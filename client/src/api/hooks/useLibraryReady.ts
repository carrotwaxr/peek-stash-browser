/**
 * The one library-initializing state.
 *
 * While none of the user's Stash instances has finished its first sync, the
 * library routes answer 503 `ready: false`. A query that gets that answer is
 * not retried: the query client's cache marks the library not ready
 * (`markLibraryNotReady`), every page shows `LibraryInitializingBanner`, and
 * this hook asks `GET /library/ready` every 5 seconds. Once it answers true,
 * the library's lists and carousels load again.
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
import { queryKeys } from "../queryKeys";

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
  const [root, , kind] = queryKey;
  if (typeof root !== "string") return false;
  if (LIBRARY_ENTITY_ROOTS.has(root)) {
    // A refetch of either mints a link (and reloads a Safari video)
    return kind !== "externalPlayerLink" && kind !== "mediaLink";
  }
  return (
    root === "clips" ||
    root === "homeCarousel" ||
    root === "carousels" ||
    root === "watchHistory"
  );
}

/**
 * Marks the library as initializing, which starts the re-check. Called by
 * the query cache for a query answered 503 `ready: false`; a second call
 * while it is already marked changes nothing, so it does not push the next
 * check back.
 */
export function markLibraryNotReady(client: QueryClient): void {
  const key = queryKeys.library.ready();
  if (client.getQueryData<LibraryReadyResponse>(key)?.ready === false) return;
  client.setQueryData<LibraryReadyResponse>(key, { ready: false });
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
 * initializing; until then nothing is asked. Queries that should wait for
 * the library take `enabled: ready`.
 */
export function useLibraryReady(): { ready: boolean } {
  const client = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.library.ready(),
    queryFn: ({ signal }) => checkLibraryReady(client, signal),
    enabled: (query) => query.state.data?.ready === false,
    refetchInterval: (query) =>
      query.state.data?.ready === false ? LIBRARY_READY_POLL_MS : false,
  });
  return { ready: data?.ready !== false };
}
