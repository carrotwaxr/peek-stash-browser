import { useQuery } from "@tanstack/react-query";
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
    queryFn: ({ signal }) => libraryApi.findGalleries(params!, signal),
    enabled: params !== null,
  });
}

export function useGalleryDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.galleries.detail(instanceId, id!),
    queryFn: () => libraryApi.findGalleryById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
