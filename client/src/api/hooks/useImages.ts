import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function useImageList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.images.list(instanceId, (params ?? {}) as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findImages(params!, signal),
    enabled: params !== null,
  });
}
