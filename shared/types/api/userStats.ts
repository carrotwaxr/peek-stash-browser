// shared/types/api/userStats.ts
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
  clipCount: number;
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
 * A scene ranked by engagement
 * Raw engagement: (oCount × 5) + (normalizedDuration × 1) + (playCount × 1)
 */
export interface TopScene {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  title: string | null;
  filePath: string | null; // For title fallback (basename)
  imageUrl: string | null;
  playCount: number;
  playDuration: number; // seconds
  oCount: number;
  score: number; // Percentile among the user's engaged entities by engagement score, 100 = top
}

/**
 * A performer ranked by engagement. A lead in Top Performers, a partner in
 * Top Partners.
 */
export interface TopPerformer {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  playDuration: number; // seconds
  oCount: number;
  score: number; // Percentile among the user's engaged entities by engagement score, 100 = top
}

/**
 * A studio ranked by engagement
 */
export interface TopStudio {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  playDuration: number; // seconds
  oCount: number;
  score: number; // Percentile among the user's engaged entities by engagement score, 100 = top
}

/**
 * A tag ranked by engagement
 */
export interface TopTag {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  playDuration: number; // seconds
  oCount: number;
  score: number; // Percentile among the user's engaged entities by engagement score, 100 = top
}

// =============================================================================
// HIGHLIGHTS
// =============================================================================

/**
 * A highlighted scene (most watched, most O'd, etc.)
 */
export interface HighlightScene {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  title: string | null;
  filePath: string | null; // For title fallback (basename)
  imageUrl: string | null;
  playCount?: number;
  oCount?: number;
}

/**
 * A highlighted image (most viewed)
 */
export interface HighlightImage {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
  title: string | null;
  filePath: string | null; // For title fallback (basename)
  imageUrl: string | null;
  viewCount: number;
}

/**
 * A highlighted performer (most O'd)
 */
export interface HighlightPerformer {
  id: string;
  /** The Stash instance the entity is on: with `id`, what names it */
  instanceId: string;
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
  topScenes: TopScene[];
  topPerformers: TopPerformer[];
  /** Performers of the viewer's partner genders; [] unless they set some */
  topPartners: TopPerformer[];
  topStudios: TopStudio[];
  topTags: TopTag[];
  mostWatchedScene: HighlightScene | null;
  mostViewedImage: HighlightImage | null;
  mostOdScene: HighlightScene | null;
  mostOdPerformer: HighlightPerformer | null;
}
