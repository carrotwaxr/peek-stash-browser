// server/types/api/clips.ts
/**
 * Clips API Types
 *
 * Request and response types for /api/clips/* endpoints.
 */

// =============================================================================
// GET CLIPS
// =============================================================================

/** GET /api/clips */
export interface GetClipsQuery extends Record<string, string | string[] | undefined> {
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
}

export interface GetClipsResponse {
  clips: unknown[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// =============================================================================
// GET CLIP BY ID
// =============================================================================

/** GET /api/clips/:id */
export interface GetClipByIdParams extends Record<string, string> {
  id: string;
}

/** Re-export ClipWithRelations as the response type for GET /api/clips/:id */
export type { ClipWithRelations as GetClipByIdResponse } from "../../services/ClipService.js";

// =============================================================================
// GET CLIPS FOR SCENE
// =============================================================================

/** GET /api/scenes/:id/clips */
export interface GetClipsForSceneParams extends Record<string, string> {
  id: string;
}

export interface GetClipsForSceneQuery extends Record<string, string | string[] | undefined> {
  includeUngenerated?: string;
  instanceId?: string;
}

export interface GetClipsForSceneResponse {
  clips: unknown[];
}
