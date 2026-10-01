import type { TagTreeScope, UntaggedKind } from "@peek/shared-types";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { fetchListPage, libraryListTotal } from "../../utils/listQuery";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useTagList(
  params: LibrarySearchParams<"tag"> | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.tags.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn:
      params === null
        ? skipToken
        : (context) =>
            fetchListPage(
              context,
              params,
              libraryListTotal("findTags"),
              (request) => libraryApi.findTags(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
    placeholderData: keepPreviousData,
  });
}

/**
 * The compact tag tree (hierarchy and folder views), whole or scoped, with
 * the Untagged count of the folder view's type (`untagged`); fetched only
 * while `enabled`
 */
export function useTagTree(
  scope: TagTreeScope | undefined,
  enabled: boolean,
  untagged?: UntaggedKind
) {
  return useQuery({
    queryKey: queryKeys.tags.tree(
      scope as Record<string, unknown> | undefined,
      untagged
    ),
    queryFn: enabled
      ? ({ signal }) =>
          libraryApi.findTagTree(
            {
              ...(scope ? { scope } : {}),
              ...(untagged ? { untagged } : {}),
            },
            signal
          )
      : skipToken,
  });
}
