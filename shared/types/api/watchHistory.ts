// shared/types/api/watchHistory.ts
/**
 * Watch History API Types
 *
 * Request and response types for /api/watch-history/* endpoints.
 */
import type { NormalizedScene } from "../entities.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Watch history data returned in responses
 */
export interface WatchHistoryData {
  playCount: number;
  playDuration: number;
  resumeTime: number | null;
  lastPlayedAt: Date | null;
}

// =============================================================================
// SAVE ACTIVITY
// =============================================================================

/**
 * POST /api/watch-history/save-activity
 * Save resume time and play duration delta (called by track-activity plugin)
 */
export interface SaveActivityRequest {
  /** The scene's instance: required, the server never guesses one */
  instanceId: string;
  sceneId: string;
  resumeTime?: number;
  playDuration?: number;
}

export interface SaveActivityResponse {
  success: true;
  watchHistory: WatchHistoryData;
}

// =============================================================================
// INCREMENT PLAY COUNT
// =============================================================================

/**
 * POST /api/watch-history/increment-play-count
 * Increment play count when minimum play percentage is reached
 */
export interface IncrementPlayCountRequest {
  /** The scene's instance: required, the server never guesses one */
  instanceId: string;
  sceneId: string;
  /**
   * One viewing's token (1 to 64 characters), the same on every retry of its
   * request: the server counts a token once for 10 minutes. A request
   * without one always counts.
   */
  playToken?: string;
}

export interface IncrementPlayCountResponse {
  success: true;
  watchHistory: WatchHistoryData;
}

// =============================================================================
// INCREMENT O COUNTER
// =============================================================================

/**
 * POST /api/watch-history/increment-o
 * Increment O counter for a scene
 */
export interface IncrementOCounterRequest {
  instanceId: string;
  sceneId: string;
}

export interface IncrementOCounterResponse {
  success: true;
  oCount: number;
  timestamp: string;
}

// =============================================================================
// DECREMENT O COUNTER
// =============================================================================

/**
 * POST /api/watch-history/decrement-o
 * Remove the user's newest O on a scene ("Remove last O"). At 0 Os it
 * changes nothing and answers oCount 0.
 */
export interface DecrementOCounterRequest {
  instanceId: string;
  sceneId: string;
}

export interface DecrementOCounterResponse {
  success: true;
  oCount: number;
}

// =============================================================================
// GET WATCHED SCENES
// =============================================================================

/**
 * The views of `GET /api/watch-history/scenes`:
 * - `all`: played, watched for any time, or left with a resume point (a
 *   scene with only an O is not watched)
 * - `in_progress`: a resume point before the final 10% of the scene, with at
 *   least 2% of it watched (any resume point when the length is unknown)
 * - `completed`: played at least once, and the last session finished
 *   (resume point 0) or stopped within the final 10% of the scene
 */
export const WATCHED_SCENES_VIEWS = [
  "all",
  "in_progress",
  "completed",
] as const;
export type WatchedScenesView = (typeof WATCHED_SCENES_VIEWS)[number];

/**
 * The orders: `recent` by last played (never-dated rows last),
 * `most_watched` by play count, `longest_duration` by time watched
 */
export const WATCHED_SCENES_SORTS = [
  "recent",
  "most_watched",
  "longest_duration",
] as const;
export type WatchedScenesSort = (typeof WATCHED_SCENES_SORTS)[number];

/**
 * GET /api/watch-history/scenes
 * The viewer's watched scenes they can see, one page, in the view and order
 * asked for. Unknown parameters or values are a 400.
 */
export interface GetWatchedScenesQuery extends Record<
  string,
  string | undefined
> {
  /** A `WatchedScenesView`; default `all` */
  view?: string;
  /** A `WatchedScenesSort`; default `recent` */
  sort?: string;
  /** Default 1 */
  page?: string;
  /** 1 to 250; default 24 */
  per_page?: string;
  /** `false` skips the totals (both answer null); default `true` */
  count?: string;
}

export interface GetWatchedScenesResponse {
  scenes: NormalizedScene[];
  /** Every scene in the view; null when the request sent `count=false` */
  total: number | null;
  /** Seconds watched over every scene in the view; null with `count=false` */
  totalPlayDuration: number | null;
}

// =============================================================================
// GET WATCH HISTORY
// =============================================================================

/**
 * GET /api/watch-history/:sceneId
 * Get watch history for a specific scene
 */
export interface GetWatchHistoryParams extends Record<string, string> {
  sceneId: string;
}

export interface GetWatchHistoryResponse {
  exists: boolean;
  resumeTime: number | null;
  playCount: number;
  playDuration?: number;
  lastPlayedAt?: Date | null;
  oCount: number;
  oHistory?: string[];
  playHistory?: string[];
}

// =============================================================================
// CLEAR ALL WATCH HISTORY
// =============================================================================

/**
 * DELETE /api/watch-history
 * Clear all watch history for current user
 */
export interface ClearAllWatchHistoryResponse {
  success: true;
  deletedCounts: {
    watchHistory: number;
    performerStats: number;
    studioStats: number;
    tagStats: number;
    rankings: number;
  };
  message: string;
}
