/**
 * ImageQueryBuilder - SQL-native image querying
 *
 * Builds parameterized SQL queries for image filtering, sorting, and pagination.
 * Eliminates the need to load all images into memory.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { getImageFallbackTitle } from "../utils/titleUtils.js";
import { buildFavoriteFilter, buildDateFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";
import type { NormalizedImage, PerformerRef, TagRef, GalleryRef } from "../types/index.js";

// Query builder options
export interface ImageQueryOptions {
  userId: number;
  filters?: ImageFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  allowedInstanceIds?: string[]; // Multi-instance support
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}

// Image filter type
export interface ImageFilter {
  ids?: { value: string[]; modifier?: string };
  favorite?: boolean;
  rating100?: { value: number; value2?: number; modifier: string };
  o_counter?: { value: number; value2?: number; modifier: string };
  performers?: { value: string[]; modifier?: string };
  tags?: { value: string[]; modifier?: string; depth?: number };
  studios?: { value: string[]; modifier?: string; depth?: number };
  galleries?: { value: string[]; modifier?: string };
  q?: string; // Search query
  // Date filters
  date?: { value?: string; value2?: string; modifier?: string };
  created_at?: { value?: string; value2?: string; modifier?: string };
  updated_at?: { value?: string; value2?: string; modifier?: string };
}

// Query result
export interface ImageQueryResult {
  images: NormalizedImage[];
  total: number;
}

/**
 * Builds and executes SQL queries for image filtering
 */
