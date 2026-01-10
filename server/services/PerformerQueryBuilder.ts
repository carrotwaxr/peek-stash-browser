/**
 * PerformerQueryBuilder - SQL-native performer querying
 *
 * Builds parameterized SQL queries for performer filtering, sorting, and pagination.
 * Eliminates the need to load all performers into memory.
 */
import type { PeekPerformerFilter, NormalizedPerformer } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface PerformerQueryOptions {
  userId: number;
  filters?: PeekPerformerFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
}

// Query result
export interface PerformerQueryResult {
  performers: NormalizedPerformer[];
  total: number;
}

/**
 * Builds and executes SQL queries for performer filtering
 */
class PerformerQueryBuilder {
  // Column list for SELECT - all StashPerformer fields plus user data
  private readonly SELECT_COLUMNS = `
    p.id, p.name, p.disambiguation, p.gender, p.birthdate, p.favorite AS stashFavorite,
    p.rating100 AS stashRating100, p.sceneCount, p.imageCount, p.galleryCount, p.groupCount,
    p.details, p.aliasList, p.country, p.ethnicity, p.hairColor, p.eyeColor,
    p.heightCm, p.weightKg, p.measurements, p.fakeTits, p.tattoos, p.piercings,
    p.careerLength, p.deathDate, p.url, p.imagePath,
    p.stashCreatedAt, p.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    s.oCounter AS userOCounter, s.playCount AS userPlayCount,
    s.lastPlayedAt AS userLastPlayedAt, s.lastOAt AS userLastOAt
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashPerformer p
        LEFT JOIN PerformerRating r ON p.id = r.performerId AND r.userId = ?
        LEFT JOIN UserPerformerStats s ON p.id = s.performerId AND s.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'performer' AND e.entityId = p.id`,
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
        sql: "p.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "p.deletedAt IS NULL",
      params: [],
    };
  }

  /**
   * Build ID filter clause
   */
  private buildIdFilter(
    filter: { value?: string[] | null; modifier?: string | null } | string[] | undefined | null
  ): FilterClause {
    const ids = Array.isArray(filter) ? filter : filter?.value;
    if (!ids || ids.length === 0) {
      return { sql: "", params: [] };
    }

    const modifier = Array.isArray(filter) ? "INCLUDES" : filter?.modifier || "INCLUDES";
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return { sql: `p.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `p.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `p.id IN (${placeholders})`, params: ids };
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
   * Build gender filter clause
   */
  private buildGenderFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "EQUALS" } = filter;

    switch (modifier) {
      case "EQUALS":
        return { sql: "UPPER(p.gender) = UPPER(?)", params: [value] };
      case "NOT_EQUALS":
        return { sql: "(p.gender IS NULL OR UPPER(p.gender) != UPPER(?))", params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag filter clause
   */
  private async buildTagFilterWithHierarchy(
    filter: { value?: string[] | null; modifier?: string | null; depth?: number | null } | undefined | null
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

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `p.id IN (SELECT performerId FROM PerformerTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `p.id IN (
            SELECT performerId FROM PerformerTag
            WHERE tagId IN (${placeholders})
            GROUP BY performerId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (SELECT performerId FROM PerformerTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build studio filter clause
   * Performers appear in scenes from specific studios
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
          sql: `p.id IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN StashScene sc ON sp.sceneId = sc.id
            WHERE sc.studioId IN (${placeholders}) AND sc.deletedAt IS NULL
          )`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN StashScene sc ON sp.sceneId = sc.id
            WHERE sc.studioId IN (${placeholders}) AND sc.deletedAt IS NULL
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build scenes filter clause
   * Filter performers by specific scenes they appear in
   */
  private buildScenesFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    // Performers appear in scenes via ScenePerformer junction table
    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `p.id IN (
            SELECT sp.performerId FROM ScenePerformer sp
            WHERE sp.sceneId IN (${placeholders})
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `p.id IN (
            SELECT sp.performerId FROM ScenePerformer sp
            WHERE sp.sceneId IN (${placeholders})
            GROUP BY sp.performerId
            HAVING COUNT(DISTINCT sp.sceneId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT sp.performerId FROM ScenePerformer sp
            WHERE sp.sceneId IN (${placeholders})
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build group filter clause
   * Performers appear in scenes from specific groups
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
          sql: `p.id IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN SceneGroup sg ON sp.sceneId = sg.sceneId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN SceneGroup sg ON sp.sceneId = sg.sceneId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build numeric filter clause (for rating100, o_counter, play_count, scene_count, etc.)
   */
  private buildNumericFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined | null,
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
   * Build date filter clause
   */
  private buildDateFilter(
    filter: { value?: string | null; value2?: string | null; modifier?: string | null } | undefined | null,
    column: string
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "GREATER_THAN" } = filter;

    switch (modifier) {
      case "EQUALS":
        return { sql: `date(${column}) = date(?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(${column} IS NULL OR date(${column}) != date(?))`, params: [value] };
      case "GREATER_THAN":
        return { sql: `${column} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${column} < ?`, params: [value] };
      case "BETWEEN":
        if (value2) {
          return { sql: `${column} BETWEEN ? AND ?`, params: [value, value2] };
        }
        return { sql: `${column} >= ?`, params: [value] };
      case "IS_NULL":
        return { sql: `${column} IS NULL`, params: [] };
      case "NOT_NULL":
        return { sql: `${column} IS NOT NULL`, params: [] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build text filter clause (for name, details, tattoos, piercings, measurements)
   */
  private buildTextFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null,
    column: string,
    additionalColumns: string[] = []
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;
    const allColumns = [column, ...additionalColumns];

    switch (modifier) {
      case "INCLUDES": {
        const conditions = allColumns.map((col) => `LOWER(${col}) LIKE LOWER(?)`).join(" OR ");
        return {
          sql: `(${conditions})`,
          params: allColumns.map(() => `%${value}%`),
        };
      }
      case "EXCLUDES": {
        const conditions = allColumns.map((col) => `(${col} IS NULL OR LOWER(${col}) NOT LIKE LOWER(?))`).join(" AND ");
        return {
          sql: `(${conditions})`,
          params: allColumns.map(() => `%${value}%`),
        };
      }
      case "EQUALS":
        return { sql: `LOWER(${column}) = LOWER(?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(${column} IS NULL OR LOWER(${column}) != LOWER(?))`, params: [value] };
      case "IS_NULL":
        return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
      case "NOT_NULL":
        return { sql: `(${column} IS NOT NULL AND ${column} != '')`, params: [] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build enum filter clause (for eye_color, ethnicity, hair_color, fake_tits)
   */
  private buildEnumFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null,
    column: string
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "EQUALS" } = filter;

    switch (modifier) {
      case "EQUALS":
        return { sql: `UPPER(${column}) = UPPER(?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(${column} IS NULL OR UPPER(${column}) != UPPER(?))`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build birth year filter clause
   */
  private buildBirthYearFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    // Extract year from birthdate string (format: YYYY-MM-DD or YYYY)
    const yearExpr = "CAST(SUBSTR(p.birthdate, 1, 4) AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `(p.birthdate IS NOT NULL AND ${yearExpr} = ?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(p.birthdate IS NULL OR ${yearExpr} != ?)`, params: [value] };
      case "GREATER_THAN":
        return { sql: `(p.birthdate IS NOT NULL AND ${yearExpr} > ?)`, params: [value] };
      case "LESS_THAN":
        return { sql: `(p.birthdate IS NOT NULL AND ${yearExpr} < ?)`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `(p.birthdate IS NOT NULL AND ${yearExpr} BETWEEN ? AND ?)`, params: [value, value2] };
        }
        return { sql: `(p.birthdate IS NOT NULL AND ${yearExpr} >= ?)`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build death year filter clause
   */
  private buildDeathYearFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    const yearExpr = "CAST(SUBSTR(p.deathDate, 1, 4) AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `(p.deathDate IS NOT NULL AND ${yearExpr} = ?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(p.deathDate IS NULL OR ${yearExpr} != ?)`, params: [value] };
      case "GREATER_THAN":
        return { sql: `(p.deathDate IS NOT NULL AND ${yearExpr} > ?)`, params: [value] };
      case "LESS_THAN":
        return { sql: `(p.deathDate IS NOT NULL AND ${yearExpr} < ?)`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `(p.deathDate IS NOT NULL AND ${yearExpr} BETWEEN ? AND ?)`, params: [value, value2] };
        }
        return { sql: `(p.deathDate IS NOT NULL AND ${yearExpr} >= ?)`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build age filter clause (calculated from birthdate)
   */
  private buildAgeFilter(
    filter: { value?: number | null; value2?: number | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    // Calculate age: (current date - birthdate) in years
    const ageExpr = "CAST((julianday(date('now')) - julianday(p.birthdate)) / 365.25 AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return { sql: `(p.birthdate IS NOT NULL AND ${ageExpr} = ?)`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `(p.birthdate IS NULL OR ${ageExpr} != ?)`, params: [value] };
      case "GREATER_THAN":
        return { sql: `(p.birthdate IS NOT NULL AND ${ageExpr} > ?)`, params: [value] };
      case "LESS_THAN":
        return { sql: `(p.birthdate IS NOT NULL AND ${ageExpr} < ?)`, params: [value] };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return { sql: `(p.birthdate IS NOT NULL AND ${ageExpr} BETWEEN ? AND ?)`, params: [value, value2] };
        }
        return { sql: `(p.birthdate IS NOT NULL AND ${ageExpr} >= ?)`, params: [value] };
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build search query filter (searches name and aliases)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(p.name) LIKE ? OR LOWER(p.aliasList) LIKE ?)",
      params: [lowerQuery, lowerQuery],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(sort: string, direction: "ASC" | "DESC"): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

    const sortMap: Record<string, string> = {
      // Performer metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `p.name COLLATE NOCASE ${dir}`,
      created_at: `p.stashCreatedAt ${dir}`,
      updated_at: `p.stashUpdatedAt ${dir}`,
      birthdate: `p.birthdate ${dir}`,
      height: `p.heightCm ${dir}`,

      // Counts
      scene_count: `p.sceneCount ${dir}`,
      scenes_count: `p.sceneCount ${dir}`,
      image_count: `p.imageCount ${dir}`,
      gallery_count: `p.galleryCount ${dir}`,
      group_count: `p.groupCount ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // User stats
      o_counter: `COALESCE(s.oCounter, 0) ${dir}`,
      play_count: `COALESCE(s.playCount, 0) ${dir}`,
      last_played_at: `s.lastPlayedAt ${dir}`,
      last_o_at: `s.lastOAt ${dir}`,

      // Random
      random: `RANDOM() ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["name"];

    // Add secondary sort by name for stable ordering
    if (sort !== "name") {
      return `${sortExpr}, p.name COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, p.id ${dir}`;
  }

  async execute(options: PerformerQueryOptions): Promise<PerformerQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters, searchQuery } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Search query
    const searchFilter = this.buildSearchFilter(searchQuery);
    if (searchFilter.sql) {
      whereClauses.push(searchFilter);
    }

    // ID filter
    if (filters?.ids) {
      const idFilter = this.buildIdFilter(filters.ids);
      if (idFilter.sql) {
        whereClauses.push(idFilter);
      }
    }

    // User data filters
    const favoriteFilter = this.buildFavoriteFilter(filters?.favorite);
    if (favoriteFilter.sql) {
      whereClauses.push(favoriteFilter);
    }

    // Gender filter
    if (filters?.gender) {
      const genderFilter = this.buildGenderFilter(filters.gender);
      if (genderFilter.sql) {
        whereClauses.push(genderFilter);
      }
    }

    // Tag filter
    if (filters?.tags) {
      const tagFilter = await this.buildTagFilterWithHierarchy(filters.tags as any);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
      }
    }

    // Studio filter (performers appearing in scenes from specific studios)
    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios as any);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    // Scenes filter
    if (filters?.scenes) {
      const scenesFilter = this.buildScenesFilter(filters.scenes as any);
      if (scenesFilter.sql) {
        whereClauses.push(scenesFilter);
      }
    }

    // Group filter (performers appearing in scenes from specific groups)
    if (filters?.groups) {
      const groupFilter = this.buildGroupFilter(filters.groups as any);
      if (groupFilter.sql) {
        whereClauses.push(groupFilter);
      }
    }

    // Rating filter
    if (filters?.rating100) {
      const ratingFilter = this.buildNumericFilter(filters.rating100, "r.rating", 0);
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // O counter filter
    if (filters?.o_counter) {
      const oCounterFilter = this.buildNumericFilter(filters.o_counter, "s.oCounter", 0);
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = this.buildNumericFilter(filters.play_count, "s.playCount", 0);
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = this.buildNumericFilter(filters.scene_count, "p.sceneCount", 0);
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      // Name filter searches name and aliases
      const nameFilter = this.buildTextFilter(filters.name, "p.name", ["p.aliasList"]);
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filters?.details) {
      const detailsFilter = this.buildTextFilter(filters.details, "p.details");
      if (detailsFilter.sql) {
        whereClauses.push(detailsFilter);
      }
    }

    if (filters?.tattoos) {
      const tattoosFilter = this.buildTextFilter(filters.tattoos, "p.tattoos");
      if (tattoosFilter.sql) {
        whereClauses.push(tattoosFilter);
      }
    }

    if (filters?.piercings) {
      const piercingsFilter = this.buildTextFilter(filters.piercings, "p.piercings");
      if (piercingsFilter.sql) {
        whereClauses.push(piercingsFilter);
      }
    }

    if (filters?.measurements) {
      const measurementsFilter = this.buildTextFilter(filters.measurements, "p.measurements");
      if (measurementsFilter.sql) {
        whereClauses.push(measurementsFilter);
      }
    }

    // Physical attribute filters
    if (filters?.height) {
      const heightFilter = this.buildNumericFilter(filters.height, "p.heightCm", 0);
      if (heightFilter.sql) {
        whereClauses.push(heightFilter);
      }
    }

    if (filters?.weight) {
      const weightFilter = this.buildNumericFilter(filters.weight as any, "p.weightKg", 0);
      if (weightFilter.sql) {
        whereClauses.push(weightFilter);
      }
    }

    if (filters?.penis_length) {
      // Note: penis_length isn't in the schema, but keeping for API compatibility
      // This will just not match anything until the field is added
      const penisLengthFilter = this.buildNumericFilter(filters.penis_length, "p.penisLength", 0);
      if (penisLengthFilter.sql) {
        whereClauses.push(penisLengthFilter);
      }
    }

    // Enum filters
    if (filters?.eye_color) {
      const eyeColorFilter = this.buildEnumFilter(filters.eye_color, "p.eyeColor");
      if (eyeColorFilter.sql) {
        whereClauses.push(eyeColorFilter);
      }
    }

    if (filters?.ethnicity) {
      const ethnicityFilter = this.buildEnumFilter(filters.ethnicity, "p.ethnicity");
      if (ethnicityFilter.sql) {
        whereClauses.push(ethnicityFilter);
      }
    }

    if (filters?.hair_color) {
      const hairColorFilter = this.buildEnumFilter(filters.hair_color, "p.hairColor");
      if (hairColorFilter.sql) {
        whereClauses.push(hairColorFilter);
      }
    }

    if (filters?.fake_tits) {
      const fakeTitsFilter = this.buildEnumFilter(filters.fake_tits, "p.fakeTits");
      if (fakeTitsFilter.sql) {
        whereClauses.push(fakeTitsFilter);
      }
    }

    // Year filters
    if (filters?.birth_year) {
      const birthYearFilter = this.buildBirthYearFilter(filters.birth_year);
      if (birthYearFilter.sql) {
        whereClauses.push(birthYearFilter);
      }
    }

    if (filters?.death_year) {
      const deathYearFilter = this.buildDeathYearFilter(filters.death_year);
      if (deathYearFilter.sql) {
        whereClauses.push(deathYearFilter);
      }
    }

    // Age filter
    if (filters?.age) {
      const ageFilter = this.buildAgeFilter(filters.age);
      if (ageFilter.sql) {
        whereClauses.push(ageFilter);
      }
    }

    // Date filters
    if (filters?.birthdate) {
      const birthdateFilter = this.buildDateFilter(filters.birthdate, "p.birthdate");
      if (birthdateFilter.sql) {
        whereClauses.push(birthdateFilter);
      }
    }

    if (filters?.death_date) {
      const deathDateFilter = this.buildDateFilter(filters.death_date, "p.deathDate");
      if (deathDateFilter.sql) {
        whereClauses.push(deathDateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = this.buildDateFilter(filters.created_at, "p.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = this.buildDateFilter(filters.updated_at, "p.stashUpdatedAt");
      if (updatedAtFilter.sql) {
        whereClauses.push(updatedAtFilter);
      }
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort clause
    const sortClause = this.buildSortClause(options.sort, options.sortDirection);

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

    logger.info("PerformerQueryBuilder.execute", {
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

    // Count query
    const countStart = Date.now();
    let total: number;

    // Check if we have any user-data filters that require the JOINs
    const hasUserDataFilters =
      filters?.favorite !== undefined ||
      filters?.rating100 !== undefined ||
      filters?.play_count !== undefined ||
      filters?.o_counter !== undefined;

    if (hasUserDataFilters || applyExclusions) {
      const countSql = `
        SELECT COUNT(DISTINCT p.id) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...countParams);
      total = Number(countResult[0]?.total || 0);
    } else {
      // Fast path: count without JOINs
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.") && !c.sql.includes("s.")
      );
      const baseWhereSQL = baseWhereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashPerformer p
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const performers = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags)
    const relationsStart = Date.now();
    await this.populateRelations(performers);
    const relationsMs = Date.now() - relationsStart;

    logger.info("PerformerQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: performers.length,
      total,
    });

    return { performers, total };
  }

  /**
   * Transform a raw database row into a NormalizedPerformer
   */
  private transformRow(row: any): NormalizedPerformer {
    const performer: any = {
      id: row.id,
      name: row.name,
      disambiguation: row.disambiguation || null,
      gender: row.gender || null,
      birthdate: row.birthdate || null,
      details: row.details || null,
      alias_list: this.parseJsonArray(row.aliasList),
      country: row.country || null,
      ethnicity: row.ethnicity || null,
      hair_color: row.hairColor || null,
      eye_color: row.eyeColor || null,
      height_cm: row.heightCm || null,
      weight: row.weightKg || null,
      measurements: row.measurements || null,
      fake_tits: row.fakeTits || null,
      tattoos: row.tattoos || null,
      piercings: row.piercings || null,
      career_length: row.careerLength || null,
      death_date: row.deathDate || null,
      url: row.url || null,

      // Image path - transform to proxy URL
      image_path: this.transformUrl(row.imagePath),

      // Counts
      scene_count: row.sceneCount || 0,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      group_count: row.groupCount || 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,
      last_played_at: row.userLastPlayedAt?.toISOString?.() || row.userLastPlayedAt || null,
      last_o_at: row.userLastOAt?.toISOString?.() || row.userLastOAt || null,

      // Relations - populated separately
      tags: [],
    };

    return performer as NormalizedPerformer;
  }

  /**
   * Populate performer relations (tags, groups, galleries, studios)
   * Includes minimal data for TooltipEntityGrid: id, name, image_path/cover
   */
  async populateRelations(performers: NormalizedPerformer[]): Promise<void> {
    if (performers.length === 0) return;

    const performerIds = performers.map((p) => p.id);

    // Load all junctions in parallel
    const [tagJunctions, scenePerformers, galleryPerformers] = await Promise.all([
      prisma.performerTag.findMany({
        where: { performerId: { in: performerIds } },
      }),
      // Get scenes this performer appears in to derive groups, studios
      prisma.scenePerformer.findMany({
        where: { performerId: { in: performerIds } },
        select: { performerId: true, sceneId: true },
      }),
      // Get galleries this performer appears in directly
      prisma.galleryPerformer.findMany({
        where: { performerId: { in: performerIds } },
        select: { performerId: true, galleryId: true },
      }),
    ]);

    // Get scene IDs for this performer
    const sceneIds = [...new Set(scenePerformers.map((sp) => sp.sceneId))];

    // Load related entities from scenes
    const [sceneGroups, sceneGalleries, scenes] = await Promise.all([
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, groupId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, galleryId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.stashScene.findMany({
            where: { id: { in: sceneIds } },
            select: { id: true, studioId: true },
          })
        : [],
    ]);

    // Get unique entity IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    // Galleries come from direct performer-gallery association (galleryPerformers)
    // plus any scene-gallery associations (sceneGalleries)
    const galleryIds = [...new Set([
      ...galleryPerformers.map((gp) => gp.galleryId),
      ...sceneGalleries.map((sg) => sg.galleryId),
    ])];
    const studioIds = [...new Set(scenes.map((s) => s.studioId).filter((id): id is string => !!id))];

    // Load all entities in parallel
    const [tags, groups, galleries, studios] = await Promise.all([
      tagIds.length > 0
        ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } })
        : [],
      groupIds.length > 0
        ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } })
        : [],
      galleryIds.length > 0
        ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } })
        : [],
      studioIds.length > 0
        ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } })
        : [],
    ]);

    // Build lookup maps with minimal tooltip data
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath),
    }]));

    const groupsById = new Map(groups.map((g) => [g.id, {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath),
    }]));

    // Build performer -> scene mapping
    const scenesByPerformer = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const set = scenesByPerformer.get(sp.performerId) || new Set();
      set.add(sp.sceneId);
      scenesByPerformer.set(sp.performerId, set);
    }

    // Build scene -> entities mappings
    const groupsByScene = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const set = groupsByScene.get(sg.sceneId) || new Set();
      set.add(sg.groupId);
      groupsByScene.set(sg.sceneId, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const set = galleriesByScene.get(sg.sceneId) || new Set();
      set.add(sg.galleryId);
      galleriesByScene.set(sg.sceneId, set);
    }

    const studioByScene = new Map<string, string>();
    for (const s of scenes) {
      if (s.studioId) studioByScene.set(s.id, s.studioId);
    }

    // Build performer -> tags map
    const tagsByPerformer = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByPerformer.get(junction.performerId) || [];
      list.push(tag);
      tagsByPerformer.set(junction.performerId, list);
    }

    // Build performer -> galleries map from direct GalleryPerformer junction
    const galleriesByPerformer = new Map<string, Set<string>>();
    for (const gp of galleryPerformers) {
      const set = galleriesByPerformer.get(gp.performerId) || new Set();
      set.add(gp.galleryId);
      galleriesByPerformer.set(gp.performerId, set);
    }

    // Populate performers with all relations
    for (const performer of performers) {
      performer.tags = tagsByPerformer.get(performer.id) || [];

      // Derive groups and studios from performer's scenes
      const performerSceneIds = scenesByPerformer.get(performer.id) || new Set();

      const performerGroupIds = new Set<string>();
      const performerStudioIds = new Set<string>();

      for (const sceneId of performerSceneIds) {
        for (const gid of groupsByScene.get(sceneId) || []) performerGroupIds.add(gid);
        const sid = studioByScene.get(sceneId);
        if (sid) performerStudioIds.add(sid);
      }

      // Galleries come from direct GalleryPerformer association
      const performerGalleryIds = galleriesByPerformer.get(performer.id) || new Set();

      (performer as any).groups = [...performerGroupIds].map((id) => groupsById.get(id)).filter(Boolean);
      (performer as any).galleries = [...performerGalleryIds].map((id) => galleriesById.get(id)).filter(Boolean);
      (performer as any).studios = [...performerStudioIds].map((id) => studiosById.get(id)).filter(Boolean);
    }
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
   * Transform a Stash URL/path to a proxy URL
   */
  private transformUrl(urlOrPath: string | null): string | null {
    if (!urlOrPath) return null;

    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        return `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    }

    return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
  }
}

// Export singleton instance
export const performerQueryBuilder = new PerformerQueryBuilder();
