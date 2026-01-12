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

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

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
    g.id, g.title, g.date, g.studioId, g.rating100 AS stashRating100,
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
        LEFT JOIN GalleryRating r ON g.id = r.galleryId AND r.userId = ?
        LEFT JOIN StashImage ci ON g.coverImageId = ci.id
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
            WHERE sg.sceneId IN (${placeholders})
          )`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT sg.galleryId FROM SceneGallery sg
            WHERE sg.sceneId IN (${placeholders})
            GROUP BY sg.galleryId
            HAVING COUNT(DISTINCT sg.sceneId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (
            SELECT sg.galleryId FROM SceneGallery sg
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
          sql: `g.id IN (SELECT galleryId FROM GalleryPerformer WHERE performerId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT galleryId FROM GalleryPerformer
            WHERE performerId IN (${placeholders})
            GROUP BY galleryId
            HAVING COUNT(DISTINCT performerId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (SELECT galleryId FROM GalleryPerformer WHERE performerId IN (${placeholders}))`,
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
          sql: `g.id IN (SELECT galleryId FROM GalleryTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      case "INCLUDES_ALL":
        return {
          sql: `g.id IN (
            SELECT galleryId FROM GalleryTag
            WHERE tagId IN (${placeholders})
            GROUP BY galleryId
            HAVING COUNT(DISTINCT tagId) = ?
          )`,
          params: [...ids, ids.length],
        };

      case "EXCLUDES":
        return {
          sql: `g.id NOT IN (SELECT galleryId FROM GalleryTag WHERE tagId IN (${placeholders}))`,
          params: ids,
        };

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build numeric filter clause (for rating100, image_count)
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
   * Build text filter clause (for title, details)
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
  private buildSortClause(sort: string, direction: "ASC" | "DESC"): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";

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

      // Random
      random: `RANDOM() ${dir}`,
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
      const ratingFilter = this.buildNumericFilter(filters.rating100, "r.rating", 0);
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // Image count filter
    if (filters?.image_count) {
      const imageCountFilter = this.buildNumericFilter(filters.image_count, "g.imageCount", 0);
      if (imageCountFilter.sql) {
        whereClauses.push(imageCountFilter);
      }
    }

    // Title filter
    if (filters?.title) {
      const titleFilter = this.buildTextFilter(filters.title, "g.title");
      if (titleFilter.sql) {
        whereClauses.push(titleFilter);
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

      // Cover path - transform to proxy URL
      cover: this.transformUrl(row.coverPath),

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

    const galleryIds = galleries.map((g) => g.id);

    // Load performer junctions
    const performerJunctions = await prisma.galleryPerformer.findMany({
      where: { galleryId: { in: galleryIds } },
    });

    // Load tag junctions
    const tagJunctions = await prisma.galleryTag.findMany({
      where: { galleryId: { in: galleryIds } },
    });

    // Get unique IDs
    const performerIds = [...new Set(performerJunctions.map((j) => j.performerId))];
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const studioIds = [...new Set(galleries.map((g) => g.studio?.id).filter((id): id is string => !!id))];

    // Load entities
    const [performers, tags, studios] = await Promise.all([
      performerIds.length > 0
        ? prisma.stashPerformer.findMany({
            where: { id: { in: performerIds } },
          })
        : [],
      tagIds.length > 0
        ? prisma.stashTag.findMany({
            where: { id: { in: tagIds } },
          })
        : [],
      studioIds.length > 0
        ? prisma.stashStudio.findMany({
            where: { id: { in: studioIds } },
          })
        : [],
    ]);

    // Build lookup maps
    const performersById = new Map<string, any>();
    for (const performer of performers) {
      performersById.set(performer.id, {
        id: performer.id,
        name: performer.name,
        image_path: this.transformUrl(performer.imagePath),
        gender: performer.gender,
      });
    }

    const tagsById = new Map<string, any>();
    for (const tag of tags) {
      tagsById.set(tag.id, {
        id: tag.id,
        name: tag.name,
        image_path: this.transformUrl(tag.imagePath),
      });
    }

    const studiosById = new Map<string, any>();
    for (const studio of studios) {
      studiosById.set(studio.id, {
        id: studio.id,
        name: studio.name,
        image_path: this.transformUrl(studio.imagePath),
      });
    }

    // Build gallery-to-entities maps
    const performersByGallery = new Map<string, any[]>();
    for (const junction of performerJunctions) {
      const performer = performersById.get(junction.performerId);
      if (!performer) continue;
      const list = performersByGallery.get(junction.galleryId) || [];
      list.push(performer);
      performersByGallery.set(junction.galleryId, list);
    }

    const tagsByGallery = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByGallery.get(junction.galleryId) || [];
      list.push(tag);
      tagsByGallery.set(junction.galleryId, list);
    }

    // Populate galleries
    for (const gallery of galleries) {
      gallery.performers = performersByGallery.get(gallery.id) || [];
      gallery.tags = tagsByGallery.get(gallery.id) || [];

      // Hydrate studio with full data
      if (gallery.studio?.id) {
        const fullStudio = studiosById.get(gallery.studio.id);
        if (fullStudio) {
          gallery.studio = fullStudio;
        }
      }
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
export const galleryQueryBuilder = new GalleryQueryBuilder();
