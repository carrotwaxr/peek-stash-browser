/**
 * TagQueryBuilder - SQL-native tag querying
 *
 * Builds parameterized SQL queries for tag filtering, sorting, and pagination.
 * Eliminates the need to load all tags into memory.
 */
import type { PeekTagFilter, NormalizedTag } from "../types/index.js";
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
export interface TagQueryOptions {
  userId: number;
  filters?: PeekTagFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
  allowedInstanceIds?: string[];
}

// Query result
export interface TagQueryResult {
  tags: NormalizedTag[];
  total: number;
}

/**
 * Builds and executes SQL queries for tag filtering
 */
class TagQueryBuilder {
  // Column list for SELECT - all StashTag fields plus user data
  private readonly SELECT_COLUMNS = `
    t.id, t.stashInstanceId, t.name, t.favorite AS stashFavorite,
    t.sceneCount, t.imageCount, t.galleryCount, t.performerCount, t.studioCount, t.groupCount, t.sceneMarkerCount,
    t.sceneCountViaPerformers,
    t.description, t.aliases, t.parentIds, t.imagePath,
    t.stashCreatedAt, t.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    us.oCounter AS userOCounter, us.playCount AS userPlayCount
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashTag t
        LEFT JOIN TagRating r ON t.id = r.tagId AND t.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN UserTagStats us ON t.id = us.tagId AND us.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'tag' AND e.entityId = t.id`,
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
        sql: "t.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "t.deletedAt IS NULL",
      params: [],
    };
  }

  /**
   * Build instance filter clause for multi-instance support
   * Includes NULL stashInstanceId for backward compatibility with legacy data
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      return { sql: "", params: [] };
    }
    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(t.stashInstanceId IN (${placeholders}) OR t.stashInstanceId IS NULL)`,
      params: allowedInstanceIds,
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
        return { sql: `t.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `t.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `t.id IN (${placeholders})`, params: ids };
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
   * Build parent filter clause with hierarchy support
   */
  private async buildParentFilterWithHierarchy(
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

    // parentIds is stored as JSON array in the database
    // We need to search within the JSON array
    switch (modifier) {
      case "INCLUDES": {
        // Match tags that have any of the given parents
        const conditions = ids.map(() => `t.parentIds LIKE ?`).join(" OR ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      case "INCLUDES_ALL": {
        // Match tags that have ALL of the given parents
        const conditions = ids.map(() => `t.parentIds LIKE ?`).join(" AND ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      case "EXCLUDES": {
        // Match tags that don't have any of the given parents
        const conditions = ids.map(() => `(t.parentIds IS NULL OR t.parentIds NOT LIKE ?)`).join(" AND ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer filter clause
   * Tags attached to specific performers
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
        return {
          sql: `t.id IN (SELECT tagId FROM PerformerTag WHERE performerId IN (${placeholders}))`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `t.id NOT IN (SELECT tagId FROM PerformerTag WHERE performerId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build studio filter clause
   * Tags attached to specific studios
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
          sql: `t.id IN (SELECT tagId FROM StudioTag WHERE studioId IN (${placeholders}))`,
          params: ids,
        };

      case "EXCLUDES":
        return {
          sql: `t.id NOT IN (SELECT tagId FROM StudioTag WHERE studioId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build scenes_filter (for tags on scenes in specific groups)
   */
  private buildScenesFilter(
    filter: { id?: { value: string[]; modifier?: string }; groups?: { value: string[]; modifier?: string } } | undefined | null
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const clauses: FilterClause[] = [];

    // Filter by scene IDs
    if (filter.id?.value && filter.id.value.length > 0) {
      const ids = filter.id.value;
      const modifier = filter.id.modifier || "INCLUDES";
      const placeholders = ids.map(() => "?").join(", ");

      if (modifier === "INCLUDES") {
        clauses.push({
          sql: `t.id IN (SELECT tagId FROM SceneTag WHERE sceneId IN (${placeholders}))`,
          params: ids,
        });
      } else if (modifier === "EXCLUDES") {
        clauses.push({
          sql: `t.id NOT IN (SELECT tagId FROM SceneTag WHERE sceneId IN (${placeholders}))`,
          params: ids,
        });
      }
    }

    // Filter by groups (tags on scenes in specific groups)
    if (filter.groups?.value && filter.groups.value.length > 0) {
      const ids = filter.groups.value;
      const modifier = filter.groups.modifier || "INCLUDES";
      const placeholders = ids.map(() => "?").join(", ");

      if (modifier === "INCLUDES") {
        clauses.push({
          sql: `t.id IN (
            SELECT DISTINCT st.tagId
            FROM SceneTag st
            JOIN SceneGroup sg ON st.sceneId = sg.sceneId AND st.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        });
      } else if (modifier === "EXCLUDES") {
        clauses.push({
          sql: `t.id NOT IN (
            SELECT DISTINCT st.tagId
            FROM SceneTag st
            JOIN SceneGroup sg ON st.sceneId = sg.sceneId AND st.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        });
      }
    }

    if (clauses.length === 0) {
      return { sql: "", params: [] };
    }

    return {
      sql: clauses.map((c) => c.sql).join(" AND "),
      params: clauses.flatMap((c) => c.params),
    };
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
   * Build text filter clause (for name, description)
   */
  private buildTextFilter(
    filter: { value?: string | null; modifier?: string | null } | undefined | null,
    column: string
  ): FilterClause {
    if (!filter || !filter.value) {
      return { sql: "", params: [] };
    }

    const { value, modifier = "INCLUDES" } = filter;

    switch (modifier) {
      case "INCLUDES":
        return { sql: `LOWER(${column}) LIKE LOWER(?)`, params: [`%${value}%`] };
      case "EXCLUDES":
        return { sql: `(${column} IS NULL OR LOWER(${column}) NOT LIKE LOWER(?))`, params: [`%${value}%`] };
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
   * Build search query filter (searches name, description, and aliases)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(t.name) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(t.aliases) LIKE ?)",
      params: [lowerQuery, lowerQuery, lowerQuery],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(sort: string, direction: "ASC" | "DESC"): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

    const sortMap: Record<string, string> = {
      // Tag metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `t.name COLLATE NOCASE ${dir}`,
      created_at: `t.stashCreatedAt ${dir}`,
      updated_at: `t.stashUpdatedAt ${dir}`,

      // Counts - scene_count uses MAX of direct and performer counts to match enhanced value
      scene_count: `MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) ${dir}`,
      scenes_count: `MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) ${dir}`,
      image_count: `t.imageCount ${dir}`,
      gallery_count: `t.galleryCount ${dir}`,
      performer_count: `t.performerCount ${dir}`,
      studio_count: `t.studioCount ${dir}`,
      group_count: `t.groupCount ${dir}`,
      scene_marker_count: `t.sceneMarkerCount ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // User stats
      o_counter: `COALESCE(us.oCounter, 0) ${dir}`,
      play_count: `COALESCE(us.playCount, 0) ${dir}`,

      // Random
      random: `RANDOM() ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["name"];

    // Add secondary sort by name for stable ordering
    if (sort !== "name") {
      return `${sortExpr}, t.name COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, t.id ${dir}`;
  }

  async execute(options: TagQueryOptions): Promise<TagQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters, searchQuery, allowedInstanceIds } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Instance filter (multi-instance support)
    const instanceFilter = this.buildInstanceFilter(allowedInstanceIds);
    if (instanceFilter.sql) {
      whereClauses.push(instanceFilter);
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
    const favoriteFilter = this.buildFavoriteFilter(filters?.favorite);
    if (favoriteFilter.sql) {
      whereClauses.push(favoriteFilter);
    }

    // Parent filter
    if (filters?.parents) {
      const parentFilter = await this.buildParentFilterWithHierarchy(filters.parents as any);
      if (parentFilter.sql) {
        whereClauses.push(parentFilter);
      }
    }

    // Performer filter
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers as any);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
    }

    // Studio filter
    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios as any);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    // Scenes filter
    if (filters?.scenes_filter) {
      const scenesFilter = this.buildScenesFilter(filters.scenes_filter as any);
      if (scenesFilter.sql) {
        whereClauses.push(scenesFilter);
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
      const oCounterFilter = this.buildNumericFilter(filters.o_counter, "us.oCounter", 0);
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = this.buildNumericFilter(filters.play_count, "us.playCount", 0);
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Cast to any to access BaseTagFilterType properties
    const filtersAny = filters as Record<string, any> | undefined;

    // Scene count filter (from BaseTagFilterType)
    // Use MAX of direct scene count and performer scene count to match the enhanced scene_count returned
    if (filtersAny?.scene_count) {
      const sceneCountFilter = this.buildNumericFilter(
        filtersAny.scene_count,
        "MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0))",
        0
      );
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters (from BaseTagFilterType)
    if (filtersAny?.name) {
      const nameFilter = this.buildTextFilter(filtersAny.name, "t.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filtersAny?.description) {
      const descriptionFilter = this.buildTextFilter(filtersAny.description, "t.description");
      if (descriptionFilter.sql) {
        whereClauses.push(descriptionFilter);
      }
    }

    // Date filters (from BaseTagFilterType)
    if (filtersAny?.created_at) {
      const createdAtFilter = this.buildDateFilter(filtersAny.created_at, "t.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filtersAny?.updated_at) {
      const updatedAtFilter = this.buildDateFilter(filtersAny.updated_at, "t.stashUpdatedAt");
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

    logger.info("TagQueryBuilder.execute", {
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
        SELECT COUNT(DISTINCT t.id) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...countParams);
      total = Number(countResult[0]?.total || 0);
    } else {
      // Fast path: count without JOINs
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.") && !c.sql.includes("us.")
      );
      const baseWhereSQL = baseWhereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashTag t
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const tags = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations for tooltip data
    const relationsStart = Date.now();
    await this.populateRelations(tags);
    const relationsMs = Date.now() - relationsStart;

    logger.info("TagQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: tags.length,
      total,
    });

    return { tags, total };
  }

  /**
   * Transform a raw database row into a NormalizedTag
   */
  private transformRow(row: any): NormalizedTag {
    const directSceneCount = row.sceneCount || 0;
    const performerSceneCount = row.sceneCountViaPerformers || 0;
    // Use the greater of direct scene count or performer scene count
    const totalSceneCount = Math.max(directSceneCount, performerSceneCount);

    const tag: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      description: row.description || null,
      aliases: this.parseJsonArray(row.aliases),
      parents: this.parseJsonArray(row.parentIds).map((id: string) => ({ id, name: "" })),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: this.transformUrl(row.imagePath, row.stashInstanceId),

      // Counts - use enhanced scene count
      scene_count: totalSceneCount,
      scene_count_direct: directSceneCount,
      scene_count_via_performers: performerSceneCount,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      performer_count: row.performerCount || 0,
      studio_count: row.studioCount || 0,
      group_count: row.groupCount || 0,
      scene_marker_count: row.sceneMarkerCount || 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations
      children: [],
    };

    return tag as NormalizedTag;
  }

  /**
   * Populate tag relations (performers, studios, groups, galleries, parent names)
   * Includes minimal data for TooltipEntityGrid: id, name, image_path/cover
   */
  async populateRelations(tags: NormalizedTag[]): Promise<void> {
    if (tags.length === 0) return;

    const tagIds = tags.map((t) => t.id);

    // Collect all parent IDs that need name hydration
    const parentIds = new Set<string>();
    for (const tag of tags) {
      if (tag.parents && Array.isArray(tag.parents)) {
        for (const parent of tag.parents) {
          if (parent.id) {
            parentIds.add(parent.id);
          }
        }
      }
    }

    // Load all junctions in parallel (include parent tags lookup)
    const [performerTags, studioTags, groupTags, galleryTags, parentTagRecords] = await Promise.all([
      prisma.performerTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, performerId: true },
      }),
      prisma.studioTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, studioId: true },
      }),
      prisma.groupTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, groupId: true },
      }),
      prisma.galleryTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, galleryId: true },
      }),
      // Fetch parent tag names
      parentIds.size > 0
        ? prisma.stashTag.findMany({
            where: { id: { in: Array.from(parentIds) } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    // Build parent name lookup map and hydrate parent names
    const parentNameMap = new Map<string, string>();
    for (const pt of parentTagRecords) {
      parentNameMap.set(pt.id, pt.name || "Unknown");
    }
    for (const tag of tags) {
      if (tag.parents && Array.isArray(tag.parents)) {
        (tag as any).parents = tag.parents.map((p) => ({
          id: p.id,
          name: parentNameMap.get(p.id) || "Unknown",
        }));
      }
    }

    // Get unique entity IDs
    const performerIds = [...new Set(performerTags.map((pt) => pt.performerId))];
    const studioIds = [...new Set(studioTags.map((st) => st.studioId))];
    const groupIds = [...new Set(groupTags.map((gt) => gt.groupId))];
    const galleryIds = [...new Set(galleryTags.map((gt) => gt.galleryId))];

    // Load all entities in parallel
    const [performers, studios, groups, galleries] = await Promise.all([
      performerIds.length > 0
        ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } })
        : [],
      studioIds.length > 0
        ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } })
        : [],
      groupIds.length > 0
        ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } })
        : [],
      galleryIds.length > 0
        ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } })
        : [],
    ]);

    // Build lookup maps with minimal tooltip data, including instanceId for multi-instance routing
    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath, s.stashInstanceId),
    }]));

    const groupsById = new Map(groups.map((g) => [g.id, {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath, g.stashInstanceId),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath, g.stashInstanceId),
    }]));

    // Build tag -> entities maps
    const performersByTag = new Map<string, any[]>();
    for (const pt of performerTags) {
      const performer = performersById.get(pt.performerId);
      if (!performer) continue;
      const list = performersByTag.get(pt.tagId) || [];
      list.push(performer);
      performersByTag.set(pt.tagId, list);
    }

    const studiosByTag = new Map<string, any[]>();
    for (const st of studioTags) {
      const studio = studiosById.get(st.studioId);
      if (!studio) continue;
      const list = studiosByTag.get(st.tagId) || [];
      list.push(studio);
      studiosByTag.set(st.tagId, list);
    }

    const groupsByTag = new Map<string, any[]>();
    for (const gt of groupTags) {
      const group = groupsById.get(gt.groupId);
      if (!group) continue;
      const list = groupsByTag.get(gt.tagId) || [];
      list.push(group);
      groupsByTag.set(gt.tagId, list);
    }

    const galleriesByTag = new Map<string, any[]>();
    for (const gt of galleryTags) {
      const gallery = galleriesById.get(gt.galleryId);
      if (!gallery) continue;
      const list = galleriesByTag.get(gt.tagId) || [];
      list.push(gallery);
      galleriesByTag.set(gt.tagId, list);
    }

    // Populate tags with all relations
    for (const tag of tags) {
      (tag as any).performers = performersByTag.get(tag.id) || [];
      (tag as any).studios = studiosByTag.get(tag.id) || [];
      (tag as any).groups = groupsByTag.get(tag.id) || [];
      (tag as any).galleries = galleriesByTag.get(tag.id) || [];
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
export const tagQueryBuilder = new TagQueryBuilder();
