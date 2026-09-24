import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useTagList(
  params: LibrarySearchParams | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.tags.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn: ({ signal }) => libraryApi.findTags(params!, signal),
    enabled: params !== null,
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}

export function useTagDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.tags.detail(instanceId, id!),
    queryFn: () => libraryApi.findTagById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
