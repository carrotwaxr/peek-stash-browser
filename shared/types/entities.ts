/**
 * Standalone Normalized Entity Types
 *
 * These types match the actual shapes produced by StashEntityService transform
 * methods and QueryBuilder populateRelations. They are standalone interfaces
 * (no dependency on Stash GraphQL types) so they can be shared across server
 * and client code.
 *
 * Design:
 * - Fields present in both QueryBuilder AND StashEntityService output → required
 * - Fields present in only one path → optional
 * - Nested relations use Ref types (lightweight relation references)
 */

// ─── Lightweight Relation References ─────────────────────────────────────────

export interface PerformerRef {
  id: string;
  instanceId: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  image_path: string | null;
  favorite: boolean | null;
  rating100: number | null;
}

export interface TagRef {
  id: string;
  instanceId: string;
  name: string;
  image_path: string | null;
  favorite: boolean | null;
}

export interface StudioRef {
  id: string;
  instanceId: string;
  name: string;
  image_path: string | null;
  favorite: boolean | null;
  parent_studio: { id: string } | null;
}

export interface GroupRef {
  id: string;
  instanceId: string;
  name: string;
  front_image_path: string | null;
  back_image_path: string | null;
}

export interface GalleryRef {
  id: string;
  instanceId: string;
  title: string | null;
  cover: string | null;
}

// ─── Scene File & Stream Types ───────────────────────────────────────────────

export interface SceneFile {
  path: string;
  duration: number | null;
  bit_rate: number | null;
  frame_rate: number | null;
  width: number | null;
  height: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  size: number | null;
}

export interface ScenePaths {
  screenshot: string | null;
  preview: string | null;
  sprite: string | null;
  vtt: string | null;
  chapters_vtt: string | null;
  stream: string | null;
  caption: string | null;
}

export interface SceneStream {
  url: string;
  mime_type?: string | null;
  label?: string | null;
}

// ─── NormalizedScene ─────────────────────────────────────────────────────────

export interface NormalizedScene {
  id: string;
  instanceId: string;
  title: string | null;
  code: string | null;
  date: string | null;
  details: string | null;
  rating100: number | null;
  organized: boolean;

  urls: string[];
  files: SceneFile[];
  paths: ScenePaths;
  sceneStreams: SceneStream[];
  captions: unknown[];

  // Nested entities (populated by QueryBuilder or transformSceneWithRelations)
  // Studio may be enriched with favorite/tags by mergeScenesWithUserData or QueryBuilder
  studio: {
    id: string;
    name?: string;
    instanceId?: string;
    image_path?: string | null;
    favorite?: boolean | null;
    parent_studio?: { id: string } | null;
    tags?: Array<{ id: string; name?: string; image_path?: string | null }>;
  } | null;
  // Performers may be PerformerRef (from QueryBuilder) or NormalizedPerformer (from transformSceneWithRelations)
  performers: Array<PerformerRef & { tags?: Array<{ id: string; name: string; image_path: string | null }> }>;
  tags: TagRef[];
  groups: Array<GroupRef & { scene_index?: number | null }>;
  galleries: GalleryRef[];

  // Inherited tags (pre-computed at sync time, hydrated at API response time)
  inheritedTagIds?: string[];
  inheritedTags?: Array<{ id: string; name: string }>;

  // User activity fields
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
  play_duration: number;
  resume_time: number;
  play_history: string[];
  o_history: Date[];
  last_played_at: string | null;
  last_o_at: string | null;

  // Transient field: set by QueryBuilder transformRow() but not part of the GraphQL type.
  // Used internally by populateRelations to look up studios without re-parsing.
  studioId?: string | null;

  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}

// ─── NormalizedPerformer ─────────────────────────────────────────────────────

export interface NormalizedPerformer {
  id: string;
  instanceId: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birthdate: string | null;
  favorite: boolean;
  rating100: number | null;
  scene_count: number;
  image_count: number;
  gallery_count: number;
  group_count: number;
  details: string | null;
  alias_list: string[];
  country: string | null;
  ethnicity: string | null;
  hair_color: string | null;
  eye_color: string | null;
  height_cm: number | null;
  weight: number | null;
  measurements: string | null;
  fake_tits: string | null;
  penis_length?: number | null;
  tattoos: string | null;
  piercings: string | null;
  career_length: string | null;
  death_date: string | null;
  url: string | null;
  tags: Array<{ id: string; name: string; image_path: string | null }>;
  image_path: string | null;
  created_at: string | null;
  updated_at: string | null;

  // User activity fields
  rating: number | null;
  o_counter: number;
  play_count: number;
  last_played_at: string | null;
  last_o_at: string | null;

  // Added by PerformerQueryBuilder.populateRelations (optional)
  groups?: GroupRef[];
  galleries?: GalleryRef[];
  studios?: StudioRef[];
}

// ─── NormalizedStudio ────────────────────────────────────────────────────────

export interface NormalizedStudio {
  id: string;
  instanceId: string;
  name: string;
  parent_studio: { id: string } | null;
  favorite: boolean;
  rating100: number | null;
  scene_count: number;
  image_count: number;
  gallery_count: number;
  performer_count: number;
  group_count: number;
  details: string | null;
  url: string | null;
  tags: Array<{ id: string; name: string; image_path: string | null }>;
  image_path: string | null;
  created_at: string | null;
  updated_at: string | null;

