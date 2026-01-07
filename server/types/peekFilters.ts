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
  groups?: { value: string[]; modifier?: string };
  galleries?: { value: string[]; modifier?: string };
};

/**
 * Peek Performer Filter
 * Adds custom Peek filter fields to base Stash performer filters
 */
export type PeekPerformerFilter = BasePerformerFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  // Additional filters using custom format for compatibility with frontend
  name?: { value?: string; modifier?: string };
  details?: { value?: string; modifier?: string };
  tattoos?: { value?: string; modifier?: string };
  piercings?: { value?: string; modifier?: string };
  measurements?: { value?: string; modifier?: string };
  height?: { value?: number; value2?: number; modifier?: string };
  eye_color?: { value?: string; modifier?: string };
  ethnicity?: { value?: string; modifier?: string };
  hair_color?: { value?: string; modifier?: string };
  fake_tits?: { value?: string; modifier?: string };
  birth_year?: { value?: number; value2?: number; modifier?: string };
  death_year?: { value?: number; value2?: number; modifier?: string };
  age?: { value?: number; value2?: number; modifier?: string };
  career_length?: { value?: number; value2?: number; modifier?: string };
  birthdate?: { value?: string; value2?: string; modifier?: string };
  death_date?: { value?: string; value2?: string; modifier?: string };
  penis_length?: { value?: number; value2?: number; modifier?: string };
  scenes?: { value: string[]; modifier?: string };
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
  scenes?: { value: string[]; modifier?: string };
};

/**
 * Peek Group Filter
 * Adds custom Peek filter fields to base Stash group filters
 */
export type PeekGroupFilter = BaseGroupFilterType & {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  scenes?: { value: string[]; modifier?: string };
};
