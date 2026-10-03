// shared/types/api/clips.ts
import type { ClipListRequestInput } from "../filters/index.js";
import type { ListCount } from "./library.js";

/**
 * Clips API Types
 *
 * Request and response types for /api/clips/* endpoints.
 */

// =============================================================================
// CLIP ROW
// =============================================================================

/** A clip's tag as the row carries it */
export interface ClipTagRef {
  id: string;
  name: string;
  color: string | null;
}

/**
 * A clip as the clips endpoints answer it, with its instance and its
 * scene's. Raw Stash paths are not sent: the screenshots are proxy URLs, and
 * the preview is `/api/proxy/clip/:id/preview`. Dates are ISO strings.
 */
export interface ClipWithRelations {
  id: string;
  instanceId: string;
  sceneId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  screenshotUrl: string | null;
  isGenerated: boolean;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;
  primaryTag: ClipTagRef | null;
  tags: ClipTagRef[];
  scene: {
    id: string;
    instanceId: string;
    title: string | null;
    pathScreenshot: string | null;
    studioId: string | null;
  };
}

// =============================================================================
// FIND CLIPS
// =============================================================================

/** POST /api/library/clips: the clip list's filter body */
export type FindClipsRequest = ClipListRequestInput;

/** POST /api/library/clips answers as GET /api/clips does */
export type FindClipsResponse<Count extends ListCount = number> =
  GetClipsResponse<Count>;

// =============================================================================
// GET CLIPS
// =============================================================================

/**
 * GET /api/clips: the old query parameters, kept for callers that still send
 * them; each maps onto a `clip_filter` field (`POST /api/library/clips`)
 */
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
  clips: ClipWithRelations[];
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

/** The clip; a bare id held by several instances answers 400 instead */
export type GetClipByIdResponse = ClipWithRelations;

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
  clips: ClipWithRelations[];
}