  // User activity fields
  rating: number | null;
  o_counter: number;
  play_count: number;

  // Added by StudioQueryBuilder.populateRelations (optional)
  performers?: PerformerRef[];
  groups?: GroupRef[];
  galleries?: GalleryRef[];
}

// ─── NormalizedTag ───────────────────────────────────────────────────────────

export interface NormalizedTag {
  id: string;
  instanceId: string;
  name: string;
  favorite: boolean;
  scene_count: number;
  image_count: number;
  gallery_count: number;
  performer_count: number;
  studio_count: number;
  group_count: number;
  scene_marker_count: number;
  scene_count_via_performers: number;
  description: string | null;
  aliases: string[];
  parents: Array<{ id: string; name?: string }>;
  image_path: string | null;
  created_at: string | null;
  updated_at: string | null;

  // User activity fields
  // rating and rating100 are both present for API backward compatibility
  rating: number | null;
  rating100: number | null;
  o_counter: number;
  play_count: number;

  // Added by TagQueryBuilder.populateRelations (optional)
  performers?: PerformerRef[];
  studios?: StudioRef[];
  groups?: GroupRef[];
  galleries?: GalleryRef[];
}

// ─── NormalizedGroup ─────────────────────────────────────────────────────────

export interface NormalizedGroup {
  id: string;
  instanceId: string;
  name: string;
  date: string | null;
  studio: { id: string; name?: string; image_path?: string | null } | null;
  rating100: number | null;
  duration: number | null;
  scene_count: number;
  performer_count: number;
  director: string | null;
  synopsis: string | null;
  urls: string[];
  tags: Array<{ id: string; name: string; image_path: string | null }>;
  front_image_path: string | null;
  back_image_path: string | null;
  created_at: string | null;
  updated_at: string | null;

  // Transient field: set by QueryBuilder transformRow() but not part of the GraphQL type.
  // Used internally by populateRelations to look up studios without re-parsing.
  studioId?: string | null;

  // User activity fields
  rating: number | null;
  favorite: boolean;

  // Added by GroupQueryBuilder.populateRelations (optional)
  performers?: PerformerRef[];
  galleries?: GalleryRef[];
}

// ─── NormalizedGallery ───────────────────────────────────────────────────────

export interface NormalizedGallery {
  id: string;
  instanceId: string;
  title: string | null;
  date: string | null;
  studio: { id: string; name?: string } | null;
  rating100: number | null;
  image_count: number;
  details: string | null;
  photographer?: string | null;
  url: string | null;
  urls?: string[];
  code: string | null;
  folder: { path: string } | null;
  files: Array<{ basename: string }>;
  cover: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
  tags: Array<{ id: string; name: string; image_path: string | null }>;
  performers: Array<{ id: string; name: string; gender: string | null; image_path: string | null }>;
  scenes: Array<{ id: string; title: string | null; paths: { screenshot: string | null } }>;
  created_at: string | null;
  updated_at: string | null;

  // User activity fields
  rating: number | null;
  favorite: boolean;
}

// ─── NormalizedImage ─────────────────────────────────────────────────────────

export interface NormalizedImage {
  id: string;
  instanceId: string;
  title: string | null;
  code: string | null;
  details: string | null;
  photographer: string | null;
  urls: string[];
  date: string | null;
  studio: { id: string; name?: string } | null;
  studioId: string | null;
  rating100: number | null;
  o_counter: number;
  organized: boolean;
  filePath: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  files: Array<{ path: string; width: number | null; height: number | null; size: number | null }>;
  paths: { thumbnail: string; preview: string; image: string };
  performers: Array<{ id: string; name: string; gender: string | null; image_path: string | null }>;
  tags: Array<{ id: string; name: string }>;
  galleries: Array<{
    id: string;
    title: string | null;
    date: string | null;
    details: string | null;
    photographer: string | null;
    urls: string[];
    cover: string | null;
    studioId: string | null;
    studio: { id: string; name: string } | null;
    performers: Array<{ id: string; name: string; gender: string | null; image_path: string | null }>;
    tags: Array<{ id: string; name: string }>;
  }>;
  created_at: string | null;
  updated_at: string | null;
  stashCreatedAt?: string | null;
  stashUpdatedAt?: string | null;

  // User activity fields (optional — not present from all code paths)
  rating?: number | null;
  favorite?: boolean;
  oCounter?: number;
  viewCount?: number;
  lastViewedAt?: string | null;
}

// ─── Utility Types ───────────────────────────────────────────────────────────

/** Entity with instanceId, for nested entities within scenes/galleries */
export type WithInstanceId<T> = T & { instanceId: string };

/**
 * Lightweight scene data for scoring operations.
 * Contains only IDs needed for similarity/recommendation scoring.
 */
export interface SceneScoringData {
  id: string;
  instanceId: string;
  studioId: string | null;
  performerIds: string[];
  tagIds: string[];
  oCounter: number;
  date: string | null;
}
