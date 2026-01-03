/**
 * ImageQueryBuilder - SQL-native image querying
 *
 * Builds parameterized SQL queries for image filtering, sorting, and pagination.
 * Eliminates the need to load all images into memory.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface ImageQueryOptions {
  userId: number;
  filters?: ImageFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
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
}

// Query result
export interface ImageQueryResult {
  images: any[];
  total: number;
}

/**
 * Builds and executes SQL queries for image filtering
 */
class ImageQueryBuilder {
  // Column list for SELECT - all StashImage fields plus user data
  private readonly SELECT_COLUMNS = `
    i.id, i.title, i.code, i.details, i.photographer, i.urls, i.date,
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
        LEFT JOIN ImageRating r ON i.id = r.imageId AND r.userId = ?
        LEFT JOIN ImageViewHistory v ON i.id = v.imageId AND v.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'image' AND e.entityId = i.id`,
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

  // Build sort clause
  private buildSortClause(sort: string, dir: "ASC" | "DESC"): string {
    const sortMap: Record<string, string> = {
      title: `COALESCE(i.title, i.filePath) ${dir}`,
      date: `i.date ${dir}`,
      rating: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      rating100: `COALESCE(r.rating, i.rating100, 0) ${dir}`,
      o_counter: `COALESCE(v.oCount, i.oCounter, 0) ${dir}`,
      filesize: `COALESCE(i.fileSize, 0) ${dir}`,
      path: `i.filePath ${dir}`,
      created_at: `i.stashCreatedAt ${dir}`,
      updated_at: `i.stashUpdatedAt ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["created_at"];
    return `${sortExpr}, i.id ${dir}`;
  }

  async execute(options: ImageQueryOptions): Promise<ImageQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters: _filters } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Combine WHERE clauses
    const whereSQL = whereClauses
      .map((c) => c.sql)
      .filter(Boolean)
      .join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection
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
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT i.id) as total
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
      returned: rows.length,
      durationMs: duration,
    });

    return { images: rows, total };
  }
}

// Export singleton instance
export const imageQueryBuilder = new ImageQueryBuilder();
