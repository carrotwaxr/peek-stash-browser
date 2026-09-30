// shared/types/api/clips.ts
import type { ListCount } from "./library.js";

/**
 * Clips API Types
 *
 * Request and response types for /api/clips/* endpoints.
 */

// =============================================================================
// GET CLIPS
// =============================================================================

/** GET /api/clips */
export interface GetClipsQuery extends Record<
  string,
  string | string[] | undefined
> {
  page?: string;
  perPage?: string;
  sortBy?: string;
  sortDir?: string;
  isGenerated?: string;
  sceneId?: string;
  tagIds?: string;
  sceneTagIds?: string;
  performerIds?: string;
  studioId?: string;
  q?: string;
  instanceId?: string;
  /** "false": the page alone, `total` and `totalPages` null */
  count?: string;
}

/** `total` and `totalPages` are null when the request said `count=false` */
export interface GetClipsResponse<Count extends ListCount = number> {
  clips: unknown[];
  total: Count;
  page: number;
  perPage: number;
  totalPages: Count;
}

// =============================================================================
// GET CLIP BY ID
// =============================================================================

/** GET /api/clips/:id */
export interface GetClipByIdParams extends Record<string, string> {
  id: string;
}

// Note: GetClipByIdResponse depends on server-internal ClipService types
// and is re-exported from server/types/api/clips.ts instead.

// =============================================================================
// GET CLIPS FOR SCENE
// =============================================================================

/** GET /api/scenes/:id/clips */
export interface GetClipsForSceneParams extends Record<string, string> {
  id: string;
}

export interface GetClipsForSceneQuery extends Record<
  string,
  string | string[] | undefined
> {
  includeUngenerated?: string;
  instanceId?: string;
}

export interface GetClipsForSceneResponse {
  clips: unknown[];
}
