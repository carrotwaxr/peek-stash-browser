// shared/types/filters/fields.ts
/**
 * Every list's filter fields and sorts, declared once.
 *
 * A table holds what the list's query builder reads from its
 * `<entity>_filter`, with the modifiers its clause understands (a ref with
 * `presence` also takes IS_NULL and NOT_NULL, "has none" and "has any"; an
 * `excludable` one takes `excludes` beside its values). The scene
 * `scene_index` and `last_o_at` sorts are declared before their expressions
 * exist, so the contract test lists them as known gaps until then. A new
 * filter or sort starts here.
 */
import {
  CIRCUMCISED,
  COMPARISON_MODIFIERS,
  type EntityKind,
  type FieldSpec,
  GENDERS,
  NULLABLE_NUMBER_MODIFIERS,
  ORIENTATIONS,
  PRESENCE_MODIFIERS,
  RESOLUTIONS,
  bool,
  date,
  enumOf,
  instance,
  num,
  path,
  playlistRef,
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
 * A number a row may lack (the viewer's rating, a height): a comparison
 * never matches a row without one, and IS_NULL and NOT_NULL find "not set"
 * and "is set". Counts, O counts and plays are never missing (none is 0), so
 * they stay `num()`.
 */
const nullableNum = () => num({ modifiers: NULLABLE_NUMBER_MODIFIERS });

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
  /** The primary file's path, as Peek stores it (a scene's other files are not read) */
  path: path(),
  /** Any one of the scene's URLs, each matched on its own text */
  url: text(),
  code: text(),
  /** The language codes of the scene's captions, compared whole */
  captions: text({
    modifiers: ["EQUALS", "NOT_EQUALS", "IS_NULL", "NOT_NULL"],
    defaultModifier: "EQUALS",
  }),
  /**
   * Scenes with (true) or without (false) a live marker the viewer can see,
   * generated or not
   */
  has_markers: bool(),
  /**
   * Scenes with (true) or without (false) another live scene the viewer can
   * see on the same instance with the same perceptual hash; a scene without
   * a hash is never a duplicate
   */
  duplicated: bool(),
  performers: ref("performer", { presence: true, excludable: true }),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  studios: ref("studio", {
    hierarchical: true,
    single: true,
    presence: true,
    excludable: true,
  }),
  /** With a depth, the collections' sub-collections too */
  groups: ref("group", { hierarchical: true, presence: true }),
  galleries: ref("gallery", { presence: true }),
  /**
   * Scenes with a performer holding these tags (with a depth, their
   * descendants too); only live performers and tags the viewer can see count
   */
  performer_tags: ref("tag", { hierarchical: true, excludable: true }),
  /**
   * Scenes in these Peek playlists: the viewer's own and those shared with
   * them (owner answer 6). Any other id holds no scenes for the viewer.
   */
  playlists: playlistRef(),
  /**
   * Scenes in (true) or in none of (false) the viewer's own playlists;
   * playlists shared with them do not count (owner answer 13)
   */
  in_any_playlist: bool(),
  rating100: nullableNum(),
  o_counter: num(),
  play_count: num(),
  play_duration: num(),
  /**
   * Scenes the viewer finished (true: played, and the last session ended or
   * stopped within the final 10%) or the rest, scenes never opened included
   */
  watched: bool(),
  /**
   * Scenes the viewer left with a resume point before the final 10%, played
   * or not (a resume point with an unknown length counts); false is the
   * rest, scenes never opened included. The History page's In progress tab
   * reads the same rule.
   */
  in_progress: bool(),
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
  /**
   * Any performer the viewer can see was this age on the scene's date, as
   * in Stash; a scene without a date never matches
   */
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

/** A StashDB (or other stash-box) id: equal to one, or set or not set */
function stashIdText() {
  return text({
    modifiers: ["EQUALS", ...PRESENCE_MODIFIERS],
    defaultModifier: "EQUALS",
    maxLength: 100,
  });
}

export const PERFORMER_FIELDS = {
  ids: ref("performer", { single: true }),
  instance_id: instance(),
  name: text(),
  details: text(),
  tattoos: text(),
  piercings: text(),
  measurements: text(),
  /**
   * Any or none of the genders, or not set (no gender or an empty one, as
   * Stash reads it) and set; beta.7's single EQUALS and NOT_EQUALS read as
   * INCLUDES and EXCLUDES of one value
   */
  gender: enumOf(GENDERS, {
    multi: true,
    modifiers: ["INCLUDES", "EXCLUDES", ...PRESENCE_MODIFIERS],
  }),
  ethnicity: freeText(),
  hair_color: freeText(),
  eye_color: freeText(),
  fake_tits: freeText(),
  disambiguation: text(),
  /** Stash's free-text country (an ISO code as Stash's editor sets it) */
  country: text(),
  circumcised: enumOf(CIRCUMCISED, {
    multi: true,
    modifiers: ["INCLUDES", ...PRESENCE_MODIFIERS],
  }),
  /** Any one alias */
  aliases: text(),
  /** Any one of the performer's links */
  url: text(),
  /** A StashDB (or other stash-box) id the performer is linked to */
  stash_id: stashIdText(),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  /** Performers in the visible scenes of these studios (depth: sub-studios) */
  studios: ref("studio", { hierarchical: true, excludable: true }),
  /** Performers in these scenes */
  scenes: ref("scene"),
  /** Performers in scenes of these groups */
  groups: ref("group"),
  /** Performers sharing a visible scene with these ("appears with") */
  performers: ref("performer", { excludable: true }),
  rating100: nullableNum(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  /** Counts as the viewer sees them */
  tag_count: num(),
  image_count: num(),
  gallery_count: num(),
  /** The visible clips in the performer's visible scenes */
  marker_count: num(),
  height: nullableNum(),
  weight: nullableNum(),
  penis_length: nullableNum(),
  /** Years between the first and last year of Stash's career text */
  career_length: nullableNum(),
  age: count(),
  birth_year: count(),
  death_year: count(),
  birthdate: date(),
  death_date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
  /** The performer has (true) or lacks (false) a favourite tag or one under it */
  tag_favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const STUDIO_FIELDS = {
  ids: ref("studio", { single: true }),
  instance_id: instance(),
  name: text(),
  details: text(),
  /** Any one alias */
  aliases: text(),
  /** The studio's website */
  url: text(),
  /** A StashDB (or other stash-box) id the studio is linked to */
  stash_id: stashIdText(),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  /**
   * Studios under these (depth: further down), the parent live and visible;
   * "has none" and "has any" a visible parent
   */
  parents: ref("studio", { hierarchical: true, presence: true }),
  rating100: nullableNum(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  /** Counts as the viewer sees them: live, visible children and tags */
  child_count: num(),
  tag_count: num(),
  image_count: num(),
  gallery_count: num(),
  performer_count: num(),
  group_count: num(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const TAG_FIELDS = {
  ids: ref("tag", { single: true }),
  instance_id: instance(),
  name: text(),
  description: text(),
  /** Any one alias */
  aliases: text(),
  /** A StashDB (or other stash-box) id the tag is linked to */
  stash_id: stashIdText(),
  /** Tags under these within depth + 1 levels, through a visible parent */
  parents: ref("tag", { hierarchical: true }),
  /** Tags having these as a visible child within depth + 1 levels */
  children: ref("tag", { hierarchical: true }),
  /** Tags on these performers */
  performers: ref("performer", { excludable: true }),
  /** Tags on these studios */
  studios: ref("studio", { excludable: true }),
  /** Tags on these scenes */
  scenes: ref("scene", { path: ["scenes_filter", "id"] }),
  /** Tags on scenes of these groups */
  groups: ref("group", { path: ["scenes_filter", "groups"] }),
  rating100: nullableNum(),
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  /** Counts as the viewer sees them: live, visible parents and children */
  parent_count: num(),
  child_count: num(),
  image_count: num(),
  gallery_count: num(),
  performer_count: num(),
  studio_count: num(),
  group_count: num(),
  /** The live clips the viewer can see with the tag, primary or not */
  marker_count: num(),
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
  /** Stash's single aliases text, matched as one phrase */
  aliases: text(),
  /** Any one of the collection's links */
  url: text(),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  studios: ref("studio", {
    hierarchical: true,
    single: true,
    presence: true,
    excludable: true,
  }),
  /** Groups holding these scenes */
  scenes: ref("scene"),
  /** Groups holding scenes of these performers */
  performers: ref("performer", { excludable: true }),
  /**
   * Collections under these within depth + 1 levels, through a visible
   * containing collection (no depth: their direct sub-collections, as the
   * card counts them)
   */
  containing_groups: ref("group", { hierarchical: true }),
  /** Collections holding these within depth + 1 levels, through a visible sub-collection */
  sub_groups: ref("group", { hierarchical: true }),
  /** A favourite performer of the viewer's in one of its visible scenes */
  performer_favorite: bool(),
  rating100: nullableNum(),
  /** The viewer's O count and plays, summed over its visible scenes */
  o_counter: num(),
  play_count: num(),
  scene_count: num(),
  /** Counts as the viewer sees them: live, visible collections and tags */
  sub_group_count: num(),
  containing_group_count: num(),
  tag_count: num(),
  duration: nullableNum(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
} as const satisfies Record<string, FieldSpec>;

export const GALLERY_FIELDS = {
  ids: ref("gallery", { single: true }),
  instance_id: instance(),
  title: text(),
  details: text(),
  code: text(),
  photographer: text(),
  /**
   * A folder gallery's folder path, a zip gallery's file path, as Peek
   * stores them
   */
  path: path(),
  /** Any one of the gallery's URLs, each matched on its own text */
  url: text(),
  organized: bool(),
  /** Galleries that are one zip file (true) or a folder (false) */
  is_zip: bool(),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  studios: ref("studio", {
    hierarchical: true,
    single: true,
    presence: true,
    excludable: true,
  }),
  performers: ref("performer", { presence: true, excludable: true }),
  /** Galleries linked to these scenes */
  scenes: ref("scene", { presence: true }),
  rating100: nullableNum(),
  image_count: num(),
  /** The gallery's tags; 0 is the folder view's Untagged */
  tag_count: count(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
  /** Galleries with at least one image the user favorited */
  hasFavoriteImage: bool(),
  /**
   * Galleries with (true) or without (false) one of the viewer's favourite
   * performers, studios (or a sub-studio of one) or tags (or a sub-tag of
   * one), counting only those the viewer can see
   */
  performer_favorite: bool(),
  studio_favorite: bool(),
  tag_favorite: bool(),
  /**
   * Galleries with a performer holding these tags (with a depth, their
   * descendants too); only live performers and tags the viewer can see count
   */
  performer_tags: ref("tag", { hierarchical: true, excludable: true }),
  /** The gallery's live performers the viewer can see */
  performer_count: count(),
  /**
   * Any performer the viewer can see was this age on the gallery's date;
   * a gallery without a date never matches
   */
  performer_age: count(),
} as const satisfies Record<string, FieldSpec>;

export const IMAGE_FIELDS = {
  ids: ref("image", { single: true }),
  instance_id: instance(),
  title: text(),
  details: text(),
  code: text(),
  photographer: text(),
  /** The image file's path, as Peek stores it */
  path: path(),
  /** Any one of the image's URLs, each matched on its own text */
  url: text(),
  organized: bool(),
  /** The shorter side of the image against Stash's resolution ranges */
  resolution: enumOf(RESOLUTIONS, { modifiers: COMPARISON_MODIFIERS }),
  orientation: enumOf(ORIENTATIONS, { multi: true }),
  tags: ref("tag", { hierarchical: true, presence: true, excludable: true }),
  studios: ref("studio", {
    hierarchical: true,
    single: true,
    presence: true,
    excludable: true,
  }),
  performers: ref("performer", { presence: true, excludable: true }),
  galleries: ref("gallery", { presence: true }),
  rating100: num({ modifiers: [...COUNT_MODIFIERS, ...PRESENCE_MODIFIERS] }),
  o_counter: num({ modifiers: COUNT_MODIFIERS }),
  /** The image's tags, its galleries' included; 0 is the folder view's Untagged */
  tag_count: count(),
  date: date(),
  created_at: date(),
  updated_at: date(),
  favorite: bool(),
  /**
   * Images with (true) or without (false) one of the viewer's favourite
   * performers, studios (or a sub-studio of one) or tags (or a sub-tag of
   * one, its galleries' tags included), counting only those the viewer can
   * see
   */
  performer_favorite: bool(),
  studio_favorite: bool(),
  tag_favorite: bool(),
  /**
   * Images with a performer holding these tags (with a depth, their
   * descendants too); only live performers and tags the viewer can see count
   */
  performer_tags: ref("tag", { hierarchical: true, excludable: true }),
  /** The image's live performers the viewer can see */
  performer_count: count(),
  /**
   * Any performer the viewer can see was this age on the image's date; an
   * image without a date never matches
   */
  performer_age: count(),
} as const satisfies Record<string, FieldSpec>;

/**
 * The clip list's filter (`POST /api/library/clips`, `clip_filter`). A
 * clip lists with its scene, so the scene's tags, performers and studio
 * filter it too. `GET /api/clips` maps its old query parameters onto these
 * fields (`parseClipQuery`).
 */
export const CLIP_FIELDS = {
  instance_id: instance(),
  /** Clips of these scenes */
  scenes: ref("scene"),
  /** Tags on the clip itself: its primary tag or its tag list */
  tags: ref("tag", { hierarchical: true, excludable: true }),
  /** Tags on the clip's scene, its own or inherited */
  scene_tags: ref("tag", { hierarchical: true, excludable: true }),
  /** Performers in the clip's scene */
  performers: ref("performer", { excludable: true }),
  /** The clip's scene's studio (depth: sub-studios); EXCLUDES keeps a scene without one */
  studios: ref("studio", {
    hierarchical: true,
    single: true,
    excludable: true,
  }),
  /**
   * Clips with (true) or without (false) a generated preview; every clip
   * when absent. The Clips page sends true for its default.
   */
  is_generated: bool(),
  /** Seconds from the clip's start to its end; a clip without an end matches no comparison */
  duration: num(),
  created_at: date(),
  updated_at: date(),
  /** The clip's own title */
  title: text(),
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

/** Every list's filter fields: the seven entity lists' and the clips' */
export const LIST_FIELDS = {
  ...FIELDS,
  clip: CLIP_FIELDS,
} as const satisfies Record<ListKind, Record<string, FieldSpec>>;

export type FieldSpecOf<E extends ListKind> = (typeof LIST_FIELDS)[E];

/** The request body key holding each list's filter */
export const FILTER_BODY_KEYS = {
  scene: "scene_filter",
  performer: "performer_filter",
  studio: "studio_filter",
  tag: "tag_filter",
  group: "group_filter",
  gallery: "gallery_filter",
  image: "image_filter",
  clip: "clip_filter",
} as const satisfies Record<ListKind, string>;

export type FilterBodyKey<E extends ListKind> = (typeof FILTER_BODY_KEYS)[E];

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
    /** The shorter side of the file */
    "resolution",
    /** The studio's name, scenes without one last */
    "studio",
    "code",
    /** The youngest performer ascending, the oldest descending, at the scene's date */
    "performer_age",
    "organized",
    /** Order within the one group the `groups` filter names */
    "scene_index",
    /** Order within the one playlist the `playlists` filter names */
    "playlist_position",
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
    "tag_count",
    "marker_count",
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
    "child_count",
    "tag_count",
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
    "child_count",
    "parent_count",
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
    "tag_count",
    "o_counter",
    /** Order within the one collection the `containing_groups` filter names */
    "sub_group_order",
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
    "tag_count",
    "performer_count",
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
    "resolution",
    "tag_count",
    "performer_count",
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
 * no group) and `playlist_position` (the page's own order is `position`).
 * `random` also arrives as `random_<seed>`.
 */
export const PLAYLIST_ITEM_SORTS = [
  "position",
  "added_at",
  ...SORTS.scene.filter(
    (s) => s !== "scene_index" && s !== "playlist_position"
  ),
] as const;
export type PlaylistItemSort = (typeof PLAYLIST_ITEM_SORTS)[number];

/** How many ranked scenes Recommended keeps per user, and filters within */
export const RECOMMENDED_LIMIT = 500;

/**
 * The sorts Recommended offers: its rank, then every scene sort. DESC on
 * `recommended` is best first, so the list's usual default direction reads right.
 */
export const RECOMMENDED_SORTS = ["recommended", ...SORTS.scene] as const;
export type RecommendedSort = (typeof RECOMMENDED_SORTS)[number];
export const DEFAULT_RECOMMENDED_SORT = {
  field: "recommended",
  direction: "DESC",
} as const;

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
