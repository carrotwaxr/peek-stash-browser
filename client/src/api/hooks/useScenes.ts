import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function useSceneList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.scenes.list(instanceId, (params ?? {}) as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findScenes(params!, signal),
    enabled: params !== null,
  });
}

export function useSceneDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.scenes.detail(instanceId, id!),
    queryFn: () => libraryApi.findSceneById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
