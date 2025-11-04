/**
 * Nested/Partial Entity Types
 *
 * These types represent entities when they appear inside other entities.
 * For example, when a Performer appears in Scene.performers[], it contains
 * fewer fields than a full Performer object.
 *
 * These types are inferred from GraphQL queries and represent the actual
 * data structure returned by those queries.
 */

/**
 * Lightweight tag reference
 * Used when tags appear in: Performer.tags[], Studio.tags[], Scene.tags[]
 */
export interface NestedTag {
  id: string;
  name: string;
  image_path: string | null;
  favorite: boolean;
}

/**
 * Lightweight performer reference (compact query)
 * Used in Scene.performers[] from findScenesCompact query
 */
export interface NestedPerformerCompact {
  id: string;
  name: string;
  image_path: string | null;
  gender: string | null;
  tags?: NestedTag[];
  favorite?: boolean; // Added by Peek when merging user data
}

/**
 * Full performer reference (full query)
 * Used in Scene.performers[] from findScenes query
 */
export interface NestedPerformerFull {
  id: string;
  name: string;
  alias_list: string[];
  birthdate: string | null;
  career_length: string | null;
  circumcised: string | null;
  country: string | null;
  created_at: string;
  death_date: string | null;
  details: string | null;
  disambiguation: string | null;
  ethnicity: string | null;
  eye_color: string | null;
  fake_tits: string | null;
  favorite: boolean;
  gender: string | null;
  hair_color: string | null;
  height_cm: number | null;
  image_path: string | null;
  measurements: string | null;
  penis_length: number | null;
  piercings: string | null;
  rating100: number | null;
  tattoos: string | null;
  updated_at: string;
  tags?: NestedTag[];
}

/**
 * Lightweight studio reference (compact query)
 * Used in Scene.studio from findScenesCompact query
 */
export interface NestedStudioCompact {
  id: string;
  name: string;
  tags?: NestedTag[];
  favorite?: boolean; // Added by Peek when merging user data
}

/**
 * Full studio reference (full query)
 * Used in Scene.studio from findScenes query
 */
export interface NestedStudioFull {
  id: string;
  name: string;
  aliases: string[];
  created_at: string;
  details: string | null;
  favorite: boolean;
  ignore_auto_tag: boolean;
  parent_studio: {
    id: string;
    name: string;
  } | null;
  rating100: number | null;
  updated_at: string;
  url: string | null;
  tags?: NestedTag[];
}

/**
 * Lightweight gallery reference
 * Used in Scene.galleries[]
 */
export interface NestedGallery {
  id: string;
  title: string | null;
}

/**
 * Group reference with scene index
 * Used in Scene.groups[]
 */
export interface NestedGroup {
  id: string;
  name: string;
  scene_index?: number; // Position of scene within group
  favorite?: boolean; // Added by Peek when merging user data
}

/**
 * Scene group wrapper
 * Stash returns groups as { group: {...}, scene_index: number }
 */
export interface SceneGroup {
  group: NestedGroup;
  scene_index: number;
}

/**
 * Video file information
 * Used in Scene.files[]
 */
export interface VideoFile {
  audio_codec: string | null;
  basename: string;
  bit_rate: number;
  created_at: string;
  duration: number;
  format: string;
  frame_rate: number;
  height: number;
  path: string;
  size: number;
  updated_at: string;
  video_codec: string;
  width: number;
}

/**
 * Scene paths (media URLs)
 * Used in Scene.paths
 */
export interface ScenePaths {
  preview: string | null;
  screenshot: string | null;
  sprite: string | null;
  vtt: string | null;
  webp: string | null;
}

/**
 * Gallery paths (media URLs)
 * Used in Gallery.paths
 */
export interface GalleryPaths {
  cover: string | null;
  zip: string | null;
}