class ImageQueryBuilder {
  // Column list for SELECT - all StashImage fields plus user data
  private readonly SELECT_COLUMNS = `
    i.id, i.stashInstanceId, i.title, i.code, i.details, i.photographer, i.urls, i.date,
    i.studioId, i.rating100 AS stashRating100, i.oCounter AS stashOCounter,
    i.organized, i.filePath, i.width, i.height, i.fileSize,
    i.pathThumbnail, i.pathPreview, i.pathImage,
    i.stashCreatedAt, i.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    v.viewCount AS userViewCount, v.oCount AS userOCount,
    v.lastViewedAt AS userLastViewedAt
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashImage i
        LEFT JOIN ImageRating r ON i.id = r.imageId AND i.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN ImageViewHistory v ON i.id = v.imageId AND i.stashInstanceId = v.instanceId AND v.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'image' AND e.entityId = i.id AND (e.instanceId = '' OR e.instanceId = i.stashInstanceId)`,
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
        sql: "i.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "i.deletedAt IS NULL",
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
      sql: `(i.stashInstanceId IN (${placeholders}) OR i.stashInstanceId IS NULL)`,
      params: allowedInstanceIds,
    };
  }

  // Build rating filter
  private buildRatingFilter(
    filter: { value: number; value2?: number; modifier: string } | undefined
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier } = filter;
    const ratingExpr = "COALESCE(r.rating, i.rating100, 0)";

    switch (modifier) {
      case "GREATER_THAN":
        return { sql: `${ratingExpr} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${ratingExpr} < ?`, params: [value] };
      case "EQUALS":
        return { sql: `${ratingExpr} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${ratingExpr} != ?`, params: [value] };
      case "BETWEEN":
        return { sql: `${ratingExpr} BETWEEN ? AND ?`, params: [value, value2 ?? value] };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build o_counter filter
  private buildOCounterFilter(
    filter: { value: number; value2?: number; modifier: string } | undefined
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const { value, value2, modifier } = filter;
    const oExpr = "COALESCE(v.oCount, i.oCounter, 0)";

    switch (modifier) {
      case "GREATER_THAN":
        return { sql: `${oExpr} > ?`, params: [value] };
      case "LESS_THAN":
        return { sql: `${oExpr} < ?`, params: [value] };
      case "EQUALS":
        return { sql: `${oExpr} = ?`, params: [value] };
      case "NOT_EQUALS":
        return { sql: `${oExpr} != ?`, params: [value] };
      case "BETWEEN":
        return { sql: `${oExpr} BETWEEN ? AND ?`, params: [value, value2 ?? value] };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build performer filter
  private buildPerformerFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `EXISTS (SELECT 1 FROM ImagePerformer ip WHERE ip.imageId = i.id AND ip.imageInstanceId = i.stashInstanceId AND ip.performerId IN (${placeholders}))`,
          params: ids,
        };
      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT ip.performerId) FROM ImagePerformer ip WHERE ip.imageId = i.id AND ip.imageInstanceId = i.stashInstanceId AND ip.performerId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };
      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM ImagePerformer ip WHERE ip.imageId = i.id AND ip.imageInstanceId = i.stashInstanceId AND ip.performerId IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build tag filter
  private buildTagFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `EXISTS (SELECT 1 FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId AND it.tagId IN (${placeholders}))`,
          params: ids,
        };
      case "INCLUDES_ALL":
        return {
          sql: `(SELECT COUNT(DISTINCT it.tagId) FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId AND it.tagId IN (${placeholders})) = ?`,
          params: [...ids, ids.length],
        };
      case "EXCLUDES":
        return {
          sql: `NOT EXISTS (SELECT 1 FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId AND it.tagId IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build studio filter
  private buildStudioFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.studioId IN (${placeholders})`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `(i.studioId IS NULL OR i.studioId NOT IN (${placeholders}))`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build gallery filter
  private buildGalleryFilter(
    filter: { value?: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.id IN (SELECT imageId FROM ImageGallery WHERE galleryId IN (${placeholders}) AND imageInstanceId = i.stashInstanceId)`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (SELECT imageId FROM ImageGallery WHERE galleryId IN (${placeholders}) AND imageInstanceId = i.stashInstanceId)`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build search query filter
  private buildSearchFilter(q: string | undefined): FilterClause {
    if (!q || q.trim() === "") {
      return { sql: "", params: [] };
    }

    const searchTerm = `%${q.trim()}%`;
    return {
      sql: `(
        i.title LIKE ? OR
        i.details LIKE ? OR
        i.photographer LIKE ? OR
        i.filePath LIKE ?
      )`,
      params: [searchTerm, searchTerm, searchTerm, searchTerm],
    };
  }

  // Build ID filter
  private buildIdFilter(
    filter: { value: string[]; modifier?: string } | undefined
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier = "INCLUDES" } = filter;
    const placeholders = ids.map(() => "?").join(", ");

    switch (modifier) {
      case "INCLUDES":
        return {
          sql: `i.id IN (${placeholders})`,
          params: ids,
        };
      case "EXCLUDES":
        return {
          sql: `i.id NOT IN (${placeholders})`,
          params: ids,
        };
      default:
        return { sql: "", params: [] };
    }
  }

  // Build sort clause
  private buildSortClause(
    sort: string,
    dir: "ASC" | "DESC",
    randomSeed?: number
  ): string {
    // Extract filename from path: '/images/My Image.jpg' -> 'My Image.jpg'
    // This matches the display logic in getImageFallbackTitle which uses basename
    const filenameExpr = `REPLACE(i.filePath, RTRIM(i.filePath, REPLACE(i.filePath, '/', '')), '')`;

    const sortMap: Record<string, string> = {
      title: `COALESCE(NULLIF(i.title, ''), ${filenameExpr}) COLLATE NOCASE ${dir}`,
      date: `i.date ${dir}`,
      rating: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      rating100: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      o_counter: `COALESCE(v.oCount, i.oCounter, 0) ${dir}`,
      filesize: `COALESCE(i.fileSize, 0) ${dir}`,
      path: `i.filePath ${dir}`,
      created_at: `i.stashCreatedAt ${dir}`,
      updated_at: `i.stashUpdatedAt ${dir}`,
      // Random with deterministic seed for stable pagination
      // Uses Stash's formula with modulo at each step to prevent SQLite integer overflow
      // Without intermediate modulo, large seeds cause overflow to float which breaks ordering
      random: `(((((i.id + ${randomSeed || 12345}) % 2147483647) * ((i.id + ${randomSeed || 12345}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((i.id + ${randomSeed || 12345}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];
    return `${sortExpr}, i.id ${dir}`;
  }

  /**
   * Hydrate image rows with related entities
   * Uses raw SQL to handle orphaned junction records gracefully
   */
  private async hydrateImages(rows: Record<string, unknown>[]): Promise<NormalizedImage[]> {
    if (rows.length === 0) return [];

    const imageIds = rows.map((r) => r.id as string);
    const imageIdPlaceholders = imageIds.map(() => "?").join(",");

    // Fetch all related data in parallel using raw SQL to handle orphaned records
    const [performers, tags, galleries, studios] = await Promise.all([
      // Performers - join with existence check
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
        SELECT ip.imageId, p.*
        FROM ImagePerformer ip
        INNER JOIN StashPerformer p ON p.id = ip.performerId AND p.stashInstanceId = ip.performerInstanceId
        WHERE ip.imageId IN (${imageIdPlaceholders}) AND p.deletedAt IS NULL
      `, ...imageIds),
      // Tags - join with existence check (handles orphaned ImageTag records)
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
        SELECT it.imageId, t.*
        FROM ImageTag it
        INNER JOIN StashTag t ON t.id = it.tagId AND t.stashInstanceId = it.tagInstanceId
        WHERE it.imageId IN (${imageIdPlaceholders}) AND t.deletedAt IS NULL
      `, ...imageIds),
      // Galleries - join with existence check
      prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
        SELECT ig.imageId, g.*
        FROM ImageGallery ig
        INNER JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE ig.imageId IN (${imageIdPlaceholders}) AND g.deletedAt IS NULL
      `, ...imageIds),
      prisma.stashStudio.findMany({
        where: { id: { in: rows.map((r) => r.studioId as string).filter(Boolean) } },
      }),
    ]);

    // Build lookup maps with transformed URLs including instanceId for multi-instance routing
    // Note: Frontend expects snake_case field names (image_path) and paths.cover for galleries
    const performersByImage = new Map<string, PerformerRef[]>();
    for (const row of performers) {
      const imageId = row.imageId as string;
      if (!performersByImage.has(imageId)) {
        performersByImage.set(imageId, []);
      }
      performersByImage.get(imageId)?.push({
        id: row.id as string,
        instanceId: row.stashInstanceId as string,
        name: row.name as string,
        disambiguation: row.disambiguation as string | null,
        gender: row.gender as string | null,
        favorite: row.favorite as boolean | null,
        rating100: row.rating100 as number | null,
        image_path: this.transformUrl(row.imagePath as string | null, row.stashInstanceId as string),
      });
    }

    const tagsByImage = new Map<string, TagRef[]>();
    for (const row of tags) {
      const imageId = row.imageId as string;
      if (!tagsByImage.has(imageId)) {
        tagsByImage.set(imageId, []);
      }
      tagsByImage.get(imageId)?.push({
        id: row.id as string,
        instanceId: row.stashInstanceId as string,
        name: row.name as string,
        favorite: row.favorite as boolean | null,
        image_path: this.transformUrl(row.imagePath as string | null, row.stashInstanceId as string),
      });
    }

    const galleriesByImage = new Map<string, GalleryRef[]>();
    for (const row of galleries) {
      const imageId = row.imageId as string;
      if (!galleriesByImage.has(imageId)) {
        galleriesByImage.set(imageId, []);
      }
      galleriesByImage.get(imageId)?.push({
        id: row.id as string,
        instanceId: row.stashInstanceId as string,
        title: row.title as string | null,
        cover: this.transformUrl(row.coverPath as string | null, row.stashInstanceId as string),
      });
    }

    const studiosById = new Map(
      studios.map((s) => [
        s.id,
        { ...s, image_path: this.transformUrl(s.imagePath, s.stashInstanceId) },
      ])
    );

    // Hydrate each row
    return rows.map((row) => ({
      ...row,
      performers: performersByImage.get(row.id as string) || [],
      tags: tagsByImage.get(row.id as string) || [],
      galleries: galleriesByImage.get(row.id as string) || [],
      studio: row.studioId ? studiosById.get(row.studioId as string) : null,
    })) as unknown as NormalizedImage[];
  }

  async execute(options: ImageQueryOptions): Promise<ImageQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, allowedInstanceIds, filters } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Instance filter (multi-instance support)
    const instanceFilter = this.buildInstanceFilter(allowedInstanceIds);
    if (instanceFilter.sql) {
      whereClauses.push(instanceFilter);
    }

    // Add user data filters
    if (filters?.favorite !== undefined) {
      const favoriteFilter = buildFavoriteFilter(filters.favorite);
      if (favoriteFilter.sql) whereClauses.push(favoriteFilter);
    }

    if (filters?.rating100) {
      const ratingFilter = this.buildRatingFilter(filters.rating100);
      if (ratingFilter.sql) whereClauses.push(ratingFilter);
    }

    if (filters?.o_counter) {
      const oCounterFilter = this.buildOCounterFilter(filters.o_counter);
      if (oCounterFilter.sql) whereClauses.push(oCounterFilter);
    }

    // Add entity filters
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers);
      if (performerFilter.sql) whereClauses.push(performerFilter);
    }

    if (filters?.tags) {
      const tagFilter = this.buildTagFilter(filters.tags);
      if (tagFilter.sql) whereClauses.push(tagFilter);
    }

    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios);
      if (studioFilter.sql) whereClauses.push(studioFilter);
    }

    if (filters?.galleries) {
      const galleryFilter = this.buildGalleryFilter(filters.galleries);
      if (galleryFilter.sql) whereClauses.push(galleryFilter);
    }

    // Add search filter
    if (filters?.q) {
      const searchFilter = this.buildSearchFilter(filters.q);
      if (searchFilter.sql) whereClauses.push(searchFilter);
    }

    // Add ID filter
    if (filters?.ids) {
      const idFilter = this.buildIdFilter(filters.ids);
      if (idFilter.sql) whereClauses.push(idFilter);
    }

    // Add date filters
    if (filters?.date) {
      const dateFilter = buildDateFilter(filters.date, "i.date");
      if (dateFilter.sql) whereClauses.push(dateFilter);
    }

    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(filters.created_at, "i.stashCreatedAt");
      if (createdAtFilter.sql) whereClauses.push(createdAtFilter);
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at, "i.stashUpdatedAt");
      if (updatedAtFilter.sql) whereClauses.push(updatedAtFilter);
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses
      .map((c) => c.sql)
      .filter(Boolean)
      .join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      options.randomSeed
    );

    // Calculate offset
    const offset = (page - 1) * perPage;

    // Build main query
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereParams, perPage, offset];

    logger.debug("ImageQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      paramCount: params.length,
    });

    // Execute query
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);

    // Convert BigInt fields to Number and transform URLs to proxy paths with instanceId
    const transformedRows = rows.map((row) => ({
      ...row,
      title: (row.title as string) || getImageFallbackTitle(row.filePath as string | null),
      fileSize: row.fileSize != null ? Number(row.fileSize) : null,
      pathThumbnail: this.transformUrl(row.pathThumbnail as string | null, row.stashInstanceId as string),
      pathPreview: this.transformUrl(row.pathPreview as string | null, row.stashInstanceId as string),
      pathImage: this.transformUrl(row.pathImage as string | null, row.stashInstanceId as string),
    }));

    // Hydrate with related entities
    const hydratedImages = await this.hydrateImages(transformedRows);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT i.id || ':' || i.stashInstanceId) as total
      ${fromClause.sql}
      WHERE ${whereSQL}
    `;
    const countParams = [...fromClause.params, ...whereParams];
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams
    );
    const total = Number(countResult[0]?.total || 0);

    const duration = Date.now() - startTime;
    logger.debug("ImageQueryBuilder.execute completed", {
      total,
      returned: hydratedImages.length,
      durationMs: duration,
    });

    return { images: hydratedImages, total };
  }

  /**
   * Get images by IDs with user data
   */
  async getByIds(options: { userId: number; ids: string[] }): Promise<ImageQueryResult> {
    const { userId, ids } = options;

    if (ids.length === 0) {
      return { images: [], total: 0 };
    }

    return this.execute({
      userId,
      filters: { ids: { value: ids, modifier: "INCLUDES" } },
      applyExclusions: false, // IDs explicitly requested, don't filter
      sort: "created_at",
      sortDirection: "DESC",
      page: 1,
      perPage: ids.length,
    });
  }

  /**
   * Transform a Stash URL/path to a proxy URL
   * @param urlOrPath - The URL or path to transform
   * @param instanceId - Optional Stash instance ID for multi-instance routing
   */
  private transformUrl(urlOrPath: string | null, instanceId?: string | null): string | null {
    if (!urlOrPath) return null;

    // If it's already a proxy URL, return as-is
    if (urlOrPath.startsWith("/api/proxy/stash")) {
      return urlOrPath;
    }

    // Build base proxy URL
    let proxyPath: string;

    // If it's a full URL (http://...), extract path + query
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      try {
        const url = new URL(urlOrPath);
        const pathWithQuery = url.pathname + url.search;
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
      } catch {
        // If URL parsing fails, treat as path
        proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
      }
    } else {
      // Otherwise treat as path and encode it
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }

    // Add instanceId for multi-instance routing
    if (instanceId) {
      proxyPath += `&instanceId=${encodeURIComponent(instanceId)}`;
    }

    return proxyPath;
  }
}

// Export singleton instance
export const imageQueryBuilder = new ImageQueryBuilder();
