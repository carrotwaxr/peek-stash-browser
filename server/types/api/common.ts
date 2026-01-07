// server/types/api/common.ts
/**
 * Common API Types
 *
 * Shared types used across all API endpoints.
 */

/**
 * Standard pagination filter accepted by most list endpoints
 */
export interface PaginationFilter {
  page?: number;
  per_page?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
  q?: string;
}

/**
 * Count-based filter for minimal endpoints.
 * Used to filter entities by their content counts (e.g., only show performers with scenes).
 * Multiple filters use OR logic - entity passes if ANY condition is met.
 */
export interface MinimalCountFilter {
  min_scene_count?: number;
  min_gallery_count?: number;
  min_image_count?: number;
  min_performer_count?: number;
  min_group_count?: number;
}

/**
 * Standard error response
 */
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: string;
  errorType?: string;
}

/**
 * Standard success response with optional message
 */
export interface ApiSuccessResponse {
  success: true;
  message?: string;
}

/**
 * Cache not ready response (503)
 */
export interface CacheNotReadyResponse {
  error: string;
  message: string;
  ready: false;
}
