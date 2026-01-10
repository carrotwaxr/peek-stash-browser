/**
 * GroupQueryBuilder - SQL-native group querying
 *
 * Builds parameterized SQL queries for group filtering, sorting, and pagination.
 * Eliminates the need to load all groups into memory.
 */
import type { PeekGroupFilter, NormalizedGroup } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds, expandStudioIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface GroupQueryOptions {
  userId: number;
  filters?: PeekGroupFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
}

// Query result
export interface GroupQueryResult {
  groups: NormalizedGroup[];
  total: number;
}

/**
 * Builds and executes SQL queries for group filtering
 */
class GroupQueryBuilder {
  // Column list for SELECT - all StashGroup fields plus user data
  private readonly SELECT_COLUMNS = `
    g.id, g.name, g.date, g.studioId, g.rating100 AS stashRating100,
    g.duration, g.sceneCount, g.performerCount,
    g.director, g.synopsis, g.urls,
    g.frontImagePath, g.backImagePath,
    g.stashCreatedAt, g.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashGroup g
        LEFT JOIN GroupRating r ON g.id = r.groupId AND r.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'group' AND e.entityId = g.id`,
        params: [userId, userId],
      };
    }

    return {
      sql: baseJoins,
      params: [userId],
    };
  }

  // Base WHERE clause (always filter deleted, optionally filter excluded)
  private buildBaseWhere(applyExclusions: boolean = true): FilterClause {
    if (applyExclusions) {
      return {
        sql: "g.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "g.deletedAt IS NULL",
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
        return { sql: `g.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `g.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `g.id IN (${placeholders})`, params: ids };
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
   * Build studio filter clause with hierarchy support
   */
  private async buildStudioFilterWithHierarchy(
    filter: { value?: string[] | null; modifier?: string | null; depth?: number | null } | undefined | null
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
          sql: `g.studioId IN (${placeholders})`,
          params: ids,
        };

      case "INCLUDES_ALL":
        // For studios, a group can only have one studio, so INCLUDES_ALL with multiple IDs would return nothing
        if (ids.length === 1) {
          return {
            sql: `g.studioId = ?`,
            params: ids,
          };
        }
        // Multiple studios in INCLUDES_ALL means no group can match (a group has at most one studio)
        return { sql: "1 = 0", params: [] };

      case "EXCLUDES":
        return {
          sql: `(g.studioId IS NULL OR g.studioId NOT IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build scenes filter clause
   * Filter groups by scenes they contain
   */
  private buildScenesFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    // Groups contain scenes via SceneGroup junction table
    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `g.id IN (
            SELECT sg.groupId FROM SceneGroup sg
            WHERE sg.sceneId IN (${placeholders})
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT sg.groupId FROM SceneGroup sg
            WHERE sg.sceneId IN (${placeholders})
            GROUP BY sg.groupId
            HAVING COUNT(DISTINCT sg.sceneId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (
            SELECT sg.groupId FROM SceneGroup sg
            WHERE sg.sceneId IN (${placeholders})
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer filter clause
   * Groups don't have direct performer relationships - we check via scenes
   */
  private buildPerformerFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    // Groups contain scenes, scenes have performers
    // Join: StashGroup -> SceneGroup -> ScenePerformer
    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `g.id IN (
            SELECT sg.groupId FROM SceneGroup sg
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId
            WHERE sp.performerId IN (${placeholders})
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT sg.groupId FROM SceneGroup sg
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId
            WHERE sp.performerId IN (${placeholders})
            GROUP BY sg.groupId
            HAVING COUNT(DISTINCT sp.performerId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (
            SELECT sg.groupId FROM SceneGroup sg
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId
            WHERE sp.performerId IN (${placeholders})
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build tag filter clause with hierarchy support
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
          sql: `g.id IN (SELECT groupId FROM GroupTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT groupId FROM GroupTag
            WHERE tagId IN (${placeholders})
            GROUP BY groupId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (SELECT groupId FROM GroupTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build numeric filter clause (for rating100, scene_count, duration, etc.)
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
   * Build text filter clause (for name, synopsis)
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
   * Build search query filter (searches name and synopsis)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(g.name) LIKE ? OR LOWER(g.synopsis) LIKE ?)",
      params: [lowerQuery, lowerQuery],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(sort: string, direction: "ASC" | "DESC"): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

    const sortMap: Record<string, string> = {
      // Group metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `g.name COLLATE NOCASE ${dir}`,
      date: `g.date ${dir}`,
      created_at: `g.stashCreatedAt ${dir}`,
      updated_at: `g.stashUpdatedAt ${dir}`,

      // Counts
      scene_count: `g.sceneCount ${dir}`,
      performer_count: `g.performerCount ${dir}`,
      duration: `g.duration ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // Random
      random: `RANDOM() ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["name"];

    // Add secondary sort by name for stable ordering
    if (sort !== "name") {
      return `${sortExpr}, g.name COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, g.id ${dir}`;
  }

  async execute(options: GroupQueryOptions): Promise<GroupQueryResult> {
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

    // Studio filter
    if (filters?.studios) {
      const studioFilter = await this.buildStudioFilterWithHierarchy(filters.studios as any);
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

    // Performer filter (via scenes)
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers as any);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
    }

    // Tag filter
    if (filters?.tags) {
      const tagFilter = await this.buildTagFilterWithHierarchy(filters.tags as any);
      if (tagFilter.sql) {
        whereClauses.push(tagFilter);
      }
    }

    // Rating filter
    if (filters?.rating100) {
      const ratingFilter = this.buildNumericFilter(filters.rating100, "r.rating", 0);
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // Scene count filter (from BaseGroupFilterType)
    const filtersAny = filters as Record<string, any> | undefined;
    if (filtersAny?.scene_count) {
      const sceneCountFilter = this.buildNumericFilter(filtersAny.scene_count, "g.sceneCount", 0);
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Duration filter (from BaseGroupFilterType)
    if (filtersAny?.duration) {
      const durationFilter = this.buildNumericFilter(filtersAny.duration, "g.duration", 0);
      if (durationFilter.sql) {
        whereClauses.push(durationFilter);
      }
    }

    // Name filter (from BaseGroupFilterType)
    if (filtersAny?.name) {
      const nameFilter = this.buildTextFilter(filtersAny.name, "g.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    // Date filters
    if (filters?.date) {
      const dateFilter = this.buildDateFilter(filters.date as any, "g.date");
      if (dateFilter.sql) {
        whereClauses.push(dateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = this.buildDateFilter(filters.created_at as any, "g.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = this.buildDateFilter(filters.updated_at as any, "g.stashUpdatedAt");
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

    logger.info("GroupQueryBuilder.execute", {
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
      filters?.rating100 !== undefined;

    if (hasUserDataFilters || applyExclusions) {
      const countSql = `
        SELECT COUNT(DISTINCT g.id) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...countParams);
      total = Number(countResult[0]?.total || 0);
    } else {
      // Fast path: count without JOINs
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.")
      );
      const baseWhereSQL = baseWhereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashGroup g
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const groups = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags, studio)
    const relationsStart = Date.now();
    await this.populateRelations(groups);
    const relationsMs = Date.now() - relationsStart;

    logger.info("GroupQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: groups.length,
      total,
    });

    return { groups, total };
  }

  /**
   * Transform a raw database row into a NormalizedGroup
   */
  private transformRow(row: any): NormalizedGroup {
    // Parse URLs JSON if present
    let urls: string[] = [];
    if (row.urls) {
      try {
        urls = JSON.parse(row.urls);
      } catch {
        urls = [];
      }
    }

    const group: any = {
      id: row.id,
      name: row.name,
      date: row.date || null,
      director: row.director || null,
      synopsis: row.synopsis || null,
      urls,

      // Counts
      scene_count: row.sceneCount || 0,
      performer_count: row.performerCount || 0,
      duration: row.duration || 0,

      // Image paths - transform to proxy URLs
      front_image_path: this.transformUrl(row.frontImagePath),
      back_image_path: this.transformUrl(row.backImagePath),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),

      // Relations - populated separately
      studio: row.studioId ? { id: row.studioId, name: "" } : null,
      tags: [],
      scenes: [],
    };

    return group as NormalizedGroup;
  }

  /**
   * Populate group relations (tags, studio, performers, galleries)
   * Includes minimal data for TooltipEntityGrid
   */
  async populateRelations(groups: NormalizedGroup[]): Promise<void> {
    if (groups.length === 0) return;

    const groupIds = groups.map((g) => g.id);

    // Load tag junctions and scene groups
    const [tagJunctions, sceneGroups] = await Promise.all([
      prisma.groupTag.findMany({
        where: { groupId: { in: groupIds } },
      }),
      prisma.sceneGroup.findMany({
        where: { groupId: { in: groupIds } },
        select: { groupId: true, sceneId: true },
      }),
    ]);

    const sceneIds = [...new Set(sceneGroups.map((sg) => sg.sceneId))];

    // Load scene relationships
    const [scenePerformers, sceneGalleries] = await Promise.all([
      sceneIds.length > 0
        ? prisma.scenePerformer.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, performerId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, galleryId: true },
          })
        : [],
    ]);

    // Get unique IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const studioIds = [...new Set(groups.map((g) => g.studio?.id).filter((id): id is string => !!id))];
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const galleryIds = [...new Set(sceneGalleries.map((sg) => sg.galleryId))];

    // Load all entities in parallel
    const [tags, studios, performers, galleries] = await Promise.all([
      tagIds.length > 0 ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } }) : [],
      studioIds.length > 0 ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } }) : [],
      performerIds.length > 0 ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } }) : [],
      galleryIds.length > 0 ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } }) : [],
    ]);

    // Build lookup maps
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath),
    }]));

    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath),
    }]));

    // Build group -> tags map
    const tagsByGroup = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByGroup.get(junction.groupId) || [];
      list.push(tag);
      tagsByGroup.set(junction.groupId, list);
    }

    // Build group -> scene mapping
    const scenesByGroup = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const set = scenesByGroup.get(sg.groupId) || new Set();
      set.add(sg.sceneId);
      scenesByGroup.set(sg.groupId, set);
    }

    // Build scene -> entities mappings
    const performersByScene = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const set = performersByScene.get(sp.sceneId) || new Set();
      set.add(sp.performerId);
      performersByScene.set(sp.sceneId, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const set = galleriesByScene.get(sg.sceneId) || new Set();
      set.add(sg.galleryId);
      galleriesByScene.set(sg.sceneId, set);
    }

    // Populate groups
    for (const group of groups) {
      group.tags = tagsByGroup.get(group.id) || [];

      // Hydrate studio with tooltip data (id, name, image_path)
      if (group.studio?.id) {
        const studioData = studiosById.get(group.studio.id);
        if (studioData) {
          (group as any).studio = studioData;
        }
      }

      // Derive performers and galleries from group's scenes
      const groupSceneIds = scenesByGroup.get(group.id) || new Set();

      const groupPerformerIds = new Set<string>();
      const groupGalleryIds = new Set<string>();

      for (const sceneId of groupSceneIds) {
        for (const pid of performersByScene.get(sceneId) || []) groupPerformerIds.add(pid);
        for (const gid of galleriesByScene.get(sceneId) || []) groupGalleryIds.add(gid);
      }

      (group as any).performers = [...groupPerformerIds].map((id) => performersById.get(id)).filter(Boolean);
      (group as any).galleries = [...groupGalleryIds].map((id) => galleriesById.get(id)).filter(Boolean);
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
export const groupQueryBuilder = new GroupQueryBuilder();
