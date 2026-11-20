/**
 * The one library-initializing state.
 *
 * While none of the user's Stash instances has finished its first sync, the
 * library routes answer 503 `ready: false`. A query that gets that answer is
 * not retried: the query client's cache marks the library not ready
 * (`markLibraryNotReady`), every page shows `LibraryInitializingBanner`, and
 * this hook asks `GET /library/ready` every 5 seconds. Once it answers true,
 * the library's lists and carousels load again. The answer's `reason` tells
 * a first sync ("initializing") from a user no Stash server is open to
 * ("noAccess"); the banner words each.
 */
import type { LibraryReadyResponse } from "@peek/shared-types";
import {
  type QueryClient,
  type QueryKey,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, apiGet } from "../client";
import { invalidateExclusionDependents } from "../invalidateExclusionDependents";
import { isLinkQuery, queryKeys } from "../queryKeys";

/**
 * Whether a request failed because the library is initializing: the
 * server's 503 `ready: false`. Pages show the notice for it, not an error.
 */
export function isLibraryInitializing(error: unknown): boolean {
  return error instanceof ApiError && error.isInitializing;
}

/** How often the library is re-checked while it is initializing. */
export const LIBRARY_READY_POLL_MS = 5_000;

const LIBRARY_ENTITY_ROOTS = new Set([
  "scenes",
  "performers",
  "studios",
  "tags",
  "galleries",
  "groups",
  "images",
]);

/** The queries that read the library: entity lists, details, pickers, clips, carousels and the watched scenes. */
function isLibraryQuery(queryKey: QueryKey): boolean {
  const [root] = queryKey;
  if (typeof root !== "string") return false;
  if (LIBRARY_ENTITY_ROOTS.has(root)) return !isLinkQuery(queryKey);
  return (
    root === "clips" ||
    root === "homeCarousel" ||
    root === "carousels" ||
    root === "watchHistory"
  );
}

/** The `reason` a 503 or ready answer carries, if it is one the client knows. */
export function libraryNotReadyReason(
  data: Record<string, unknown>
): LibraryReadyResponse["reason"] {
  const { reason } = data;
  return reason === "initializing" || reason === "noAccess"
    ? reason
    : undefined;
}

/**
 * Marks the library as not ready, which starts the re-check. Called by the
 * query cache for a query answered 503 `ready: false`, with the body's
 * `reason`. A second call that adds nothing (no reason, or the stored one)
 * changes nothing, so it does not push the next check back and a bare call
 * never overwrites a stored reason.
 */
export function markLibraryNotReady(
  client: QueryClient,
  reason?: LibraryReadyResponse["reason"]
): void {
  const key = queryKeys.library.ready();
  const current = client.getQueryData<LibraryReadyResponse>(key);
  if (current?.ready === false && (!reason || reason === current.reason)) {
    return;
  }
  client.setQueryData<LibraryReadyResponse>(
    key,
    reason ? { ready: false, reason } : { ready: false }
  );
}

/**
 * Refetches the library queries on screen (lists, details, pickers, clips
 * and carousels); the others are marked stale and refetch when next shown.
 */
export function invalidateLibraryQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => isLibraryQuery(query.queryKey),
  });
}

/**
 * After a write to the viewer's own values (a rating, favorite or O), once
 * `patchEntityInCache` has put the new value in every cached row: marks
 * the library queries (lists, details, pickers, clips, carousels, watched
 * scenes) and the user's stats stale and fetches nothing. A row that no
 * longer fits its list's filter or order stays until the list is next
 * shown, which fetches the truth. Call it after the patch: `setQueryData`
 * resets `dataUpdatedAt`, so the stale mark must come second.
 */
export function markLibraryStale(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({
      predicate: (query) => isLibraryQuery(query.queryKey),
      refetchType: "none",
    }),
    client.invalidateQueries({
      queryKey: queryKeys.user.stats(),
      refetchType: "none",
    }),
  ]).then(() => undefined);
}

/**
 * After a Stash instance is added, edited, enabled, disabled or deleted, or
 * a user's Content Sources change: the setup status (its instance count
 * decides whether cards name their server) and everything the user's
 * visible set feeds (`invalidateExclusionDependents`: the library queries,
 * Recommended, stats and Hidden Items).
 */
export function invalidateInstanceQueries(client: QueryClient): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.setup.status() }),
    invalidateExclusionDependents(client),
  ]).then(() => undefined);
}

async function checkLibraryReady(
  client: QueryClient,
  signal: AbortSignal
): Promise<LibraryReadyResponse> {
  const answer = await apiGet<LibraryReadyResponse>("/library/ready", signal);
  // Read after the answer: a request may have found the library
  // initializing while this one was on its way
  const wasReady = client.getQueryData<LibraryReadyResponse>(
    queryKeys.library.ready()
  )?.ready;
  if (answer.ready && wasReady === false) {
    void invalidateLibraryQueries(client);
  }
  return answer;
}

/**
 * `ready` is false only while the server has said the library is
 * initializing or the user has no Stash server; until then nothing is
 * asked. Queries that should wait for the library take `enabled: ready`.
 * `reason` is the server's, when it gave one.
 */
export function useLibraryReady(): {
  ready: boolean;
  reason: LibraryReadyResponse["reason"];
} {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.library.ready(),
    queryFn: ({ signal }) => checkLibraryReady(client, signal),
    enabled: (query) => query.state.data?.ready === false,
    refetchInterval: (query) =>
      query.state.data?.ready === false ? LIBRARY_READY_POLL_MS : false,
  });
  return { ready: data?.ready !== false, reason: data?.reason };
}
