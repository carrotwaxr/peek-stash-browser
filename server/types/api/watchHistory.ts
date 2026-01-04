// server/types/api/watchHistory.ts
/**
 * Watch History API Types
 *
 * Request and response types for /api/watch-history/* endpoints.
 */

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

/**
 * Full watch history record (includes oCount and history arrays)
 */
export interface FullWatchHistoryRecord {
  id: number;
  userId: number;
  sceneId: string;
  playCount: number;
  playDuration: number;
  resumeTime: number | null;
  lastPlayedAt: Date | null;
  oCount: number;
  oHistory: string[];
  playHistory: string[];
}

// =============================================================================
// PING WATCH HISTORY
// =============================================================================

/**
 * POST /api/watch-history/ping
 * Periodic ping from video player to track playback progress
 */
export interface PingWatchHistoryRequest {
  sceneId: string;
  currentTime: number;
  quality?: string;
  sessionStart?: string;
  seekEvents?: Array<{ from: number; to: number }>;
}

export interface PingWatchHistoryResponse {
  success: true;
  watchHistory: WatchHistoryData;
}

// =============================================================================
// SAVE ACTIVITY
// =============================================================================

/**
 * POST /api/watch-history/save-activity
 * Save resume time and play duration delta (called by track-activity plugin)
 */
export interface SaveActivityRequest {
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
  sceneId: string;
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
  sceneId: string;
}

export interface IncrementOCounterResponse {
  success: true;
  oCount: number;
  timestamp: string;
}

// =============================================================================
// GET ALL WATCH HISTORY
// =============================================================================

/**
 * GET /api/watch-history
 * Get all watch history for current user (Continue Watching carousel)
 */
export interface GetAllWatchHistoryQuery
  extends Record<string, string | undefined> {
  limit?: string;
  inProgress?: string;
}

export interface GetAllWatchHistoryResponse {
  watchHistory: FullWatchHistoryRecord[];
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
  };
  message: string;
}
