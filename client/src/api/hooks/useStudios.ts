import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useStudioList(
  params: LibrarySearchParams | null,
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
        : ({ signal }) => libraryApi.findStudios(params, signal),
    // Keep the current results on screen while the next page loads
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
