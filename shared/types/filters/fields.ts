// shared/types/filters/fields.ts
/**
 * Every list's filter fields and sorts, declared once.
 *
 * A table holds what the list's query builder reads from its
 * `<entity>_filter`, with the modifiers its clause understands. The scene
 * `scene_index` and `last_o_at` sorts are declared before their expressions
 * exist, so the contract test lists them as known gaps until then. A new
 * filter or sort starts here.
 */
import {
  COMPARISON_MODIFIERS,
  type EntityKind,
  type FieldSpec,
  GENDERS,
  ORIENTATIONS,
  RESOLUTIONS,
  bool,
  date,
  enumOf,
  instance,
  num,
  ref,
  text,
} from "./criteria.js";

/** Longest search text (`q`) a list, clip or picker request takes */
export const Q_MAX_LENGTH = 200;

/** Most rows a list request returns; a larger per_page is held to it */
export const PER_PAGE_MAX = 250;

/** Most ids one ref criterion may name */
export const MAX_REF_VALUES = 1000;

/** Most rows an entity picker's `/minimal` request returns; a larger per_page is held to it */
export const MINIMAL_PER_PAGE_MAX = 100;

/** Most ids one `/minimal` request may look up */
export const MINIMAL_IDS_MAX = 100;

/** Count and age clauses that compare and take BETWEEN, but not NOT_BETWEEN */
const COUNT_MODIFIERS = [...COMPARISON_MODIFIERS, "BETWEEN"] as const;

/** A count or age: EQUALS when the modifier is missing */
const count = () =>
  num({ modifiers: COUNT_MODIFIERS, defaultModifier: "EQUALS" });

/**
 * A performer attribute Stash stores as free text (ethnicity, hair colour,
 * eye colour, breast type): compared whole, ignoring case, so a value the
 * option lists (ETHNICITIES and the rest) lack still filters
 */
const freeText = () =>
  text({
    modifiers: ["EQUALS", "NOT_EQUALS"],
    defaultModifier: "EQUALS",
    maxLength: 100,
  });

// =============================================================================
// FILTER FIELDS
// =============================================================================

export const SCENE_FIELDS = {
  ids: ref("scene", { single: true }),
  instance_id: instance(),
  title: text(),
  details: text(),
  director: text(),
  video_codec: text(),
  audio_codec: text(),
  performers: ref("performer"),
  tags: ref("tag", { hierarchical: true }),
  studios: ref("studio", { hierarchical: true, single: true }),
  groups: ref("group"),
  galleries: ref("gallery"),
  rating100: num(),
  o_counter: num(),
  play_count: num(),
  play_duration: num(),
  duration: num(),
  bitrate: num(),
  framerate: num(),
  performer_count: count(),
  /** The scene's own tags (`SceneTag`), inherited ones not counted */
  tag_count: count(),
  /**
   * Scenes with (true) or without (false) any tag, their own or inherited
   * (`SceneInheritedTag`): false is the folder view's Untagged, the scenes
   * in no tag's folder
   */
  tagged: bool(),
  /** The oldest performer's age on the scene's date */
  performer_age: count(),
  resolution: enumOf(RESOLUTIONS, { modifiers: COMPARISON_MODIFIERS }),
  orientation: enumOf(ORIENTATIONS, { multi: true }),
  date: date(),
  created_at: date(),
  updated_at: date(),
  last_played_at: date(),
  favorite: bool(),
  performer_favorite: bool(),
  studio_favorite: bool(),
  tag_favorite: bool(),
  organized: bool(),
} as const satisfies Record<string, FieldSpec>;

