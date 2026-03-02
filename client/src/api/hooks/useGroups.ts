import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi, type LibrarySearchParams } from "../library";

export function useGroupList(params: LibrarySearchParams | null, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.groups.list(instanceId, (params ?? {}) as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findGroups(params!, signal),
    enabled: params !== null,
  });
}

export function useGroupDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.groups.detail(instanceId, id!),
    queryFn: () => libraryApi.findGroupById(id!, instanceId ?? null),
    enabled: !!id,
  });
}
