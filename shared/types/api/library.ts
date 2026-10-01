// shared/types/api/library.ts
/**
 * Library API Types
 *
 * Request and response types for /api/library/* endpoints. A list request
 * carries its entity's filter as the contract in `shared/types/filters`
 * declares it; every row of a list response carries `stashUrl`.
 */
import type {
  ImageListItem,
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../entities.js";
import type { ListRequestInput } from "../filters/index.js";
import type { MinimalCountFilter } from "./common.js";

/**
 * A list row with its View in Stash link: the entity's page in its own Stash,
 * or null when the viewer is not an admin (Stash's address reaches only admins)
 */
export type WithStashUrl<T> = T & { stashUrl: string | null };

// =============================================================================
// ENTITY PICKERS
// =============================================================================

/**
 * A picker's reach beyond what the user sees. "allEnabled": every live
 * entity on every enabled instance past its first sync, the user's own
 * hidden items included, for an admin's Content Restrictions editor, which
 * restricts another user on any server. Admins only.
 */
export type MinimalScope = "allEnabled";

/**
 * POST /api/library/<entities>/minimal: the entity pickers (filter
 * dropdowns, carousel rules, content restrictions). One page in name order,
 * of what the user can see on the instances they use (or, with `scope`,
 * every live entity on every enabled instance).
 */
export interface MinimalRequest {
  /**
   * Only these entities, as `"id:instanceId"` (a bare id is that id on every
   * instance the user sees): how a picker names its selected values. At most
   * MINIMAL_IDS_MAX (100).
   */
  ids?: string[];
  /**
   * "allEnabled" lists every live entity on every enabled instance past its
   * first sync, in place of the user's selection and past the user's own
   * hidden items, so an admin can restrict what they hid for themselves.
   * 403 for anyone but an admin.
   */
  scope?: MinimalScope;
  filter?: {
    /** Matched anywhere in the name or an alias, ignoring case */
    q?: string;
    /** 1 to MINIMAL_PER_PAGE_MAX (100); 50 when absent */
    per_page?: number;
  };
  /** The counts an entity must reach, any one of them */
  count_filter?: MinimalCountFilter;
}

/**
 * An entity as a picker lists it. A gallery without a title is named by its
 * file, else its folder. When listed entities of two instances share a name,
 * each one not on the default instance carries its instance's name.
 */
export interface MinimalEntity {
  id: string;
  instanceId: string;
  name: string;
}

// =============================================================================
// SCENES
// =============================================================================

/**
 * POST /api/library/scenes - Find scenes with filters
 */
export type FindScenesRequest = ListRequestInput<"scene">;

/**
 * A list response's total: a number, or null when the request asked for no
 * count (`filter.count: false`, or the clip list's `count=false`). A reader
 * that never sends the flag reads the default, a number.
 */
export type ListCount = number | null;

export interface FindScenesResponse<Count extends ListCount = number> {
  findScenes: {
    count: Count;
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
  /** The seed's instance (required; a request without it answers 400) */
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
    /** Performers, studios and tags the user's viewing ranks in its top half */
    rankedEntities: number;
  };
}

// =============================================================================
// PERFORMERS
// =============================================================================

/**
 * POST /api/library/performers - Find performers with filters
 */
export type FindPerformersRequest = ListRequestInput<"performer">;

export interface FindPerformersResponse<Count extends ListCount = number> {
  findPerformers: {
    count: Count;
    performers: WithStashUrl<NormalizedPerformer>[];
  };
}

/**
 * POST /api/library/performers/minimal - Get minimal performer data
 */
export type FindPerformersMinimalRequest = MinimalRequest;

export interface FindPerformersMinimalResponse {
  performers: MinimalEntity[];
}

// =============================================================================
// STUDIOS
// =============================================================================

/**
 * POST /api/library/studios - Find studios with filters
 */
export type FindStudiosRequest = ListRequestInput<"studio">;

export interface FindStudiosResponse<Count extends ListCount = number> {
  findStudios: {
    count: Count;
    studios: WithStashUrl<NormalizedStudio>[];
  };
}

/**
 * POST /api/library/studios/minimal - Get minimal studio data
 */
export type FindStudiosMinimalRequest = MinimalRequest;

export interface FindStudiosMinimalResponse {
  studios: MinimalEntity[];
}

// =============================================================================
// TAGS
// =============================================================================

/**
 * POST /api/library/tags - Find tags with filters
 */
export type FindTagsRequest = ListRequestInput<"tag">;

export interface FindTagsResponse<Count extends ListCount = number> {
  findTags: {
    count: Count;
    tags: WithStashUrl<NormalizedTag>[];
  };
}

/**
 * POST /api/library/tags/minimal - Get minimal tag data
 */
export type FindTagsMinimalRequest = MinimalRequest;

export interface FindTagsMinimalResponse {
  tags: MinimalEntity[];
}

/**
 * What a scoped tag tree covers: the scenes of a performer, tag, studio,
 * collection and gallery (all that are given). Each is `"id:instanceId"`, or
 * a bare id for that id on every instance the user sees.
 */
export interface TagTreeScope {
  performer?: string;
  tag?: string;
  studio?: string;
  group?: string;
  gallery?: string;
}

/**
 * POST /api/library/tags/tree - every tag the user can see, compact, for the
 * Tags page's hierarchy view and the folder view (children are derived on
 * the client). With a scope, only the tags on the scope's visible scenes and
 * their visible ancestors.
 */
export interface FindTagTreeRequest {
  scope?: TagTreeScope;
  /**
   * The folder view's page type: the response carries how many of its items
   * have no tag of their own (the Untagged folder)
   */
  untagged?: UntaggedKind;
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

/** A folder view's page type, whose untagged items the tree can count */
export type UntaggedKind = "scene" | "gallery" | "image";

export interface FindTagTreeResponse {
  tags: TagTreeRow[];
  /**
   * With `untagged` in the request: the items of that type the user can see
   * with no tag of their own, the total of the Untagged folder's list
   * (`tag_count` EQUALS 0). With a scope, the scope's scenes (galleries and
   * images 0, as the scoped rows count).
   */
  untagged?: number;
}

// =============================================================================
// GALLERIES
// =============================================================================

/**
 * POST /api/library/galleries - Find galleries with filters
 */
export type FindGalleriesRequest = ListRequestInput<"gallery">;

export interface FindGalleriesResponse<Count extends ListCount = number> {
  findGalleries: {
    count: Count;
    galleries: WithStashUrl<NormalizedGallery>[];
  };
}

/**
 * POST /api/library/galleries/minimal - Get minimal gallery data
 */
export type FindGalleriesMinimalRequest = MinimalRequest;

export interface FindGalleriesMinimalResponse {
  galleries: MinimalEntity[];
}

// =============================================================================
// GROUPS
// =============================================================================

/**
 * POST /api/library/groups - Find groups with filters
 */
export type FindGroupsRequest = ListRequestInput<"group">;

export interface FindGroupsResponse<Count extends ListCount = number> {
  findGroups: {
    count: Count;
    groups: WithStashUrl<NormalizedGroup>[];
  };
}

/**
 * POST /api/library/groups/minimal - Get minimal group data
 */
export type FindGroupsMinimalRequest = MinimalRequest;

export interface FindGroupsMinimalResponse {
  groups: MinimalEntity[];
}

// =============================================================================
// IMAGES
// =============================================================================

/**
 * POST /api/library/images - Find images with filters
 */
export type FindImagesRequest = ListRequestInput<"image">;

export interface FindImagesResponse<Count extends ListCount = number> {
  findImages: {
    count: Count;
    images: WithStashUrl<ImageListItem>[];
  };
}

// =============================================================================
// DETAIL PAGE COUNTS
// =============================================================================

/**
 * A detail page's counted tabs, by the page's entity: each count is the
 * total of the tab's list for the viewer, with the tab's own filter
 */
export interface RelationCountsByType {
  performer: {
    scenes: number;
    galleries: number;
    images: number;
    groups: number;
  };
  studio: {
    scenes: number;
    galleries: number;
    images: number;
    performers: number;
    groups: number;
  };
  tag: {
    scenes: number;
    galleries: number;
    images: number;
    performers: number;
    studios: number;
    groups: number;
    /** The clips of the Clips page's default list (generated), with this tag */
    clips: number;
  };
  group: { scenes: number; performers: number };
  gallery: { images: number; scenes: number };
}

/** The entities whose detail pages ask for their counts */
export type RelationCountsType = keyof RelationCountsByType;

export interface RelationCountsParams extends Record<string, string> {
  id: string;
}

/**
 * GET /api/library/<entities>/:id/counts: the query. Anything else, or an
 * option of another page, answers 400.
 */
export interface RelationCountsQuery extends Record<
  string,
  string | undefined
> {
  /** The entity's instance (required) */
  instanceId?: string;
  /** Tag pages: "true" counts the sub-tags' content as the tabs list it */
  includeSubTags?: string;
  /** Studio pages: "true" counts the sub-studios' content as the tabs list it */
  includeSubStudios?: string;
}

/**
 * GET /api/library/<entities>/:id/counts: the page's tab counts, as the
 * viewer sees them (the same numbers as the entity's card). 404 for an
 * entity the viewer cannot see.
 */
export interface RelationCountsResponse<
  T extends RelationCountsType = RelationCountsType,
> {
  counts: RelationCountsByType[T];
}
