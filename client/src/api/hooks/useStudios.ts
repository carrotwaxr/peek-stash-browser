import { useQuery } from "@tanstack/react-query";
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
    queryFn: ({ signal }) => libraryApi.findStudios(params!, signal),
    enabled: params !== null,
  });
}

export function useStudioDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.studios.detail(instanceId, id!),
    queryFn: () => libraryApi.findStudioById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
