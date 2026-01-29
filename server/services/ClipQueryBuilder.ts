/**
 * ClipQueryBuilder - SQL-native clip querying
 *
 * Builds parameterized SQL queries for clip filtering, sorting, and pagination.
 * Uses JOIN-based exclusions to avoid SQLite parameter limits (P2029 error).
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

// Filter clause builder result
interface FilterClause {
  sql: string;
  params: (string | number | boolean)[];
}

// Query builder options
export interface ClipQueryOptions {
  userId: number;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  isGenerated?: boolean;
  sceneId?: string;
  tagIds?: string[];
  sceneTagIds?: string[];
  performerIds?: string[];
  studioId?: string;
  q?: string;
  allowedInstanceIds?: string[];
  randomSeed?: number; // Seed for consistent random ordering
}

// Clip with relations (matches ClipService interface)
export interface ClipWithRelations {
  id: string;
  sceneId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  isGenerated: boolean;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;
  primaryTag: { id: string; name: string; color: string | null } | null;
  tags: Array<{ id: string; name: string; color: string | null }>;
  scene: {
    id: string;
    title: string | null;
    pathScreenshot: string | null;
    studioId: string | null;
    stashInstanceId: string | null;
  };
}

// Raw query result row
interface ClipRow {
  id: string;
  stashInstanceId: string;
  sceneId: string;
  sceneInstanceId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  primaryTagInstanceId: string | null;
  isGenerated: number; // SQLite returns 0/1
  stashCreatedAt: string | null;
  stashUpdatedAt: string | null;
  // Scene fields
  sceneTitle: string | null;
  scenePathScreenshot: string | null;
  sceneStudioId: string | null;
  // Primary tag fields
  primaryTagName: string | null;
  primaryTagColor: string | null;
}

/**
 * Builds and executes SQL queries for clip filtering
 */
class ClipQueryBuilder {
  private readonly SELECT_COLUMNS = `
    c.id, c.stashInstanceId, c.sceneId, c.sceneInstanceId,
    c.title, c.seconds, c.endSeconds,
    c.primaryTagId, c.primaryTagInstanceId,
    c.isGenerated, c.stashCreatedAt, c.stashUpdatedAt,
    s.title AS sceneTitle, s.pathScreenshot AS scenePathScreenshot,
    s.studioId AS sceneStudioId,
    pt.name AS primaryTagName, pt.color AS primaryTagColor
  `.trim();

  /**
   * Build FROM clause with exclusion JOIN
   */
  private buildFromClause(userId: number): { sql: string; params: number[] } {
    return {
      sql: `
        FROM StashClip c
        INNER JOIN StashScene s ON c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId
        LEFT JOIN StashTag pt ON c.primaryTagId = pt.id AND c.primaryTagInstanceId = pt.stashInstanceId
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = c.sceneId
      `.trim(),
      params: [userId],
    };
  }

  /**
   * Build base WHERE clause (always filter deleted and excluded)
   */
  private buildBaseWhere(): FilterClause {
    return {
      sql: "c.deletedAt IS NULL AND s.deletedAt IS NULL AND e.id IS NULL",
      params: [],
    };
  }

  /**
   * Build instance filter clause
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      return { sql: "", params: [] };
    }

    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(c.stashInstanceId IN (${placeholders}) OR c.stashInstanceId IS NULL)`,
      params: allowedInstanceIds,
    };
  }

  /**
   * Build isGenerated filter
   */
  private buildGeneratedFilter(isGenerated: boolean | undefined): FilterClause {
    if (isGenerated === undefined) {
      return { sql: "", params: [] };
    }
    return {
      sql: "c.isGenerated = ?",
      params: [isGenerated ? 1 : 0],
    };
  }

  /**
   * Build scene ID filter
   */
  private buildSceneIdFilter(sceneId: string | undefined): FilterClause {
    if (!sceneId) {
      return { sql: "", params: [] };
    }
    return {
      sql: "c.sceneId = ?",
      params: [sceneId],
    };
  }

  /**
   * Build text search filter
   */
  private buildSearchFilter(q: string | undefined): FilterClause {
    if (!q) {
      return { sql: "", params: [] };
    }
    return {
      sql: "c.title LIKE ?",
      params: [`%${q}%`],
    };
  }

  /**
   * Build clip tag filter (matches clips with ANY of these tags on the clip itself)
   */
  private buildTagFilter(tagIds: string[] | undefined): FilterClause {
    if (!tagIds || tagIds.length === 0) {
      return { sql: "", params: [] };
    }

    const placeholders = tagIds.map(() => "?").join(", ");
    return {
      sql: `(c.primaryTagId IN (${placeholders}) OR EXISTS (
        SELECT 1 FROM ClipTag ct WHERE ct.clipId = c.id AND ct.clipInstanceId = c.stashInstanceId AND ct.tagId IN (${placeholders})
      ))`,
      params: [...tagIds, ...tagIds],
    };
  }

