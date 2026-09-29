import type { TagTreeScope } from "@peek/shared-types";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
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
        : ({ signal }) => libraryApi.findTags(params, signal),
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}

export function useTagDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.tags.detail(instanceId, id),
    queryFn: id
      ? () => libraryApi.findTagById(id, instanceId ?? null)
      : skipToken,
  });
}

/**
 * The compact tag tree (hierarchy and folder views), whole or scoped; fetched
 * only while `enabled`
 */
export function useTagTree(scope: TagTreeScope | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tags.tree(scope as Record<string, unknown> | undefined),
    queryFn: enabled
      ? ({ signal }) => libraryApi.findTagTree(scope, signal)
      : skipToken,
  });
}
