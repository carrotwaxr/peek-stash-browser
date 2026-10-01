/**
 * Typed row interfaces for QueryBuilder raw SQL results.
 *
 * Each interface matches the exact column names and types returned by SQLite
 * for the corresponding QueryBuilder's SELECT clause. Column names correspond
 * to SQL aliases (e.g. `s.rating100 AS stashRating100`).
 *
 * Types as Prisma's raw queries return them from SQLite, by the column's
 * declared type:
 *   - INTEGER -> number
 *   - BIGINT (fileSize) -> bigint
 *   - COUNT, SUM and COALESCE over integers -> bigint
 *   - BOOLEAN -> boolean, never 0 or 1
 *   - DATETIME -> Date, whether the column holds text or epoch milliseconds
 *     (Prisma fails the query on text it cannot parse); a transform writes
 *     it out with toISOString(), which is what the JSON carried
 *   - TEXT -> string
 *   - NULL -> null
 *   - JSON held in TEXT columns -> string (parsed in transformRow)
 *   - LEFT JOIN columns -> T | null
 */
// ---------------------------------------------------------------------------
// SceneQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by SceneQueryBuilder's SELECT.
 *
 * Base columns from StashScene, plus user data from LEFT JOINs on
 * SceneRating (r) and WatchHistory (w).
 */
export interface SceneQueryRow {
  // StashScene base columns
  id: string;
  stashInstanceId: string;
  title: string | null;
  code: string | null;
  date: string | null;
  studioId: string | null;
  stashRating100: number | null;
  duration: number | null;
  organized: boolean;
  details: string | null;
  director: string | null;
  urls: string | null; // JSON-encoded string[]
  filePath: string | null;
  fileBitRate: number | null;
  fileFrameRate: number | null;
  fileWidth: number | null;
  fileHeight: number | null;
  fileVideoCodec: string | null;
  fileAudioCodec: string | null;
  fileSize: bigint | null; // BIGINT column: Prisma returns a bigint
  pathScreenshot: string | null;
  pathPreview: string | null;
  pathSprite: string | null;
  pathVtt: string | null;
  pathChaptersVtt: string | null;
  pathStream: string | null;
  pathCaption: string | null;
  captions: string | null; // JSON-encoded caption metadata
  inheritedTagIds: string | null; // JSON-encoded string[]
  stashOCounter: number | null;
  stashPlayCount: number | null;
  stashPlayDuration: number | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN SceneRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // User data from LEFT JOIN WatchHistory (w)
  userPlayCount: number | null;
  userPlayDuration: number | null;
  userLastPlayedAt: Date | null;
  userOCount: number | null;
  userResumeTime: number | null;
  // The newest O (ISO text), computed in SQL from WatchHistory.oHistory
  userLastOAt: string | null;
}

/**
 * Raw row of `StashEntityService.getScenesForScoring`: the scene's ids, its
 * junction ids as comma-separated lists (null with none), and the user's
 * watch data from a LEFT JOIN on WatchHistory (wh).
 */
export interface SceneScoringRow {
  id: string;
  stashInstanceId: string;
  studioId: string | null;
  /** The viewer's O count: COALESCE over an integer, so a bigint */
  oCounter: bigint;
  performerIds: string | null;
  tagIds: string | null;
  playCount: number | null;
  lastPlayedAt: Date | null;
}

// ---------------------------------------------------------------------------
// PerformerQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by PerformerQueryBuilder's SELECT.
 *
 * Base columns from StashPerformer, plus user data from LEFT JOINs on
 * PerformerRating (r) and UserPerformerStats (s).
 */
/**
 * A count column the viewer sees is an expression (the live column minus
 * the viewer's excluded links, query/excludedCounts.ts), which Prisma
 * returns as bigint; the plain column, without exclusions, as number.
 */
