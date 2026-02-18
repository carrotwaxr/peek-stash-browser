/**
 * GroupQueryBuilder - SQL-native group querying
 *
 * Builds parameterized SQL queries for group filtering, sorting, and pagination.
 * Eliminates the need to load all groups into memory.
 */
import type { PeekGroupFilter, NormalizedGroup, PerformerRef, TagRef, StudioRef, GalleryRef } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds, expandStudioIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import { buildNumericFilter, buildDateFilter, buildTextFilter, buildFavoriteFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";

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
  allowedInstanceIds?: string[];
  randomSeed?: number; // Seed for consistent random ordering
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
    g.id, g.stashInstanceId, g.name, g.date, g.studioId, g.rating100 AS stashRating100,
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
        LEFT JOIN GroupRating r ON g.id = r.groupId AND g.stashInstanceId = r.instanceId AND r.userId = ?
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
   * Build instance filter clause for multi-instance support
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      return { sql: "", params: [] };
    }
    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(g.stashInstanceId IN (${placeholders}) OR g.stashInstanceId IS NULL)`,
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
        return { sql: `g.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `g.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `g.id IN (${placeholders})`, params: ids };
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
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
            WHERE sp.performerId IN (${placeholders})
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT sg.groupId FROM SceneGroup sg
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
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
            JOIN ScenePerformer sp ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
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
          sql: `g.id IN (SELECT groupId FROM GroupTag WHERE tagId IN (${placeholders}) AND groupInstanceId = g.stashInstanceId)`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT groupId FROM GroupTag
            WHERE tagId IN (${placeholders}) AND groupInstanceId = g.stashInstanceId
            GROUP BY groupId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (SELECT groupId FROM GroupTag WHERE tagId IN (${placeholders}) AND groupInstanceId = g.stashInstanceId)`,
          params: ids,
        };

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
  private buildSortClause(sort: string, direction: "ASC" | "DESC", randomSeed?: number): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";
    const seed = randomSeed || 12345;

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

      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((g.id + ${seed}) % 2147483647) * ((g.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((g.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
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

    // Studio filter
    if (filters?.studios) {
      const studioFilter = await this.buildStudioFilterWithHierarchy(filters.studios);
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

    // Performer filter (via scenes)
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
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

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(filters.scene_count, "COALESCE(g.sceneCount, 0)");
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Duration filter
    if (filters?.duration) {
      const durationFilter = buildNumericFilter(filters.duration, "COALESCE(g.duration, 0)");
      if (durationFilter.sql) {
        whereClauses.push(durationFilter);
      }
    }

    // Name filter
    if (filters?.name) {
      const nameFilter = buildTextFilter(filters.name, "g.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    // Date filters
    if (filters?.date) {
      const dateFilter = buildDateFilter(filters.date, "g.date");
      if (dateFilter.sql) {
        whereClauses.push(dateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(filters.created_at, "g.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at, "g.stashUpdatedAt");
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

    logger.info("GroupQueryBuilder.execute", {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transformRow(row: Record<string, any>): NormalizedGroup {
    // Parse URLs JSON if present
    let urls: string[] = [];
    if (row.urls) {
      try {
        urls = JSON.parse(row.urls);
      } catch {
        urls = [];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group: any = {
      id: row.id,
      instanceId: row.stashInstanceId, // For multi-instance correctness in populateRelations
      name: row.name,
      date: row.date || null,
      director: row.director || null,
      synopsis: row.synopsis || null,
      urls,

      // Counts
      scene_count: row.sceneCount || 0,
      performer_count: row.performerCount || 0,
      duration: row.duration || 0,

      // Image paths - transform to proxy URLs with instanceId for multi-instance routing
      front_image_path: this.transformUrl(row.frontImagePath, row.stashInstanceId),
      back_image_path: this.transformUrl(row.backImagePath, row.stashInstanceId),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),

      // Relations - populated separately
      studio: row.studioId ? { id: row.studioId, name: "" } : null,
      studioId: row.studioId || null, // For multi-instance correctness in populateRelations
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
    // Extract instanceIds from groups for multi-instance correctness
    const groupInstanceIds = [...new Set(groups.map((g) => g.instanceId))];

    // Load tag junctions and scene groups - filter by both groupId AND groupInstanceId
    const [tagJunctions, sceneGroups] = await Promise.all([
      prisma.groupTag.findMany({
        where: {
          groupId: { in: groupIds },
          groupInstanceId: { in: groupInstanceIds },
        },
      }),
      prisma.sceneGroup.findMany({
        where: {
          groupId: { in: groupIds },
          groupInstanceId: { in: groupInstanceIds },
        },
        select: { groupId: true, groupInstanceId: true, sceneId: true, sceneInstanceId: true },
      }),
    ]);

    // Collect unique scene keys from junction records
    const sceneKeys = [...new Map(
      sceneGroups.map((sg) => [`${sg.sceneId}:${sg.sceneInstanceId}`, { id: sg.sceneId, instanceId: sg.sceneInstanceId }])
    ).values()];
    const sceneIds = sceneKeys.map((k) => k.id);
    const sceneInstanceIds = [...new Set(sceneKeys.map((k) => k.instanceId))];

    // Load scene relationships - filter by both sceneId AND sceneInstanceId
    const [scenePerformers, sceneGalleries] = await Promise.all([
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
        ? prisma.sceneGallery.findMany({
            where: {
              sceneId: { in: sceneIds },
              sceneInstanceId: { in: sceneInstanceIds },
            },
            select: { sceneId: true, sceneInstanceId: true, galleryId: true, galleryInstanceId: true },
          })
        : [],
    ]);

    // Collect unique entity keys (id:instanceId) from junction tables
    const tagKeys = [...new Map(
      tagJunctions.map((j) => [`${j.tagId}:${j.tagInstanceId}`, { id: j.tagId, instanceId: j.tagInstanceId }])
    ).values()];
    // Cast via `unknown` because studioId is set on the raw SQL row in transformRow()
    // but NormalizedGroup (from GraphQL's Group type) only has `studio?: Maybe<Studio>`,
    // not a flat studioId field.
    const studioKeys = [...new Map(
      groups
        .filter((g) => (g as unknown as { studioId: string | null }).studioId)
        .map((g) => {
          const studioId = (g as unknown as { studioId: string | null }).studioId;
          return [`${studioId}:${g.instanceId}`, { id: studioId as string, instanceId: g.instanceId }];
        })
    ).values()];
    const performerKeys = [...new Map(
      scenePerformers.map((sp) => [`${sp.performerId}:${sp.performerInstanceId}`, { id: sp.performerId, instanceId: sp.performerInstanceId }])
    ).values()];
    const galleryKeys = [...new Map(
      sceneGalleries.map((sg) => [`${sg.galleryId}:${sg.galleryInstanceId}`, { id: sg.galleryId, instanceId: sg.galleryInstanceId }])
    ).values()];

    // Build OR conditions for entity queries using composite keys
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const galleryOrConditions = galleryKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load all entities in parallel using composite key lookups
    const [tags, studios, performers, galleries] = await Promise.all([
      tagOrConditions.length > 0 ? prisma.stashTag.findMany({ where: { OR: tagOrConditions } }) : [],
      studioOrConditions.length > 0 ? prisma.stashStudio.findMany({ where: { OR: studioOrConditions } }) : [],
      performerOrConditions.length > 0 ? prisma.stashPerformer.findMany({ where: { OR: performerOrConditions } }) : [],
      galleryOrConditions.length > 0 ? prisma.stashGallery.findMany({ where: { OR: galleryOrConditions } }) : [],
    ]);

    // Build lookup maps with composite keys (id:instanceId)
    const tagsByKey = new Map<string, TagRef>();
    for (const t of tags) {
      const key = `${t.id}:${t.stashInstanceId}`;
      tagsByKey.set(key, {
        id: t.id,
        instanceId: t.stashInstanceId,
        name: t.name,
        image_path: this.transformUrl(t.imagePath, t.stashInstanceId),
        favorite: t.favorite,
      });
    }

    const studiosByKey = new Map<string, StudioRef>();
    for (const s of studios) {
      const key = `${s.id}:${s.stashInstanceId}`;
      studiosByKey.set(key, {
        id: s.id,
        instanceId: s.stashInstanceId,
        name: s.name,
        image_path: this.transformUrl(s.imagePath, s.stashInstanceId),
        favorite: s.favorite,
        parent_studio: s.parentId ? { id: s.parentId } : null,
      });
    }

    const performersByKey = new Map<string, PerformerRef>();
    for (const p of performers) {
      const key = `${p.id}:${p.stashInstanceId}`;
      performersByKey.set(key, {
        id: p.id,
        instanceId: p.stashInstanceId,
        name: p.name,
        disambiguation: p.disambiguation || null,
        gender: p.gender || null,
        image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
        favorite: p.favorite,
        rating100: p.rating100 ?? null,
      });
    }

    const galleriesByKey = new Map<string, GalleryRef>();
    for (const g of galleries) {
      const key = `${g.id}:${g.stashInstanceId}`;
      galleriesByKey.set(key, {
        id: g.id,
        title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
        cover: this.transformUrl(g.coverPath, g.stashInstanceId),
      });
    }

    // Build group -> tags map using composite keys
    // Key format: groupId:groupInstanceId -> tags[]
    const tagsByGroup = new Map<string, TagRef[]>();
    for (const junction of tagJunctions) {
      const tagKey = `${junction.tagId}:${junction.tagInstanceId}`;
      const tag = tagsByKey.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const groupKey = `${junction.groupId}:${junction.groupInstanceId}`;
      const list = tagsByGroup.get(groupKey) || [];
      list.push(tag);
      tagsByGroup.set(groupKey, list);
    }

    // Build group -> scene mapping using composite keys
    // Key format: groupId:groupInstanceId -> Set<sceneId:sceneInstanceId>
    const scenesByGroup = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const groupKey = `${sg.groupId}:${sg.groupInstanceId}`;
      const sceneKey = `${sg.sceneId}:${sg.sceneInstanceId}`;
      const set = scenesByGroup.get(groupKey) || new Set();
      set.add(sceneKey);
      scenesByGroup.set(groupKey, set);
    }

    // Build scene -> entities mappings using composite keys
    // Key format: sceneId:sceneInstanceId -> Set<entityId:entityInstanceId>
    const performersByScene = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const sceneKey = `${sp.sceneId}:${sp.sceneInstanceId}`;
      const performerKey = `${sp.performerId}:${sp.performerInstanceId}`;
      const set = performersByScene.get(sceneKey) || new Set();
      set.add(performerKey);
      performersByScene.set(sceneKey, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const sceneKey = `${sg.sceneId}:${sg.sceneInstanceId}`;
      const galleryKey = `${sg.galleryId}:${sg.galleryInstanceId}`;
      const set = galleriesByScene.get(sceneKey) || new Set();
      set.add(galleryKey);
      galleriesByScene.set(sceneKey, set);
    }

    // Populate groups using composite keys
    for (const group of groups) {
      const groupKey = `${group.id}:${group.instanceId}`;
      group.tags = (tagsByGroup.get(groupKey) || []) as unknown as NormalizedGroup["tags"];

      // Hydrate studio with tooltip data (id, name, image_path) using composite key
      if (group.studio?.id) {
        const studioKey = `${group.studio.id}:${group.instanceId}`;
        const studioData = studiosByKey.get(studioKey);
        if (studioData) {
          (group as unknown as { studio: typeof studioData }).studio = studioData;
        }
      }

      // Derive performers and galleries from group's scenes using composite keys
      const groupSceneKeys = scenesByGroup.get(groupKey) || new Set();

      const groupPerformerKeys = new Set<string>();
      const groupGalleryKeys = new Set<string>();

      for (const sceneKey of groupSceneKeys) {
        for (const performerKey of performersByScene.get(sceneKey) || []) groupPerformerKeys.add(performerKey);
        for (const galleryKey of galleriesByScene.get(sceneKey) || []) groupGalleryKeys.add(galleryKey);
      }

      (group as unknown as { performers: PerformerRef[] }).performers = [...groupPerformerKeys].map((key) => performersByKey.get(key)).filter((p): p is PerformerRef => !!p);
      (group as unknown as { galleries: GalleryRef[] }).galleries = [...groupGalleryKeys].map((key) => galleriesByKey.get(key)).filter((g): g is GalleryRef => !!g);
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
export const groupQueryBuilder = new GroupQueryBuilder();
