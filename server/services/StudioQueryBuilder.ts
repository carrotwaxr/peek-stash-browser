/**
 * StudioQueryBuilder - SQL-native studio querying
 *
 * Builds parameterized SQL queries for studio filtering, sorting, and pagination.
 * Eliminates the need to load all studios into memory.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";
import type {
  NormalizedStudio,
  PeekStudioFilter,
  TagRef,
} from "../types/index.js";
import type { StudioQueryRow } from "../types/internal/queryRows.js";
import { entityKey } from "../utils/entityRef.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { logger } from "../utils/logger.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  buildDateFilter,
  buildFavoriteFilter,
  buildJunctionFilter,
  buildNumericFilter,
  buildTextFilter,
  parseCompositeFilterValues,
} from "../utils/sqlFilterBuilders.js";
import { loadTooltipRelations } from "./TooltipRelations.js";

// Query builder options
export interface StudioQueryOptions {
  userId: number;
  filters?: PeekStudioFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
  allowedInstanceIds?: string[];
  specificInstanceId?: string; // Single instance filter for disambiguation on detail pages
  randomSeed?: number; // Seed for consistent random ordering
}

// Query result
export interface StudioQueryResult {
  studios: NormalizedStudio[];
  total: number;
}

/**
 * Builds and executes SQL queries for studio filtering
 */
class StudioQueryBuilder {
  // Column list for SELECT - all StashStudio fields plus user data
  private readonly SELECT_COLUMNS = `
    s.id, s.stashInstanceId, s.name, s.parentId, s.favorite AS stashFavorite, s.rating100 AS stashRating100,
    s.sceneCount, s.imageCount, s.galleryCount, s.performerCount, s.groupCount,
    s.details, s.url, s.imagePath,
    s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    us.oCounter AS userOCounter, us.playCount AS userPlayCount
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashStudio s
        LEFT JOIN StudioRating r ON s.id = r.studioId AND s.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN UserStudioStats us ON s.id = us.studioId AND s.stashInstanceId = us.instanceId AND us.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'studio' AND e.entityId = s.id AND (e.instanceId = '' OR e.instanceId = s.stashInstanceId)`,
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
   */
  private buildInstanceFilter(
    allowedInstanceIds: string[] | undefined
  ): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
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
   */
  private buildSpecificInstanceFilter(
    instanceId: string | undefined
  ): FilterClause {
    if (!instanceId) {
      return { sql: "", params: [] };
    }
    return {
      sql: `s.stashInstanceId = ?`,
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
        return { sql: `s.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `s.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `s.id IN (${placeholders})`, params: ids };
    }
  }

  /**
   * Build tag filter clause with hierarchy support
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
      "StudioTag",
      "studioId",
      "studioInstanceId",
      "tagId",
      "tagInstanceId",
      "s",
      modifier || "INCLUDES"
    );
  }

  /**
   * Build search query filter (searches name and details)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(s.name) LIKE ? OR LOWER(s.details) LIKE ?)",
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
      // Studio metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `s.name COLLATE NOCASE ${dir}`,
      created_at: `s.stashCreatedAt ${dir}`,
      updated_at: `s.stashUpdatedAt ${dir}`,

      // Counts
      scene_count: `s.sceneCount ${dir}`,
      scenes_count: `s.sceneCount ${dir}`,
      image_count: `s.imageCount ${dir}`,
      gallery_count: `s.galleryCount ${dir}`,
      performer_count: `s.performerCount ${dir}`,
      group_count: `s.groupCount ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // User stats
      o_counter: `COALESCE(us.oCounter, 0) ${dir}`,
      play_count: `COALESCE(us.playCount, 0) ${dir}`,

      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((s.id + ${seed}) % 2147483647) * ((s.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((s.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["name"];

    // Add secondary sort by name for stable ordering
    if (sort !== "name") {
      return `${sortExpr}, s.name COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, s.id ${dir}`;
  }

  async execute(options: StudioQueryOptions): Promise<StudioQueryResult> {
    const startTime = Date.now();
    const {
      userId,
      page,
      perPage,
      applyExclusions = true,
      filters,
      searchQuery,
      allowedInstanceIds,
      specificInstanceId,
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

    // Tag filter
    if (filters?.tags) {
      const tagFilter = await this.buildTagFilterWithHierarchy(filters.tags);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
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
        "COALESCE(us.oCounter, 0)"
      );
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = buildNumericFilter(
        filters.play_count,
        "COALESCE(us.playCount, 0)"
      );
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(
        filters.scene_count,
        "COALESCE(s.sceneCount, 0)"
      );
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      const nameFilter = buildTextFilter(filters.name, "s.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filters?.details) {
      const detailsFilter = buildTextFilter(filters.details, "s.details");
      if (detailsFilter.sql) {
        whereClauses.push(detailsFilter);
      }
    }

    // Date filters
    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(
        filters.created_at,
        "s.stashCreatedAt"
      );
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(
        filters.updated_at,
        "s.stashUpdatedAt"
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

    logger.debug("StudioQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      sortDirection: options.sortDirection,
      paramCount: params.length,
    });

    // Execute query
    const queryStart = Date.now();
    const rows = await prisma.$queryRawUnsafe<StudioQueryRow[]>(sql, ...params);
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
      // COUNT(*) counts each studio once: the other LEFT JOINs in
      // buildFromClause match at most one row each (a unique key), and the
      // exclusion join, which can match two (global and per-instance), keeps a
      // studio only when it matched none (e.id IS NULL).
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
        (c) => !c.sql.includes("r.") && !c.sql.includes("us.")
      );
      const baseWhereSQL = baseWhereClauses
        .map((c) => c.sql)
        .filter(Boolean)
        .join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashStudio s
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
    const studios = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags)
    const relationsStart = Date.now();
    await this.populateRelations(studios, userId);
    const relationsMs = Date.now() - relationsStart;

    logger.debug("StudioQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: studios.length,
      total,
    });

    return { studios, total };
  }

  /**
   * Transform a raw database row into a NormalizedStudio
   */
  private transformRow(row: StudioQueryRow): NormalizedStudio {
    const studio = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      parent_studio: row.parentId ? { id: row.parentId, name: "" } : null,
      details: row.details || null,
      url: row.url || null,

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: row.sceneCount || 0,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      performer_count: row.performerCount || 0,
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

      // Relations - populated separately
      tags: [] as TagRef[],
      child_studios: [] as NormalizedStudio[],
    };

    return studio as NormalizedStudio;
  }

  /**
   * The card's relations for the whole page: its tags, at most
   * TOOLTIP_LIMIT collections and galleries, and how many of those and of
   * its performers there are (TooltipRelations), one statement per relation
   */
  async populateRelations(
    studios: NormalizedStudio[],
    userId: number
  ): Promise<void> {
    const relations = await loadTooltipRelations("studio", studios, userId);
    for (const studio of studios) {
      Object.assign(
        studio,
        relations.get(entityKey(studio.id, studio.instanceId))
      );
    }
  }
}

// Export singleton instance
export const studioQueryBuilder = new StudioQueryBuilder();
