import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function useTagList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.tags.list(instanceId, (params ?? {}) as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findTags(params!, signal),
    enabled: params !== null,
  });
}

export function useTagDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.tags.detail(instanceId, id!),
    queryFn: () => libraryApi.findTagById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
