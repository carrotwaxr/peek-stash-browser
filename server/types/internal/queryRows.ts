/**
 * Typed row interfaces for QueryBuilder raw SQL results.
 *
 * Each interface matches the exact column names and types returned by SQLite
 * for the corresponding QueryBuilder's SELECT clause. Column names correspond
 * to SQL aliases (e.g. `s.rating100 AS stashRating100`).
 *
 * SQLite type mapping:
 *   - INTEGER -> number
 *   - TEXT -> string
 *   - NULL -> null
 *   - BOOLEAN -> number (0 | 1)
 *   - JSON columns -> string (parsed in transformRow)
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
  organized: number | null;          // SQLite boolean: 0 | 1
  details: string | null;
  director: string | null;
  urls: string | null;               // JSON-encoded string[]
  filePath: string | null;
  fileBitRate: number | null;
  fileFrameRate: number | null;
  fileWidth: number | null;
  fileHeight: number | null;
  fileVideoCodec: string | null;
  fileAudioCodec: string | null;
  fileSize: number | null;           // BigInt stored as number
  pathScreenshot: string | null;
  pathPreview: string | null;
  pathSprite: string | null;
  pathVtt: string | null;
  pathChaptersVtt: string | null;
  pathStream: string | null;
  pathCaption: string | null;
  captions: string | null;           // JSON-encoded caption metadata
  streams: string | null;            // JSON-encoded stream info
  inheritedTagIds: string | null;    // JSON-encoded string[]
  stashOCounter: number | null;
  stashPlayCount: number | null;
  stashPlayDuration: number | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN SceneRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1

  // User data from LEFT JOIN WatchHistory (w)
  userPlayCount: number | null;
  userPlayDuration: number | null;
  userLastPlayedAt: string | null;
  userOCount: number | null;
  userResumeTime: number | null;
  userOHistory: string | null;       // JSON-encoded string[]
  userPlayHistory: string | null;    // JSON-encoded string[]
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
export interface PerformerQueryRow {
  // StashPerformer base columns
  id: string;
  stashInstanceId: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birthdate: string | null;
  stashFavorite: number | null;      // SQLite boolean: 0 | 1
  stashRating100: number | null;
  sceneCount: number | null;
  imageCount: number | null;
  galleryCount: number | null;
  groupCount: number | null;
  details: string | null;
  aliasList: string | null;          // JSON-encoded string[]
  country: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  heightCm: number | null;
  weightKg: number | null;
  measurements: string | null;
  fakeTits: string | null;
  tattoos: string | null;
  piercings: string | null;
  careerLength: string | null;
  deathDate: string | null;
  url: string | null;
  imagePath: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN PerformerRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1

  // User data from LEFT JOIN UserPerformerStats (s)
  userOCounter: number | null;
  userPlayCount: number | null;
  userLastPlayedAt: string | null;
  userLastOAt: string | null;
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
  stashFavorite: number | null;      // SQLite boolean: 0 | 1
  stashRating100: number | null;
  sceneCount: number | null;
  imageCount: number | null;
  galleryCount: number | null;
  performerCount: number | null;
  groupCount: number | null;
  details: string | null;
  url: string | null;
  imagePath: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN StudioRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1

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
  stashFavorite: number | null;      // SQLite boolean: 0 | 1
  sceneCount: number | null;
  imageCount: number | null;
  galleryCount: number | null;
  performerCount: number | null;
  studioCount: number | null;
  groupCount: number | null;
  sceneMarkerCount: number | null;
  sceneCountViaPerformers: number | null;
  description: string | null;
  aliases: string | null;            // JSON-encoded string[]
  parentIds: string | null;          // JSON-encoded string[]
  imagePath: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN TagRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1

  // User data from LEFT JOIN UserTagStats (us)
  userOCounter: number | null;
  userPlayCount: number | null;
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
  imageCount: number | null;
  coverImageId: string | null;
  details: string | null;
  url: string | null;
  code: string | null;
  photographer: string | null;
  urls: string | null;               // JSON-encoded string[]
  folderPath: string | null;
  fileBasename: string | null;
  coverPath: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN GalleryRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1

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
 * GroupRating (r).
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
  sceneCount: number | null;
  performerCount: number | null;
  director: string | null;
  synopsis: string | null;
  urls: string | null;               // JSON-encoded string[]
  frontImagePath: string | null;
  backImagePath: string | null;
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;

  // User data from LEFT JOIN GroupRating (r)
  userRating: number | null;
  userFavorite: number | null;       // SQLite boolean: 0 | 1
}
