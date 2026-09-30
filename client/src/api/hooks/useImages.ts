import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { fetchListPage, libraryListTotal } from "../../utils/listQuery";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useImageList(
  params: LibrarySearchParams<"image"> | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.images.list(
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
              libraryListTotal("findImages"),
              (request) => libraryApi.findImages(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
    placeholderData: keepPreviousData,
  });
}
