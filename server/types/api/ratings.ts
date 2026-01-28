// server/types/api/ratings.ts
/**
 * Ratings API Types
 *
 * Request and response types for /api/ratings/* endpoints.
 */

// =============================================================================
// COMMON RATING TYPES
// =============================================================================

/**
 * Common request body for all rating updates
 */
export interface UpdateRatingRequest {
  /** Optional Stash instance ID - for multi-instance disambiguation when the same entity ID exists in multiple instances */
  instanceId?: string;
  rating?: number | null;
  favorite?: boolean;
}

/**
 * Common response for all rating updates
 */
export interface UpdateRatingResponse {
  success: true;
  rating: {
    id: number;
    instanceId: string | null;
    rating: number | null;
    favorite: boolean;
  };
}

// =============================================================================
// SCENE RATING
// =============================================================================

/**
 * PUT /api/ratings/scenes/:sceneId
 */
export interface UpdateSceneRatingParams extends Record<string, string> {
  sceneId: string;
}

// =============================================================================
// PERFORMER RATING
// =============================================================================

/**
 * PUT /api/ratings/performers/:performerId
 */
export interface UpdatePerformerRatingParams extends Record<string, string> {
  performerId: string;
}

// =============================================================================
// STUDIO RATING
// =============================================================================

/**
 * PUT /api/ratings/studios/:studioId
 */
export interface UpdateStudioRatingParams extends Record<string, string> {
  studioId: string;
}

// =============================================================================
// TAG RATING
// =============================================================================

/**
 * PUT /api/ratings/tags/:tagId
 */
export interface UpdateTagRatingParams extends Record<string, string> {
  tagId: string;
}

// =============================================================================
// GALLERY RATING
// =============================================================================

/**
 * PUT /api/ratings/galleries/:galleryId
 */
export interface UpdateGalleryRatingParams extends Record<string, string> {
  galleryId: string;
}

// =============================================================================
// GROUP RATING
// =============================================================================

/**
 * PUT /api/ratings/groups/:groupId
 */
export interface UpdateGroupRatingParams extends Record<string, string> {
  groupId: string;
}

// =============================================================================
// IMAGE RATING
// =============================================================================

/**
 * PUT /api/ratings/images/:imageId
 */
export interface UpdateImageRatingParams extends Record<string, string> {
  imageId: string;
}
