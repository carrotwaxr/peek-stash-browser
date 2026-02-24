/**
 * PerformerQueryBuilder - SQL-native performer querying
 *
 * Builds parameterized SQL queries for performer filtering, sorting, and pagination.
 * Eliminates the need to load all performers into memory.
 */
import type { PeekPerformerFilter, NormalizedPerformer, TagRef, GroupRef, GalleryRef, StudioRef } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import { KEY_SEP } from "./UserStatsService.js";
import { buildNumericFilter, buildDateFilter, buildTextFilter, buildFavoriteFilter, buildJunctionFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";

/** Deduplicate composite key objects by id+stashInstanceId */
function dedupeKeys(items: { id: string; stashInstanceId: string }[]): { id: string; stashInstanceId: string }[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}:${item.stashInstanceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Query builder options
export interface PerformerQueryOptions {
  userId: number;
  filters?: PeekPerformerFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  allowedInstanceIds?: string[]; // Multi-instance filtering - array of instances the user can access
  specificInstanceId?: string; // Single instance filter for disambiguation on detail pages
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
  randomSeed?: number; // Seed for consistent random ordering
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
    p.id, p.stashInstanceId, p.name, p.disambiguation, p.gender, p.birthdate, p.favorite AS stashFavorite,
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
        LEFT JOIN PerformerRating r ON p.id = r.performerId AND p.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN UserPerformerStats s ON p.id = s.performerId AND p.stashInstanceId = s.instanceId AND s.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'performer' AND e.entityId = p.id AND (e.instanceId = '' OR e.instanceId = p.stashInstanceId)`,
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
   * Build instance filter clause for multi-instance support
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      return { sql: "", params: [] };
    }
    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(p.stashInstanceId IN (${placeholders}) OR p.stashInstanceId IS NULL)`,
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
      sql: `p.stashInstanceId = ?`,
      params: [instanceId],
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
    const { modifier, depth } = filter;

    // Expand IDs if depth is specified and not 0
    if (depth !== undefined && depth !== null && depth !== 0) {
      ids = await expandTagIds(ids, depth);
    }

    return buildJunctionFilter(
      ids, "PerformerTag", "performerId", "performerInstanceId",
      "tagId", "tagInstanceId", "p", modifier || "INCLUDES"
    );
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
            JOIN StashScene sc ON sp.sceneId = sc.id AND sp.sceneInstanceId = sc.stashInstanceId
            WHERE sc.studioId IN (${placeholders}) AND sc.deletedAt IS NULL
              AND sp.performerInstanceId = p.stashInstanceId
          )`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN StashScene sc ON sp.sceneId = sc.id AND sp.sceneInstanceId = sc.stashInstanceId
            WHERE sc.studioId IN (${placeholders}) AND sc.deletedAt IS NULL
              AND sp.performerInstanceId = p.stashInstanceId
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
              AND sp.performerInstanceId = p.stashInstanceId
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `p.id IN (
            SELECT sp.performerId FROM ScenePerformer sp
            WHERE sp.sceneId IN (${placeholders})
              AND sp.performerInstanceId = p.stashInstanceId
            GROUP BY sp.performerId, sp.performerInstanceId
            HAVING COUNT(DISTINCT sp.sceneId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT sp.performerId FROM ScenePerformer sp
            WHERE sp.sceneId IN (${placeholders})
              AND sp.performerInstanceId = p.stashInstanceId
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
            JOIN SceneGroup sg ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
              AND sp.performerInstanceId = p.stashInstanceId
          )`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `p.id NOT IN (
            SELECT DISTINCT sp.performerId
            FROM ScenePerformer sp
            JOIN SceneGroup sg ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
              AND sp.performerInstanceId = p.stashInstanceId
          )`,
          params: ids,
        };

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
  private buildSortClause(sort: string, direction: "ASC" | "DESC", randomSeed?: number): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";
    const seed = randomSeed || 12345;

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

      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((p.id + ${seed}) % 2147483647) * ((p.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((p.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
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
    const { userId, page, perPage, applyExclusions = true, allowedInstanceIds, specificInstanceId, filters, searchQuery, randomSeed } = options;

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
    const favoriteFilter = buildFavoriteFilter(filters?.favorite);
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
      const tagFilter = await this.buildTagFilterWithHierarchy(filters.tags);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
      }
    }

    // Studio filter (performers appearing in scenes from specific studios)
    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    // Scenes filter
    if (filters?.scenes) {
      const scenesFilter = this.buildScenesFilter(filters.scenes);
      if (scenesFilter.sql) {
        whereClauses.push(scenesFilter);
      }
    }

    // Group filter (performers appearing in scenes from specific groups)
    if (filters?.groups) {
      const groupFilter = this.buildGroupFilter(filters.groups);
      if (groupFilter.sql) {
        whereClauses.push(groupFilter);
      }
    }

    // Rating filter
    if (filters?.rating100) {
      const ratingFilter = buildNumericFilter(filters.rating100, "COALESCE(r.rating, 0)");
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // O counter filter
    if (filters?.o_counter) {
      const oCounterFilter = buildNumericFilter(filters.o_counter, "COALESCE(s.oCounter, 0)");
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = buildNumericFilter(filters.play_count, "COALESCE(s.playCount, 0)");
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(filters.scene_count, "COALESCE(p.sceneCount, 0)");
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      // Name filter searches name and aliases
      const nameFilter = buildTextFilter(filters.name, "p.name", ["p.aliasList"]);
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filters?.details) {
      const detailsFilter = buildTextFilter(filters.details, "p.details");
      if (detailsFilter.sql) {
        whereClauses.push(detailsFilter);
      }
    }

    if (filters?.tattoos) {
      const tattoosFilter = buildTextFilter(filters.tattoos, "p.tattoos");
      if (tattoosFilter.sql) {
        whereClauses.push(tattoosFilter);
      }
    }

    if (filters?.piercings) {
      const piercingsFilter = buildTextFilter(filters.piercings, "p.piercings");
      if (piercingsFilter.sql) {
        whereClauses.push(piercingsFilter);
      }
    }

    if (filters?.measurements) {
      const measurementsFilter = buildTextFilter(filters.measurements, "p.measurements");
      if (measurementsFilter.sql) {
        whereClauses.push(measurementsFilter);
      }
    }

    // Physical attribute filters
    if (filters?.height) {
      const heightFilter = buildNumericFilter(filters.height, "COALESCE(p.heightCm, 0)");
      if (heightFilter.sql) {
        whereClauses.push(heightFilter);
      }
    }

    if (filters?.weight) {
      const weightFilter = buildNumericFilter(filters.weight, "COALESCE(p.weightKg, 0)");
      if (weightFilter.sql) {
        whereClauses.push(weightFilter);
      }
    }

    if (filters?.penis_length) {
      // Note: penis_length isn't in the schema, but keeping for API compatibility
      // This will just not match anything until the field is added
      const penisLengthFilter = buildNumericFilter(filters.penis_length, "COALESCE(p.penisLength, 0)");
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
      const birthdateFilter = buildDateFilter(filters.birthdate, "p.birthdate");
      if (birthdateFilter.sql) {
        whereClauses.push(birthdateFilter);
      }
    }

    if (filters?.death_date) {
      const deathDateFilter = buildDateFilter(filters.death_date, "p.deathDate");
      if (deathDateFilter.sql) {
        whereClauses.push(deathDateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(filters.created_at, "p.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at, "p.stashUpdatedAt");
      if (updatedAtFilter.sql) {
        whereClauses.push(updatedAtFilter);
      }
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort clause
    const sortClause = this.buildSortClause(options.sort, options.sortDirection, randomSeed);

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
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
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
        SELECT COUNT(DISTINCT p.id || ':' || p.stashInstanceId) as total
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL row with dynamic columns; defining a 30+ field interface adds maintenance overhead without real safety gain
  private transformRow(row: Record<string, any>): NormalizedPerformer {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- building partial NormalizedPerformer from DB row; Performer base type requires fields we don't populate
    const performer: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
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

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: this.transformUrl(row.imagePath, row.stashInstanceId),

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

    // Build composite where clause to avoid cross-instance collisions
    const performerWhereClause = performers.map((p) => ({
      performerId: p.id,
      performerInstanceId: p.instanceId || "",
    }));

    // Load all junctions in parallel
    const [tagJunctions, scenePerformers, galleryPerformers] = await Promise.all([
      prisma.performerTag.findMany({
        where: { OR: performerWhereClause },
      }),
      // Get scenes this performer appears in to derive groups, studios
      prisma.scenePerformer.findMany({
        where: { OR: performerWhereClause },
        select: { performerId: true, performerInstanceId: true, sceneId: true, sceneInstanceId: true },
      }),
      // Get galleries this performer appears in directly
      prisma.galleryPerformer.findMany({
        where: { OR: performerWhereClause },
        select: { performerId: true, performerInstanceId: true, galleryId: true, galleryInstanceId: true },
      }),
    ]);

    // Get scene IDs and instance IDs for this performer
    const sceneIds = [...new Set(scenePerformers.map((sp) => sp.sceneId))];
    const sceneInstanceIds = [...new Set(scenePerformers.map((sp) => sp.sceneInstanceId))];

    // Load related entities from scenes (with instanceId constraints)
    const [sceneGroups, sceneGalleries, scenes] = await Promise.all([
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: { sceneId: { in: sceneIds }, sceneInstanceId: { in: sceneInstanceIds } },
            select: { sceneId: true, groupId: true, groupInstanceId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds }, sceneInstanceId: { in: sceneInstanceIds } },
            select: { sceneId: true, galleryId: true, galleryInstanceId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.stashScene.findMany({
            where: { id: { in: sceneIds }, stashInstanceId: { in: sceneInstanceIds } },
            select: { id: true, stashInstanceId: true, studioId: true },
          })
        : [],
    ]);

    // Build composite key OR conditions for entity lookups (prevents cross-instance data leakage)
    const tagOrConditions = dedupeKeys(tagJunctions.map((j) => ({
      id: j.tagId,
      stashInstanceId: j.tagInstanceId,
    })));
    const groupOrConditions = dedupeKeys(sceneGroups.map((sg) => ({
      id: sg.groupId,
      stashInstanceId: sg.groupInstanceId,
    })));
    // Galleries come from direct performer-gallery association (galleryPerformers)
    // plus any scene-gallery associations (sceneGalleries)
    const galleryOrConditions = dedupeKeys([
      ...galleryPerformers.map((gp) => ({
        id: gp.galleryId,
        stashInstanceId: gp.galleryInstanceId,
      })),
      ...sceneGalleries.map((sg) => ({
        id: sg.galleryId,
        stashInstanceId: sg.galleryInstanceId,
      })),
    ]);
    const studioOrConditions = dedupeKeys(scenes
      .filter((s) => !!s.studioId)
      .map((s) => ({
        id: s.studioId!,
        stashInstanceId: s.stashInstanceId,
      })));

    // Load all entities in parallel using composite key lookups
    const [tags, groups, galleries, studios] = await Promise.all([
      tagOrConditions.length > 0
        ? prisma.stashTag.findMany({ where: { OR: tagOrConditions } })
        : [],
      groupOrConditions.length > 0
        ? prisma.stashGroup.findMany({ where: { OR: groupOrConditions } })
        : [],
      galleryOrConditions.length > 0
        ? prisma.stashGallery.findMany({ where: { OR: galleryOrConditions } })
        : [],
      studioOrConditions.length > 0
        ? prisma.stashStudio.findMany({ where: { OR: studioOrConditions } })
        : [],
    ]);

    // Build lookup maps keyed by composite id:instanceId (prevents cross-instance collisions)
    const tagsByKey = new Map<string, TagRef>(tags.map((t) => [`${t.id}:${t.stashInstanceId}`, {
      id: t.id,
      instanceId: t.stashInstanceId,
      name: t.name,
      image_path: this.transformUrl(t.imagePath, t.stashInstanceId),
      favorite: t.favorite,
    }]));

    const groupsByKey = new Map<string, GroupRef>(groups.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath, g.stashInstanceId),
      back_image_path: this.transformUrl(g.backImagePath, g.stashInstanceId),
    }]));

    const galleriesByKey = new Map<string, GalleryRef>(galleries.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath, g.stashInstanceId),
    }]));

    const studiosByKey = new Map<string, StudioRef>(studios.map((s) => [`${s.id}:${s.stashInstanceId}`, {
      id: s.id,
      instanceId: s.stashInstanceId,
      name: s.name,
      image_path: this.transformUrl(s.imagePath, s.stashInstanceId),
      favorite: s.favorite,
      parent_studio: s.parentId ? { id: s.parentId } : null,
    }]));

    // Build performer -> scene mapping (keyed by composite performerId\0instanceId)
    const scenesByPerformer = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const key = `${sp.performerId}${KEY_SEP}${sp.performerInstanceId}`;
      const set = scenesByPerformer.get(key) || new Set();
      set.add(sp.sceneId);
      scenesByPerformer.set(key, set);
    }

    // Build scene -> entities mappings (using composite keys id:instanceId)
    const groupsByScene = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const set = groupsByScene.get(sg.sceneId) || new Set();
      set.add(`${sg.groupId}:${sg.groupInstanceId}`);
      groupsByScene.set(sg.sceneId, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const set = galleriesByScene.get(sg.sceneId) || new Set();
      set.add(`${sg.galleryId}:${sg.galleryInstanceId}`);
      galleriesByScene.set(sg.sceneId, set);
    }

    const studioByScene = new Map<string, string>();
    for (const s of scenes) {
      if (s.studioId) studioByScene.set(s.id, `${s.studioId}:${s.stashInstanceId}`);
    }

    // Build performer -> tags map (keyed by composite performerId\0instanceId)
    const tagsByPerformer = new Map<string, TagRef[]>();
    for (const junction of tagJunctions) {
      const tag = tagsByKey.get(`${junction.tagId}:${junction.tagInstanceId}`);
      if (!tag) continue;
      const key = `${junction.performerId}${KEY_SEP}${junction.performerInstanceId}`;
      const list = tagsByPerformer.get(key) || [];
      list.push(tag);
      tagsByPerformer.set(key, list);
    }

    // Build performer -> galleries map from direct GalleryPerformer junction (keyed by composite performerId\0instanceId)
    const galleriesByPerformer = new Map<string, Set<string>>();
    for (const gp of galleryPerformers) {
      const key = `${gp.performerId}${KEY_SEP}${gp.performerInstanceId}`;
      const set = galleriesByPerformer.get(key) || new Set();
      set.add(`${gp.galleryId}:${gp.galleryInstanceId}`);
      galleriesByPerformer.set(key, set);
    }

    // Populate performers with all relations (using composite key for lookup)
    for (const performer of performers) {
      const performerKey = `${performer.id}${KEY_SEP}${performer.instanceId || ""}`;
      performer.tags = tagsByPerformer.get(performerKey) || [];

      // Derive groups and studios from performer's scenes
      const performerSceneIds = scenesByPerformer.get(performerKey) || new Set();

      const performerGroupKeys = new Set<string>();
      const performerStudioKeys = new Set<string>();

      for (const sceneId of performerSceneIds) {
        for (const gkey of groupsByScene.get(sceneId) || []) performerGroupKeys.add(gkey);
        const skey = studioByScene.get(sceneId);
        if (skey) performerStudioKeys.add(skey);
      }

      // Galleries come from direct GalleryPerformer association
      const performerGalleryKeys = galleriesByPerformer.get(performerKey) || new Set();

      performer.groups = [...performerGroupKeys].map((key) => groupsByKey.get(key)).filter((g): g is GroupRef => !!g);
      performer.galleries = [...performerGalleryKeys].map((key) => galleriesByKey.get(key)).filter((g): g is GalleryRef => !!g);
      performer.studios = [...performerStudioKeys].map((key) => studiosByKey.get(key)).filter((s): s is StudioRef => !!s);
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
   * @param urlOrPath - The URL or path to transform
   * @param instanceId - Optional Stash instance ID for multi-instance routing
   */
  private transformUrl(urlOrPath: string | null, instanceId?: string | null): string | null {
    if (!urlOrPath) return null;

    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    let proxyPath: string;

    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    } else {
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }

    if (instanceId) {
      proxyPath += `&instanceId=${encodeURIComponent(instanceId)}`;
    }

    return proxyPath;
  }
}

// Export singleton instance
export const performerQueryBuilder = new PerformerQueryBuilder();
