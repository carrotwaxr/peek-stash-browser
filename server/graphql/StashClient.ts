/**
 * StashClient - Internal GraphQL client for Stash API
 *
 * Replaces the external stashapp-api package with an internal implementation.
 * Uses graphql-request and generated SDK from codegen.
 *
 * Every request is bounded: it fails after `requestTimeoutMs`, and a client
 * from `withSignal(signal)` also ends its requests in flight when the signal
 * aborts, so a Stash that never answers cannot hold a sync forever.
 */
import { ClientError, GraphQLClient } from "graphql-request";
import { type SdkFunctionWrapper, getSdk } from "./generated/graphql.js";

/**
 * How long one Stash request may take. Generous against the largest sync
 * request (a 500-scene page or a 5,000-id page), and the bound on how long a
 * Stash that stops answering can hold a sync.
 */
export const STASH_REQUEST_TIMEOUT_MS = 120_000;

/** Longest text `describeStashError` returns. */
const MAX_ERROR_DESCRIPTION = 500;

/**
 * What a request cut short by a `withSignal` client's signal rejects with:
 * the message the sync's own abort check throws, so the sync treats both the
 * same way.
 */
const ABORTED_MESSAGE = "Sync aborted";

export interface StashClientConfig {
  url: string;
  apiKey: string;
  /** Per request; defaults to STASH_REQUEST_TIMEOUT_MS. */
  requestTimeoutMs?: number;
}

/** A Stash request that got no complete answer within its time limit. */
export class StashRequestTimeoutError extends Error {
  constructor(
    readonly operationName: string,
    readonly timeoutMs: number
  ) {
    super(
      `Stash request ${operationName} timed out after ${timeoutMs / 1000} s`
    );
    this.name = "StashRequestTimeoutError";
  }
}

/**
 * A Stash request's failure in words fit for a log line or an admin's status
 * page, cut to 500 characters:
 * - a GraphQL answer: the operation, each error's message with the field it
 *   broke on, and the HTTP status, as in `FindStudios: runtime error: ...
 *   (at findStudios.studios.3.parent_studio) (HTTP 200)`;
 * - a timeout's message, a network error's code, or the error's message.
 * Never the query, its variables or the headers: a graphql-request
 * `ClientError`'s own message embeds the query and variables.
 */
export function describeStashError(error: unknown): string {
  const text = describe(error);
  return text.length > MAX_ERROR_DESCRIPTION
    ? `${text.slice(0, MAX_ERROR_DESCRIPTION - 3)}...`
    : text;
}

function describe(error: unknown): string {
  if (error instanceof ClientError) {
    const { errors, status } = error.response;
    const messages = (errors ?? [])
      .filter((e) => e.message.length > 0)
      .map((e) =>
        e.path && e.path.length > 0
          ? `${e.message} (at ${e.path.join(".")})`
          : e.message
      );
    const operation = operationName(error.request.query);
    const prefix = operation ? `${operation}: ` : "";
    return messages.length > 0
      ? `${prefix}${messages.join("; ")} (HTTP ${status})`
      : `${prefix}Stash answered HTTP ${status}`;
  }
  if (error instanceof StashRequestTimeoutError) return error.message;
  const code = networkErrorCode(error);
  if (code) return `Could not reach Stash (${code})`;
  return error instanceof Error ? error.message : String(error);
}

/**
 * The name of the operation a request's document starts with (`FindStudios`
 * in `query FindStudios(...) {...}`), and nothing else of the query.
 */
