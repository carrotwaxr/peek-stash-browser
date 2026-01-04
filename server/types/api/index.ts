// server/types/api/index.ts
/**
 * API Types Index
 *
 * Re-exports all API request/response types for easy importing.
 *
 * Usage:
 *   import type { FindScenesRequest, FindScenesResponse } from "../types/api/index.js";
 */

// Common types
export type {
  PaginationFilter,
  ApiErrorResponse,
  ApiSuccessResponse,
  CacheNotReadyResponse,
} from "./common.js";

// Express typed helpers
export type {
  TypedRequest,
  TypedAuthRequest,
  TypedResponse,
} from "./express.js";

// Library endpoint types
export type {
  // Scenes
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  UpdateSceneParams,
  UpdateSceneRequest,
  UpdateSceneResponse,
  // Performers
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  UpdatePerformerParams,
  UpdatePerformerRequest,
  UpdatePerformerResponse,
  // Studios
  FindStudiosRequest,
  FindStudiosResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  UpdateStudioParams,
  UpdateStudioRequest,
  UpdateStudioResponse,
  // Tags
  FindTagsRequest,
  FindTagsResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  UpdateTagParams,
  UpdateTagRequest,
  UpdateTagResponse,
  // Galleries
  FindGalleriesRequest,
  FindGalleriesResponse,
  GetGalleryParams,
  GetGalleryResponse,
  GetGalleryImagesParams,
  GetGalleryImagesQuery,
  GetGalleryImagesResponse,
  GalleryImageWithContext,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  // Groups
  FindGroupsRequest,
  FindGroupsResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  // Images
  FindImagesRequest,
  FindImagesResponse,
  GetImageParams,
  GetImageResponse,
} from "./library.js";