export interface PerformerQueryRow {
  // StashPerformer base columns
  id: string;
  stashInstanceId: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birthdate: string | null;
  stashFavorite: boolean;
  stashRating100: number | null;
  sceneCount: number | bigint | null;
  imageCount: number | bigint | null;
  galleryCount: number | bigint | null;
  groupCount: number | bigint | null;
  details: string | null;
  aliasList: string | null; // JSON-encoded string[]
  country: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  heightCm: number | null;
  weightKg: number | null;
  measurements: string | null;
  fakeTits: string | null;
  penisLength: number | null;
  circumcised: string | null;
  tattoos: string | null;
  piercings: string | null;
  careerLength: string | null;
  deathDate: string | null;
  url: string | null;
  imagePath: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN PerformerRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // User data from LEFT JOIN UserPerformerStats (s)
  userOCounter: number | null;
  userPlayCount: number | null;
  userLastPlayedAt: Date | null;
  userLastOAt: Date | null;
}

// ---------------------------------------------------------------------------
// StudioQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by StudioQueryBuilder's SELECT.
 *
 * Base columns from StashStudio, plus user data from LEFT JOINs on
 * StudioRating (r) and UserStudioStats (us).
 */
export interface StudioQueryRow {
  // StashStudio base columns
  id: string;
  stashInstanceId: string;
  name: string;
  parentId: string | null;
  stashFavorite: boolean;
  stashRating100: number | null;
  sceneCount: number | bigint | null;
  imageCount: number | bigint | null;
  galleryCount: number | bigint | null;
  performerCount: number | bigint | null;
  groupCount: number | bigint | null;
  details: string | null;
  url: string | null;
  imagePath: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN StudioRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // User data from LEFT JOIN UserStudioStats (us)
  userOCounter: number | null;
  userPlayCount: number | null;
}

// ---------------------------------------------------------------------------
// TagQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by TagQueryBuilder's SELECT.
 *
 * Base columns from StashTag, plus user data from LEFT JOINs on
 * TagRating (r) and UserTagStats (us).
 */
export interface TagQueryRow {
  // StashTag base columns
  id: string;
  stashInstanceId: string;
  name: string;
  stashFavorite: boolean;
  sceneCount: number | null;
  imageCount: number | bigint | null;
  galleryCount: number | bigint | null;
  performerCount: number | bigint | null;
  studioCount: number | bigint | null;
  groupCount: number | bigint | null;
  sceneCountViaPerformers: number | null;
  /** Live scenes tagged directly or inheriting the tag, each once */
  sceneCountAll: number | bigint;
  description: string | null;
  aliases: string | null; // JSON-encoded string[]
  parentIds: string | null; // JSON-encoded string[]
  imagePath: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN TagRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // User data from LEFT JOIN UserTagStats (us)
  userOCounter: number | null;
  userPlayCount: number | null;
}

/** A row of the compact tag tree (services/TagTreeService.ts) */
export interface TagTreeQueryRow {
  id: string;
  stashInstanceId: string;
  name: string;
  imagePath: string | null;
  parentIds: string | null; // JSON-encoded string[]
  /** The card's counts as the user sees them (query/excludedCounts.ts) */
  sceneCountAll: number | bigint;
  imageCount: number | bigint;
  galleryCount: number | bigint;
  performerCount: number | bigint;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;
  // LEFT JOIN TagRating (r) and UserTagStats (us)
  userRating: number | null;
  userFavorite: boolean | null;
  userOCounter: number | null;
  /** Scoped only: the scope's visible scenes carrying the tag (COALESCE) */
  scopeSceneCount: bigint | null;
}

/** The folder view's Untagged count (`loadUntaggedCount`): COUNT(*), a bigint */
export interface UntaggedCountRow {
  n: bigint;
}

// ---------------------------------------------------------------------------
// GalleryQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by GalleryQueryBuilder's SELECT.
 *
 * Base columns from StashGallery, plus user data from LEFT JOIN on
 * GalleryRating (r), and cover image dimensions from LEFT JOIN on
 * StashImage (ci).
 */
