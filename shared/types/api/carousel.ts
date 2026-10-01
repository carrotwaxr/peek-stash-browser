// shared/types/api/carousel.ts
/**
 * Carousel API Types
 *
 * Request and response types for /api/carousels/* endpoints.
 */
import type { NormalizedScene } from "../entities.js";
import type { SceneFilterInput } from "../filters/index.js";
import type { WithStashUrl } from "./library.js";

// =============================================================================
// COMMON TYPES
// =============================================================================

// Dates are ISO 8601 strings: that is what JSON carries.

/**
 * Carousel data structure
 * Note: rules is the scene filter stored as JSON, as the client saved it
 */
export interface CarouselData {
  id: string;
  userId: number;
  title: string;
  icon: string;
  rules: SceneFilterInput;
  sort: string;
  direction: string;
  createdAt: string;
  updatedAt: string;
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
 * The rules a request sends: the scene filter the client builds
 * (`SceneFilterInput`). The server reads them as an unvalidated object and
 * checks them against the scene contract, so it takes any object.
 */
export type CarouselRulesInput = object;

/**
 * POST /api/carousels
 * Create a new custom carousel
 */
export interface CreateCarouselRequest {
  title: string;
  icon?: string;
  rules: CarouselRulesInput;
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
  rules?: CarouselRulesInput;
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
  rules: CarouselRulesInput;
  sort?: string;
  direction?: string;
}

export interface PreviewCarouselResponse {
  scenes: WithStashUrl<NormalizedScene>[];
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
  scenes: WithStashUrl<NormalizedScene>[];
}
