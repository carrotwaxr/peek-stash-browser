import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function useGalleryList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.galleries.list(instanceId, (params ?? {}) as Record<string, unknown>),
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

export function useGalleryImages(
  galleryId: string | undefined,
  options: { page?: number; per_page?: number; instanceId?: string } = {},
) {
  const { page = 1, per_page = 0, instanceId } = options;
  return useQuery({
    queryKey: queryKeys.galleries.images(instanceId, galleryId!, { page, per_page } as Record<string, unknown>),
    queryFn: () => libraryApi.getGalleryImages(galleryId!, { page, per_page, instanceId: instanceId ?? null }),
    enabled: !!galleryId,
  });
}
