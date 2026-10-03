import type {
  ExternalPlayerLinkResponse,
  FindRecommendedScenesRequest,
  NormalizedScene,
  SceneMediaLinkResponse,
} from "@peek/shared-types";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "..";
import {
  fetchListPage,
  libraryListTotal,
  recommendedListTotal,
} from "../../utils/listQuery";
import { type LibrarySearchParams, libraryApi } from "../library";
import { queryKeys } from "../queryKeys";
import { useLibraryReady } from "./useLibraryReady";

export function useSceneList(
  params: LibrarySearchParams<"scene"> | null,
  instanceId?: string
) {
  return useQuery({
    queryKey: queryKeys.scenes.list(
      instanceId,
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn:
      params === null
        ? skipToken
        : (context) =>
            fetchListPage(
              context,
              params,
              libraryListTotal("findScenes"),
              (request) => libraryApi.findScenes(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
    placeholderData: keepPreviousData,
  });
}

/**
 * One page of Recommended: the scene list's request within the user's
 * ranked scenes, its total in a top-level `count` (`recommendedListTotal`),
 * keyed apart from the Scenes list so the two never share a total. A null
 * request sends nothing.
 */
export function useRecommendedList(
  params: FindRecommendedScenesRequest | null
) {
  return useQuery({
    queryKey: queryKeys.scenes.recommended(
      (params ?? {}) as Record<string, unknown>
    ),
    queryFn:
      params === null
        ? skipToken
        : (context) =>
            fetchListPage(context, params, recommendedListTotal, (request) =>
              libraryApi.findRecommendedScenes(request, context.signal)
            ),
    // Keep the current results on screen while the next page loads; a page
    // change reuses the list's count (`fetchListPage`)
    placeholderData: keepPreviousData,
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

/**
 * The scene's signed media link: every playable source, the one a Cast
 * receiver is given, captions and poster, all on the user's personal link.
 * `enabled` is the caller's flag, so only a tab that needs it (Safari, or a
 * cast in progress) mints one. Renewed hourly like the external-player link,
 * and never refetched by a library invalidation (`isLibraryQuery`).
 */
export function useSceneMediaLink(
  sceneId: string,
  instanceId: string,
  { enabled = true }: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: queryKeys.scenes.mediaLink(instanceId, sceneId),
    queryFn: () =>
      apiPost<SceneMediaLinkResponse>(`/scene/${sceneId}/media-link`, {
        instanceId,
      }),
    enabled: enabled && !!sceneId && !!instanceId,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: false,
  });
}

export interface SimilarScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
}

/**
 * One page of "Scenes like this" for a scene, keyed by the scene's instance,
 * id and page, so the Similar Scenes tab and the Recommended sidebar share
 * one request for page 1.
 *
 * The query does not take TanStack's abort signal: with the signal consumed,
 * the fetch is cancelled the moment its last observer unmounts, and a
 * remount (StrictMode's double mount, a layout change) sends it again. A
 * page of ids is cheap to let finish and cache.
 *
 * While the next page of the same scene loads, the current page stays on
 * screen; a new scene (or the same id on another instance) shows nothing
 * until its own answer arrives, never the previous scene's list.
 */
export function useSimilarScenes(
  sceneId: string,
  instanceId: string,
  page: number
) {
  // Mounts the library re-check, so a scene opened during the first sync
  // loads its similar scenes once the library is ready
  const { ready } = useLibraryReady();
  return useQuery({
    queryKey: queryKeys.scenes.similar(instanceId, sceneId, page),
    queryFn: () =>
      apiGet<SimilarScenesResponse>(
        `/library/scenes/${sceneId}/similar?instanceId=${encodeURIComponent(instanceId)}&page=${page}`
      ),
    enabled: !!sceneId && !!instanceId && ready,
    // Keep the current page on screen while the next one of the same
    // scene loads (key: ["scenes", instanceId, "similar", sceneId, page])
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === sceneId &&
      previousQuery.queryKey[1] === instanceId
        ? previous
        : undefined,
  });
}
