/**
 * GalleryQueryBuilder - SQL-native gallery querying
 *
 * Builds parameterized SQL queries for gallery filtering, sorting, and pagination.
 * Eliminates the need to load all galleries into memory.
 */
import type { PeekGalleryFilter, NormalizedGallery } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import { buildNumericFilter, buildDateFilter, buildTextFilter, buildFavoriteFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";

// Query builder options
export interface GalleryQueryOptions {
  userId: number;
  filters?: PeekGalleryFilter;
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
export interface GalleryQueryResult {
  galleries: NormalizedGallery[];
  total: number;
}

/**
 * Builds and executes SQL queries for gallery filtering
 */
class GalleryQueryBuilder {
  // Column list for SELECT - all StashGallery fields plus user data
  private readonly SELECT_COLUMNS = `
    g.id, g.stashInstanceId, g.title, g.date, g.studioId, g.rating100 AS stashRating100,
    g.imageCount, g.coverImageId,
    g.details, g.url, g.code, g.photographer, g.urls,
    g.folderPath, g.fileBasename, g.coverPath,
    g.stashCreatedAt, g.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    ci.width AS coverWidth, ci.height AS coverHeight
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashGallery g
        LEFT JOIN GalleryRating r ON g.id = r.galleryId AND g.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN StashImage ci ON g.coverImageId = ci.id AND g.stashInstanceId = ci.stashInstanceId
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'gallery' AND e.entityId = g.id`,
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
        // For studios, a gallery can only have one studio, so INCLUDES_ALL with multiple IDs would return nothing
        // Just treat as INCLUDES for single ID, or empty for multiple
        if (ids.length === 1) {
          return {
            sql: `g.studioId = ?`,
            params: ids,
          };
        }
        // Multiple studios in INCLUDES_ALL means no gallery can match (a gallery has at most one studio)
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
   * Filter galleries by scenes they contain
   */
  private buildScenesFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    // Galleries contain scenes via SceneGallery junction table
    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `g.id IN (
            SELECT sg.galleryId FROM SceneGallery sg
            WHERE sg.sceneId IN (${placeholders}) AND sg.galleryInstanceId = g.stashInstanceId
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT sg.galleryId FROM SceneGallery sg
            WHERE sg.sceneId IN (${placeholders}) AND sg.galleryInstanceId = g.stashInstanceId
            GROUP BY sg.galleryId
            HAVING COUNT(DISTINCT sg.sceneId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (
            SELECT sg.galleryId FROM SceneGallery sg
            WHERE sg.sceneId IN (${placeholders}) AND sg.galleryInstanceId = g.stashInstanceId
          )`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer filter clause
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
          sql: `EXISTS (SELECT 1 FROM GalleryPerformer gp WHERE gp.galleryId = g.id AND gp.galleryInstanceId = g.stashInstanceId AND gp.performerId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT gp.performerId) FROM GalleryPerformer gp WHERE gp.galleryId = g.id AND gp.galleryInstanceId = g.stashInstanceId AND gp.performerId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM GalleryPerformer gp WHERE gp.galleryId = g.id AND gp.galleryInstanceId = g.stashInstanceId AND gp.performerId IN (${placeholders}))`,
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
          sql: `EXISTS (SELECT 1 FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId AND gt.tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT gt.tagId) FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId AND gt.tagId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId AND gt.tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build filter for galleries that have at least one favorited image
   */
  private buildHasFavoriteImageFilter(
    hasFavoriteImage: boolean | undefined,
    userId: number
  ): FilterClause {
    if (!hasFavoriteImage) {
      return { sql: "", params: [] };
    }

    return {
      sql: `EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage si ON ig.imageId = si.id AND ig.imageInstanceId = si.stashInstanceId
        JOIN ImageRating ir ON ir.imageId = si.id AND ir.instanceId = si.stashInstanceId AND ir.userId = ?
        WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId
        AND ir.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build search query filter (searches title, details, photographer)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(g.title) LIKE ? OR LOWER(g.details) LIKE ? OR LOWER(g.photographer) LIKE ?)",
      params: [lowerQuery, lowerQuery, lowerQuery],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(sort: string, direction: "ASC" | "DESC", randomSeed?: number): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";
    const seed = randomSeed || 12345;

    // Extract folder name from path: '/images/My Gallery' -> 'My Gallery'
    const folderNameExpr = `REPLACE(REPLACE(g.folderPath, RTRIM(g.folderPath, REPLACE(g.folderPath, '/', '')), ''), '/', '')`;

    const sortMap: Record<string, string> = {
      // Gallery metadata - use COALESCE for fallback title, COLLATE NOCASE for case-insensitive sorting
      // NULLIF handles empty string titles (762 galleries have '' instead of NULL)
      title: `COALESCE(NULLIF(g.title, ''), g.fileBasename, ${folderNameExpr}) COLLATE NOCASE ${dir}`,
      date: `g.date ${dir}`,
      created_at: `g.stashCreatedAt ${dir}`,
      updated_at: `g.stashUpdatedAt ${dir}`,
      path: `g.folderPath COLLATE NOCASE ${dir}`,

      // Counts
      image_count: `g.imageCount ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((g.id + ${seed}) % 2147483647) * ((g.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((g.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["title"];

    // Add secondary sort by title for stable ordering (use same fallback as primary title sort)
    if (sort !== "title") {
      return `${sortExpr}, COALESCE(NULLIF(g.title, ''), g.fileBasename, ${folderNameExpr}) COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, g.id ${dir}`;
  }

  async execute(options: GalleryQueryOptions): Promise<GalleryQueryResult> {
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

    // Has favorite image filter
    if (filters?.hasFavoriteImage) {
      const hasFavImageFilter = this.buildHasFavoriteImageFilter(filters.hasFavoriteImage, userId);
      if (hasFavImageFilter.sql) {
        whereClauses.push(hasFavImageFilter);
      }
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

    // Performer filter
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
      const ratingFilter = buildNumericFilter(filters.rating100, "COALESCE(r.rating, 0)");
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // Image count filter
    if (filters?.image_count) {
      const imageCountFilter = buildNumericFilter(filters.image_count, "COALESCE(g.imageCount, 0)");
      if (imageCountFilter.sql) {
        whereClauses.push(imageCountFilter);
      }
    }

    // Title filter
    if (filters?.title) {
      const titleFilter = buildTextFilter(filters.title, "g.title");
      if (titleFilter.sql) {
        whereClauses.push(titleFilter);
      }
    }

    // Date filters
    if (filters?.date) {
      const dateFilter = buildDateFilter(filters.date as any, "g.date");
      if (dateFilter.sql) {
        whereClauses.push(dateFilter);
      }
    }

    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(filters.created_at as any, "g.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at as any, "g.stashUpdatedAt");
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

    logger.info("GalleryQueryBuilder.execute", {
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
      filters?.hasFavoriteImage;

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
        FROM StashGallery g
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const galleries = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (performers, tags, studio)
    const relationsStart = Date.now();
    await this.populateRelations(galleries);
    const relationsMs = Date.now() - relationsStart;

    logger.info("GalleryQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: galleries.length,
      total,
    });

    return { galleries, total };
  }


  /**
   * Transform a raw database row into a NormalizedGallery
   */
  private transformRow(row: any): NormalizedGallery {
    // Parse URLs JSON if present
    let urls: string[] = [];
    if (row.urls) {
      try {
        urls = JSON.parse(row.urls);
      } catch {
        urls = [];
      }
    }

    const gallery: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
      title: row.title || getGalleryFallbackTitle(row.folderPath, row.fileBasename),
      date: row.date || null,
      code: row.code || null,
      details: row.details || null,
      photographer: row.photographer || null,
      url: row.url || null,
      urls,

      // Counts
      image_count: row.imageCount || 0,

      // File paths
      folder: row.folderPath ? { path: row.folderPath } : null,

      // Cover path - transform to proxy URL with instanceId for multi-instance routing
      cover: this.transformUrl(row.coverPath, row.stashInstanceId),

      // Cover dimensions (from StashImage via coverImageId)
      coverWidth: row.coverWidth || null,
      coverHeight: row.coverHeight || null,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),

      // Relations - populated separately
      studio: row.studioId ? { id: row.studioId, name: "" } : null,
      performers: [],
      tags: [],
      scenes: [],
    };

    return gallery as NormalizedGallery;
  }

  /**
   * Populate gallery relations (performers, tags, studio)
   */
  async populateRelations(galleries: NormalizedGallery[]): Promise<void> {
    if (galleries.length === 0) return;

    // Build gallery keys with instanceId for multi-instance support
    const galleryIds = galleries.map((g) => g.id);
    const galleryInstanceIds = [...new Set(galleries.map((g) => (g as any).instanceId))];

    // Collect unique (studioId, instanceId) pairs - each gallery's studio comes from its own instance
    const studioKeys = [...new Map(
      galleries
        .filter((g) => g.studio?.id)
        .map((g) => [`${g.studio!.id}:${(g as any).instanceId}`, { id: g.studio!.id, instanceId: (g as any).instanceId }])
    ).values()];

    // Batch load all relations in parallel
    // Filter by both galleryId AND galleryInstanceId for multi-instance correctness
    const [performerJunctions, tagJunctions] = await Promise.all([
      prisma.galleryPerformer.findMany({
        where: {
          galleryId: { in: galleryIds },
          galleryInstanceId: { in: galleryInstanceIds },
        },
      }),
      prisma.galleryTag.findMany({
        where: {
          galleryId: { in: galleryIds },
          galleryInstanceId: { in: galleryInstanceIds },
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

    // Build OR conditions for entity queries (need to match on composite keys)
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const tagOrConditions = tagKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));

    // Load actual entities (only those that exist) using composite key lookups
    const [performers, tags, studios] = await Promise.all([
      performerOrConditions.length > 0
        ? prisma.stashPerformer.findMany({
            where: { OR: performerOrConditions },
          })
        : Promise.resolve([]),
      tagOrConditions.length > 0
        ? prisma.stashTag.findMany({
            where: { OR: tagOrConditions },
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
      performersByKey.set(key, {
        id: performer.id,
        instanceId: performer.stashInstanceId,
        name: performer.name,
        image_path: this.transformUrl(performer.imagePath, performer.stashInstanceId),
        gender: performer.gender,
      });
    }

    const tagsByKey = new Map<string, any>();
    for (const tag of tags) {
      const key = `${tag.id}:${tag.stashInstanceId}`;
      tagsByKey.set(key, {
        id: tag.id,
        instanceId: tag.stashInstanceId,
        name: tag.name,
        image_path: this.transformUrl(tag.imagePath, tag.stashInstanceId),
      });
    }

    const studiosByKey = new Map<string, any>();
    for (const studio of studios) {
      const key = `${studio.id}:${studio.stashInstanceId}`;
      studiosByKey.set(key, {
        id: studio.id,
        instanceId: studio.stashInstanceId,
        name: studio.name,
        image_path: this.transformUrl(studio.imagePath, studio.stashInstanceId),
      });
    }

    // Build gallery-to-entities maps using junction tables with composite keys
    // Key format: galleryId:galleryInstanceId -> entities[]
    const performersByGallery = new Map<string, any[]>();
    for (const junction of performerJunctions) {
      const performerKey = `${junction.performerId}:${junction.performerInstanceId}`;
      const performer = performersByKey.get(performerKey);
      if (!performer) continue; // Skip orphaned junction records
      const galleryKey = `${junction.galleryId}:${junction.galleryInstanceId}`;
      const list = performersByGallery.get(galleryKey) || [];
      list.push(performer);
      performersByGallery.set(galleryKey, list);
    }

    const tagsByGallery = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tagKey = `${junction.tagId}:${junction.tagInstanceId}`;
      const tag = tagsByKey.get(tagKey);
      if (!tag) continue; // Skip orphaned junction records
      const galleryKey = `${junction.galleryId}:${junction.galleryInstanceId}`;
      const list = tagsByGallery.get(galleryKey) || [];
      list.push(tag);
      tagsByGallery.set(galleryKey, list);
    }

    // Populate galleries using composite keys
    for (const gallery of galleries) {
      const galleryKey = `${gallery.id}:${(gallery as any).instanceId}`;
      gallery.performers = performersByGallery.get(galleryKey) || [];
      gallery.tags = tagsByGallery.get(galleryKey) || [];

      // Hydrate studio with full data using composite key
      if (gallery.studio?.id) {
        const studioKey = `${gallery.studio.id}:${(gallery as any).instanceId}`;
        const fullStudio = studiosByKey.get(studioKey);
        if (fullStudio) {
          gallery.studio = fullStudio;
        }
      }
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
export const galleryQueryBuilder = new GalleryQueryBuilder();
