/**
 * Clips API endpoints.
 */
import type {
  ClipQueryInput,
  GetClipsForSceneResponse,
  RefModifier,
} from "@peek/shared-types";
import { apiGet } from "./client";

/**
 * The Clips page's filter parameters, as `buildClipFilter` builds them: ids
 * as `"id:instanceId"`, each list with a choice of modifier beside it
 */
export interface ClipFilterParams {
  tagIds?: string[];
  tagIdsModifier?: RefModifier;
  sceneTagIds?: string[];
  sceneTagIdsModifier?: RefModifier;
  performerIds?: string[];
  performerIdsModifier?: RefModifier;
  studioId?: string;
  /** With (true) or without (false) a generated preview; absent lists every clip */
  isGenerated?: boolean;
}

export interface GetClipsOptions extends ClipFilterParams {
  page?: number;
  perPage?: number;
  sortBy?: ClipQueryInput["sortBy"];
  sortDir?: ClipQueryInput["sortDir"];
  sceneId?: string;
  q?: string;
  /** false: the page alone, `total` and `totalPages` null (a page change reusing its count) */
  count?: false;
}

/** `GET /api/clips`, with every parameter as the server's contract names it */
export async function getClips(options: GetClipsOptions = {}) {
  const query: { -readonly [K in keyof ClipQueryInput]: ClipQueryInput[K] } =
    {};

  if (options.page) query.page = String(options.page);
  if (options.perPage) query.perPage = String(options.perPage);
  if (options.sortBy) query.sortBy = options.sortBy;
  if (options.sortDir) query.sortDir = options.sortDir;
  if (options.isGenerated !== undefined)
    query.isGenerated = options.isGenerated ? "true" : "false";
  if (options.sceneId) query.sceneId = options.sceneId;
  if (options.tagIds?.length) {
    query.tagIds = options.tagIds.join(",");
    if (options.tagIdsModifier) query.tagIdsModifier = options.tagIdsModifier;
  }
  if (options.sceneTagIds?.length) {
    query.sceneTagIds = options.sceneTagIds.join(",");
    if (options.sceneTagIdsModifier)
      query.sceneTagIdsModifier = options.sceneTagIdsModifier;
  }
  if (options.performerIds?.length) {
    query.performerIds = options.performerIds.join(",");
    if (options.performerIdsModifier)
      query.performerIdsModifier = options.performerIdsModifier;
  }
  if (options.studioId) query.studioId = options.studioId;
  if (options.q) query.q = options.q;
  if (options.count === false) query.count = "false";

  const queryString = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  ).toString();
  return apiGet(`/clips${queryString ? `?${queryString}` : ""}`);
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
