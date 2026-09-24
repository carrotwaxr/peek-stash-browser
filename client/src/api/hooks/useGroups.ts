import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useGroupList(
  params: LibrarySearchParams | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.groups.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn:
      params === null
        ? skipToken
        : ({ signal }) => libraryApi.findGroups(params, signal),
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}

export function useGroupDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(instanceId, id),
    queryFn: id
      ? () => libraryApi.findGroupById(id, instanceId ?? null)
      : skipToken,
  });
}
