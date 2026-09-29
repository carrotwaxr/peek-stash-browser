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
//
// A list row's nested entities: what a chip, a card line or a tooltip shows,
// only those the requesting user may see (live, not excluded). A ref carries
// no favorite or rating: Stash's own are the Stash user's, and no reader
// shows one from a ref (the entity's own list row carries the user's).

export interface PerformerRef {
  id: string;
  instanceId: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  image_path: string | null;
}

export interface TagRef {
  id: string;
  instanceId: string;
  name: string;
  image_path: string | null;
}

export interface StudioRef {
  id: string;
  instanceId: string;
  name: string;
  image_path: string | null;
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

/**
 * How many related entities of each kind the requesting user can see, on the
 * performer, studio, tag and collection list endpoints. A card's list of them
 * holds at most 12 (most shared scenes first, then by name), so a count is
 * this total, and a tooltip says how many more there are. The gallery list
 * counts each gallery's scenes here, with no list.
 */
export type RelationTotals = Partial<
  Record<"performers" | "studios" | "groups" | "galleries" | "scenes", number>
>;

/**
 * One link of the collection hierarchy, seen from a group: the group at the
 * other end (always on the same instance) and Stash's description of the
 * link, e.g. "Part 2".
 */
export interface GroupRelationRef {
  group: { id: string; name: string; instanceId: string };
  description: string | null;
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
  /** Always null: Peek serves streams and captions through its own routes. */
  stream: string | null;
  /** Always null: Peek serves streams and captions through its own routes. */
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
  studio: {
    id: string;
    name?: string;
    instanceId?: string;
    image_path?: string | null;
    parent_studio?: { id: string } | null;
    tags?: Array<{ id: string; name?: string; image_path?: string | null }>;
  } | null;
  // Performers may be PerformerRef (from QueryBuilder) or NormalizedPerformer (from transformSceneWithRelations)
  performers: Array<
    PerformerRef & {
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
    }
  >;
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
  /** ISO timestamps, as stored and as the JSON carries them */
  o_history: string[];
  last_played_at: string | null;
  last_o_at: string | null;

  // Transient field: set by QueryBuilder transformRow() but not part of the GraphQL type.
  // Used internally by populateRelations to look up studios without re-parsing.
  studioId?: string | null;

  // Server-enriched fields (added by addStreamabilityInfo in scenes controller,
  // which also adds stashUrl: see WithStashUrl in api/library.ts)
  isStreamable?: boolean;
  streamabilityReasons?: string[];

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
  circumcised?: string | null;
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

  // Added by PerformerQueryBuilder.populateRelations (optional): at most 12
  // of each, and how many there are
  groups?: GroupRef[];
  galleries?: GalleryRef[];
  studios?: StudioRef[];
  relation_totals?: RelationTotals;
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

  // Added by StudioQueryBuilder.populateRelations (optional): at most 12
  // of each, and how many there are. The list endpoint counts the
  // performers without listing them.
  performers?: PerformerRef[];
  groups?: GroupRef[];
  galleries?: GalleryRef[];
  relation_totals?: RelationTotals;
  // Also there: `parent_studio` as the parent's ref (null when the user
  // cannot see it) and the children the user can see, on the studio's own
  // instance, by name
  child_studios?: StudioRef[];
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

  // Added by TagQueryBuilder.populateRelations (optional): at most 12 of
  // each, and how many there are
  performers?: PerformerRef[];
  studios?: StudioRef[];
  groups?: GroupRef[];
  galleries?: GalleryRef[];
  relation_totals?: RelationTotals;
  // Also there: `parents` as the refs of the parents the user can see, in
  // the tag's order, and the children the user can see, on the tag's own
  // instance, by name
  children?: TagRef[];
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
  /** Direct sub-groups the requesting user can see */
  sub_group_count: number;
  director: string | null;
  synopsis: string | null;
  urls: string[];
  tags: Array<{ id: string; name: string; image_path: string | null }>;
  front_image_path: string | null;
  back_image_path: string | null;
  created_at: string | null;
  updated_at: string | null;

  // The collection hierarchy, on the detail request only: the groups
  // containing this one, by name, and its sub-groups, in Stash's order. Each
  // leaves out the groups the requesting user cannot see.
  containing_groups?: GroupRelationRef[];
  sub_groups?: GroupRelationRef[];

  // Transient field: set by QueryBuilder transformRow() but not part of the GraphQL type.
  // Used internally by populateRelations to look up studios without re-parsing.
  studioId?: string | null;

  // User activity fields
  rating: number | null;
  favorite: boolean;

  // Added by GroupQueryBuilder.populateRelations (optional): at most 12 of
  // each, and how many there are
  performers?: PerformerRef[];
  galleries?: GalleryRef[];
  relation_totals?: RelationTotals;
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
  performers: Array<{
    id: string;
    name: string;
    gender: string | null;
    image_path: string | null;
  }>;
  scenes: Array<{
    id: string;
    title: string | null;
    paths: { screenshot: string | null };
  }>;
  created_at: string | null;
  updated_at: string | null;

  // User activity fields
  rating: number | null;
  favorite: boolean;

  // Added by GalleryQueryBuilder: how many of its scenes the requesting user
  // can see (`scenes`)
  relation_totals?: RelationTotals;
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
  files: Array<{
    path: string;
    width: number | null;
    height: number | null;
    size: number | null;
  }>;
  paths: { thumbnail: string; preview: string; image: string };
  performers: Array<{
    id: string;
    name: string;
    gender: string | null;
    image_path: string | null;
  }>;
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
    performers: Array<{
      id: string;
      name: string;
      gender: string | null;
      image_path: string | null;
    }>;
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

/**
 * An image as the image list returns it (POST /api/library/images): its
 * columns, its media as proxy URLs, the requesting user's rating, favorite,
 * O count and views (never Stash's), and its performers, tags, galleries
 * and studio on its own instance.
 */
export interface ImageListItem {
  id: string;
  instanceId: string;
  /** The same as instanceId */
  stashInstanceId: string;
  /** The title, else the file name without its extension */
  title: string | null;
  code: string | null;
  details: string | null;
  photographer: string | null;
  urls: string[];
  date: string | null;
  studioId: string | null;
  organized: boolean;
  filePath: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  paths: {
    thumbnail: string | null;
    preview: string | null;
    image: string | null;
  };
  /** The same as paths.thumbnail, paths.preview and paths.image */
  pathThumbnail: string | null;
  pathPreview: string | null;
  pathImage: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // The requesting user's own data
  rating100: number | null;
  favorite: boolean;
  oCounter: number;
  viewCount: number;
  lastViewedAt: string | null;

  performers: PerformerRef[];
  tags: TagRef[];
  galleries: GalleryRef[];
  studio: StudioRef | null;
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
}
