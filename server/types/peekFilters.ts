/**
 * Peek Extended Filter Types
 *
 * These types extend the base filter types from the internal graphql module
 * to include Peek-specific filter fields.
 *
 * Entity reference arrays use InstanceAwareId[] to enforce composite key
 * format ("entityId:instanceId") at compile time, preventing multi-instance
 * collision bugs (#361, #368, #390, #400, #401).
 */
import type {
  GalleryFilterType as BaseGalleryFilterType,
  GroupFilterType as BaseGroupFilterType,
  PerformerFilterType as BasePerformerFilterType,
  SceneFilterType as BaseSceneFilterType,
  StudioFilterType as BaseStudioFilterType,
  TagFilterType as BaseTagFilterType,
} from "../graphql/types.js";
import type { InstanceAwareId } from "@peek/shared-types/instanceAwareId.js";

/** Entity reference filter field with branded composite keys */
export interface EntityRefFilter {
  value: InstanceAwareId[];
  modifier?: string;
}

/**
 * Peek Scene Filter
 * Adds custom Peek filter fields to base Stash scene filters.
 * Entity reference fields override base types with InstanceAwareId[].
 */
export type PeekSceneFilter = BaseSceneFilterType & {
  ids?: EntityRefFilter;
  performers?: EntityRefFilter;
  tags?: EntityRefFilter;
  studios?: EntityRefFilter;
  groups?: EntityRefFilter;
  galleries?: EntityRefFilter;
  favorite?: boolean;
  last_o_at?: { value?: string; value2?: string; modifier?: string };
  studio_favorite?: boolean;
  tag_favorite?: boolean;
  performer_favorite?: boolean;
  instance_id?: string;
};

/**
 * Peek Performer Filter
 * Adds custom Peek filter fields to base Stash performer filters.
 * Entity reference fields override base types with InstanceAwareId[].
 */
export type PeekPerformerFilter = BasePerformerFilterType & {
  ids?: EntityRefFilter;
  tags?: EntityRefFilter;
  favorite?: boolean;
  instance_id?: string;
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
  scenes?: EntityRefFilter;
};

/**
 * Peek Studio Filter
 * Adds custom Peek filter fields to base Stash studio filters.
 */
export type PeekStudioFilter = BaseStudioFilterType & {
  ids?: EntityRefFilter;
  favorite?: boolean;
  instance_id?: string;
  o_counter?: { value?: number; value2?: number; modifier?: string };
  play_count?: { value?: number; value2?: number; modifier?: string };
};

/**
 * Peek Tag Filter
 * Adds custom Peek filter fields to base Stash tag filters.
 */
export type PeekTagFilter = BaseTagFilterType & {
  ids?: EntityRefFilter;
  favorite?: boolean;
  instance_id?: string;
  rating100?: { value?: number; value2?: number; modifier?: string };
  o_counter?: { value?: number; value2?: number; modifier?: string };
  play_count?: { value?: number; value2?: number; modifier?: string };
  scene_count?: { value?: number; value2?: number; modifier?: string };
  // Custom entity filters (not in Stash API)
  performers?: EntityRefFilter;
  studios?: EntityRefFilter;
  scenes_filter?: {
    id?: EntityRefFilter;
    groups?: EntityRefFilter;
  };
};

/**
 * Peek Gallery Filter
 * Adds custom Peek filter fields to base Stash gallery filters.
 */
export type PeekGalleryFilter = BaseGalleryFilterType & {
  ids?: EntityRefFilter;
  performers?: EntityRefFilter;
  tags?: EntityRefFilter;
  studios?: EntityRefFilter;
  favorite?: boolean;
  instance_id?: string;
  hasFavoriteImage?: boolean;
  scenes?: EntityRefFilter;
};

/**
 * Peek Group Filter
 * Adds custom Peek filter fields to base Stash group filters.
 */
export type PeekGroupFilter = BaseGroupFilterType & {
  ids?: EntityRefFilter;
  tags?: EntityRefFilter;
  studios?: EntityRefFilter;
  favorite?: boolean;
  instance_id?: string;
  scenes?: EntityRefFilter;
  scene_count?: { value?: number; value2?: number; modifier?: string };
};
