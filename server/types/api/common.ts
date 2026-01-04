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
 * Standard error response
 */
export interface ApiErrorResponse {
  error: string;
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
