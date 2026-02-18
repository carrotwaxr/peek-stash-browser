/**
 * StudioQueryBuilder - SQL-native studio querying
 *
 * Builds parameterized SQL queries for studio filtering, sorting, and pagination.
 * Eliminates the need to load all studios into memory.
 */
import type { PeekStudioFilter, NormalizedStudio, TagRef } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import { buildNumericFilter, buildDateFilter, buildTextFilter, buildFavoriteFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";

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
          sql: `s.id IN (SELECT studioId FROM StudioTag WHERE tagId IN (${placeholders}) AND studioInstanceId = s.stashInstanceId)`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `s.id IN (
            SELECT studioId FROM StudioTag
            WHERE tagId IN (${placeholders}) AND studioInstanceId = s.stashInstanceId
            GROUP BY studioId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `s.id NOT IN (SELECT studioId FROM StudioTag WHERE tagId IN (${placeholders}) AND studioInstanceId = s.stashInstanceId)`,
          params: ids,
        };

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
  private buildSortClause(sort: string, direction: "ASC" | "DESC", randomSeed?: number): string {
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
    const { userId, page, perPage, applyExclusions = true, filters, searchQuery, allowedInstanceIds, randomSeed } = options;

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
      const ratingFilter = buildNumericFilter(filters.rating100, "COALESCE(r.rating, 0)");
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // O counter filter
    if (filters?.o_counter) {
      const oCounterFilter = buildNumericFilter(filters.o_counter, "COALESCE(us.oCounter, 0)");
      if (oCounterFilter.sql) {
        whereClauses.push(oCounterFilter);
      }
    }

    // Play count filter
    if (filters?.play_count) {
      const playCountFilter = buildNumericFilter(filters.play_count, "COALESCE(us.playCount, 0)");
      if (playCountFilter.sql) {
        whereClauses.push(playCountFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(filters.scene_count, "COALESCE(s.sceneCount, 0)");
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
      const createdAtFilter = buildDateFilter(filters.created_at, "s.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at, "s.stashUpdatedAt");
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

    logger.info("StudioQueryBuilder.execute", {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformRow(row: Record<string, any>): NormalizedStudio {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const studioInstanceIds = [...new Set(studios.map((s) => s.instanceId))];

    // Load tag junctions, scenes, and galleries for this studio
    // Use composite keys (studioId + studioInstanceId) for multi-instance correctness
    const [tagJunctions, scenes, studioGalleries] = await Promise.all([
      prisma.studioTag.findMany({
        where: {
          studioId: { in: studioIds },
          studioInstanceId: { in: studioInstanceIds },
        },
      }),
      prisma.stashScene.findMany({
        where: {
          studioId: { in: studioIds },
          stashInstanceId: { in: studioInstanceIds },
        },
        select: { id: true, studioId: true, stashInstanceId: true },
      }),
      // Galleries have studioId directly
      prisma.stashGallery.findMany({
        where: {
          studioId: { in: studioIds },
          stashInstanceId: { in: studioInstanceIds },
        },
        select: { id: true, studioId: true, stashInstanceId: true },
      }),
    ]);

    const sceneIds = scenes.map((s) => s.id);
    const sceneInstanceIds = [...new Set(scenes.map((s) => s.stashInstanceId))];

    // Load scene relationships for performers and groups
    // Use composite keys (sceneId + sceneInstanceId) for multi-instance correctness
    const [scenePerformers, sceneGroups] = await Promise.all([
      sceneIds.length > 0
        ? prisma.scenePerformer.findMany({
            where: {
              sceneId: { in: sceneIds },
              sceneInstanceId: { in: sceneInstanceIds },
            },
            select: { sceneId: true, sceneInstanceId: true, performerId: true, performerInstanceId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: {
              sceneId: { in: sceneIds },
              sceneInstanceId: { in: sceneInstanceIds },
            },
            select: { sceneId: true, sceneInstanceId: true, groupId: true, groupInstanceId: true },
          })
        : [],
    ]);

    // Collect unique entity keys (id:instanceId) from junction tables
    const tagKeys = [...new Map(
      tagJunctions.map((j) => [`${j.tagId}:${j.tagInstanceId}`, { id: j.tagId, instanceId: j.tagInstanceId }])
    ).values()];
    const performerKeys = [...new Map(
      scenePerformers.map((j) => [`${j.performerId}:${j.performerInstanceId}`, { id: j.performerId, instanceId: j.performerInstanceId }])
    ).values()];
    const groupKeys = [...new Map(
      sceneGroups.map((j) => [`${j.groupId}:${j.groupInstanceId}`, { id: j.groupId, instanceId: j.groupInstanceId }])
    ).values()];
    const galleryKeys = [...new Map(
      studioGalleries.map((g) => [`${g.id}:${g.stashInstanceId}`, { id: g.id, instanceId: g.stashInstanceId }])
    ).values()];

    // Build OR conditions for entity queries (need to match on composite keys)
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const groupOrConditions = groupKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const galleryOrConditions = galleryKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load all entities in parallel using composite key lookups
    const [tags, performers, groups, galleries] = await Promise.all([
      tagOrConditions.length > 0 ? prisma.stashTag.findMany({ where: { OR: tagOrConditions } }) : [],
      performerOrConditions.length > 0 ? prisma.stashPerformer.findMany({ where: { OR: performerOrConditions } }) : [],
      groupOrConditions.length > 0 ? prisma.stashGroup.findMany({ where: { OR: groupOrConditions } }) : [],
      galleryOrConditions.length > 0 ? prisma.stashGallery.findMany({ where: { OR: galleryOrConditions } }) : [],
    ]);

    // Build lookup maps by composite key (id:instanceId)
    const tagsById = new Map<string, TagRef>(tags.map((t) => [`${t.id}:${t.stashInstanceId}`, {
      id: t.id,
      instanceId: t.stashInstanceId,
      name: t.name,
      image_path: this.transformUrl(t.imagePath, t.stashInstanceId),
      favorite: t.favorite,
    }]));

    const performersById = new Map(performers.map((p) => [`${p.id}:${p.stashInstanceId}`, {
      id: p.id,
      instanceId: p.stashInstanceId,
      name: p.name,
      image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
    }]));

    const groupsById = new Map(groups.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath, g.stashInstanceId),
    }]));

    const galleriesById = new Map(galleries.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath, g.stashInstanceId),
    }]));

    // Build scene -> studio mapping using composite keys
    const studioByScene = new Map(scenes.map((s) => [`${s.id}:${s.stashInstanceId}`, { studioId: s.studioId, instanceId: s.stashInstanceId }]));

    // Build studio -> tags map using composite keys
    const tagsByStudio = new Map<string, TagRef[]>();
    for (const junction of tagJunctions) {
      const tagKey = `${junction.tagId}:${junction.tagInstanceId}`;
      const tag = tagsById.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const studioKey = `${junction.studioId}:${junction.studioInstanceId}`;
      const list = tagsByStudio.get(studioKey) || [];
      list.push(tag);
      tagsByStudio.set(studioKey, list);
    }

    // Build studio -> entities maps from scenes using composite keys
    const performersByStudio = new Map<string, Set<string>>();
    const groupsByStudio = new Map<string, Set<string>>();

    for (const sp of scenePerformers) {
      const sceneKey = `${sp.sceneId}:${sp.sceneInstanceId}`;
      const studioInfo = studioByScene.get(sceneKey);
      if (!studioInfo) continue;
      const studioKey = `${studioInfo.studioId}:${studioInfo.instanceId}`;
      const performerKey = `${sp.performerId}:${sp.performerInstanceId}`;
      const set = performersByStudio.get(studioKey) || new Set();
      set.add(performerKey);
      performersByStudio.set(studioKey, set);
    }

    for (const sg of sceneGroups) {
      const sceneKey = `${sg.sceneId}:${sg.sceneInstanceId}`;
      const studioInfo = studioByScene.get(sceneKey);
      if (!studioInfo) continue;
      const studioKey = `${studioInfo.studioId}:${studioInfo.instanceId}`;
      const groupKey = `${sg.groupId}:${sg.groupInstanceId}`;
      const set = groupsByStudio.get(studioKey) || new Set();
      set.add(groupKey);
      groupsByStudio.set(studioKey, set);
    }

    // Build studio -> galleries map from direct studio-gallery relationship using composite keys
    const galleriesByStudio = new Map<string, Set<string>>();
    for (const g of studioGalleries) {
      if (!g.studioId) continue;
      const studioKey = `${g.studioId}:${g.stashInstanceId}`;
      const galleryKey = `${g.id}:${g.stashInstanceId}`;
      const set = galleriesByStudio.get(studioKey) || new Set();
      set.add(galleryKey);
      galleriesByStudio.set(studioKey, set);
    }

    // Populate studios using composite keys
    for (const studio of studios) {
      const studioKey = `${studio.id}:${studio.instanceId}`;
      studio.tags = (tagsByStudio.get(studioKey) || []) as unknown as NormalizedStudio["tags"];
      const performers = [...(performersByStudio.get(studioKey) || [])].map((key) => performersById.get(key)).filter(Boolean);
      (studio as unknown as { performers: typeof performers }).performers = performers;
      const groups = [...(groupsByStudio.get(studioKey) || [])].map((key) => groupsById.get(key)).filter(Boolean);
      (studio as unknown as { groups: typeof groups }).groups = groups;
      const studioGalleryList = [...(galleriesByStudio.get(studioKey) || [])].map((key) => galleriesById.get(key)).filter(Boolean);
      (studio as unknown as { galleries: typeof studioGalleryList }).galleries = studioGalleryList;
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