function operationName(query: string | string[]): string | undefined {
  const document = Array.isArray(query) ? query[0] : query;
  return document?.match(
    /^\s*(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/
  )?.[1];
}

/**
 * The system error code under a failed fetch (`ECONNREFUSED`, `ENOTFOUND`,
 * ...), from its cause or, when Node tried several addresses, the first of
 * the cause's errors.
 */
function networkErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("cause" in error)) return undefined;
  const { cause } = error;
  if (typeof cause !== "object" || cause === null) return undefined;
  if ("code" in cause && typeof cause.code === "string") return cause.code;
  if ("errors" in cause && Array.isArray(cause.errors)) {
    const first: unknown = cause.errors[0];
    if (
      typeof first === "object" &&
      first !== null &&
      "code" in first &&
      typeof first.code === "string"
    ) {
      return first.code;
    }
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

/**
 * Client for interacting with the Stash GraphQL API.
 * Each instance maintains its own connection configuration.
 */
export class StashClient {
  private client: GraphQLClient;
  private sdk: ReturnType<typeof getSdk>;

  /**
   * `scopeSignal`, which `withSignal` sets, ends every request of this client
   * when it aborts.
   */
  constructor(
    private readonly config: StashClientConfig,
    scopeSignal?: AbortSignal
  ) {
    const timeoutMs = config.requestTimeoutMs ?? STASH_REQUEST_TIMEOUT_MS;
    this.client = new GraphQLClient(config.url, {
      headers: { ApiKey: config.apiKey },
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const signals = [AbortSignal.timeout(timeoutMs)];
        if (init?.signal) signals.push(init.signal);
        if (scopeSignal) signals.push(scopeSignal);
        return fetch(input, { ...init, signal: AbortSignal.any(signals) });
      },
    });
    const wrapper: SdkFunctionWrapper = async (action, operationName) => {
      try {
        return await action();
      } catch (error) {
        if (scopeSignal?.aborted) throw new Error(ABORTED_MESSAGE);
        if (isTimeout(error)) {
          throw new StashRequestTimeoutError(operationName, timeoutMs);
        }
        throw error;
      }
    };
    this.sdk = getSdk(this.client, wrapper);
  }

  /**
   * The same client, whose requests also end when `signal` aborts: one in
   * flight rejects at once, and a later one is not sent. Either rejects with
   * Error("Sync aborted").
   */
  withSignal(signal: AbortSignal): StashClient {
    return new StashClient(this.config, signal);
  }

  // Find operations
  findPerformers = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindPerformers"]>
  ) => this.sdk.FindPerformers(...args);
  findStudios = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindStudios"]>
  ) => this.sdk.FindStudios(...args);
  findScenes = (...args: Parameters<ReturnType<typeof getSdk>["FindScenes"]>) =>
    this.sdk.FindScenes(...args);
  findScenesCompact = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindScenesCompact"]>
  ) => this.sdk.FindScenesCompact(...args);
  findTags = (...args: Parameters<ReturnType<typeof getSdk>["FindTags"]>) =>
    this.sdk.FindTags(...args);
  findGroups = (...args: Parameters<ReturnType<typeof getSdk>["FindGroups"]>) =>
    this.sdk.FindGroups(...args);
  findGroup = (...args: Parameters<ReturnType<typeof getSdk>["FindGroup"]>) =>
    this.sdk.FindGroup(...args);
  /** Every group's sub-groups in Stash's order: the collection hierarchy */
  findGroupRelations = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindGroupRelations"]>
  ) => this.sdk.FindGroupRelations(...args);
  findGalleries = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindGalleries"]>
  ) => this.sdk.FindGalleries(...args);
  findGallery = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindGallery"]>
  ) => this.sdk.FindGallery(...args);
  findImages = (...args: Parameters<ReturnType<typeof getSdk>["FindImages"]>) =>
    this.sdk.FindImages(...args);
  findSceneMarkers = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindSceneMarkers"]>
  ) => this.sdk.FindSceneMarkers(...args);

  // ID-only find operations (for cleanup/deletion detection)
  findSceneIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindSceneIDs"]>
  ) => this.sdk.FindSceneIDs(...args);
  findPerformerIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindPerformerIDs"]>
  ) => this.sdk.FindPerformerIDs(...args);
  findStudioIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindStudioIDs"]>
  ) => this.sdk.FindStudioIDs(...args);
  findTagIDs = (...args: Parameters<ReturnType<typeof getSdk>["FindTagIDs"]>) =>
    this.sdk.FindTagIDs(...args);
  findGroupIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindGroupIDs"]>
  ) => this.sdk.FindGroupIDs(...args);
  findGalleryIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindGalleryIDs"]>
  ) => this.sdk.FindGalleryIDs(...args);
  findImageIDs = (
    ...args: Parameters<ReturnType<typeof getSdk>["FindImageIDs"]>
  ) => this.sdk.FindImageIDs(...args);

  // Update operations
  sceneUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["sceneUpdate"]>
  ) => this.sdk.sceneUpdate(...args);
  scenesUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["scenesUpdate"]>
  ) => this.sdk.scenesUpdate(...args);
  performerUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["performerUpdate"]>
  ) => this.sdk.performerUpdate(...args);
  studioUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["studioUpdate"]>
  ) => this.sdk.studioUpdate(...args);
  galleryUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["galleryUpdate"]>
  ) => this.sdk.galleryUpdate(...args);
  groupUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["groupUpdate"]>
  ) => this.sdk.groupUpdate(...args);
  imageUpdate = (
    ...args: Parameters<ReturnType<typeof getSdk>["imageUpdate"]>
  ) => this.sdk.imageUpdate(...args);
  tagCreate = (...args: Parameters<ReturnType<typeof getSdk>["tagCreate"]>) =>
    this.sdk.tagCreate(...args);
  tagUpdate = (...args: Parameters<ReturnType<typeof getSdk>["tagUpdate"]>) =>
    this.sdk.tagUpdate(...args);

  // Destroy operations
  performerDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["performerDestroy"]>
  ) => this.sdk.performerDestroy(...args);
  performersDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["performersDestroy"]>
  ) => this.sdk.performersDestroy(...args);
  tagDestroy = (...args: Parameters<ReturnType<typeof getSdk>["tagDestroy"]>) =>
    this.sdk.tagDestroy(...args);
  tagsDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["tagsDestroy"]>
  ) => this.sdk.tagsDestroy(...args);
  studioDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["studioDestroy"]>
  ) => this.sdk.studioDestroy(...args);
  studiosDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["studiosDestroy"]>
  ) => this.sdk.studiosDestroy(...args);
  sceneDestroy = (
    ...args: Parameters<ReturnType<typeof getSdk>["sceneDestroy"]>
  ) => this.sdk.sceneDestroy(...args);

  // Activity operations
  sceneIncrementO = (
    ...args: Parameters<ReturnType<typeof getSdk>["sceneIncrementO"]>
  ) => this.sdk.sceneIncrementO(...args);
  sceneDecrementO = (
    ...args: Parameters<ReturnType<typeof getSdk>["SceneDecrementO"]>
  ) => this.sdk.SceneDecrementO(...args);
  sceneSaveActivity = (
    ...args: Parameters<ReturnType<typeof getSdk>["SceneSaveActivity"]>
  ) => this.sdk.SceneSaveActivity(...args);
  sceneAddPlay = (
    ...args: Parameters<ReturnType<typeof getSdk>["SceneAddPlay"]>
  ) => this.sdk.SceneAddPlay(...args);

  // Configuration
  configuration = (
    ...args: Parameters<ReturnType<typeof getSdk>["Configuration"]>
  ) => this.sdk.Configuration(...args);

  // Version info
  version = (...args: Parameters<ReturnType<typeof getSdk>["Version"]>) =>
    this.sdk.Version(...args);

  // Metadata operations
  metadataScan = (
    ...args: Parameters<ReturnType<typeof getSdk>["metadataScan"]>
  ) => this.sdk.metadataScan(...args);
}
