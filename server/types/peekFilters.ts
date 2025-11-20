/**
 * Peek Extended Filter Types
 *
 * These types extend the base filter types from stashapp-api
 * to include Peek-specific filter fields.
 */
import type {
  GalleryFilterType as BaseGalleryFilterType,
  GroupFilterType as BaseGroupFilterType,
  PerformerFilterType as BasePerformerFilterType,
  SceneFilterType as BaseSceneFilterType,
  StudioFilterType as BaseStudioFilterType,
  TagFilterType as BaseTagFilterType,
} from "stashapp-api";

/**
 * Peek Scene Filter
 * Adds custom Peek filter fields to base Stash scene filters
 */
export type PeekSceneFilter = BaseSceneFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  last_o_at?: { value?: string; value2?: string; modifier?: string };
  studio_favorite?: boolean;
  tag_favorite?: boolean;
  performer_favorite?: boolean;
};

/**
 * Peek Performer Filter
 * Adds custom Peek filter fields to base Stash performer filters
 */
export type PeekPerformerFilter = BasePerformerFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
};

/**
 * Peek Studio Filter
 * Adds custom Peek filter fields to base Stash studio filters
 */
export type PeekStudioFilter = BaseStudioFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  o_counter?: { value?: number; value2?: number; modifier?: string };
  play_count?: { value?: number; value2?: number; modifier?: string };
};

/**
 * Peek Tag Filter
 * Adds custom Peek filter fields to base Stash tag filters
 */
export type PeekTagFilter = BaseTagFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  rating100?: { value?: number; value2?: number; modifier?: string };
  o_counter?: { value?: number; value2?: number; modifier?: string };
  play_count?: { value?: number; value2?: number; modifier?: string };
  // Custom entity filters (not in Stash API)
  performers?: { value: string[]; modifier?: string };
  studios?: { value: string[]; modifier?: string };
  scenes_filter?: {
    id?: { value: string[]; modifier?: string };
    groups?: { value: string[]; modifier?: string };
  };
};

/**
 * Peek Gallery Filter
 * Adds custom Peek filter fields to base Stash gallery filters
 */
export type PeekGalleryFilter = BaseGalleryFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
};

/**
 * Peek Group Filter
 * Adds custom Peek filter fields to base Stash group filters
 */
export type PeekGroupFilter = BaseGroupFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
};