export interface GalleryQueryRow {
  // StashGallery base columns
  id: string;
  stashInstanceId: string;
  title: string | null;
  date: string | null;
  studioId: string | null;
  stashRating100: number | null;
  imageCount: number | bigint | null;
  coverImageId: string | null;
  details: string | null;
  url: string | null;
  code: string | null;
  photographer: string | null;
  urls: string | null; // JSON-encoded string[]
  folderPath: string | null;
  fileBasename: string | null;
  coverPath: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN GalleryRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // Cover image dimensions from LEFT JOIN StashImage (ci)
  coverWidth: number | null;
  coverHeight: number | null;
}

// ---------------------------------------------------------------------------
// GroupQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by GroupQueryBuilder's SELECT.
 *
 * Base columns from StashGroup, plus user data from LEFT JOIN on
 * GroupRating (r) and the count of sub-groups the user can see.
 */
export interface GroupQueryRow {
  // StashGroup base columns
  id: string;
  stashInstanceId: string;
  name: string;
  date: string | null;
  studioId: string | null;
  stashRating100: number | null;
  duration: number | null;
  sceneCount: number | bigint | null;
  performerCount: number | bigint | null;
  director: string | null;
  synopsis: string | null;
  urls: string | null; // JSON-encoded string[]
  frontImagePath: string | null;
  backImagePath: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN GroupRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // COUNT(*) over GroupRelation: live sub-groups the user can see
  subGroupCount: bigint;
}

/**
 * Raw row of GroupQueryBuilder.getHierarchy: the group at the other end of a
 * GroupRelation link, and the link's description.
 */
export interface GroupRelationQueryRow {
  id: string;
  stashInstanceId: string;
  name: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// TooltipRelations (the performer, studio, tag and group cards)
// ---------------------------------------------------------------------------

/**
 * One related entity of one parent on the page: the parent's (id, instance)
 * as `pid`/`pinst`, the entity's id (on the parent's instance), its place in
 * the parent's list (ROW_NUMBER) and how many the parent has (COUNT OVER).
 */
export interface TooltipListRow {
  pid: string;
  pinst: string;
  id: string;
  rn: bigint;
  total: bigint;
}

/** How many related entities one parent on the page has. */
export interface TooltipTotalRow {
  pid: string;
  pinst: string;
  total: bigint;
}

// ---------------------------------------------------------------------------
// Nested refs (services/query/nestedRefs.ts, TooltipRelations)
// ---------------------------------------------------------------------------

/**
 * A nested or related entity's key, as a list row's relation load reads it
 * (the tooltip loads name the instance `pinst`, the parent's).
 */
export interface RefKeyRow {
  id: string;
  stashInstanceId: string;
}

/**
 * A nested performer's columns. Stash's own `favorite` and `rating100` are
 * never read: they belong to the Stash user.
 */
export interface PerformerRefRow {
  name: string;
  disambiguation: string | null;
  gender: string | null;
  imagePath: string | null;
}

/** A nested studio's columns (no Stash favorite) */
export interface StudioRefRow {
  name: string;
  imagePath: string | null;
  parentId: string | null;
}

/** A nested tag's columns (no Stash favorite) */
export interface TagRefRow {
  name: string;
  imagePath: string | null;
}

/** A nested group's columns */
export interface GroupRefRow {
  name: string;
  frontImagePath: string | null;
  backImagePath: string | null;
}

/** A nested gallery's columns */
export interface GalleryRefRow {
  title: string | null;
  folderPath: string | null;
  fileBasename: string | null;
  coverPath: string | null;
}

/** The parent a nested load's row belongs to, from the page's pairs */
export interface NestedParentRow {
  pid: string;
  pinst: string;
}

// ---------------------------------------------------------------------------
// ImageQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by ImageQueryBuilder's SELECT.
 *
 * Base columns from StashImage, plus user data from LEFT JOINs on
 * ImageRating (r) and ImageViewHistory (v). Stash's own rating and O count
 * are not selected: the list reads the viewer's.
 */
export interface ImageQueryRow {
  // StashImage base columns
  id: string;
  stashInstanceId: string;
  title: string | null;
  code: string | null;
  details: string | null;
  photographer: string | null;
  urls: string | null; // JSON-encoded string[]
  date: string | null;
  studioId: string | null;
  organized: boolean;
  filePath: string | null;
  width: number | null;
  height: number | null;
  fileSize: bigint | null; // BIGINT column: Prisma returns a bigint
  pathThumbnail: string | null;
  pathPreview: string | null;
  pathImage: string | null;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // User data from LEFT JOIN ImageRating (r)
  userRating: number | null;
  userFavorite: boolean | null;