  /**
   * Build scene tag filter (matches clips from scenes with ANY of these tags)
   */
  private buildSceneTagFilter(sceneTagIds: string[] | undefined): FilterClause {
    if (!sceneTagIds || sceneTagIds.length === 0) {
      return { sql: "", params: [] };
    }

    const placeholders = sceneTagIds.map(() => "?").join(", ");
    return {
      sql: `EXISTS (
        SELECT 1 FROM SceneTag st
        WHERE st.sceneId = c.sceneId AND st.sceneInstanceId = c.sceneInstanceId
        AND st.tagId IN (${placeholders})
      )`,
      params: sceneTagIds,
    };
  }

  /**
   * Build performer filter (matches clips from scenes with ANY of these performers)
   */
  private buildPerformerFilter(performerIds: string[] | undefined): FilterClause {
    if (!performerIds || performerIds.length === 0) {
      return { sql: "", params: [] };
    }

    const placeholders = performerIds.map(() => "?").join(", ");
    return {
      sql: `EXISTS (
        SELECT 1 FROM ScenePerformer sp
        WHERE sp.sceneId = c.sceneId AND sp.sceneInstanceId = c.sceneInstanceId
        AND sp.performerId IN (${placeholders})
      )`,
      params: performerIds,
    };
  }

  /**
   * Build studio filter
   */
  private buildStudioFilter(studioId: string | undefined): FilterClause {
    if (!studioId) {
      return { sql: "", params: [] };
    }
    return {
      sql: "s.studioId = ?",
      params: [studioId],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderBy(sortBy: string, sortDir: "asc" | "desc", randomSeed?: number): string {
    const direction = sortDir.toUpperCase();
    const seed = randomSeed || 12345;

    const validColumns: Record<string, string> = {
      stashCreatedAt: "c.stashCreatedAt",
      stashUpdatedAt: "c.stashUpdatedAt",
      title: "c.title",
      seconds: "c.seconds",
      sceneTitle: "s.title",
      duration: "(c.endSeconds - c.seconds)",
      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((c.id + ${seed}) % 2147483647) * ((c.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((c.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647)`,
    };

    const column = validColumns[sortBy] || "c.stashCreatedAt";

    return `ORDER BY ${column} ${direction}`;
  }

  /**
   * Combine filter clauses
   */
  private combineFilters(filters: FilterClause[]): FilterClause {
    const validFilters = filters.filter((f) => f.sql.length > 0);
    if (validFilters.length === 0) {
      return { sql: "", params: [] };
    }

    return {
      sql: validFilters.map((f) => `(${f.sql})`).join(" AND "),
      params: validFilters.flatMap((f) => f.params),
    };
  }

  /**
   * Fetch tags for clips
   */
  private async fetchClipTags(clipIds: Array<{ id: string; instanceId: string }>): Promise<Map<string, Array<{ id: string; name: string; color: string | null }>>> {
    if (clipIds.length === 0) {
      return new Map();
    }

    // Build query to get all tags for these clips
    const conditions = clipIds.map(() => "(ct.clipId = ? AND ct.clipInstanceId = ?)").join(" OR ");
    const params = clipIds.flatMap((c) => [c.id, c.instanceId]);

    const tags = await prisma.$queryRawUnsafe<Array<{
      clipId: string;
      clipInstanceId: string;
      tagId: string;
      tagName: string;
      tagColor: string | null;
    }>>(
      `SELECT ct.clipId, ct.clipInstanceId, t.id AS tagId, t.name AS tagName, t.color AS tagColor
       FROM ClipTag ct
       INNER JOIN StashTag t ON ct.tagId = t.id AND ct.tagInstanceId = t.stashInstanceId
       WHERE ${conditions}`,
      ...params
    );

    const tagMap = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    for (const tag of tags) {
      const key = `${tag.clipId}:${tag.clipInstanceId}`;
      if (!tagMap.has(key)) {
        tagMap.set(key, []);
      }
      tagMap.get(key)!.push({
        id: tag.tagId,
        name: tag.tagName,
        color: tag.tagColor,
      });
    }

    return tagMap;
  }

  /**
   * Transform raw rows to ClipWithRelations
   */
  private transformRows(
    rows: ClipRow[],
    tagMap: Map<string, Array<{ id: string; name: string; color: string | null }>>
  ): ClipWithRelations[] {
    return rows.map((row) => {
      const key = `${row.id}:${row.stashInstanceId}`;
      return {
        id: row.id,
        sceneId: row.sceneId,
        title: row.title,
        seconds: row.seconds,
        endSeconds: row.endSeconds,
        primaryTagId: row.primaryTagId,
        // SQLite via Prisma raw queries may return number or string for boolean columns
        isGenerated: Number(row.isGenerated) === 1,
        stashCreatedAt: row.stashCreatedAt ? new Date(row.stashCreatedAt) : null,
        stashUpdatedAt: row.stashUpdatedAt ? new Date(row.stashUpdatedAt) : null,
        primaryTag: row.primaryTagId
          ? { id: row.primaryTagId, name: row.primaryTagName || "", color: row.primaryTagColor }
          : null,
        tags: tagMap.get(key) || [],
        scene: {
          id: row.sceneId,
          title: row.sceneTitle,
          pathScreenshot: row.scenePathScreenshot,
          studioId: row.sceneStudioId,
          stashInstanceId: row.sceneInstanceId,
        },
      };
    });
  }

  /**
   * Execute query and return clips with pagination
   */
  async getClips(options: ClipQueryOptions): Promise<{ clips: ClipWithRelations[]; total: number }> {
    const {
      userId,
      page = 1,
      perPage = 24,
      sortBy = "stashCreatedAt",
      sortDir = "desc",
      isGenerated,
      sceneId,
      tagIds,
      sceneTagIds,
      performerIds,
      studioId,
      q,
      allowedInstanceIds,
      randomSeed,
    } = options;

    // Build query components
    const fromClause = this.buildFromClause(userId);
    const baseWhere = this.buildBaseWhere();

    const filters = this.combineFilters([
      baseWhere,
      this.buildInstanceFilter(allowedInstanceIds),
      this.buildGeneratedFilter(isGenerated),
      this.buildSceneIdFilter(sceneId),
      this.buildSearchFilter(q),
      this.buildTagFilter(tagIds),
      this.buildSceneTagFilter(sceneTagIds),
      this.buildPerformerFilter(performerIds),
      this.buildStudioFilter(studioId),
    ]);

    const whereClause = filters.sql ? `WHERE ${filters.sql}` : "";
    const orderBy = this.buildOrderBy(sortBy, sortDir, randomSeed);
    const offset = (page - 1) * perPage;

    // Build full queries
    const dataQuery = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      ${fromClause.sql}
      ${whereClause}
    `;

    const queryParams = [...fromClause.params, ...filters.params];

    try {
      // Execute queries in parallel
      const [rows, countResult] = await Promise.all([
        prisma.$queryRawUnsafe<ClipRow[]>(dataQuery, ...queryParams, perPage, offset),
        prisma.$queryRawUnsafe<[{ total: bigint }]>(countQuery, ...queryParams),
      ]);

      // Fetch tags for all clips
      const clipIds = rows.map((r) => ({ id: r.id, instanceId: r.stashInstanceId }));
      const tagMap = await this.fetchClipTags(clipIds);

      return {
        clips: this.transformRows(rows, tagMap),
        total: Number(countResult[0]?.total || 0),
      };
    } catch (error) {
      logger.error("ClipQueryBuilder.getClips failed", { error, options });
      throw error;
    }
  }

  /**
   * Get clips for a specific scene (simpler query, no pagination)
   */
  async getClipsForScene(
    sceneId: string,
    userId: number,
    includeUngenerated = false,
    allowedInstanceIds?: string[]
  ): Promise<ClipWithRelations[]> {
    const fromClause = this.buildFromClause(userId);
    const baseWhere = this.buildBaseWhere();

    const filters = this.combineFilters([
      baseWhere,
      this.buildInstanceFilter(allowedInstanceIds),
      { sql: "c.sceneId = ?", params: [sceneId] },
      includeUngenerated ? { sql: "", params: [] } : this.buildGeneratedFilter(true),
    ]);

    const whereClause = filters.sql ? `WHERE ${filters.sql}` : "";

    const query = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      ${whereClause}
      ORDER BY c.seconds ASC
    `;

    const queryParams = [...fromClause.params, ...filters.params];

    try {
      const rows = await prisma.$queryRawUnsafe<ClipRow[]>(query, ...queryParams);

      // Fetch tags for all clips
      const clipIds = rows.map((r) => ({ id: r.id, instanceId: r.stashInstanceId }));
      const tagMap = await this.fetchClipTags(clipIds);

      return this.transformRows(rows, tagMap);
    } catch (error) {
      logger.error("ClipQueryBuilder.getClipsForScene failed", { error, sceneId, userId });
      throw error;
    }
  }

  /**
   * Get a single clip by ID
   */
  async getClipById(
    clipId: string,
    userId: number,
    allowedInstanceIds?: string[]
  ): Promise<ClipWithRelations | null> {
    const fromClause = this.buildFromClause(userId);
    const baseWhere = this.buildBaseWhere();

    const filters = this.combineFilters([
      baseWhere,
      this.buildInstanceFilter(allowedInstanceIds),
      { sql: "c.id = ?", params: [clipId] },
    ]);

    const whereClause = filters.sql ? `WHERE ${filters.sql}` : "";

    const query = `
      SELECT ${this.SELECT_COLUMNS}
      ${fromClause.sql}
      ${whereClause}
      LIMIT 1
    `;

    const queryParams = [...fromClause.params, ...filters.params];

    try {
      const rows = await prisma.$queryRawUnsafe<ClipRow[]>(query, ...queryParams);

      if (rows.length === 0) {
        return null;
      }

      // Fetch tags for this clip
      const clipIds = [{ id: rows[0].id, instanceId: rows[0].stashInstanceId }];
      const tagMap = await this.fetchClipTags(clipIds);

      return this.transformRows(rows, tagMap)[0];
    } catch (error) {
      logger.error("ClipQueryBuilder.getClipById failed", { error, clipId, userId });
      throw error;
    }
  }
}

export const clipQueryBuilder = new ClipQueryBuilder();
