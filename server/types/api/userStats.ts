// server/types/api/userStats.ts
/**
 * User Stats API Types
 *
 * Request and response types for /api/user-stats endpoint.
 */

// =============================================================================
// LIBRARY STATS
// =============================================================================

/**
 * Counts of entities in the user's Stash library
 */
export interface LibraryStats {
  sceneCount: number;
  performerCount: number;
  studioCount: number;
  tagCount: number;
  galleryCount: number;
  imageCount: number;
}

// =============================================================================
// ENGAGEMENT STATS
// =============================================================================

/**
 * Aggregate engagement metrics for the user
 */
export interface EngagementStats {
  totalWatchTime: number; // seconds
  totalPlayCount: number;
  totalOCount: number; // scenes + images
  totalImagesViewed: number;
  uniqueScenesWatched: number;
}

// =============================================================================
// TOP LISTS
// =============================================================================

/**
 * A performer ranked by engagement
 */
export interface TopPerformer {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  oCount: number;
}

/**
 * A studio ranked by engagement
 */
export interface TopStudio {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  oCount: number;
}

/**
 * A tag ranked by engagement
 */
export interface TopTag {
  id: string;
  name: string;
  playCount: number;
  oCount: number;
}

// =============================================================================
// HIGHLIGHTS
// =============================================================================

/**
 * A highlighted scene (most watched, most O'd, etc.)
 */
export interface HighlightScene {
  id: string;
  title: string;
  imageUrl: string | null;
  playCount?: number;
  oCount?: number;
}

/**
 * A highlighted image (most viewed)
 */
export interface HighlightImage {
  id: string;
  title: string | null;
  imageUrl: string | null;
  viewCount: number;
}

/**
 * A highlighted performer (most O'd)
 */
export interface HighlightPerformer {
  id: string;
  name: string;
  imageUrl: string | null;
  oCount: number;
}

// =============================================================================
// RESPONSE
// =============================================================================

/**
 * GET /api/user-stats
 * Complete user statistics response
 */
export interface UserStatsResponse {
  library: LibraryStats;
  engagement: EngagementStats;
  topPerformers: TopPerformer[];
  topStudios: TopStudio[];
  topTags: TopTag[];
  mostWatchedScene: HighlightScene | null;
  mostViewedImage: HighlightImage | null;
  mostOdScene: HighlightScene | null;
  mostOdPerformer: HighlightPerformer | null;
}
