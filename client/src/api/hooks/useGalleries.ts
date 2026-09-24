import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useGalleryList(
  params: LibrarySearchParams | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.galleries.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn:
      params === null
        ? skipToken
        : ({ signal }) => libraryApi.findGalleries(params, signal),
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}

export function useGalleryDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.galleries.detail(instanceId, id),
    queryFn: id
      ? () => libraryApi.findGalleryById(id, instanceId ?? null)
      : skipToken,
  });
}
