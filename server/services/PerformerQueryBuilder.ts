/**
 * PerformerQueryBuilder - SQL-native performer querying
 *
 * Builds parameterized SQL queries for performer filtering, sorting, and pagination.
 * Eliminates the need to load all performers into memory.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";
import type {
  NormalizedPerformer,
  PeekPerformerFilter,
  TagRef,
} from "../types/index.js";
import type { PerformerQueryRow } from "../types/internal/queryRows.js";
import { entityKey } from "../utils/entityRef.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { logger } from "../utils/logger.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import { type ViaSceneSpec, viaSceneClause } from "../utils/sqlClauses.js";
import {
  type FilterClause,
  buildDateFilter,
  buildFavoriteFilter,
  buildJunctionFilter,
  buildNumericFilter,
  buildTextFilter,
  parseCompositeFilterValues,
} from "../utils/sqlFilterBuilders.js";
import { parseJsonArray } from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";

/** Performers in one of the scenes */
const PERFORMERS_BY_SCENE: ViaSceneSpec = {
  alias: "p",
  junction: { table: "ScenePerformer", alias: "sp" },
  entityIdCol: "performerId",
  entityInstanceCol: "performerInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** Performers in a scene of one of the groups (a collection's Performers tab) */
const PERFORMERS_BY_GROUP: ViaSceneSpec = {
  ...PERFORMERS_BY_SCENE,
  via: {
    table: "SceneGroup",
    alias: "sg",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "groupId",
    refInstanceCol: "groupInstanceId",
  },
};

/**
 * Performers in a live scene of one of the studios; a scene's studio is on
 * the scene's instance
 */
const PERFORMERS_BY_STUDIO: ViaSceneSpec = {
  ...PERFORMERS_BY_SCENE,
  via: {
    table: "StashScene",
    alias: "sc",
    sceneIdCol: "id",
    sceneInstanceCol: "stashInstanceId",
    refIdCol: "studioId",
    refInstanceCol: "stashInstanceId",
  },
  where: "sc.deletedAt IS NULL",
};

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
    p.heightCm, p.weightKg, p.measurements, p.fakeTits, p.penisLength, p.circumcised,
    p.tattoos, p.piercings,
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
  private buildInstanceFilter(
    allowedInstanceIds: string[] | undefined
  ): FilterClause {
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
  private buildSpecificInstanceFilter(
    instanceId: string | undefined
  ): FilterClause {
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
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | string[]
      | undefined
      | null
  ): FilterClause {
    const ids = Array.isArray(filter) ? filter : filter?.value;
    if (!ids || ids.length === 0) {
      return { sql: "", params: [] };
    }

    const modifier = Array.isArray(filter)
      ? "INCLUDES"
      : filter?.modifier || "INCLUDES";
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
    filter:
      | { value?: string | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "EQUALS" } = filter;

    switch (modifier) {
      case "EQUALS":
        return { sql: "UPPER(p.gender) = UPPER(?)", params: [value] };
      case "NOT_EQUALS":
        return {
          sql: "(p.gender IS NULL OR UPPER(p.gender) != UPPER(?))",
          params: [value],
        };
      case null:
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag filter clause
   */
  private async buildTagFilterWithHierarchy(
    filter:
      | {
          value?: string[] | null;
          modifier?: string | null;
          depth?: number | null;
        }
      | undefined
      | null
  ): Promise<FilterClause> {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    // Parse composite keys ("284:instance-1" -> "284") since UI sends composite format
    const { parsed } = parseCompositeFilterValues(filter.value);
    let ids = parsed.map((p) => p.id);
    const { modifier, depth } = filter;

    // Expand IDs if depth is specified and not 0
    if (depth !== undefined && depth !== null && depth !== 0) {
      ids = await expandTagIds(ids, depth);
    }

    return buildJunctionFilter(
      coerceEntityRefs(ids),
      "PerformerTag",
      "performerId",
      "performerInstanceId",
      "tagId",
      "tagInstanceId",
      "p",
      modifier || "INCLUDES"
    );
  }

  /**
   * Build studio filter clause
   * Performers appear in scenes from specific studios
   */
  private buildStudioFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    return viaSceneClause(
      PERFORMERS_BY_STUDIO,
      parseCompositeFilterValues(filter?.value ?? []).parsed,
      filter?.modifier ?? "INCLUDES"
    );
  }

  /**
   * Build scenes filter clause
   * Filter performers by specific scenes they appear in
   */
  private buildScenesFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    return viaSceneClause(
      PERFORMERS_BY_SCENE,
      parseCompositeFilterValues(filter?.value ?? []).parsed,
      filter?.modifier ?? "INCLUDES"
    );
  }

  /**
   * Build group filter clause
   * Performers appear in scenes from specific groups
   */
  private buildGroupFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    return viaSceneClause(
      PERFORMERS_BY_GROUP,
      parseCompositeFilterValues(filter?.value ?? []).parsed,
      filter?.modifier ?? "INCLUDES"
    );
  }

  /**
   * Build enum filter clause (for eye_color, ethnicity, hair_color, fake_tits)
   */
  private buildEnumFilter(
    filter:
      | { value?: string | null; modifier?: string | null }
      | undefined
      | null,
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
        return {
          sql: `(${column} IS NULL OR UPPER(${column}) != UPPER(?))`,
          params: [value],
        };
      case null:
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build birth year filter clause
   */
  private buildBirthYearFilter(
    filter:
      | {
          value?: number | null;
          value2?: number | null;
          modifier?: string | null;
        }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    // Extract year from birthdate string (format: YYYY-MM-DD or YYYY)
    const yearExpr = "CAST(SUBSTR(p.birthdate, 1, 4) AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${yearExpr} = ?)`,
          params: [value],
        };
      case "NOT_EQUALS":
        return {
          sql: `(p.birthdate IS NULL OR ${yearExpr} != ?)`,
          params: [value],
        };
      case "GREATER_THAN":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${yearExpr} > ?)`,
          params: [value],
        };
      case "LESS_THAN":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${yearExpr} < ?)`,
          params: [value],
        };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return {
            sql: `(p.birthdate IS NOT NULL AND ${yearExpr} BETWEEN ? AND ?)`,
            params: [value, value2],
          };
        }
        return {
          sql: `(p.birthdate IS NOT NULL AND ${yearExpr} >= ?)`,
          params: [value],
        };
      case null:
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build death year filter clause
   */
  private buildDeathYearFilter(
    filter:
      | {
          value?: number | null;
          value2?: number | null;
          modifier?: string | null;
        }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    const yearExpr = "CAST(SUBSTR(p.deathDate, 1, 4) AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return {
          sql: `(p.deathDate IS NOT NULL AND ${yearExpr} = ?)`,
          params: [value],
        };
      case "NOT_EQUALS":
        return {
          sql: `(p.deathDate IS NULL OR ${yearExpr} != ?)`,
          params: [value],
        };
      case "GREATER_THAN":
        return {
          sql: `(p.deathDate IS NOT NULL AND ${yearExpr} > ?)`,
          params: [value],
        };
      case "LESS_THAN":
        return {
          sql: `(p.deathDate IS NOT NULL AND ${yearExpr} < ?)`,
          params: [value],
        };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return {
            sql: `(p.deathDate IS NOT NULL AND ${yearExpr} BETWEEN ? AND ?)`,
            params: [value, value2],
          };
        }
        return {
          sql: `(p.deathDate IS NOT NULL AND ${yearExpr} >= ?)`,
          params: [value],
        };
      case null:
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build age filter clause (calculated from birthdate)
   */
  private buildAgeFilter(
    filter:
      | {
          value?: number | null;
          value2?: number | null;
          modifier?: string | null;
        }
      | undefined
      | null
  ): FilterClause {
    if (!filter || filter.value === undefined || filter.value === null) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier = "EQUALS" } = filter;
    // Calculate age: (current date - birthdate) in years
    const ageExpr =
      "CAST((julianday(date('now')) - julianday(p.birthdate)) / 365.25 AS INTEGER)";

    switch (modifier) {
      case "EQUALS":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${ageExpr} = ?)`,
          params: [value],
        };
      case "NOT_EQUALS":
        return {
          sql: `(p.birthdate IS NULL OR ${ageExpr} != ?)`,
          params: [value],
        };
      case "GREATER_THAN":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${ageExpr} > ?)`,
          params: [value],
        };
      case "LESS_THAN":
        return {
          sql: `(p.birthdate IS NOT NULL AND ${ageExpr} < ?)`,
          params: [value],
        };
      case "BETWEEN":
        if (value2 !== undefined && value2 !== null) {
          return {
            sql: `(p.birthdate IS NOT NULL AND ${ageExpr} BETWEEN ? AND ?)`,
            params: [value, value2],
          };
        }
        return {
          sql: `(p.birthdate IS NOT NULL AND ${ageExpr} >= ?)`,
          params: [value],
        };
      case null:
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
  private buildSortClause(
    sort: string,
    direction: "ASC" | "DESC",
    randomSeed?: number
  ): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";
    const seed = randomSeed || 12345;

    const sortMap: Record<string, string> = {
      // Performer metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `p.name COLLATE NOCASE ${dir}`,
      created_at: `p.stashCreatedAt ${dir}`,
      updated_at: `p.stashUpdatedAt ${dir}`,
      birthdate: `p.birthdate ${dir}`,
      height: `p.heightCm ${dir}`,
      penis_length: `p.penisLength ${dir}`,

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
    const {
      userId,
      page,
      perPage,
      applyExclusions = true,
      allowedInstanceIds,
      specificInstanceId,
      filters,
      searchQuery,
      randomSeed,
    } = options;

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
      const specificFilter =
        this.buildSpecificInstanceFilter(specificInstanceId);
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
      const ratingFilter = buildNumericFilter(
        filters.rating100,
        "COALESCE(r.rating, 0)"
      );
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // O counter filter
    if (filters?.o_counter) {
      const oCounterFilter = buildNumericFilter(
        filters.o_counter,
        "COALESCE(s.oCounter, 0)"
      );
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = buildNumericFilter(
        filters.play_count,
        "COALESCE(s.playCount, 0)"
      );
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(
        filters.scene_count,
        "COALESCE(p.sceneCount, 0)"
      );
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      // Name filter searches name and aliases
      const nameFilter = buildTextFilter(filters.name, "p.name", [
        "p.aliasList",
      ]);
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
      const measurementsFilter = buildTextFilter(
        filters.measurements,
        "p.measurements"
      );
      if (measurementsFilter.sql) {
        whereClauses.push(measurementsFilter);
      }
    }

    // Physical attribute filters
    if (filters?.height) {
      const heightFilter = buildNumericFilter(
        filters.height,
        "COALESCE(p.heightCm, 0)"
      );
      if (heightFilter.sql) {
        whereClauses.push(heightFilter);
      }
    }

    if (filters?.weight) {
      const weightFilter = buildNumericFilter(
        filters.weight,
        "COALESCE(p.weightKg, 0)"
      );
      if (weightFilter.sql) {
        whereClauses.push(weightFilter);
      }
    }

    if (filters?.penis_length) {
      // No COALESCE: a performer without a length never matches, as in Stash
      const penisLengthFilter = buildNumericFilter(
        filters.penis_length,
        "p.penisLength"
      );
      if (penisLengthFilter.sql) {
        whereClauses.push(penisLengthFilter);
      }
    }

    // Enum filters
    if (filters?.eye_color) {
      const eyeColorFilter = this.buildEnumFilter(
        filters.eye_color,
        "p.eyeColor"
      );
      if (eyeColorFilter.sql) {
        whereClauses.push(eyeColorFilter);
      }
    }

    if (filters?.ethnicity) {
      const ethnicityFilter = this.buildEnumFilter(
        filters.ethnicity,
        "p.ethnicity"
      );
      if (ethnicityFilter.sql) {
        whereClauses.push(ethnicityFilter);
      }
    }

    if (filters?.hair_color) {
      const hairColorFilter = this.buildEnumFilter(
        filters.hair_color,
        "p.hairColor"
      );
      if (hairColorFilter.sql) {
        whereClauses.push(hairColorFilter);
      }
    }

    if (filters?.fake_tits) {
      const fakeTitsFilter = this.buildEnumFilter(
        filters.fake_tits,
        "p.fakeTits"
      );
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
      const deathDateFilter = buildDateFilter(
        filters.death_date,
        "p.deathDate"
      );
      if (deathDateFilter.sql) {
        whereClauses.push(deathDateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(
        filters.created_at,
        "p.stashCreatedAt"
      );
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(
        filters.updated_at,
        "p.stashUpdatedAt"
      );
      if (updatedAtFilter.sql) {
        whereClauses.push(updatedAtFilter);
      }
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses
      .map((c) => c.sql)
      .filter(Boolean)
      .join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort clause
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      randomSeed
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

    logger.debug("PerformerQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      sortDirection: options.sortDirection,
      paramCount: params.length,
    });

    // Execute query
    const queryStart = Date.now();
    const rows = await prisma.$queryRawUnsafe<PerformerQueryRow[]>(
      sql,
      ...params
    );
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
      // COUNT(*) counts each performer once: the other LEFT JOINs in
      // buildFromClause match at most one row each (a unique key), and the
      // exclusion join, which can match two (global and per-instance), keeps a
      // performer only when it matched none (e.id IS NULL).
      const countSql = `
        SELECT COUNT(*) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        countSql,
        ...countParams
      );
      total = Number(countResult[0]?.total ?? 0n);
    } else {
      // Fast path: count without JOINs
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.") && !c.sql.includes("s.")
      );
      const baseWhereSQL = baseWhereClauses
        .map((c) => c.sql)
        .filter(Boolean)
        .join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashPerformer p
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        countSql,
        ...baseWhereParams
      );
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const performers = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags)
    const relationsStart = Date.now();
    await this.populateRelations(performers, userId);
    const relationsMs = Date.now() - relationsStart;

    logger.debug("PerformerQueryBuilder.execute complete", {
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
  private transformRow(row: PerformerQueryRow): NormalizedPerformer {
    const performer = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      disambiguation: row.disambiguation || null,
      gender: row.gender || null,
      birthdate: row.birthdate || null,
      details: row.details || null,
      alias_list: parseJsonArray(row.aliasList),
      country: row.country || null,
      ethnicity: row.ethnicity || null,
      hair_color: row.hairColor || null,
      eye_color: row.eyeColor || null,
      height_cm: row.heightCm || null,
      weight: row.weightKg || null,
      measurements: row.measurements || null,
      fake_tits: row.fakeTits || null,
      penis_length: row.penisLength ?? null,
      circumcised: row.circumcised ?? null,
      tattoos: row.tattoos || null,
      piercings: row.piercings || null,
      career_length: row.careerLength || null,
      death_date: row.deathDate || null,
      url: row.url || null,

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: row.sceneCount || 0,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      group_count: row.groupCount || 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,
      last_played_at: row.userLastPlayedAt?.toISOString() ?? null,
      last_o_at: row.userLastOAt?.toISOString() ?? null,

      // Relations - populated separately
      tags: [] as TagRef[],
    };

    return performer as NormalizedPerformer;
  }

  /**
   * The card's relations for the whole page: its tags, and at most
   * TOOLTIP_LIMIT studios, collections and galleries with how many there
   * are (TooltipRelations), one statement per relation
   */
  async populateRelations(
    performers: NormalizedPerformer[],
    userId: number
  ): Promise<void> {
    const relations = await loadTooltipRelations(
      "performer",
      performers,
      userId
    );
    for (const performer of performers) {
      Object.assign(
        performer,
        relations.get(entityKey(performer.id, performer.instanceId))
      );
    }
  }
}

// Export singleton instance
export const performerQueryBuilder = new PerformerQueryBuilder();
