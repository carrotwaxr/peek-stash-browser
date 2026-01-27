/**
 * SceneQueryBuilder - SQL-native scene querying
 *
 * Builds parameterized SQL queries for scene filtering, sorting, and pagination.
 * Eliminates the need to load all scenes into memory.
 */
import type { PeekSceneFilter, NormalizedScene } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface SceneQueryOptions {
  userId: number;
  filters?: PeekSceneFilter;
  applyExclusions?: boolean;  // Default true - use pre-computed exclusions
  allowedInstanceIds?: string[];  // Multi-instance filtering - array of instances the user can access
  specificInstanceId?: string;  // Single instance filter for disambiguation on detail pages
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
  searchQuery?: string;  // Text search query - searches title, details, path, performer names, studio name, tag names
}

// Query result
export interface SceneQueryResult {
  scenes: NormalizedScene[];
  total: number;
}

// Query by IDs options
export interface SceneByIdsOptions {
  userId: number;
  ids: string[];
  allowedInstanceIds?: string[];  // Multi-instance filtering
}

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder {
  // Column list for SELECT - all StashScene fields plus user data
  private readonly SELECT_COLUMNS = `
    s.id, s.stashInstanceId, s.title, s.code, s.date, s.studioId, s.rating100 AS stashRating100,
    s.duration, s.organized, s.details, s.director, s.urls, s.filePath, s.fileBitRate,
    s.fileFrameRate, s.fileWidth, s.fileHeight, s.fileVideoCodec,
    s.fileAudioCodec, s.fileSize, s.pathScreenshot, s.pathPreview,
    s.pathSprite, s.pathVtt, s.pathChaptersVtt, s.pathStream, s.pathCaption,
    s.streams, s.inheritedTagIds,
    s.oCounter AS stashOCounter, s.playCount AS stashPlayCount,
    s.playDuration AS stashPlayDuration, s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    w.playCount AS userPlayCount, w.playDuration AS userPlayDuration,
    w.lastPlayedAt AS userLastPlayedAt, w.oCount AS userOCount,
    w.resumeTime AS userResumeTime, w.oHistory AS userOHistory,
    w.playHistory AS userPlayHistory
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(userId: number, applyExclusions: boolean = true): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashScene s
        LEFT JOIN SceneRating r ON s.id = r.sceneId AND s.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN WatchHistory w ON s.id = w.sceneId AND s.stashInstanceId = w.instanceId AND w.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = s.id`,
        params: [userId, userId, userId],
      };
    }

    return {
      sql: baseJoins,
      params: [userId, userId],
    };
  }

  // Base WHERE clause (always filter deleted, optionally filter excluded)
  private buildBaseWhere(applyExclusions: boolean = true): FilterClause {
    if (applyExclusions) {
      return {
        sql: "s.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "s.deletedAt IS NULL",
      params: [],
    };
  }

  /**
   * Build instance filter clause for multi-instance support
   * Filters scenes to only those from allowed Stash instances
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      // No instance filter - return all scenes
      return { sql: "", params: [] };
    }

    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(s.stashInstanceId IN (${placeholders}) OR s.stashInstanceId IS NULL)`,
      params: allowedInstanceIds,
    };
  }

  /**
   * Build filter for a specific instance ID (for disambiguation on detail pages)
   * This is different from allowedInstanceIds - it filters to exactly one instance.
   */
  private buildSpecificInstanceFilter(instanceId: string | undefined): FilterClause {
    if (!instanceId) {
      return { sql: "", params: [] };
    }
    return {
      sql: `s.stashInstanceId = ?`,
      params: [instanceId],
    };
  }

  /**
   * Build performer filter clause
   * Supports INCLUDES, INCLUDES_ALL, EXCLUDES modifiers
   */
  private buildPerformerFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        // Scene has ANY of these performers
        return {
          sql: `EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND sp.performerId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        // Scene has ALL of these performers
        return {
          sql: `(SELECT COUNT(DISTINCT sp.performerId) FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND sp.performerId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        // Scene has NONE of these performers
        return {
          sql: `NOT EXISTS (SELECT 1 FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND sp.performerId IN (${placeholders}))`,
          params: ids,
        };

      default:
        logger.warn("Unknown performer filter modifier", { modifier });
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag filter clause
   */
  private buildTagFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT st.tagId) FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build studio filter clause
   */
  private buildStudioFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.studioId IN (${placeholders})`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `(s.studioId IS NULL OR s.studioId NOT IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build group filter clause
   */
  private buildGroupFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId AND sg.groupId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT sg.groupId) FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId AND sg.groupId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM SceneGroup sg WHERE sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId AND sg.groupId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build galleries filter clause
   */
  private buildGalleriesFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.id IN (SELECT sceneId FROM SceneGallery WHERE galleryId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `s.id IN (
            SELECT sceneId FROM SceneGallery
            WHERE galleryId IN (${placeholders})
            GROUP BY sceneId
            HAVING COUNT(DISTINCT galleryId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `s.id NOT IN (SELECT sceneId FROM SceneGallery WHERE galleryId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build favorite filter clause
   */
  private buildFavoriteFilter(favorite: boolean | undefined): FilterClause {
    if (favorite === undefined) {
      return { sql: "", params: [] };
    }

    if (favorite) {
      return { sql: "r.favorite = 1", params: [] };
    } else {
      return { sql: "(r.favorite = 0 OR r.favorite IS NULL)", params: [] };
    }
  }

  /**
   * Build rating filter clause
   */
  private buildRatingFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(r.rating, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };

      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };

      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };

      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };

      case "BETWEEN":
        if (value2 === undefined || value2 === null) {
          return { sql: `${col} >= ?`, params: [value] };
        }
        return { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] };

      case "NOT_BETWEEN":
        if (value2 === undefined || value2 === null) {
          return { sql: `${col} < ?`, params: [value] };
        }
        return { sql: `(${col} < ? OR ${col} > ?)`, params: [value, value2] };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build play count filter clause
   */
  private buildPlayCountFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(w.playCount, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined && value2 !== null
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build o_counter filter clause
   */
  private buildOCounterFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(w.oCount, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined && value2 !== null
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build ID filter clause (for specific scene IDs)
   */
  private buildIdFilter(
    filter: { value?: string[] | null; modifier?: string | null } | string[] | undefined | null
  ): FilterClause {
    // Handle both array and object formats
    const ids = Array.isArray(filter) ? filter : filter?.value;
    if (!ids || ids.length === 0) {
      return { sql: "", params: [] };
    }

    const modifier = Array.isArray(filter) ? "INCLUDES" : filter?.modifier || "INCLUDES";
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return { sql: `s.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `s.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `s.id IN (${placeholders})`, params: ids };
    }
  }

  /**
   * Build duration filter clause
   */
  private buildDurationFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = "COALESCE(s.duration, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        return value2 !== undefined && value2 !== null
          ? { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] }
          : { sql: `${col} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build resolution filter clause
   */
  private buildResolutionFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    // Resolution values map enum names to pixel heights
    const resolutionMap: Record<string, number> = {
      // Lowercase with 'p' suffix (e.g., "720p")
      "144p": 144,
      "240p": 240,
      "360p": 360,
      "480p": 480,
      "540p": 540,
      "720p": 720,
      "1080p": 1080,
      "1440p": 1440,
      "4k": 2160,
      "5k": 2880,
      "6k": 3240,
      "8k": 4320,
      // Stash enum values (e.g., "STANDARD_HD")
      very_low: 144,
      low: 240,
      r360p: 360,
      standard: 480,
      web_hd: 540,
      standard_hd: 720,
      full_hd: 1080,
      quad_hd: 1440,
      vr_hd: 1920,
      four_k: 2160,
      five_k: 2880,
      six_k: 3240,
      eight_k: 4320,
    };

    const height = resolutionMap[filter.value.toLowerCase()];
    if (!height) {
      return { sql: "", params: [] };
    }

    const { modifier = "EQUALS" } = filter;
    const col = "COALESCE(s.fileHeight, 0)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [height] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [height] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [height] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [height] };
      default:
        return { sql: `${col} >= ?`, params: [height] };
    }
  }

  /**
   * Build title filter clause (text search)
   */
  private buildTitleFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;

    switch (modifier) {
      case "INCLUDES":
        return { sql: "LOWER(s.title) LIKE LOWER(?)", params: [`%${value}%`] };
      case "EXCLUDES":
        return {
          sql: "(s.title IS NULL OR LOWER(s.title) NOT LIKE LOWER(?))",
          params: [`%${value}%`],
        };
      case "EQUALS":
        return { sql: "LOWER(s.title) = LOWER(?)", params: [value] };
      case "NOT_EQUALS":
        return {
          sql: "(s.title IS NULL OR LOWER(s.title) != LOWER(?))",
          params: [value],
        };
      case "IS_NULL":
        return { sql: "(s.title IS NULL OR s.title = '')", params: [] };
      case "NOT_NULL":
        return { sql: "(s.title IS NOT NULL AND s.title != '')", params: [] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build details filter clause (text search)
   */
  private buildDetailsFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;

    switch (modifier) {
      case "INCLUDES":
        return { sql: "LOWER(s.details) LIKE LOWER(?)", params: [`%${value}%`] };
      case "EXCLUDES":
        return {
          sql: "(s.details IS NULL OR LOWER(s.details) NOT LIKE LOWER(?))",
          params: [`%${value}%`],
        };
      case "EQUALS":
        return { sql: "LOWER(s.details) = LOWER(?)", params: [value] };
      case "NOT_EQUALS":
        return {
          sql: "(s.details IS NULL OR LOWER(s.details) != LOWER(?))",
          params: [value],
        };
      case "IS_NULL":
        return { sql: "(s.details IS NULL OR s.details = '')", params: [] };
      case "NOT_NULL":
        return { sql: "(s.details IS NOT NULL AND s.details != '')", params: [] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build text search filter clause (searches across title, details, path, performers, studio, tags)
   * Uses LIKE with wildcard for broad text matching
   */
  private buildSearchQueryFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const query = searchQuery.trim();
    const likeParam = `%${query}%`;

    // Build OR clause that searches across multiple fields including relations via subqueries
    // Using LOWER() for case-insensitive matching
    const sql = `(
      LOWER(s.title) LIKE LOWER(?) OR
      LOWER(s.details) LIKE LOWER(?) OR
      LOWER(s.filePath) LIKE LOWER(?) OR
      EXISTS (
        SELECT 1 FROM ScenePerformer sp
        INNER JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        AND LOWER(p.name) LIKE LOWER(?)
      ) OR
      EXISTS (
        SELECT 1 FROM StashStudio st
        WHERE st.id = s.studioId AND st.stashInstanceId = s.stashInstanceId
        AND LOWER(st.name) LIKE LOWER(?)
      ) OR
      EXISTS (
        SELECT 1 FROM SceneTag stag
        INNER JOIN StashTag t ON stag.tagId = t.id AND stag.tagInstanceId = t.stashInstanceId
        WHERE stag.sceneId = s.id AND stag.sceneInstanceId = s.stashInstanceId
        AND LOWER(t.name) LIKE LOWER(?)
      )
    )`;

    return {
      sql,
      params: [likeParam, likeParam, likeParam, likeParam, likeParam, likeParam],
    };
  }

  /**
   * Build date filter clause (for scene date, created_at, updated_at, last_played_at)
   */
  private buildDateFilter(
    filter:
      | { value?: string | null; value2?: string | null; modifier?: string | null }
      | undefined
      | null,
    column: string
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;

    // IS_NULL and NOT_NULL don't require a value
    if (modifier === "IS_NULL") {
      return { sql: `${column} IS NULL`, params: [] };
    }
    if (modifier === "NOT_NULL") {
      return { sql: `${column} IS NOT NULL`, params: [] };
    }

    // All other modifiers require a value
    if (!value) {
      return { sql: "", params: [] };
    }

    switch (modifier) {
      case "EQUALS":
        return { sql: `date(${column}) = date(?)`, params: [value] };
      case "NOT_EQUALS":
        return {
          sql: `(${column} IS NULL OR date(${column}) != date(?))`,
          params: [value],
        };
      case "GREATER_THAN":
        return { sql: `${column} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${column} < ?`, params: [value] };
      case "BETWEEN":
        if (value2) {
          return { sql: `${column} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${column} >= ?`, params: [value] };
      case "NOT_BETWEEN":
        if (value2) {
          return {
            sql: `(${column} IS NULL OR ${column} < ? OR ${column} > ?)`,
            params: [value, value2],
          };
        }
        return { sql: `${column} < ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build numeric filter clause (for bitrate, framerate, counts, etc.)
   */
  private buildNumericFilter(
    filter:
      | { value?: number | null; value2?: number | null; modifier?: string | null }
      | undefined
      | null,
    column: string,
    coalesce: number = 0
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;
    const col = `COALESCE(${column}, ${coalesce})`;

    switch (modifier) {
      case "EQUALS":
        return { sql: `${col} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${col} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${col} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${col} < ?`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `${col} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${col} >= ?`, params: [value] };
      case "NOT_BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `(${col} < ? OR ${col} > ?)`, params: [value, value2] };
        }
        return { sql: `${col} < ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build orientation filter clause
   */
  private buildOrientationFilter(
    filter: { value?: string[] | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const orientations = filter.value.map((o) => o.toUpperCase());
    const conditions: string[] = [];

    for (const orientation of orientations) {
      switch (orientation) {
        case "LANDSCAPE":
          conditions.push("(s.fileWidth > s.fileHeight)");
          break;
        case "PORTRAIT":
          conditions.push("(s.fileWidth < s.fileHeight)");
          break;
        case "SQUARE":
          conditions.push("(s.fileWidth = s.fileHeight AND s.fileWidth > 0)");
          break;
      }
    }

    if (conditions.length === 0) {
      return { sql: "", params: [] };
    }

    return { sql: `(${conditions.join(" OR ")})`, params: [] };
  }

  /**
   * Build video codec filter clause
   */
  private buildVideoCodecFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: "LOWER(s.fileVideoCodec) LIKE LOWER(?)",
          params: [`%${value}%`],
        };
      case "EXCLUDES":
        return {
          sql: "(s.fileVideoCodec IS NULL OR LOWER(s.fileVideoCodec) NOT LIKE LOWER(?))",
          params: [`%${value}%`],
        };
      case "EQUALS":
        return { sql: "LOWER(s.fileVideoCodec) = LOWER(?)", params: [value] };
      case "NOT_EQUALS":
        return {
          sql: "(s.fileVideoCodec IS NULL OR LOWER(s.fileVideoCodec) != LOWER(?))",
          params: [value],
        };
      case "IS_NULL":
        return {
          sql: "(s.fileVideoCodec IS NULL OR s.fileVideoCodec = '')",
          params: [],
        };
      case "NOT_NULL":
        return {
          sql: "(s.fileVideoCodec IS NOT NULL AND s.fileVideoCodec != '')",
          params: [],
        };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build audio codec filter clause
   */
  private buildAudioCodecFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: "LOWER(s.fileAudioCodec) LIKE LOWER(?)",
          params: [`%${value}%`],
        };
      case "EXCLUDES":
        return {
          sql: "(s.fileAudioCodec IS NULL OR LOWER(s.fileAudioCodec) NOT LIKE LOWER(?))",
          params: [`%${value}%`],
        };
      case "EQUALS":
        return { sql: "LOWER(s.fileAudioCodec) = LOWER(?)", params: [value] };
      case "NOT_EQUALS":
        return {
          sql: "(s.fileAudioCodec IS NULL OR LOWER(s.fileAudioCodec) != LOWER(?))",
          params: [value],
        };
      case "IS_NULL":
        return {
          sql: "(s.fileAudioCodec IS NULL OR s.fileAudioCodec = '')",
          params: [],
        };
      case "NOT_NULL":
        return {
          sql: "(s.fileAudioCodec IS NOT NULL AND s.fileAudioCodec != '')",
          params: [],
        };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer count filter clause
   */
  private buildPerformerCountFilter(
    filter:
      | { value?: number | null; value2?: number | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    const subquery =
      "(SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${subquery} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${subquery} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${subquery} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${subquery} < ?`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `${subquery} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${subquery} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag count filter clause
   */
  private buildTagCountFilter(
    filter:
      | { value?: number | null; value2?: number | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    const subquery = "(SELECT COUNT(*) FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `${subquery} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${subquery} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${subquery} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${subquery} < ?`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `${subquery} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${subquery} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer favorite filter clause
   * Returns scenes that have at least one favorite performer
   */
  private buildPerformerFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN PerformerRating pr ON sp.performerId = pr.performerId AND pr.userId = ?
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND pr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build studio favorite filter clause
   * Returns scenes that have a favorite studio
   */
  private buildStudioFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `s.studioId IN (
        SELECT sr.studioId FROM StudioRating sr
        WHERE sr.userId = ? AND sr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build tag favorite filter clause
   * Returns scenes that have at least one favorite tag
   */
  private buildTagFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN TagRating tr ON st.tagId = tr.tagId AND tr.userId = ?
        WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND tr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build performer age filter clause
   * Filters by performer age at time of scene date
   */
  private buildPerformerAgeFilter(
    filter:
      | { value?: number | null; value2?: number | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    // Calculate age: (scene_date - birthdate) in years
    // SQLite: (julianday(scene_date) - julianday(birthdate)) / 365.25
    const ageSubquery = `(
      SELECT MAX(
        CAST((julianday(COALESCE(s.date, date('now'))) - julianday(p.birthdate)) / 365.25 AS INTEGER)
      )
      FROM ScenePerformer sp
      JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
      WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND p.birthdate IS NOT NULL
    )`;

    switch (modifier) {
      case "EQUALS":
        return { sql: `${ageSubquery} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${ageSubquery} != ?`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${ageSubquery} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${ageSubquery} < ?`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `${ageSubquery} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${ageSubquery} >= ?`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build studio filter with hierarchy support
   */
  private async buildStudioFilterWithHierarchy(
    filter:
      | { value?: string[] | null; modifier?: string | null; depth?: number | null }
      | undefined
      | null
  ): Promise<FilterClause> {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    let ids = filter.value;
    const { modifier = "INCLUDES", depth } = filter;

    // Expand IDs if depth is specified and not 0
    if (depth !== undefined && depth !== null && depth !== 0) {
      ids = await expandStudioIds(ids, depth);
    }

    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `s.studioId IN (${placeholders})`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `(s.studioId IS NULL OR s.studioId NOT IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag filter with hierarchy support
   * Searches both direct scene tags (SceneTag) and inherited tags (inheritedTagIds JSON)
   */
  private async buildTagFilterWithHierarchy(
    filter:
      | { value?: string[] | null; modifier?: string | null; depth?: number | null }
      | undefined
      | null
  ): Promise<FilterClause> {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    let ids = filter.value;
    const { modifier = "INCLUDES", depth } = filter;

    // Expand IDs if depth is specified and not 0
    if (depth !== undefined && depth !== null && depth !== 0) {
      ids = await expandTagIds(ids, depth);
    }

    const placeholders = ids.map(() => "?").join(", ");

    // Build inherited tag check using json_each to search the JSON array
    // inheritedTagIds is stored as JSON string like '["284","313"]'
    // IMPORTANT: Also verify the tag exists in the scene's instance to prevent cross-instance pollution
    // Different instances can have different tags with the same ID
    const inheritedTagCheck = ids.map(() =>
      `EXISTS (SELECT 1 FROM json_each(s.inheritedTagIds) je WHERE je.value = ? AND EXISTS (SELECT 1 FROM StashTag t WHERE t.id = je.value AND t.stashInstanceId = s.stashInstanceId AND t.deletedAt IS NULL))`
    ).join(" OR ");

    switch (modifier) {
      case "INCLUDES":
        // Match if tag is in direct tags OR in inherited tags
        return {
          sql: `(EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${placeholders})) OR (${inheritedTagCheck}))`,
          params: [...ids, ...ids],
        };

      case "INCLUDES_ALL": {
        // Match if ALL tags are present (in direct tags OR inherited tags)
        // For each tag, check if it's in SceneTag OR in inheritedTagIds (with instance validation)
        const allTagChecks = ids.map(() =>
          `(EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId = ?) OR EXISTS (SELECT 1 FROM json_each(s.inheritedTagIds) je WHERE je.value = ? AND EXISTS (SELECT 1 FROM StashTag t WHERE t.id = je.value AND t.stashInstanceId = s.stashInstanceId AND t.deletedAt IS NULL)))`
        ).join(" AND ");
        // Flatten params: for each id, we need it twice (once for SceneTag, once for json_each)
        const allTagParams = ids.flatMap(id => [id, id]);
        return {
          sql: `(${allTagChecks})`,
          params: allTagParams,
        };
      }

      case "EXCLUDES":
        // Exclude if tag is in direct tags OR in inherited tags
        return {
          sql: `(NOT EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND st.tagId IN (${placeholders})) AND NOT (${inheritedTagCheck}))`,
          params: [...ids, ...ids],
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(
    sort: string,
    direction: "ASC" | "DESC",
    randomSeed?: number
  ): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

    // Extract filename from path: '/videos/My Scene.mp4' -> 'My Scene.mp4'
    // This matches the display logic in getSceneFallbackTitle which uses basename
    // Note: handles forward slashes; backslashes are uncommon in Stash paths
    const filenameExpr = `REPLACE(s.filePath, RTRIM(s.filePath, REPLACE(s.filePath, '/', '')), '')`;

    // Map sort field names to SQL expressions
    const sortMap: Record<string, string> = {
      // Scene metadata
      created_at: `s.stashCreatedAt ${dir}`,
      updated_at: `s.stashUpdatedAt ${dir}`,
      date: `s.date ${dir}`,
      title: `COALESCE(NULLIF(s.title, ''), ${filenameExpr}) COLLATE NOCASE ${dir}`,
      duration: `s.duration ${dir}`,
      filesize: `s.fileSize ${dir}`,
      bitrate: `s.fileBitRate ${dir}`,
      framerate: `s.fileFrameRate ${dir}`,
      path: `s.filePath ${dir}`,
      performer_count: `(SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId) ${dir}`,
      tag_count: `(SELECT COUNT(*) FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId) ${dir}`,

      // User ratings (from SceneRating table)
      rating: `COALESCE(r.rating, 0) ${dir}`,

      // User data - prefer user values
      last_played_at: `w.lastPlayedAt ${dir}`,
      play_count: `COALESCE(w.playCount, 0) ${dir}`,
      play_duration: `COALESCE(w.playDuration, 0) ${dir}`,
      o_counter: `COALESCE(w.oCount, 0) ${dir}`,
      // last_o_at: SQL sort not supported - lastOAt column doesn't exist in WatchHistory
      // The last O timestamp is derived from oHistory JSON and can only be sorted in JS
      user_rating: `COALESCE(r.rating, 0) ${dir}`,
      resume_time: `COALESCE(w.resumeTime, 0) ${dir}`,

      // Random with deterministic seed for stable pagination
      // Uses Stash's formula with modulo at each step to prevent SQLite integer overflow
      // Without intermediate modulo, large seeds cause overflow to float which breaks ordering
      random: `(((((s.id + ${randomSeed || 12345}) % 2147483647) * ((s.id + ${randomSeed || 12345}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((s.id + ${randomSeed || 12345}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];

    // Add secondary sort by id for stable ordering
    return `${sortExpr}, s.id ${dir}`;
  }

  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, allowedInstanceIds, specificInstanceId, filters } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Instance filter (multi-instance support)
    const instanceFilter = this.buildInstanceFilter(allowedInstanceIds);
    if (instanceFilter.sql) {
      whereClauses.push(instanceFilter);
    }

    // Specific instance filter (for disambiguation on detail pages)
    if (specificInstanceId) {
      const specificFilter = this.buildSpecificInstanceFilter(specificInstanceId);
      if (specificFilter.sql) {
        whereClauses.push(specificFilter);
      }
    }

    // ID filter
    if (filters?.ids) {
      const idFilter = this.buildIdFilter(filters.ids);
      if (idFilter.sql) {
        whereClauses.push(idFilter);
      }
    }

    // Metadata filters
    if (filters?.duration) {
      const durationFilter = this.buildDurationFilter(filters.duration);
      if (durationFilter.sql) {
        whereClauses.push(durationFilter);
      }
    }

    if (filters?.resolution) {
      const resolutionFilter = this.buildResolutionFilter(filters.resolution);
      if (resolutionFilter.sql) {
        whereClauses.push(resolutionFilter);
      }
    }

    // Add entity filters
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
    }

    if (filters?.tags) {
      // Use hierarchy-aware filter that supports depth parameter
      const tagFilter = await this.buildTagFilterWithHierarchy(filters.tags as any);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
      }
    }

    if (filters?.studios) {
      // Use hierarchy-aware filter that supports depth parameter
      const studioFilter = await this.buildStudioFilterWithHierarchy(filters.studios as any);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    if (filters?.groups) {
      const groupFilter = this.buildGroupFilter(filters.groups as any);
      if (groupFilter.sql) {
        whereClauses.push(groupFilter);
      }
    }

    if (filters?.galleries) {
      const galleriesFilter = this.buildGalleriesFilter(filters.galleries as any);
      if (galleriesFilter.sql) {
        whereClauses.push(galleriesFilter);
      }
    }

    // User data filters
    const favoriteFilter = this.buildFavoriteFilter(filters?.favorite);
    if (favoriteFilter.sql) {
      whereClauses.push(favoriteFilter);
    }

    if (filters?.rating100) {
      const ratingFilter = this.buildRatingFilter(filters.rating100);
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    if (filters?.play_count) {
      const playCountFilter = this.buildPlayCountFilter(filters.play_count);
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    if (filters?.o_counter) {
      const oCounterFilter = this.buildOCounterFilter(filters.o_counter);
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Text filters
    if (filters?.title) {
      const titleFilter = this.buildTitleFilter(filters.title);
      if (titleFilter.sql) {
        whereClauses.push(titleFilter);
      }
    }

    if (filters?.details) {
      const detailsFilter = this.buildDetailsFilter(filters.details);
      if (detailsFilter.sql) {
        whereClauses.push(detailsFilter);
      }
    }

    // Date filters
    if (filters?.date) {
      const dateFilter = this.buildDateFilter(filters.date, "s.date");
      if (dateFilter.sql) {
        whereClauses.push(dateFilter);
      }
    }

    if (filters?.created_at) {
      const createdFilter = this.buildDateFilter(filters.created_at, "s.stashCreatedAt");
      if (createdFilter.sql) {
        whereClauses.push(createdFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedFilter = this.buildDateFilter(filters.updated_at, "s.stashUpdatedAt");
      if (updatedFilter.sql) {
        whereClauses.push(updatedFilter);
      }
    }

    if (filters?.last_played_at) {
      const lastPlayedFilter = this.buildDateFilter(filters.last_played_at, "w.lastPlayedAt");
      if (lastPlayedFilter.sql) {
        whereClauses.push(lastPlayedFilter);
      }
    }

    // Numeric filters
    if (filters?.bitrate) {
      const bitrateFilter = this.buildNumericFilter(filters.bitrate, "s.fileBitRate", 0);
      if (bitrateFilter.sql) {
        whereClauses.push(bitrateFilter);
      }
    }

    if (filters?.framerate) {
      const framerateFilter = this.buildNumericFilter(filters.framerate, "s.fileFrameRate", 0);
      if (framerateFilter.sql) {
        whereClauses.push(framerateFilter);
      }
    }

    if (filters?.play_duration) {
      const playDurationFilter = this.buildNumericFilter(
        filters.play_duration,
        "COALESCE(w.playDuration, 0)",
        0
      );
      if (playDurationFilter.sql) {
        whereClauses.push(playDurationFilter);
      }
    }

    // Count filters
    if (filters?.performer_count) {
      const performerCountFilter = this.buildPerformerCountFilter(filters.performer_count);
      if (performerCountFilter.sql) {
        whereClauses.push(performerCountFilter);
      }
    }

    if (filters?.tag_count) {
      const tagCountFilter = this.buildTagCountFilter(filters.tag_count);
      if (tagCountFilter.sql) {
        whereClauses.push(tagCountFilter);
      }
    }

    if (filters?.performer_age) {
      const performerAgeFilter = this.buildPerformerAgeFilter(filters.performer_age);
      if (performerAgeFilter.sql) {
        whereClauses.push(performerAgeFilter);
      }
    }

    // Enum/select filters
    if (filters?.orientation) {
      const orientationFilter = this.buildOrientationFilter(filters.orientation);
      if (orientationFilter.sql) {
        whereClauses.push(orientationFilter);
      }
    }

    if (filters?.video_codec) {
      const videoCodecFilter = this.buildVideoCodecFilter(filters.video_codec);
      if (videoCodecFilter.sql) {
        whereClauses.push(videoCodecFilter);
      }
    }

    if (filters?.audio_codec) {
      const audioCodecFilter = this.buildAudioCodecFilter(filters.audio_codec);
      if (audioCodecFilter.sql) {
        whereClauses.push(audioCodecFilter);
      }
    }

    // Favorite entity filters
    if (filters?.performer_favorite === true) {
      whereClauses.push(this.buildPerformerFavoriteFilter(userId));
    }

    if (filters?.studio_favorite === true) {
      whereClauses.push(this.buildStudioFavoriteFilter(userId));
    }

    if (filters?.tag_favorite === true) {
      whereClauses.push(this.buildTagFavoriteFilter(userId));
    }

    // Text search query (searches across title, details, path, performers, studio, tags)
    if (options.searchQuery) {
      const searchFilter = this.buildSearchQueryFilter(options.searchQuery);
      if (searchFilter.sql) {
        whereClauses.push(searchFilter);
      }
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort clause
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      options.randomSeed
    );

    // Build full query
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereParams, perPage, offset];

    logger.info("SceneQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      sortDirection: options.sortDirection,
      paramCount: params.length,
    });

    // Execute query
    const queryStart = Date.now();
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    const queryMs = Date.now() - queryStart;

    // Count query - use simplified count without JOINs when possible
    // The JOINs are only needed for user data filtering or exclusions, not for basic count
    const countStart = Date.now();
    let total: number;

    // Check if we have any user-data filters that require the JOINs
    const hasUserDataFilters =
      filters?.favorite !== undefined ||
      filters?.rating100 !== undefined ||
      filters?.play_count !== undefined ||
      filters?.o_counter !== undefined ||
      filters?.last_played_at !== undefined ||
      filters?.play_duration !== undefined ||
      filters?.performer_favorite === true ||
      filters?.studio_favorite === true ||
      filters?.tag_favorite === true;

    // Need full JOINs if user data filters OR exclusions are applied
    if (hasUserDataFilters || applyExclusions) {
      // Need full JOINs for accurate count with user data filters or exclusions
      const countSql = `
        SELECT COUNT(DISTINCT s.id) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
        countSql,
        ...countParams
      );
      total = Number(countResult[0]?.total || 0);
    } else {
      // Fast path: count without JOINs (no user data filters and no exclusions)
      // Build WHERE clause without user data conditions
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.") && !c.sql.includes("w.")
      );
      const baseWhereSQL = baseWhereClauses
        .map((c) => c.sql)
        .filter(Boolean)
        .join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashScene s
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
        countSql,
        ...baseWhereParams
      );
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const scenes = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations
    const relationsStart = Date.now();
    await this.populateRelations(scenes);
    const relationsMs = Date.now() - relationsStart;

    logger.info("SceneQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: scenes.length,
      total,
    });

    return { scenes, total };
  }

  /**
   * Transform a raw database row into a NormalizedScene
   */
  private transformRow(row: any): NormalizedScene {
    // Parse JSON fields
    const oHistory = this.parseJsonArray(row.userOHistory);
    const playHistory = this.parseJsonArray(row.userPlayHistory);

    // Determine last_o_at from o_history
    const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

    // Create scene object with studioId preserved for population
    const scene: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
      title: row.title || getSceneFallbackTitle(row.filePath),
      code: row.code || null,
      date: row.date || null,
      details: row.details || null,
      director: row.director || null,
      organized: row.organized === 1,
      created_at: row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt || null,

      // URLs
      urls: this.parseJsonArray(row.urls),

      // Store studioId for later population
      studioId: row.studioId,

      // User data - Peek user data ONLY, never fall back to Stash user data
      // Stash data (stashOCounter, stashPlayCount, etc.) belongs to the Stash user,
      // not the Peek user. Each Peek user starts at 0 for these fields.
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),
      o_counter: row.userOCount ?? 0,
      play_count: row.userPlayCount ?? 0,
      play_duration: row.userPlayDuration ?? 0,
      resume_time: row.userResumeTime ?? 0,
      play_history: playHistory,
      o_history: oHistory.map((ts: string) => new Date(ts)),
      last_played_at: row.userLastPlayedAt || null,
      last_o_at: lastOAt,

      // File data - build from individual columns
      files: row.filePath ? [{
        path: row.filePath,
        basename: row.filePath.split('/').pop()?.split('\\').pop() || row.filePath,
        duration: row.duration,
        bit_rate: row.fileBitRate,
        frame_rate: row.fileFrameRate,
        width: row.fileWidth,
        height: row.fileHeight,
        video_codec: row.fileVideoCodec,
        audio_codec: row.fileAudioCodec,
        size: row.fileSize ? Number(row.fileSize) : null,
      }] : [],

      // Paths - transform to proxy URLs with instanceId for multi-instance routing
      paths: {
        screenshot: this.transformUrl(row.pathScreenshot, row.stashInstanceId),
        preview: this.transformUrl(row.pathPreview, row.stashInstanceId),
        stream: this.transformUrl(row.pathStream, row.stashInstanceId),
        sprite: this.transformUrl(row.pathSprite, row.stashInstanceId),
        vtt: this.transformUrl(row.pathVtt, row.stashInstanceId),
        chapters_vtt: this.transformUrl(row.pathChaptersVtt, row.stashInstanceId),
        caption: this.transformUrl(row.pathCaption, row.stashInstanceId),
      },

      // Parse sceneStreams from JSON
      sceneStreams: this.parseSceneStreams(row.streams),

      // Relations - populated separately after query
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],

      // Inherited tags - IDs parsed here, hydrated with names in populateRelations
      inheritedTagIds: this.parseJsonArray(row.inheritedTagIds),
      inheritedTags: [], // Will be populated in populateRelations
    };

    return scene as NormalizedScene;
  }

  /**
   * Populate scene relations (performers, tags, studio, groups, galleries)
   * Called after main query with just the scene IDs we need
   *
   * Multi-instance aware: Uses composite keys (id:instanceId) throughout to
   * correctly associate relations when same IDs exist across different instances.
   */
  async populateRelations(scenes: NormalizedScene[]): Promise<void> {
    if (scenes.length === 0) return;

    // Build scene keys with instanceId for multi-instance support
    // All scenes should have valid instanceIds after migration
    const normalizeInstanceId = (id: string | null | undefined): string => {
      if (!id) {
        throw new Error('Scene has null/undefined instanceId - this should not happen after migration');
      }
      return id;
    };

    const sceneIds = scenes.map((s) => s.id);
    const sceneInstanceIds = [...new Set(scenes.map((s) => normalizeInstanceId(s.instanceId)))];
    // Collect unique (studioId, instanceId) pairs - each scene's studio comes from its own instance
    const studioKeys = [...new Map(
      scenes
        .filter((s) => (s as any).studioId)
        .map((s) => [`${(s as any).studioId}:${normalizeInstanceId(s.instanceId)}`, { id: (s as any).studioId, instanceId: normalizeInstanceId(s.instanceId) }])
    ).values()];

    // Batch load all relations in parallel
    // Filter by both sceneId AND sceneInstanceId for multi-instance correctness
    const [
      performerJunctions,
      tagJunctions,
      groupJunctions,
      galleryJunctions,
    ] = await Promise.all([
      prisma.scenePerformer.findMany({
        where: {
          sceneId: { in: sceneIds },
          sceneInstanceId: { in: sceneInstanceIds },
        },
      }),
      prisma.sceneTag.findMany({
        where: {
          sceneId: { in: sceneIds },
          sceneInstanceId: { in: sceneInstanceIds },
        },
      }),
      prisma.sceneGroup.findMany({
        where: {
          sceneId: { in: sceneIds },
          sceneInstanceId: { in: sceneInstanceIds },
        },
      }),
      prisma.sceneGallery.findMany({
        where: {
          sceneId: { in: sceneIds },
          sceneInstanceId: { in: sceneInstanceIds },
        },
      }),
    ]);

    // Collect unique entity keys (id:instanceId) from junction tables
    const performerKeys = [...new Map(
      performerJunctions.map((j) => [`${j.performerId}:${j.performerInstanceId}`, { id: j.performerId, instanceId: j.performerInstanceId }])
    ).values()];
    const tagKeys = [...new Map(
      tagJunctions.map((j) => [`${j.tagId}:${j.tagInstanceId}`, { id: j.tagId, instanceId: j.tagInstanceId }])
    ).values()];
    const groupKeys = [...new Map(
      groupJunctions.map((j) => [`${j.groupId}:${j.groupInstanceId}`, { id: j.groupId, instanceId: j.groupInstanceId }])
    ).values()];
    const galleryKeys = [...new Map(
      galleryJunctions.map((j) => [`${j.galleryId}:${j.galleryInstanceId}`, { id: j.galleryId, instanceId: j.galleryInstanceId }])
    ).values()];

    // Collect inherited tag IDs (these may not be in tagJunctions since they come from performers/studios/groups)
    // For inherited tags, we use just ID since they're pre-computed and stored without instance info
    const inheritedTagIdSet = new Set<string>();
    for (const scene of scenes) {
      const sceneAny = scene as any;
      if (sceneAny.inheritedTagIds && Array.isArray(sceneAny.inheritedTagIds)) {
        for (const tagId of sceneAny.inheritedTagIds) {
          inheritedTagIdSet.add(tagId);
        }
      }
    }

    // Build OR conditions for entity queries (need to match on composite keys)
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    // Add inherited tags - these use scene's instance since they're from the same Stash
    const inheritedTagOrConditions = [...inheritedTagIdSet].map((tagId) => ({
      id: tagId,
      stashInstanceId: { in: sceneInstanceIds },
    }));
    const allTagOrConditions = [...tagOrConditions, ...inheritedTagOrConditions];
    const groupOrConditions = groupKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const galleryOrConditions = galleryKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load actual entities (only those that exist) using composite key lookups
    const [performers, tags, groups, galleries, studios] = await Promise.all([
      performerOrConditions.length > 0
        ? prisma.stashPerformer.findMany({
            where: { OR: performerOrConditions },
          })
        : Promise.resolve([]),
      allTagOrConditions.length > 0
        ? prisma.stashTag.findMany({
            where: { OR: allTagOrConditions },
          })
        : Promise.resolve([]),
      groupOrConditions.length > 0
        ? prisma.stashGroup.findMany({
            where: { OR: groupOrConditions },
          })
        : Promise.resolve([]),
      galleryOrConditions.length > 0
        ? prisma.stashGallery.findMany({
            where: { OR: galleryOrConditions },
          })
        : Promise.resolve([]),
      studioOrConditions.length > 0
        ? prisma.stashStudio.findMany({
            where: { OR: studioOrConditions },
          })
        : Promise.resolve([]),
    ]);

    // Build entity lookup maps by composite key (id:instanceId)
    const performersByKey = new Map<string, any>();
    for (const performer of performers) {
      const key = `${performer.id}:${performer.stashInstanceId}`;
      performersByKey.set(key, this.transformStashPerformer(performer));
    }

    const tagsByKey = new Map<string, any>();
    for (const tag of tags) {
      const key = `${tag.id}:${tag.stashInstanceId}`;
      tagsByKey.set(key, this.transformStashTag(tag));
    }

    const groupsByKey = new Map<string, any>();
    for (const group of groups) {
      const key = `${group.id}:${group.stashInstanceId}`;
      groupsByKey.set(key, this.transformStashGroup(group));
    }

    const galleriesByKey = new Map<string, any>();
    for (const gallery of galleries) {
      const key = `${gallery.id}:${gallery.stashInstanceId}`;
      galleriesByKey.set(key, this.transformStashGallery(gallery));
    }

    const studiosByKey = new Map<string, any>();
    for (const studio of studios) {
      const key = `${studio.id}:${studio.stashInstanceId}`;
      studiosByKey.set(key, this.transformStashStudio(studio));
    }

    // Build scene-to-entities maps using junction tables with composite keys
    // Key format: sceneId:sceneInstanceId -> entities[]
    const performersByScene = new Map<string, any[]>();
    for (const junction of performerJunctions) {
      const performerKey = `${junction.performerId}:${junction.performerInstanceId}`;
      const performer = performersByKey.get(performerKey);
      if (!performer) continue; // Skip orphaned junction records
      const sceneKey = `${junction.sceneId}:${junction.sceneInstanceId}`;
      const list = performersByScene.get(sceneKey) || [];
      list.push(performer);
      performersByScene.set(sceneKey, list);
    }

    const tagsByScene = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tagKey = `${junction.tagId}:${junction.tagInstanceId}`;
      const tag = tagsByKey.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const sceneKey = `${junction.sceneId}:${junction.sceneInstanceId}`;
      const list = tagsByScene.get(sceneKey) || [];
      list.push(tag);
      tagsByScene.set(sceneKey, list);
    }

    const groupsByScene = new Map<string, any[]>();
    for (const junction of groupJunctions) {
      const groupKey = `${junction.groupId}:${junction.groupInstanceId}`;
      const group = groupsByKey.get(groupKey);
      if (!group) continue; // Skip orphaned junction records
      const sceneKey = `${junction.sceneId}:${junction.sceneInstanceId}`;
      const list = groupsByScene.get(sceneKey) || [];
      list.push({ ...group, scene_index: junction.sceneIndex });
      groupsByScene.set(sceneKey, list);
    }

    const galleriesByScene = new Map<string, any[]>();
    for (const junction of galleryJunctions) {
      const galleryKey = `${junction.galleryId}:${junction.galleryInstanceId}`;
      const gallery = galleriesByKey.get(galleryKey);
      if (!gallery) continue; // Skip orphaned junction records
      const sceneKey = `${junction.sceneId}:${junction.sceneInstanceId}`;
      const list = galleriesByScene.get(sceneKey) || [];
      list.push(gallery);
      galleriesByScene.set(sceneKey, list);
    }

    // Populate scenes using composite keys (use normalized instanceId)
    for (const scene of scenes) {
      const normalizedSceneInstanceId = normalizeInstanceId(scene.instanceId);
      const sceneKey = `${scene.id}:${normalizedSceneInstanceId}`;
      scene.performers = performersByScene.get(sceneKey) || [];
      scene.tags = tagsByScene.get(sceneKey) || [];
      scene.groups = groupsByScene.get(sceneKey) || [];
      scene.galleries = galleriesByScene.get(sceneKey) || [];
      const sceneAny = scene as any;
      if (sceneAny.studioId) {
        const studioKey = `${sceneAny.studioId}:${normalizedSceneInstanceId}`;
        scene.studio = studiosByKey.get(studioKey) || null;
      }

      // Hydrate inherited tags with full tag objects
      // Inherited tags use scene's instanceId since they're from the same Stash instance
      if (sceneAny.inheritedTagIds && Array.isArray(sceneAny.inheritedTagIds) && sceneAny.inheritedTagIds.length > 0) {
        sceneAny.inheritedTags = sceneAny.inheritedTagIds
          .map((tagId: string) => tagsByKey.get(`${tagId}:${normalizedSceneInstanceId}`))
          .filter((tag: any) => tag !== undefined);
      }
    }
  }

  // Helper transforms for Stash entities - all image URLs need proxy treatment
  // Each entity includes its stashInstanceId for multi-instance routing
  private transformStashPerformer(p: any): any {
    return {
      id: p.id,
      name: p.name,
      disambiguation: p.disambiguation,
      gender: p.gender,
      image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
      favorite: p.favorite,
      rating100: p.rating100,
    };
  }

  private transformStashTag(t: any): any {
    return {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath, t.stashInstanceId),
      favorite: t.favorite,
    };
  }

  private transformStashStudio(s: any): any {
    return {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath, s.stashInstanceId),
      favorite: s.favorite,
      parent_studio: s.parentId ? { id: s.parentId } : null,
    };
  }

  private transformStashGroup(g: any): any {
    return {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath, g.stashInstanceId),
      back_image_path: this.transformUrl(g.backImagePath, g.stashInstanceId),
    };
  }

  private transformStashGallery(g: any): any {
    const coverUrl = g.coverPath ? this.transformUrl(g.coverPath, g.stashInstanceId) : null;
    return {
      id: g.id,
      title: g.title,
      // Cover as simple string URL for consistency
      cover: coverUrl,
    };
  }

  /**
   * Safely parse a JSON array string
   */
  private parseJsonArray(json: string | null): string[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Parse sceneStreams JSON and keep the raw stream URLs
   * The frontend will handle URL rewriting to proxy-stream endpoint
   */
  private parseSceneStreams(json: string | null): any[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Transform a Stash URL/path to a proxy URL
   * @param urlOrPath - The URL or path to transform
   * @param instanceId - Optional Stash instance ID for multi-instance routing
   */
  private transformUrl(urlOrPath: string | null, instanceId?: string | null): string | null {
    if (!urlOrPath) return null;

    // If it's already a proxy URL, return as-is
    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    // Build base proxy URL
    let proxyPath: string;

    // If it's a full URL (http://...), extract path + query
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        // If URL parsing fails, treat as path
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    } else {
      // Otherwise treat as path and encode it
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }

    // Add instanceId for multi-instance routing
    if (instanceId) {
      proxyPath += `&instanceId=${encodeURIComponent(instanceId)}`;
    }

    return proxyPath;
  }

  /**
   * Get scenes by IDs with full relations
   * Used after scoring to fetch the final paginated results
   */
  async getByIds(options: SceneByIdsOptions): Promise<SceneQueryResult> {
    const { userId, ids, allowedInstanceIds } = options;

    if (ids.length === 0) {
      return { scenes: [], total: 0 };
    }

    // Use execute with ID filter
    return this.execute({
      userId,
      filters: {
        ids: { value: ids, modifier: "INCLUDES" },
      },
      applyExclusions: false, // IDs already filtered, don't double-exclude
      allowedInstanceIds, // Pass through for multi-instance filtering
      sort: "created_at", // Default sort, results will be reordered by caller if needed
      sortDirection: "DESC",
      page: 1,
      perPage: ids.length, // Get all requested IDs
    });
  }
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
