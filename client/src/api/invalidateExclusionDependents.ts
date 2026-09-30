/**
 * What a user's exclusions change (a hide, a restore, Restore All) shows
 * up in: every library list, detail, picker, clip list and carousel, the
 * Recommended list, the stats page and the Hidden Items list. The default
 * `staleTime` is five minutes, so without this a page shows the old set
 * until it is reloaded.
 */
import type { QueryClient } from "@tanstack/react-query";
import { invalidateLibraryQueries } from "./hooks/useLibraryReady";
import { queryKeys } from "./queryKeys";

/**
 * Refetches the queries on screen and marks the rest stale. The library
 * predicate covers the entity lists, details, pickers, clips, carousels
 * (Home's included) and Recommended, which lives under the scenes root;
 * the stats page and the Hidden Items list are added here.
 */
export function invalidateExclusionDependents(
  client: QueryClient
): Promise<void> {
  return Promise.all([
    invalidateLibraryQueries(client),
    client.invalidateQueries({ queryKey: queryKeys.user.stats() }),
    // Marked stale, not refetched: the list is on screen only on the Hidden
    // Items page, whose Restore buttons refetch it themselves
    client.invalidateQueries({
      queryKey: queryKeys.user.hiddenEntities(),
      refetchType: "none",
    }),
  ]).then(() => undefined);
}
