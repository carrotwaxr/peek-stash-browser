/**
 * StudioQueryBuilder - SQL-native studio querying
 *
 * Builds parameterized SQL queries for studio filtering, sorting, and pagination.
 * Eliminates the need to load all studios into memory.
 */
import type { PeekStudioFilter, NormalizedStudio } from "../types/index.js";
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
        LEFT JOIN UserStudioStats us ON s.id = us.studioId AND us.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'studio' AND e.entityId = s.id`,
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
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
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
        return { sql: `s.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `s.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `s.id IN (${placeholders})`, params: ids };
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
          sql: `s.id IN (SELECT studioId FROM StudioTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `s.id IN (
            SELECT studioId FROM StudioTag
            WHERE tagId IN (${placeholders})
            GROUP BY studioId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `s.id NOT IN (SELECT studioId FROM StudioTag WHERE tagId IN (${placeholders}))`,
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
   * Build text filter clause (for name, details)
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
  private buildSortClause(sort: string, direction: "ASC" | "DESC"): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

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

      // Random
      random: `RANDOM() ${dir}`,
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

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = this.buildNumericFilter(filters.scene_count, "s.sceneCount", 0);
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      const nameFilter = this.buildTextFilter(filters.name, "s.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filters?.details) {
      const detailsFilter = this.buildTextFilter(filters.details, "s.details");
      if (detailsFilter.sql) {
        whereClauses.push(detailsFilter);
      }
    }

    // Date filters
    if (filters?.created_at) {
      const createdAtFilter = this.buildDateFilter(filters.created_at, "s.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = this.buildDateFilter(filters.updated_at, "s.stashUpdatedAt");
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

    logger.info("StudioQueryBuilder.execute", {
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
        SELECT COUNT(DISTINCT s.id) as total
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
        FROM StashStudio s
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const studios = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags)
    const relationsStart = Date.now();
    await this.populateRelations(studios);
    const relationsMs = Date.now() - relationsStart;

    logger.info("StudioQueryBuilder.execute complete", {
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
  private transformRow(row: any): NormalizedStudio {
    const studio: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      parent_studio: row.parentId ? { id: row.parentId, name: "" } : null,
      details: row.details || null,
      url: row.url || null,

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: this.transformUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: row.sceneCount || 0,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      performer_count: row.performerCount || 0,
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

      // Relations - populated separately
      tags: [],
      child_studios: [],
    };

    return studio as NormalizedStudio;
  }

  /**
   * Populate studio relations (tags, performers, groups, galleries)
   * Includes minimal data for TooltipEntityGrid
   */
  async populateRelations(studios: NormalizedStudio[]): Promise<void> {
    if (studios.length === 0) return;

    const studioIds = studios.map((s) => s.id);

    // Load tag junctions, scenes, and galleries for this studio
    const [tagJunctions, scenes, studioGalleries] = await Promise.all([
      prisma.studioTag.findMany({
        where: { studioId: { in: studioIds } },
      }),
      prisma.stashScene.findMany({
        where: { studioId: { in: studioIds } },
        select: { id: true, studioId: true },
      }),
      // Galleries have studioId directly
      prisma.stashGallery.findMany({
        where: { studioId: { in: studioIds } },
        select: { id: true, studioId: true },
      }),
    ]);

    const sceneIds = scenes.map((s) => s.id);

    // Load scene relationships for performers and groups
    const [scenePerformers, sceneGroups] = await Promise.all([
      sceneIds.length > 0
        ? prisma.scenePerformer.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, performerId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, groupId: true },
          })
        : [],
    ]);

    // Get unique entity IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const galleryIds = [...new Set(studioGalleries.map((sg) => sg.id))];

    // Load all entities in parallel
    const [tags, performers, groups, galleries] = await Promise.all([
      tagIds.length > 0 ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } }) : [],
      performerIds.length > 0 ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } }) : [],
      groupIds.length > 0 ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } }) : [],
      galleryIds.length > 0 ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } }) : [],
    ]);

    // Build lookup maps with instanceId for multi-instance routing
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath, t.stashInstanceId),
    }]));

    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
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

    // Build scene -> studio mapping
    const studioByScene = new Map(scenes.map((s) => [s.id, s.studioId]));

    // Build studio -> tags map
    const tagsByStudio = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByStudio.get(junction.studioId) || [];
      list.push(tag);
      tagsByStudio.set(junction.studioId, list);
    }

    // Build studio -> entities maps from scenes
    const performersByStudio = new Map<string, Set<string>>();
    const groupsByStudio = new Map<string, Set<string>>();

    for (const sp of scenePerformers) {
      const studioId = studioByScene.get(sp.sceneId);
      if (!studioId) continue;
      const set = performersByStudio.get(studioId) || new Set();
      set.add(sp.performerId);
      performersByStudio.set(studioId, set);
    }

    for (const sg of sceneGroups) {
      const studioId = studioByScene.get(sg.sceneId);
      if (!studioId) continue;
      const set = groupsByStudio.get(studioId) || new Set();
      set.add(sg.groupId);
      groupsByStudio.set(studioId, set);
    }

    // Build studio -> galleries map from direct studio-gallery relationship
    const galleriesByStudio = new Map<string, Set<string>>();
    for (const g of studioGalleries) {
      if (!g.studioId) continue;
      const set = galleriesByStudio.get(g.studioId) || new Set();
      set.add(g.id);
      galleriesByStudio.set(g.studioId, set);
    }

    // Populate studios
    for (const studio of studios) {
      studio.tags = tagsByStudio.get(studio.id) || [];
      (studio as any).performers = [...(performersByStudio.get(studio.id) || [])].map((id) => performersById.get(id)).filter(Boolean);
      (studio as any).groups = [...(groupsByStudio.get(studio.id) || [])].map((id) => groupsById.get(id)).filter(Boolean);
      (studio as any).galleries = [...(galleriesByStudio.get(studio.id) || [])].map((id) => galleriesById.get(id)).filter(Boolean);
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
export const studioQueryBuilder = new StudioQueryBuilder();
