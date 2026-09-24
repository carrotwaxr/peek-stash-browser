import type { ExternalPlayerLinkResponse } from "@peek/shared-types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiPost } from "..";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";

export function useSceneList(
  params: LibrarySearchParams | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.scenes.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn: ({ signal }) => libraryApi.findScenes(params!, signal),
    enabled: params !== null,
    // Keep the current results on screen while the next page loads
    placeholderData: keepPreviousData,
  });
}

export function useSceneDetail(id: string | undefined, instanceId?: string) {
  return useQuery({
    queryKey: queryKeys.scenes.detail(instanceId, id!),
    queryFn: () => libraryApi.findSceneById(id!, instanceId ?? null),
    enabled: !!id,
  });
}

/**
 * The signed-in user's personal external-player link for a scene. Minted
 * when the Scene page mounts (iOS Safari drops custom-scheme navigations
 * that follow an await) and renewed hourly, so a visible tab never holds a
 * link more than about an hour old against its 12-hour lifetime.
 */
export function useExternalPlayerLink(sceneId: string, instanceId: string) {
  return useQuery({
    queryKey: queryKeys.scenes.externalPlayerLink(instanceId, sceneId),
    queryFn: () =>
      apiPost<ExternalPlayerLinkResponse>(
        `/scene/${sceneId}/external-player-link`,
        { instanceId }
      ),
    enabled: !!sceneId && !!instanceId,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: false,
  });
}
