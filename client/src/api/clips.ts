/**
 * Clips API endpoints.
 */
import { apiGet } from "./client";

export interface GetClipsOptions {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortDir?: string;
  isGenerated?: boolean;
  sceneId?: string;
  tagIds?: string[];
  sceneTagIds?: string[];
  performerIds?: string[];
  studioId?: string;
  q?: string;
}

export async function getClips(options: GetClipsOptions = {}) {
  const params = new URLSearchParams();

  if (options.page) params.set("page", String(options.page));
  if (options.perPage) params.set("perPage", String(options.perPage));
  if (options.sortBy) params.set("sortBy", options.sortBy);
  if (options.sortDir) params.set("sortDir", options.sortDir);
  if (options.isGenerated !== undefined) params.set("isGenerated", String(options.isGenerated));
  if (options.sceneId) params.set("sceneId", options.sceneId);
  if (options.tagIds?.length) params.set("tagIds", options.tagIds.join(","));
  if (options.sceneTagIds?.length) params.set("sceneTagIds", options.sceneTagIds.join(","));
  if (options.performerIds?.length) params.set("performerIds", options.performerIds.join(","));
  if (options.studioId) params.set("studioId", options.studioId);
  if (options.q) params.set("q", options.q);

  const queryString = params.toString();
  return apiGet(`/clips${queryString ? `?${queryString}` : ""}`);
}

export async function getClipsForScene(sceneId: string, instanceId?: string, includeUngenerated = false) {
  const params = new URLSearchParams();
  if (includeUngenerated) params.set("includeUngenerated", "true");
  if (instanceId) params.set("instanceId", instanceId);
  const queryString = params.toString();
  return apiGet(`/scenes/${sceneId}/clips${queryString ? `?${queryString}` : ""}`);
}

export function getClipPreviewUrl(clipId: string): string {
  return `/api/proxy/clip/${clipId}/preview`;
}
