// server/types/api/library.ts
/**
 * Library API Types
 *
 * Request and response types for /api/library/* endpoints.
 */
import type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
  PeekSceneFilter,
  PeekPerformerFilter,
  PeekStudioFilter,
  PeekTagFilter,
  PeekGalleryFilter,
  PeekGroupFilter,
} from "../index.js";
import type { PaginationFilter } from "./common.js";

// =============================================================================
// SCENES
// =============================================================================

/**
 * POST /api/library/scenes - Find scenes with filters
 */
export interface FindScenesRequest {
  filter?: PaginationFilter;
  scene_filter?: PeekSceneFilter;
  ids?: string[];
}

export interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: NormalizedScene[];
  };
}

/**
 * GET /api/library/scenes/:id/similar - Find similar scenes
 */
export interface FindSimilarScenesParams extends Record<string, string> {
  id: string;
}

export interface FindSimilarScenesQuery extends Record<string, string | undefined> {
  page?: string;
}

export interface FindSimilarScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
}

/**
 * GET /api/library/scenes/recommended - Get recommended scenes
 */
export interface GetRecommendedScenesQuery extends Record<string, string | undefined> {
  page?: string;
  per_page?: string;
}

export interface GetRecommendedScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
  message?: string;
  criteria?: {
    favoritedPerformers: number;
    ratedPerformers: number;
    favoritedStudios: number;
    ratedStudios: number;
    favoritedTags: number;
    ratedTags: number;
    favoritedScenes: number;
    ratedScenes: number;
  };
}

/**
 * PUT /api/library/scenes/:id - Update scene
 */
export interface UpdateSceneParams extends Record<string, string> {
  id: string;
}

export interface UpdateSceneRequest {
  title?: string;
  details?: string;
  date?: string;
  rating100?: number;
  studio_id?: string;
  performer_ids?: string[];
  tag_ids?: string[];
  [key: string]: unknown; // Allow pass-through to Stash API
}

export interface UpdateSceneResponse {
  success: true;
  scene: NormalizedScene;
}

// =============================================================================
// PERFORMERS
// =============================================================================

/**
 * POST /api/library/performers - Find performers with filters
 */
export interface FindPerformersRequest {
  filter?: PaginationFilter;
  performer_filter?: PeekPerformerFilter;
  ids?: string[];
}

export interface FindPerformersResponse {
  findPerformers: {
    count: number;
    performers: NormalizedPerformer[];
  };
}

/**
 * POST /api/library/performers/minimal - Get minimal performer data
 */
export interface FindPerformersMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindPerformersMinimalResponse {
  performers: Array<{ id: string; name: string }>;
}

/**
 * PUT /api/library/performers/:id - Update performer
 */
export interface UpdatePerformerParams extends Record<string, string> {
  id: string;
}

export interface UpdatePerformerRequest {
  name?: string;
  details?: string;
  [key: string]: unknown;
}

export interface UpdatePerformerResponse {
  success: true;
  performer: NormalizedPerformer;
}

// =============================================================================
// STUDIOS
// =============================================================================

/**
 * POST /api/library/studios - Find studios with filters
 */
export interface FindStudiosRequest {
  filter?: PaginationFilter;
  studio_filter?: PeekStudioFilter;
  ids?: string[];
}

export interface FindStudiosResponse {
  findStudios: {
    count: number;
    studios: NormalizedStudio[];
  };
}

/**
 * POST /api/library/studios/minimal - Get minimal studio data
 */
export interface FindStudiosMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindStudiosMinimalResponse {
  studios: Array<{ id: string; name: string }>;
}

// =============================================================================
// TAGS
// =============================================================================

/**
 * POST /api/library/tags - Find tags with filters
 */
export interface FindTagsRequest {
  filter?: PaginationFilter;
  tag_filter?: PeekTagFilter;
  ids?: string[];
}

export interface FindTagsResponse {
  findTags: {
    count: number;
    tags: NormalizedTag[];
  };
}

/**
 * POST /api/library/tags/minimal - Get minimal tag data
 */
export interface FindTagsMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindTagsMinimalResponse {
  tags: Array<{ id: string; name: string }>;
}

// =============================================================================
// GALLERIES
// =============================================================================

/**
 * POST /api/library/galleries - Find galleries with filters
 */
export interface FindGalleriesRequest {
  filter?: PaginationFilter;
  gallery_filter?: PeekGalleryFilter;
  ids?: string[];
}

export interface FindGalleriesResponse {
  findGalleries: {
    count: number;
    galleries: NormalizedGallery[];
  };
}

/**
 * GET /api/library/galleries/:id - Get single gallery
 */
export interface GetGalleryParams extends Record<string, string> {
  id: string;
}

export interface GetGalleryResponse {
  gallery: NormalizedGallery | null;
}

/**
 * GET /api/library/galleries/:id/images - Get gallery images
 */
export interface GetGalleryImagesParams extends Record<string, string> {
  id: string;
}

export interface GetGalleryImagesQuery
  extends Record<string, string | undefined> {
  page?: string;
  per_page?: string;
}

export interface GetGalleryImagesResponse {
  images: Array<{
    id: string;
    title?: string;
    files?: Array<{ width?: number; height?: number }>;
    paths?: { thumbnail?: string };
  }>;
  count: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * POST /api/library/galleries/minimal - Get minimal gallery data
 */
export interface FindGalleriesMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindGalleriesMinimalResponse {
  galleries: Array<{ id: string; title: string }>;
}

// =============================================================================
// GROUPS
// =============================================================================

/**
 * POST /api/library/groups - Find groups with filters
 */
export interface FindGroupsRequest {
  filter?: PaginationFilter;
  group_filter?: PeekGroupFilter;
  ids?: string[];
}

export interface FindGroupsResponse {
  findGroups: {
    count: number;
    groups: NormalizedGroup[];
  };
}

/**
 * POST /api/library/groups/minimal - Get minimal group data
 */
export interface FindGroupsMinimalRequest {
  filter?: PaginationFilter;
}

export interface FindGroupsMinimalResponse {
  groups: Array<{ id: string; name: string }>;
}

// =============================================================================
// IMAGES
// =============================================================================

/**
 * POST /api/library/images - Find images with filters
 */
export interface FindImagesRequest {
  filter?: PaginationFilter;
  image_filter?: Record<string, unknown>; // TODO: Add PeekImageFilter
  ids?: string[];
}

export interface FindImagesResponse {
  findImages: {
    count: number;
    images: Array<{
      id: string;
      title?: string;
      rating100?: number;
      favorite?: boolean;
      o_counter?: number;
      files?: Array<{ width?: number; height?: number }>;
      paths?: { thumbnail?: string };
      galleries?: Array<{ id: string; title?: string }>;
      performers?: Array<{ id: string; name: string }>;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name: string }>;
    }>;
  };
}
