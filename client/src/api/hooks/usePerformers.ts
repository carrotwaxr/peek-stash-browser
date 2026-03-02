import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function usePerformerList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.performers.list(instanceId, (params ?? {}) as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findPerformers(params!, signal),
    enabled: params !== null,
  });
}

export function usePerformerDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.performers.detail(instanceId, id!),
    queryFn: () => libraryApi.findPerformerById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