export const PERFORMER_FIELDS = {
  ids: ref("performer", { single: true }),
  instance_id: instance(),
  name: text(),
  details: text(),
  tattoos: text(),
  piercings: text(),
  measurements: text(),
  gender: enumOf(GENDERS),
  ethnicity: freeText(),
  hair_color: freeText(),
  eye_color: freeText(),
  fake_tits: freeText(),
  tags: ref("tag", { hierarchical: true }),
  /** Performers in scenes of these studios */
  studios: ref("studio"),
  /** Performers in these scenes */
  scenes: ref("scene"),
  /** Performers in scenes of these groups */
  groups: ref("group"),
  rating100: num(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  height: num(),
  weight: num(),
  penis_length: num(),
  /** Years between the first and last year of Stash's career text */
  career_length: num(),
  age: count(),
  birth_year: count(),
  death_year: count(),
  birthdate: date(),
  death_date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const STUDIO_FIELDS = {
  ids: ref("studio", { single: true }),
  instance_id: instance(),
  name: text(),
  details: text(),
  tags: ref("tag", { hierarchical: true }),
  rating100: num(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const TAG_FIELDS = {
  ids: ref("tag", { single: true }),
  instance_id: instance(),
  name: text(),
  description: text(),
  parents: ref("tag", { hierarchical: true }),
  /** Tags on these performers */
  performers: ref("performer"),
  /** Tags on these studios */
  studios: ref("studio"),
  /** Tags on these scenes */
  scenes: ref("scene", { path: ["scenes_filter", "id"] }),
  /** Tags on scenes of these groups */
  groups: ref("group", { path: ["scenes_filter", "groups"] }),
  rating100: num(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const GROUP_FIELDS = {
  ids: ref("group", { single: true }),
  instance_id: instance(),
  name: text(),
  synopsis: text(),
  director: text(),
  tags: ref("tag", { hierarchical: true }),
  studios: ref("studio", { hierarchical: true, single: true }),
  /** Groups holding these scenes */
  scenes: ref("scene"),
  /** Groups holding scenes of these performers */
  performers: ref("performer"),
  /** The direct sub-groups of these groups (no depth, as the card counts them) */
  containing_groups: ref("group"),
  rating100: num(),
  scene_count: num(),
  duration: num(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const GALLERY_FIELDS = {
  ids: ref("gallery", { single: true }),
  instance_id: instance(),
  title: text(),
  tags: ref("tag", { hierarchical: true }),
  studios: ref("studio", { hierarchical: true, single: true }),
  performers: ref("performer"),
  /** Galleries linked to these scenes */
  scenes: ref("scene"),
  rating100: num(),
  image_count: num(),
  /** The gallery's tags; 0 is the folder view's Untagged */
  tag_count: count(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
  /** Galleries with at least one image the user favorited */
  hasFavoriteImage: bool(),
} as const satisfies Record<string, FieldSpec>;

export const IMAGE_FIELDS = {
  ids: ref("image", { single: true }),
  instance_id: instance(),
  tags: ref("tag", { hierarchical: true }),
  studios: ref("studio", { hierarchical: true, single: true }),
  performers: ref("performer"),
  galleries: ref("gallery"),
  rating100: num({ modifiers: COUNT_MODIFIERS }),
  o_counter: num({ modifiers: COUNT_MODIFIERS }),
  /** The image's tags, its galleries' included; 0 is the folder view's Untagged */
  tag_count: count(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

/**
 * `GET /api/clips` query parameters that filter. Ref values are one
 * comma-separated string; a ref with a choice of modifier takes it from
 * `<param>Modifier` (`tagIdsModifier`).
 */
export const CLIP_PARAMS = {
  instanceId: instance(),
  /** Clips of this scene */
  sceneId: ref("scene", { single: true, modifiers: ["INCLUDES"] }),
  /** Tags on the clip itself (its primary tag or its tag list) */
  tagIds: ref("tag"),
  /** Tags on the clip's scene */
  sceneTagIds: ref("tag"),
  /** Performers in the clip's scene */
  performerIds: ref("performer"),
  /** The clip's scene's studio */
  studioId: ref("studio", { single: true, modifiers: ["INCLUDES"] }),
  /**
   * Clips with (true) or without (false) a generated preview; every clip
   * when absent. The Clips page sends true for its default.
   */
  isGenerated: bool(),
} as const satisfies Record<string, FieldSpec>;

export const FIELDS = {
  scene: SCENE_FIELDS,
  performer: PERFORMER_FIELDS,
  studio: STUDIO_FIELDS,
  tag: TAG_FIELDS,
  group: GROUP_FIELDS,
  gallery: GALLERY_FIELDS,
  image: IMAGE_FIELDS,
} as const satisfies Record<EntityKind, Record<string, FieldSpec>>;

export type FieldSpecOf<E extends EntityKind> = (typeof FIELDS)[E];

/** The request body key holding each list's filter */
export const FILTER_BODY_KEYS = {
  scene: "scene_filter",
  performer: "performer_filter",
  studio: "studio_filter",
  tag: "tag_filter",
  group: "group_filter",
  gallery: "gallery_filter",
  image: "image_filter",
} as const satisfies Record<EntityKind, string>;

export type FilterBodyKey<E extends EntityKind> = (typeof FILTER_BODY_KEYS)[E];

// =============================================================================
// SORTS
// =============================================================================

/** The seven entity lists and clips */
export const LIST_KINDS = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const SORT_DIRECTIONS = ["ASC", "DESC"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * Each list's sort keys. `random` also arrives as `random_<seed>`, which
 * keeps its order from page to page.
 */
export const SORTS = {
  scene: [
    "created_at",
    "updated_at",
    "date",
    "title",
    "duration",
    "filesize",
    "bitrate",
    "framerate",
    "path",
    "performer_count",
    "tag_count",
    "rating",
    "user_rating",
    "last_played_at",
    "play_count",
    "play_duration",
    "o_counter",
    "resume_time",
    "last_o_at",
    /** Order within the one group the `groups` filter names */
    "scene_index",
    "random",
  ],
  performer: [
    "name",
    "created_at",
    "updated_at",
    "birthdate",
    "height",
    "weight",
    "measurements",
    "penis_length",
    "career_length",
    "scene_count",
    "scenes_count",
    "image_count",
    "gallery_count",
    "group_count",
    "rating",
    "rating100",
    "o_counter",
    "play_count",
    "last_played_at",
    "last_o_at",
    "random",
  ],
  studio: [
    "name",
    "created_at",
    "updated_at",
    "scene_count",
    "scenes_count",
    "image_count",
    "gallery_count",
    "performer_count",
    "group_count",
    "rating",
    "rating100",
    "o_counter",
    "play_count",
    "random",
  ],
  tag: [
    "name",
    "created_at",
    "updated_at",
    "scene_count",
    "scenes_count",
    "image_count",
    "gallery_count",
    "performer_count",
    "studio_count",
    "group_count",
    "scene_marker_count",
    "rating",
    "rating100",
    "o_counter",
    "play_count",
    "random",
  ],
  group: [
    "name",
    "date",
    "created_at",
    "updated_at",
    "scene_count",
    "performer_count",
    "duration",
    "rating",
    "rating100",
    "random",
  ],
  gallery: [
    "title",
    "date",
    "created_at",
    "updated_at",
    "path",
    "image_count",
    "rating",
    "rating100",
    "random",
  ],
  image: [
    "title",
    "date",
    "created_at",
    "updated_at",
    "path",
    "filesize",
    "rating",
    "rating100",
    "o_counter",
    "random",
  ],
  clip: [
    "stashCreatedAt",
    "stashUpdatedAt",
    "title",
    "seconds",
    "sceneTitle",
    "duration",
    "random",
  ],
} as const satisfies Record<ListKind, readonly string[]>;

export type SortOf<K extends ListKind> = (typeof SORTS)[K][number];

/** A random sort with its seed: the same seed gives the same order */
export type RandomSortKey = `random_${number}`;

/**
 * The sorts a playlist's item page offers: the playlist's own order, when the
 * item was added, then every scene sort except `scene_index` (a playlist has
 * no group). `random` also arrives as `random_<seed>`.
 */
export const PLAYLIST_ITEM_SORTS = [
  "position",
  "added_at",
  ...SORTS.scene.filter((s) => s !== "scene_index"),
] as const;
export type PlaylistItemSort = (typeof PLAYLIST_ITEM_SORTS)[number];

/** A playlist's items come in the playlist's own order unless asked */
export const DEFAULT_PLAYLIST_ITEM_SORT = {
  field: "position",
  direction: "ASC",
} as const;

/** What a list sorts by when the request names no sort */
export const DEFAULT_SORT = {
  scene: { field: "created_at", direction: "DESC" },
  performer: { field: "name", direction: "ASC" },
  studio: { field: "name", direction: "ASC" },
  tag: { field: "name", direction: "ASC" },
  group: { field: "name", direction: "ASC" },
  gallery: { field: "title", direction: "ASC" },
  image: { field: "title", direction: "ASC" },
  clip: { field: "stashCreatedAt", direction: "DESC" },
} as const satisfies {
  readonly [K in ListKind]: {
    readonly field: SortOf<K>;
    readonly direction: SortDirection;
  };
};