  // User data from LEFT JOIN ImageViewHistory (v)
  userViewCount: number | null;
  userOCount: number | null;
  userLastViewedAt: Date | null;
}

// ---------------------------------------------------------------------------
// ClipQueryBuilder
// ---------------------------------------------------------------------------

/**
 * Raw row returned by ClipQueryBuilder's SELECT.
 *
 * Base columns from StashClip and the scene's columns from INNER JOIN
 * StashScene (s). The primary tag and the tag list load with the page's
 * relations, only when the viewer may see them.
 */
export interface ClipRow {
  // StashClip base columns
  id: string;
  stashInstanceId: string;
  sceneId: string;
  sceneInstanceId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  primaryTagInstanceId: string | null;
  screenshotPath: string | null;
  isGenerated: boolean;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;

  // Scene columns from INNER JOIN StashScene (s)
  sceneTitle: string | null;
  scenePathScreenshot: string | null;
  sceneStudioId: string | null;
}

/** A clip's tag's columns (its primary tag or one of its list) */
export interface ClipTagRefRow {
  name: string;
  color: string | null;
}

// ---------------------------------------------------------------------------
// MinimalEntityQuery
// ---------------------------------------------------------------------------

/** Raw row of an entity picker's search (services/MinimalEntityQuery.ts) */
export interface MinimalEntityQueryRow {
  id: string;
  instanceId: string;
  /** The name expression; a gallery with no title, file or folder has none */
  name: string | null;
  /** Galleries only: what the shown name is built from */
  title?: string | null;
  fileBasename?: string | null;
  folderPath?: string | null;
}

// ---------------------------------------------------------------------------
// PlaylistQueryService
// ---------------------------------------------------------------------------

/**
 * Raw row of the playlist previews (services/PlaylistQueryService.ts): one of
 * the first four items a user can see in a playlist, with its scene's
 * compact columns and how many of the playlist's items the user can see.
 */
export interface PlaylistPreviewQueryRow {
  playlistId: number;
  sceneId: string;
  /** The join matches it to the scene's instance, so never null */
  instanceId: string;
  position: number;
  title: string | null;
  filePath: string | null;
  pathScreenshot: string | null;
  /** COUNT(*) OVER the playlist's visible items */
  visibleCount: bigint;
}

/** Raw row of a page of a playlist's visible items (PlaylistQueryService) */
export interface PlaylistItemQueryRow {
  id: number;
  playlistId: number;
  sceneId: string;
  /** The join matches it to the scene's instance, so never null */
  instanceId: string;
  position: number;
  addedAt: Date;
}

/** One item of a playlist being moved (PlaylistQueryService.moveItem) */
export interface PlaylistMoveQueryRow {
  id: number;
  /** 1 when the owner sees the item's scene, else 0 */
  visible: bigint;
}

/** One play queue entry's columns (PlaylistQueryService.loadPlaylistQueue) */
export interface PlaylistQueueQueryRow {
  sceneId: string;
  /** The join matches it to the scene's instance, so never null */
  instanceId: string;
  title: string | null;
  filePath: string | null;
  pathScreenshot: string | null;
  duration: number | null;
  /** Null without a studio, or one the viewer may not see */
  studioName: string | null;
}

/** One watched scene of a page (WatchHistoryQueryService) */
export interface WatchedSceneQueryRow {
  id: string;
  instanceId: string;
}

/** The totals of a watched-scenes view (WatchHistoryQueryService) */
export interface WatchedScenesTotalsRow {
  total: number | bigint;
  /** NULL-free through COALESCE; SUM of a REAL column comes back as number */
  totalPlayDuration: number | bigint;
}
