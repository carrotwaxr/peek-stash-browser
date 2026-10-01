// shared/types/api/imageViewHistory.ts
/**
 * Image View History API Types
 *
 * Request and response types for /api/image-view-history/* endpoints.
 */

// =============================================================================
// INCREMENT IMAGE O COUNTER
// =============================================================================

/**
 * POST /api/image-view-history/increment-o
 * Increment O counter for an image
 */
export interface IncrementImageOCounterRequest {
  instanceId: string;
  imageId: string;
}

export interface IncrementImageOCounterResponse {
  success: true;
  oCount: number;
  timestamp: string;
}

// =============================================================================
// DECREMENT IMAGE O COUNTER
// =============================================================================

/**
 * POST /api/image-view-history/decrement-o
 * Remove the user's newest O on an image ("Remove last O"). At 0 Os it
 * changes nothing and answers oCount 0.
 */
export interface DecrementImageOCounterRequest {
  instanceId: string;
  imageId: string;
}

export interface DecrementImageOCounterResponse {
  success: true;
  oCount: number;
}

// =============================================================================
// RECORD IMAGE VIEW
// =============================================================================

/**
 * POST /api/image-view-history/view
 * Record image view when opened in Lightbox
 */
export interface RecordImageViewRequest {
  instanceId: string;
  imageId: string;
}

export interface RecordImageViewResponse {
  success: true;
  viewCount: number;
  lastViewedAt: Date | null;
}

// =============================================================================
// GET IMAGE VIEW HISTORY
// =============================================================================

/**
 * GET /api/image-view-history/:imageId
 * Get view history for a specific image
 */
export interface GetImageViewHistoryParams extends Record<string, string> {
  imageId: string;
}

export interface GetImageViewHistoryResponse {
  exists: boolean;
  viewCount: number;
  viewHistory?: string[];
  oCount: number;
  oHistory?: string[];
  lastViewedAt?: Date | null;
}
