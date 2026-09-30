import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { fetchListPage, libraryListTotal } from "../../utils/listQuery";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useStudioList(
  params: LibrarySearchParams<"studio"> | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.studios.list(
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
              libraryListTotal("findStudios"),
              (request) => libraryApi.findStudios(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
    placeholderData: keepPreviousData,
  });
}

export function useStudioDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.studios.detail(instanceId, id),
    queryFn: id
      ? () => libraryApi.findStudioById(id, instanceId ?? null)
      : skipToken,
  });
}
