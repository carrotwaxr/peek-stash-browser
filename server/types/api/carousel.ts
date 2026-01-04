// server/types/api/carousel.ts
/**
 * Carousel API Types
 *
 * Request and response types for /api/carousels/* endpoints.
 */
import type { JsonValue } from "@prisma/client/runtime/library";
import type { NormalizedScene, PeekSceneFilter } from "../index.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Carousel data structure
 * Note: rules is JsonValue from Prisma since it's stored as JSON
 */
export interface CarouselData {
  id: string;
  userId: number;
  title: string;
  icon: string;
  rules: JsonValue;
  sort: string;
  direction: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// GET USER CAROUSELS
// =============================================================================

/**
 * GET /api/carousels
 * Get all custom carousels for the current user
 */
export interface GetUserCarouselsResponse {
  carousels: CarouselData[];
}

// =============================================================================
// GET CAROUSEL
// =============================================================================

/**
 * GET /api/carousels/:id
 * Get a single carousel by ID
 */
export interface GetCarouselParams extends Record<string, string> {
  id: string;
}

export interface GetCarouselResponse {
  carousel: CarouselData;
}

// =============================================================================
// CREATE CAROUSEL
// =============================================================================

/**
 * POST /api/carousels
 * Create a new custom carousel
 */
export interface CreateCarouselRequest {
  title: string;
  icon?: string;
  rules: PeekSceneFilter;
  sort?: string;
  direction?: string;
}

export interface CreateCarouselResponse {
  carousel: CarouselData;
}

// =============================================================================
// UPDATE CAROUSEL
// =============================================================================

/**
 * PUT /api/carousels/:id
 * Update an existing carousel
 */
export interface UpdateCarouselParams extends Record<string, string> {
  id: string;
}

export interface UpdateCarouselRequest {
  title?: string;
  icon?: string;
  rules?: PeekSceneFilter;
  sort?: string;
  direction?: string;
}

export interface UpdateCarouselResponse {
  carousel: CarouselData;
}

// =============================================================================
// DELETE CAROUSEL
// =============================================================================

/**
 * DELETE /api/carousels/:id
 * Delete a carousel
 */
export interface DeleteCarouselParams extends Record<string, string> {
  id: string;
}

export interface DeleteCarouselResponse {
  success: true;
  message: string;
}

// =============================================================================
// PREVIEW CAROUSEL
// =============================================================================

/**
 * POST /api/carousels/preview
 * Preview carousel results without saving
 */
export interface PreviewCarouselRequest {
  rules: PeekSceneFilter;
  sort?: string;
  direction?: string;
}

export interface PreviewCarouselResponse {
  scenes: NormalizedScene[];
}

// =============================================================================
// EXECUTE CAROUSEL BY ID
// =============================================================================

/**
 * GET /api/carousels/:id/execute
 * Execute a carousel by ID and return its scenes
 */
export interface ExecuteCarouselByIdParams extends Record<string, string> {
  id: string;
}

export interface ExecuteCarouselByIdResponse {
  carousel: {
    id: string;
    title: string;
    icon: string;
  };
  scenes: NormalizedScene[];
}
