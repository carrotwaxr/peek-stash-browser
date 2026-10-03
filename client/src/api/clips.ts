/**
 * Clips API endpoints.
 */
import type {
  FindClipsRequest,
  FindClipsResponse,
  GetClipsForSceneResponse,
  ListCount,
} from "@peek/shared-types";
import { apiGet, apiPost } from "./client";

/**
 * `POST /api/library/clips`: a page of the clip list, its filter in
 * `clip_filter` (`buildClipFilter`), paging, sort and search in `filter`;
 * `filter.count: false` asks for the page alone (`total` and `totalPages`
 * null)
 */
export async function findClips(request: FindClipsRequest) {
  return apiPost<FindClipsResponse<ListCount>>("/library/clips", request);
}

/** `GET /api/scenes/:id/clips`: the scene on its own instance, which the server requires */
export async function getClipsForScene(
  sceneId: string,
  instanceId: string,
  includeUngenerated = false,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ instanceId });
  if (includeUngenerated) params.set("includeUngenerated", "true");
  return apiGet<GetClipsForSceneResponse>(
    `/scenes/${sceneId}/clips?${params.toString()}`,
    signal
  );
}

/**
 * The clip preview proxy URL, on the clip's own instance: the server serves
 * a media request only from the instance it names.
 */
export function getClipPreviewUrl(clipId: string, instanceId: string): string {
  return `/api/proxy/clip/${clipId}/preview?instanceId=${encodeURIComponent(instanceId)}`;
}
