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

/**
 * What a scoped tag tree covers: the scenes of a performer, tag, studio and
 * collection (all that are given). Each is `"id:instanceId"`, or a bare id
 * for that id on every instance the user sees.
 */
export interface TagTreeScope {
  performer?: string;
  tag?: string;
  studio?: string;
  group?: string;
}

/**
 * POST /api/library/tags/tree - every tag the user can see, compact, for the
 * Tags page's hierarchy view and the folder view (children are derived on
 * the client). With a scope, only the tags on the scope's visible scenes and
 * their visible ancestors.
 */
export interface FindTagTreeRequest {
  scope?: TagTreeScope;
}

/** A tag in the tree. Its parents and their ids are on its own instance. */
export interface TagTreeRow {
  id: string;
  instanceId: string;
  name: string;
  image_path: string | null;
  /**
   * The parents in this response: one the user cannot see is left out, so a
   * tag whose every parent is hidden is a root
   */
  parents: Array<{ id: string }>;
  /**
   * The tag's scenes (the greater of its own and its performers', as in the
   * list); with a scope, the scope's visible scenes that carry the tag
   */
  scene_count: number;
  /** With a scope: 0 */
  image_count: number;
  /** With a scope: 0 */
  gallery_count: number;
  /** With a scope: 0 */
  performer_count: number;
  created_at: string | null;
  updated_at: string | null;
  /** The requesting user's own rating, favorite and O count */
  rating100: number | null;
  favorite: boolean;
  o_counter: number;
}

export interface FindTagTreeResponse {
  tags: TagTreeRow[];
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
