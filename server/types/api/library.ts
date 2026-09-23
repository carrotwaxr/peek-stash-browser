// server/types/api/library.ts
/**
 * Library API Types
 *
 * Request and response types for /api/library/* endpoints.
 */
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
  PeekGalleryFilter,
  PeekGroupFilter,
  PeekPerformerFilter,
  PeekSceneFilter,
  PeekStudioFilter,
  PeekTagFilter,
} from "../index.js";
import type { MinimalCountFilter, PaginationFilter } from "./common.js";

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

export interface FindSimilarScenesQuery extends Record<
  string,
  string | undefined
> {
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
export interface GetRecommendedScenesQuery extends Record<
  string,
  string | undefined
> {
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
  count_filter?: MinimalCountFilter;
}

export interface FindPerformersMinimalResponse {
  performers: Array<{ id: string; name: string; instanceId: string }>;
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
  count_filter?: MinimalCountFilter;
}

export interface FindStudiosMinimalResponse {
  studios: Array<{ id: string; name: string; instanceId: string }>;
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
  count_filter?: MinimalCountFilter;
}

export interface FindTagsMinimalResponse {
  tags: Array<{ id: string; name: string; instanceId: string }>;
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
 * POST /api/library/galleries/minimal - Get minimal gallery data
 */
export interface FindGalleriesMinimalRequest {
  filter?: PaginationFilter;
  count_filter?: MinimalCountFilter;
}

export interface FindGalleriesMinimalResponse {
  galleries: Array<{ id: string; title: string; instanceId: string }>;
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
  count_filter?: MinimalCountFilter;
}

export interface FindGroupsMinimalResponse {
  groups: Array<{ id: string; name: string; instanceId: string }>;
}

// =============================================================================
// IMAGES
// =============================================================================

/**
 * Image filter for API requests
 * Matches the internal ImageFilter structure from ImageQueryBuilder
 */
export interface PeekImageFilter {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  rating100?: { value: number; value2?: number; modifier: string };
  o_counter?: { value: number; value2?: number; modifier: string };
  performers?: { value: string[]; modifier?: string };
  tags?: { value: string[]; modifier?: string; depth?: number };
  studios?: { value: string[]; modifier?: string; depth?: number };
  galleries?: { value: string[]; modifier?: string };
  // Date filters
  date?: { value?: string; value2?: string; modifier?: string };
  created_at?: { value?: string; value2?: string; modifier?: string };
  updated_at?: { value?: string; value2?: string; modifier?: string };
}

/**
 * POST /api/library/images - Find images with filters
 */
export interface FindImagesRequest {
  filter?: PaginationFilter;
  image_filter?: PeekImageFilter;
  ids?: string[];
}

export interface FindImagesResponse {
  findImages: {
    count: number;
    images: NormalizedImage[];
  };
}

/**
 * Scene recommendation scoring intermediate type
 */
export interface ScoredSceneId {
  id: string;
  score: number;
  oCounter: number;
}
