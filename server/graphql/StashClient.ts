/**
 * StashClient - Internal GraphQL client for Stash API
 *
 * Replaces the external stashapp-api package with an internal implementation.
 * Uses graphql-request and the typed documents from codegen.
 *
 * Every request is bounded: it fails after `requestTimeoutMs`, and a client
 * from `withSignal(signal)` also ends its requests in flight when the signal
 * aborts, so a Stash that never answers cannot hold a sync forever.
 */
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { ClientError, GraphQLClient, type Variables } from "graphql-request";
import {
  ConfigurationDocument,
  type ConfigurationQueryVariables,
  ConfigurationUiDocument,
  type ConfigurationUiQueryVariables,
  FindGalleriesDocument,
  type FindGalleriesQueryVariables,
  FindGalleryDocument,
  FindGalleryIDsDocument,
  type FindGalleryIDsQueryVariables,
  type FindGalleryQueryVariables,
  FindGroupDocument,
  FindGroupIDsDocument,
  type FindGroupIDsQueryVariables,
  type FindGroupQueryVariables,
  FindGroupRelationsDocument,
  type FindGroupRelationsQueryVariables,
  FindGroupsDocument,
  type FindGroupsQueryVariables,
  FindImageIDsDocument,
  type FindImageIDsQueryVariables,
  FindImagesDocument,
  type FindImagesQueryVariables,
  FindPerformerIDsDocument,
  type FindPerformerIDsQueryVariables,
  FindPerformersDocument,
  type FindPerformersQueryVariables,
  FindSceneIDsDocument,
  type FindSceneIDsQueryVariables,
  FindSceneMarkersDocument,
  type FindSceneMarkersQueryVariables,
  FindScenesCompactDocument,
  type FindScenesCompactQueryVariables,
  FindScenesDocument,
  type FindScenesQueryVariables,
  FindStudioIDsDocument,
  type FindStudioIDsQueryVariables,
  FindStudiosDocument,
  type FindStudiosQueryVariables,
  FindTagIDsDocument,
  type FindTagIDsQueryVariables,
  FindTagsDocument,
  type FindTagsQueryVariables,
  GalleryUpdateDocument,
  type GalleryUpdateMutationVariables,
  GroupUpdateDocument,
  type GroupUpdateMutationVariables,
  ImageDecrementODocument,
  type ImageDecrementOMutationVariables,
  ImageIncrementODocument,
  type ImageIncrementOMutationVariables,
  ImageUpdateDocument,
  type ImageUpdateMutationVariables,
  MetadataScanDocument,
  type MetadataScanMutationVariables,
  PerformerDestroyDocument,
  type PerformerDestroyMutationVariables,
  PerformerUpdateDocument,
  type PerformerUpdateMutationVariables,
  PerformersDestroyDocument,
  type PerformersDestroyMutationVariables,
  SceneAddPlayDocument,
  type SceneAddPlayMutationVariables,
  SceneDeleteODocument,
  type SceneDeleteOMutationVariables,
  SceneDestroyDocument,
  type SceneDestroyMutationVariables,
  SceneIncrementODocument,
  type SceneIncrementOMutationVariables,
  SceneSaveActivityDocument,
  type SceneSaveActivityMutationVariables,
  SceneUpdateDocument,
  type SceneUpdateMutationVariables,
  ScenesUpdateDocument,
  type ScenesUpdateMutationVariables,
  StudioDestroyDocument,
  type StudioDestroyMutationVariables,
  StudioUpdateDocument,
  type StudioUpdateMutationVariables,
  StudiosDestroyDocument,
  type StudiosDestroyMutationVariables,
  TagCreateDocument,
  type TagCreateMutationVariables,
  TagDestroyDocument,
  type TagDestroyMutationVariables,
  TagUpdateDocument,
  type TagUpdateMutationVariables,
  TagsDestroyDocument,
  type TagsDestroyMutationVariables,
  VersionDocument,
  type VersionQueryVariables,
} from "./generated/graphql.js";

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
  private readonly timeoutMs: number;
  private readonly scopeSignal: AbortSignal | undefined;

  /**
   * `scopeSignal`, which `withSignal` sets, ends every request of this client
   * when it aborts.
   */
  constructor(
    private readonly config: StashClientConfig,
    scopeSignal?: AbortSignal
  ) {
    const timeoutMs = config.requestTimeoutMs ?? STASH_REQUEST_TIMEOUT_MS;
    this.timeoutMs = timeoutMs;
    this.scopeSignal = scopeSignal;
    this.client = new GraphQLClient(config.url, {
      headers: { ApiKey: config.apiKey },
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const signals = [AbortSignal.timeout(timeoutMs)];
        if (init?.signal) signals.push(init.signal);
        if (scopeSignal) signals.push(scopeSignal);
        return fetch(input, { ...init, signal: AbortSignal.any(signals) });
      },
    });
  }

  /**
   * The same client, whose requests also end when `signal` aborts: one in
   * flight rejects at once, and a later one is not sent. Either rejects with
   * Error("Sync aborted").
   */
  withSignal(signal: AbortSignal): StashClient {
    return new StashClient(this.config, signal);
  }

  /**
   * Sends one typed operation. A timeout rejects with
   * StashRequestTimeoutError naming `operationName`, and a request cut short
   * by the scope signal rejects with Error("Sync aborted").
   */
  private async run<TResult, TVars extends Variables>(
    document: TypedDocumentNode<TResult, TVars>,
    operationName: string,
    variables?: TVars,
    signal?: AbortSignal
  ): Promise<TResult> {
    try {
      return await this.client.request<TResult>({
        document,
        ...(variables && { variables }),
        ...(signal && { signal }),
      });
    } catch (error) {
      if (this.scopeSignal?.aborted) throw new Error(ABORTED_MESSAGE);
      if (isTimeout(error)) {
        throw new StashRequestTimeoutError(operationName, this.timeoutMs);
      }
      throw error;
    }
  }

  // Find operations
  findPerformers = (
    variables?: FindPerformersQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindPerformersDocument, "FindPerformers", variables, signal);
  findStudios = (variables?: FindStudiosQueryVariables, signal?: AbortSignal) =>
    this.run(FindStudiosDocument, "FindStudios", variables, signal);
  findScenes = (variables?: FindScenesQueryVariables, signal?: AbortSignal) =>
    this.run(FindScenesDocument, "FindScenes", variables, signal);
  findScenesCompact = (
    variables?: FindScenesCompactQueryVariables,
    signal?: AbortSignal
  ) =>
    this.run(FindScenesCompactDocument, "FindScenesCompact", variables, signal);
  findTags = (variables?: FindTagsQueryVariables, signal?: AbortSignal) =>
    this.run(FindTagsDocument, "FindTags", variables, signal);
  findGroups = (variables?: FindGroupsQueryVariables, signal?: AbortSignal) =>
    this.run(FindGroupsDocument, "FindGroups", variables, signal);
  findGroup = (variables: FindGroupQueryVariables, signal?: AbortSignal) =>
    this.run(FindGroupDocument, "FindGroup", variables, signal);
  /** Every group's sub-groups in Stash's order: the collection hierarchy */
  findGroupRelations = (
    variables?: FindGroupRelationsQueryVariables,
    signal?: AbortSignal
  ) =>
    this.run(
      FindGroupRelationsDocument,
      "FindGroupRelations",
      variables,
      signal
    );
  findGalleries = (
    variables?: FindGalleriesQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindGalleriesDocument, "FindGalleries", variables, signal);
  findGallery = (variables: FindGalleryQueryVariables, signal?: AbortSignal) =>
    this.run(FindGalleryDocument, "FindGallery", variables, signal);
  findImages = (variables?: FindImagesQueryVariables, signal?: AbortSignal) =>
    this.run(FindImagesDocument, "FindImages", variables, signal);
  findSceneMarkers = (
    variables?: FindSceneMarkersQueryVariables,
    signal?: AbortSignal
  ) =>
    this.run(FindSceneMarkersDocument, "FindSceneMarkers", variables, signal);

  // ID-only find operations (for cleanup/deletion detection)
  findSceneIDs = (
    variables?: FindSceneIDsQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindSceneIDsDocument, "FindSceneIDs", variables, signal);
  findPerformerIDs = (
    variables?: FindPerformerIDsQueryVariables,
    signal?: AbortSignal
  ) =>
    this.run(FindPerformerIDsDocument, "FindPerformerIDs", variables, signal);
  findStudioIDs = (
    variables?: FindStudioIDsQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindStudioIDsDocument, "FindStudioIDs", variables, signal);
  findTagIDs = (variables?: FindTagIDsQueryVariables, signal?: AbortSignal) =>
    this.run(FindTagIDsDocument, "FindTagIDs", variables, signal);
  findGroupIDs = (
    variables?: FindGroupIDsQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindGroupIDsDocument, "FindGroupIDs", variables, signal);
  findGalleryIDs = (
    variables?: FindGalleryIDsQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindGalleryIDsDocument, "FindGalleryIDs", variables, signal);
  findImageIDs = (
    variables?: FindImageIDsQueryVariables,
    signal?: AbortSignal
  ) => this.run(FindImageIDsDocument, "FindImageIDs", variables, signal);

  // Update operations
  sceneUpdate = (
    variables: SceneUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(SceneUpdateDocument, "SceneUpdate", variables, signal);
  scenesUpdate = (
    variables: ScenesUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(ScenesUpdateDocument, "ScenesUpdate", variables, signal);
  performerUpdate = (
    variables: PerformerUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(PerformerUpdateDocument, "PerformerUpdate", variables, signal);
  studioUpdate = (
    variables: StudioUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(StudioUpdateDocument, "StudioUpdate", variables, signal);
  galleryUpdate = (
    variables: GalleryUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(GalleryUpdateDocument, "GalleryUpdate", variables, signal);
  groupUpdate = (
    variables: GroupUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(GroupUpdateDocument, "GroupUpdate", variables, signal);
  imageUpdate = (
    variables: ImageUpdateMutationVariables,
    signal?: AbortSignal
  ) => this.run(ImageUpdateDocument, "ImageUpdate", variables, signal);
  tagCreate = (variables: TagCreateMutationVariables, signal?: AbortSignal) =>
    this.run(TagCreateDocument, "TagCreate", variables, signal);
  tagUpdate = (variables: TagUpdateMutationVariables, signal?: AbortSignal) =>
    this.run(TagUpdateDocument, "TagUpdate", variables, signal);

  // Destroy operations
  performerDestroy = (
    variables: PerformerDestroyMutationVariables,
    signal?: AbortSignal
  ) =>
    this.run(PerformerDestroyDocument, "PerformerDestroy", variables, signal);
  performersDestroy = (
    variables: PerformersDestroyMutationVariables,
    signal?: AbortSignal
  ) =>
    this.run(PerformersDestroyDocument, "PerformersDestroy", variables, signal);
  tagDestroy = (variables: TagDestroyMutationVariables, signal?: AbortSignal) =>
    this.run(TagDestroyDocument, "TagDestroy", variables, signal);
  tagsDestroy = (
    variables: TagsDestroyMutationVariables,
    signal?: AbortSignal
  ) => this.run(TagsDestroyDocument, "TagsDestroy", variables, signal);
  studioDestroy = (
    variables: StudioDestroyMutationVariables,
    signal?: AbortSignal
  ) => this.run(StudioDestroyDocument, "StudioDestroy", variables, signal);
  studiosDestroy = (
    variables: StudiosDestroyMutationVariables,
    signal?: AbortSignal
  ) => this.run(StudiosDestroyDocument, "StudiosDestroy", variables, signal);
  sceneDestroy = (
    variables: SceneDestroyMutationVariables,
    signal?: AbortSignal
  ) => this.run(SceneDestroyDocument, "SceneDestroy", variables, signal);

  // Activity operations
  sceneIncrementO = (
    variables: SceneIncrementOMutationVariables,
    signal?: AbortSignal
  ) => this.run(SceneIncrementODocument, "SceneIncrementO", variables, signal);
  /** Removes the given O times, or Stash's newest when `times` is omitted */
  sceneDeleteO = (
    variables: SceneDeleteOMutationVariables,
    signal?: AbortSignal
  ) => this.run(SceneDeleteODocument, "SceneDeleteO", variables, signal);
  imageIncrementO = (
    variables: ImageIncrementOMutationVariables,
    signal?: AbortSignal
  ) => this.run(ImageIncrementODocument, "ImageIncrementO", variables, signal);
  imageDecrementO = (
    variables: ImageDecrementOMutationVariables,
    signal?: AbortSignal
  ) => this.run(ImageDecrementODocument, "ImageDecrementO", variables, signal);
  sceneSaveActivity = (
    variables: SceneSaveActivityMutationVariables,
    signal?: AbortSignal
  ) =>
    this.run(SceneSaveActivityDocument, "SceneSaveActivity", variables, signal);
  sceneAddPlay = (
    variables: SceneAddPlayMutationVariables,
    signal?: AbortSignal
  ) => this.run(SceneAddPlayDocument, "SceneAddPlay", variables, signal);

  // Configuration
  configuration = (
    variables?: ConfigurationQueryVariables,
    signal?: AbortSignal
  ) => this.run(ConfigurationDocument, "Configuration", variables, signal);
  /** The Stash user's saved UI settings, a JSON map (`ui.vrTag` is read). */
  configurationUi = (
    variables?: ConfigurationUiQueryVariables,
    signal?: AbortSignal
  ) => this.run(ConfigurationUiDocument, "ConfigurationUi", variables, signal);

  // Version info
  version = (variables?: VersionQueryVariables, signal?: AbortSignal) =>
    this.run(VersionDocument, "Version", variables, signal);

  // Metadata operations
  metadataScan = (
    variables: MetadataScanMutationVariables,
    signal?: AbortSignal
  ) => this.run(MetadataScanDocument, "MetadataScan", variables, signal);
}
