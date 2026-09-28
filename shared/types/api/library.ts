// shared/types/api/library.ts
/**
 * Library API Types
 *
 * Request and response types for /api/library/* endpoints. A list request
 * carries its entity's filter as the contract in `shared/types/filters`
 * declares it; every row of a list response carries `stashUrl`.
 */
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../entities.js";
import type { ListRequestInput } from "../filters/index.js";
import type { MinimalCountFilter, PaginationFilter } from "./common.js";

/**
 * A list row with its View in Stash link: the entity's page in its own Stash,
 * or null when the viewer is not an admin (Stash's address reaches only admins)
 */
export type WithStashUrl<T> = T & { stashUrl: string | null };

// =============================================================================
// SCENES
// =============================================================================

/**
 * POST /api/library/scenes - Find scenes with filters
 */
export type FindScenesRequest = ListRequestInput<"scene">;

export interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: WithStashUrl<NormalizedScene>[];
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
  /** The seed's instance; without it, the first instance the user can see it on */
  instanceId?: string;
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
export type FindPerformersRequest = ListRequestInput<"performer">;

export interface FindPerformersResponse {
  findPerformers: {
    count: number;
    performers: WithStashUrl<NormalizedPerformer>[];
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
export type FindStudiosRequest = ListRequestInput<"studio">;

export interface FindStudiosResponse {
  findStudios: {
    count: number;
    studios: WithStashUrl<NormalizedStudio>[];
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
export type FindTagsRequest = ListRequestInput<"tag">;

export interface FindTagsResponse {
  findTags: {
    count: number;
    tags: WithStashUrl<NormalizedTag>[];
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
export type FindGalleriesRequest = ListRequestInput<"gallery">;

export interface FindGalleriesResponse {
  findGalleries: {
    count: number;
    galleries: WithStashUrl<NormalizedGallery>[];
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
export type FindGroupsRequest = ListRequestInput<"group">;

export interface FindGroupsResponse {
  findGroups: {
    count: number;
    groups: WithStashUrl<NormalizedGroup>[];
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
 * POST /api/library/images - Find images with filters
 */
export type FindImagesRequest = ListRequestInput<"image">;

export interface FindImagesResponse {
  findImages: {
    count: number;
    images: WithStashUrl<NormalizedImage>[];
  };
}
