import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useImageList(
  params: LibrarySearchParams | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.images.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn: ({ signal }) => libraryApi.findImages(params!, signal),
    enabled: params !== null,
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}
