import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { fetchListPage, libraryListTotal } from "../../utils/listQuery";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useGalleryList(
  params: LibrarySearchParams<"gallery"> | null,
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
        : (context) =>
            fetchListPage(
              context,
              params,
              libraryListTotal("findGalleries"),
              (request) => libraryApi.findGalleries(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
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
