/**
 * SceneQueryBuilder - SQL-native scene querying
 *
 * Builds parameterized SQL queries for scene filtering, sorting, and pagination.
 * Eliminates the need to load all scenes into memory.
 */
import type { PeekSceneFilter, NormalizedScene } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface SceneQueryOptions {
  userId: number;
  filters?: PeekSceneFilter;
  excludedSceneIds?: Set<string>;
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  randomSeed?: number;
}

// Query result
export interface SceneQueryResult {
  scenes: NormalizedScene[];
  total: number;
}

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder {
  // Column list for SELECT - all CachedScene fields plus user data
  private readonly SELECT_COLUMNS = `
    s.id, s.title, s.code, s.date, s.studioId, s.rating100 AS stashRating100,
    s.duration, s.organized, s.details, s.filePath, s.fileBitRate,
    s.fileFrameRate, s.fileWidth, s.fileHeight, s.fileVideoCodec,
    s.fileAudioCodec, s.fileSize, s.pathScreenshot, s.pathPreview,
    s.pathSprite, s.pathVtt, s.pathChaptersVtt, s.pathStream, s.pathCaption,
    s.oCounter AS stashOCounter, s.playCount AS stashPlayCount,
    s.playDuration AS stashPlayDuration, s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    w.playCount AS userPlayCount, w.playDuration AS userPlayDuration,
    w.lastPlayedAt AS userLastPlayedAt, w.oCount AS userOCount,
    w.resumeTime AS userResumeTime, w.oHistory AS userOHistory,
    w.playHistory AS userPlayHistory
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(userId: number): { sql: string; params: number[] } {
    return {
      sql: `
        FROM CachedScene s
        LEFT JOIN SceneRating r ON s.id = r.sceneId AND r.userId = ?
        LEFT JOIN WatchHistory w ON s.id = w.sceneId AND w.userId = ?
      `.trim(),
      params: [userId, userId],
    };
  }

  // Base WHERE clause (always filter deleted)
  private buildBaseWhere(): FilterClause {
    return {
      sql: "s.deletedAt IS NULL",
      params: [],
    };
  }

  /**
   * Build exclusion filter clause
   * Excludes scenes by ID (from user restrictions)
   */
  private buildExclusionFilter(excludedIds: Set<string>): FilterClause {
    if (!excludedIds || excludedIds.size === 0) {
      return { sql: "", params: [] };
    }

    // For large exclusion sets, use a subquery approach
    // SQLite handles IN clauses well up to ~1000 items
    const ids = Array.from(excludedIds);

    if (ids.length <= 500) {
      // Direct IN clause for smaller sets
      const placeholders = ids.map(() => "?").join(", ");
      return {
        sql: `s.id NOT IN (${placeholders})`,
        params: ids,
      };
    }

    // For larger sets, we'll need to use a different approach
    // This is a pragmatic limit - if you have >500 exclusions,
    // consider pre-computing a materialized view
    const placeholders = ids.slice(0, 500).map(() => "?").join(", ");
    logger.warn("Exclusion set truncated to 500 items", {
      originalSize: ids.length,
    });
    return {
      sql: `s.id NOT IN (${placeholders})`,
      params: ids.slice(0, 500),
    };
  }

  async execute(options: SceneQueryOptions): Promise<SceneQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, excludedSceneIds } = options;

    // Build FROM clause
    const fromClause = this.buildFromClause(userId);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere()];

    // Add exclusion filter
    const exclusionFilter = this.buildExclusionFilter(excludedSceneIds || new Set());
    if (exclusionFilter.sql) {
      whereClauses.push(exclusionFilter);
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses.map((c) => c.sql).filter(Boolean).join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build full query
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY s.stashCreatedAt DESC
      LIMIT ? OFFSET ?
    `;

    const params = [...fromClause.params, ...whereParams, perPage, offset];

    logger.info("SceneQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      excludedCount: excludedSceneIds?.size || 0,
      paramCount: params.length,
    });

    // Execute query
    const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...params);

    // Count query
    const countSql = `
      SELECT COUNT(DISTINCT s.id) as total
      ${fromClause.sql}
      WHERE ${whereSQL}
    `;
    const countParams = [...fromClause.params, ...whereParams];
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      countSql,
      ...countParams
    );
    const total = Number(countResult[0]?.total || 0);

    const scenes = rows.map((row) => this.transformRow(row));

    logger.info("SceneQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      resultCount: scenes.length,
      total,
    });

    return { scenes, total };
  }

  /**
   * Transform a raw database row into a NormalizedScene
   */
  private transformRow(row: any): NormalizedScene {
    // Parse JSON fields
    const oHistory = this.parseJsonArray(row.userOHistory);
    const playHistory = this.parseJsonArray(row.userPlayHistory);

    // Determine last_o_at from o_history
    const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

    return {
      id: row.id,
      title: row.title || null,
      code: row.code || null,
      date: row.date || null,
      details: row.details || null,
      organized: row.organized === 1,
      created_at: row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt || null,

      // User data - prefer Peek user data over Stash data
      rating: row.userRating != null ? Math.round(row.userRating / 20) : null,
      rating100: row.userRating ?? null,
      favorite: row.userFavorite === 1,
      o_counter: row.userOCount ?? row.stashOCounter ?? 0,
      play_count: row.userPlayCount ?? row.stashPlayCount ?? 0,
      play_duration: row.userPlayDuration ?? row.stashPlayDuration ?? 0,
      resume_time: row.userResumeTime ?? 0,
      play_history: playHistory,
      o_history: oHistory.map((ts: string) => new Date(ts)),
      last_played_at: row.userLastPlayedAt || null,
      last_o_at: lastOAt,

      // File data - build from individual columns
      files: row.filePath ? [{
        path: row.filePath,
        duration: row.duration,
        bit_rate: row.fileBitRate,
        frame_rate: row.fileFrameRate,
        width: row.fileWidth,
        height: row.fileHeight,
        video_codec: row.fileVideoCodec,
        audio_codec: row.fileAudioCodec,
        size: row.fileSize ? Number(row.fileSize) : null,
      }] : [],

      // Paths
      paths: {
        screenshot: row.pathScreenshot || null,
        preview: row.pathPreview || null,
        stream: row.pathStream || null,
        sprite: row.pathSprite || null,
        vtt: row.pathVtt || null,
        caption: row.pathCaption || null,
      },

      // Empty sceneStreams - generated on demand
      sceneStreams: [],

      // Relations - populated separately after query
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
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
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
