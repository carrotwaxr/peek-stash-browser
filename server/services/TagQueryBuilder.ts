/**
 * TagQueryBuilder - SQL-native tag querying
 *
 * Builds parameterized SQL queries for tag filtering, sorting, and pagination.
 * Eliminates the need to load all tags into memory.
 */
import type { PeekTagFilter, NormalizedTag, PerformerRef, StudioRef, GroupRef, GalleryRef } from "../types/index.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import { buildNumericFilter, buildDateFilter, buildTextFilter, buildFavoriteFilter, buildJunctionFilter, type FilterClause } from "../utils/sqlFilterBuilders.js";

// Query builder options
export interface TagQueryOptions {
  userId: number;
  filters?: PeekTagFilter;
  applyExclusions?: boolean; // Default true - use pre-computed exclusions
  sort: string;
  sortDirection: "ASC" | "DESC";
  page: number;
  perPage: number;
  searchQuery?: string;
  allowedInstanceIds?: string[];
  specificInstanceId?: string; // Single instance filter for disambiguation on detail pages
  randomSeed?: number; // Seed for consistent random ordering
}

// Query result
export interface TagQueryResult {
  tags: NormalizedTag[];
  total: number;
}

/**
 * Builds and executes SQL queries for tag filtering
 */
class TagQueryBuilder {
  // Column list for SELECT - all StashTag fields plus user data
  private readonly SELECT_COLUMNS = `
    t.id, t.stashInstanceId, t.name, t.favorite AS stashFavorite,
    t.sceneCount, t.imageCount, t.galleryCount, t.performerCount, t.studioCount, t.groupCount, t.sceneMarkerCount,
    t.sceneCountViaPerformers,
    t.description, t.aliases, t.parentIds, t.imagePath,
    t.stashCreatedAt, t.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    us.oCounter AS userOCounter, us.playCount AS userPlayCount
  `.trim();

  // Base FROM clause with user data JOINs
  private buildFromClause(
    userId: number,
    applyExclusions: boolean = true
  ): { sql: string; params: number[] } {
    const baseJoins = `
        FROM StashTag t
        LEFT JOIN TagRating r ON t.id = r.tagId AND t.stashInstanceId = r.instanceId AND r.userId = ?
        LEFT JOIN UserTagStats us ON t.id = us.tagId AND t.stashInstanceId = us.instanceId AND us.userId = ?
    `.trim();

    if (applyExclusions) {
      return {
        sql: `${baseJoins}
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'tag' AND e.entityId = t.id AND (e.instanceId = '' OR e.instanceId = t.stashInstanceId)`,
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
        sql: "t.deletedAt IS NULL AND e.id IS NULL",
        params: [],
      };
    }
    return {
      sql: "t.deletedAt IS NULL",
      params: [],
    };
  }

  /**
   * Build instance filter clause for multi-instance support
   * Includes NULL stashInstanceId for backward compatibility with legacy data
   */
  private buildInstanceFilter(allowedInstanceIds: string[] | undefined): FilterClause {
    if (!allowedInstanceIds || allowedInstanceIds.length === 0) {
      return { sql: "", params: [] };
    }
    const placeholders = allowedInstanceIds.map(() => "?").join(", ");
    return {
      sql: `(t.stashInstanceId IN (${placeholders}) OR t.stashInstanceId IS NULL)`,
      params: allowedInstanceIds,
    };
  }

  /**
   * Build filter for a specific instance ID (for disambiguation on detail pages)
   * This is different from allowedInstanceIds - it filters to exactly one instance.
   */
  private buildSpecificInstanceFilter(instanceId: string | undefined): FilterClause {
    if (!instanceId) {
      return { sql: "", params: [] };
    }
    return {
      sql: `t.stashInstanceId = ?`,
      params: [instanceId],
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
        return { sql: `t.id IN (${placeholders})`, params: ids };
      case "EXCLUDES":
        return { sql: `t.id NOT IN (${placeholders})`, params: ids };
      default:
        return { sql: `t.id IN (${placeholders})`, params: ids };
    }
  }

  /**
   * Build parent filter clause with hierarchy support
   */
  private async buildParentFilterWithHierarchy(
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

    // parentIds is stored as JSON array in the database
    // We need to search within the JSON array
    switch (modifier) {
      case "INCLUDES": {
        // Match tags that have any of the given parents
        const conditions = ids.map(() => `t.parentIds LIKE ?`).join(" OR ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      case "INCLUDES_ALL": {
        // Match tags that have ALL of the given parents
        const conditions = ids.map(() => `t.parentIds LIKE ?`).join(" AND ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      case "EXCLUDES": {
        // Match tags that don't have any of the given parents
        const conditions = ids.map(() => `(t.parentIds IS NULL OR t.parentIds NOT LIKE ?)`).join(" AND ");
        const params = ids.map((id) => `%"${id}"%`);
        return { sql: `(${conditions})`, params };
      }

      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build performer filter clause
   * Tags attached to specific performers
   */
  private buildPerformerFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier } = filter;

    return buildJunctionFilter(
      ids, "PerformerTag", "tagId", "tagInstanceId",
      "performerId", "performerInstanceId", "t", modifier || "INCLUDES"
    );
  }

  /**
   * Build studio filter clause
   * Tags attached to specific studios
   */
  private buildStudioFilter(
    filter: { value?: string[] | null; modifier?: string | null } | undefined | null
  ): FilterClause {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    const { value: ids, modifier } = filter;

    return buildJunctionFilter(
      ids, "StudioTag", "tagId", "tagInstanceId",
      "studioId", "studioInstanceId", "t", modifier || "INCLUDES"
    );
  }

  /**
   * Build scenes_filter (for tags on scenes in specific groups)
   */
  private buildScenesFilter(
    filter: { id?: { value: string[]; modifier?: string }; groups?: { value: string[]; modifier?: string } } | undefined | null
  ): FilterClause {
    if (!filter) {
      return { sql: "", params: [] };
    }

    const clauses: FilterClause[] = [];

    // Filter by scene IDs
    if (filter.id?.value && filter.id.value.length > 0) {
      const ids = filter.id.value;
      const modifier = filter.id.modifier || "INCLUDES";
      const placeholders = ids.map(() => "?").join(", ");

      if (modifier === "INCLUDES") {
        clauses.push({
          sql: `t.id IN (SELECT tagId FROM SceneTag WHERE sceneId IN (${placeholders}) AND tagInstanceId = t.stashInstanceId)`,
          params: ids,
        });
      } else if (modifier === "EXCLUDES") {
        clauses.push({
          sql: `t.id NOT IN (SELECT tagId FROM SceneTag WHERE sceneId IN (${placeholders}) AND tagInstanceId = t.stashInstanceId)`,
          params: ids,
        });
      }
    }

    // Filter by groups (tags on scenes in specific groups)
    if (filter.groups?.value && filter.groups.value.length > 0) {
      const ids = filter.groups.value;
      const modifier = filter.groups.modifier || "INCLUDES";
      const placeholders = ids.map(() => "?").join(", ");

      if (modifier === "INCLUDES") {
        clauses.push({
          sql: `t.id IN (
            SELECT DISTINCT st.tagId
            FROM SceneTag st
            JOIN SceneGroup sg ON st.sceneId = sg.sceneId AND st.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        });
      } else if (modifier === "EXCLUDES") {
        clauses.push({
          sql: `t.id NOT IN (
            SELECT DISTINCT st.tagId
            FROM SceneTag st
            JOIN SceneGroup sg ON st.sceneId = sg.sceneId AND st.sceneInstanceId = sg.sceneInstanceId
            WHERE sg.groupId IN (${placeholders})
          )`,
          params: ids,
        });
      }
    }

    if (clauses.length === 0) {
      return { sql: "", params: [] };
    }

    return {
      sql: clauses.map((c) => c.sql).join(" AND "),
      params: clauses.flatMap((c) => c.params),
    };
  }

  /**
   * Build search query filter (searches name, description, and aliases)
   */
  private buildSearchFilter(searchQuery: string | undefined): FilterClause {
    if (!searchQuery || searchQuery.trim() === "") {
      return { sql: "", params: [] };
    }

    const lowerQuery = `%${searchQuery.toLowerCase()}%`;
    return {
      sql: "(LOWER(t.name) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(t.aliases) LIKE ?)",
      params: [lowerQuery, lowerQuery, lowerQuery],
    };
  }

  /**
   * Build ORDER BY clause
   */
  private buildSortClause(sort: string, direction: "ASC" | "DESC", randomSeed?: number): string {
    const dir = direction === "ASC" ? "ASC" : "DESC";
    const seed = randomSeed || 12345;

    const sortMap: Record<string, string> = {
      // Tag metadata - use COLLATE NOCASE for case-insensitive sorting
      name: `t.name COLLATE NOCASE ${dir}`,
      created_at: `t.stashCreatedAt ${dir}`,
      updated_at: `t.stashUpdatedAt ${dir}`,

      // Counts - scene_count uses MAX of direct and performer counts to match enhanced value
      scene_count: `MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) ${dir}`,
      scenes_count: `MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0)) ${dir}`,
      image_count: `t.imageCount ${dir}`,
      gallery_count: `t.galleryCount ${dir}`,
      performer_count: `t.performerCount ${dir}`,
      studio_count: `t.studioCount ${dir}`,
      group_count: `t.groupCount ${dir}`,
      scene_marker_count: `t.sceneMarkerCount ${dir}`,

      // User ratings
      rating: `COALESCE(r.rating, 0) ${dir}`,
      rating100: `COALESCE(r.rating, 0) ${dir}`,

      // User stats
      o_counter: `COALESCE(us.oCounter, 0) ${dir}`,
      play_count: `COALESCE(us.playCount, 0) ${dir}`,

      // Random - seeded formula matching Stash's algorithm, prevents SQLite integer overflow
      random: `(((((t.id + ${seed}) % 2147483647) * ((t.id + ${seed}) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((t.id + ${seed}) * 1047483763 % 2147483647)) % 2147483647) ${dir}`,
    };

    const sortExpr = sortMap[sort] || sortMap["name"];

    // Add secondary sort by name for stable ordering
    if (sort !== "name") {
      return `${sortExpr}, t.name COLLATE NOCASE ASC`;
    }
    return `${sortExpr}, t.id ${dir}`;
  }

  async execute(options: TagQueryOptions): Promise<TagQueryResult> {
    const startTime = Date.now();
    const { userId, page, perPage, applyExclusions = true, filters, searchQuery, allowedInstanceIds, specificInstanceId, randomSeed } = options;

    // Build FROM clause with optional exclusion JOIN
    const fromClause = this.buildFromClause(userId, applyExclusions);

    // Build WHERE clauses
    const whereClauses: FilterClause[] = [this.buildBaseWhere(applyExclusions)];

    // Instance filter (multi-instance support)
    const instanceFilter = this.buildInstanceFilter(allowedInstanceIds);
    if (instanceFilter.sql) {
      whereClauses.push(instanceFilter);
    }

    // Specific instance filter (for disambiguation on detail pages)
    if (specificInstanceId) {
      const specificFilter = this.buildSpecificInstanceFilter(specificInstanceId);
      if (specificFilter.sql) {
        whereClauses.push(specificFilter);
      }
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

    // Parent filter
    if (filters?.parents) {
      const parentFilter = await this.buildParentFilterWithHierarchy(filters.parents);
      if (parentFilter.sql) {
        whereClauses.push(parentFilter);
      }
    }

    // Performer filter
    if (filters?.performers) {
      const performerFilter = this.buildPerformerFilter(filters.performers);
      if (performerFilter.sql) {
        whereClauses.push(performerFilter);
      }
    }

    // Studio filter
    if (filters?.studios) {
      const studioFilter = this.buildStudioFilter(filters.studios);
      if (studioFilter.sql) {
        whereClauses.push(studioFilter);
      }
    }

    // Scenes filter
    if (filters?.scenes_filter) {
      const scenesFilter = this.buildScenesFilter(filters.scenes_filter);
      if (scenesFilter.sql) {
        whereClauses.push(scenesFilter);
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
    // Use MAX of direct scene count and performer scene count to match the enhanced scene_count returned
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(
        filters.scene_count,
        "MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0))"
      );
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Text filters
    if (filters?.name) {
      const nameFilter = buildTextFilter(filters.name, "t.name");
      if (nameFilter.sql) {
        whereClauses.push(nameFilter);
      }
    }

    if (filters?.description) {
      const descriptionFilter = buildTextFilter(filters.description, "t.description");
      if (descriptionFilter.sql) {
        whereClauses.push(descriptionFilter);
      }
    }

    // Date filters
    if (filters?.created_at) {
      const createdAtFilter = buildDateFilter(filters.created_at, "t.stashCreatedAt");
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(filters.updated_at, "t.stashUpdatedAt");
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

    logger.info("TagQueryBuilder.execute", {
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
        SELECT COUNT(DISTINCT t.id || ':' || t.stashInstanceId) as total
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
        FROM StashTag t
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...baseWhereParams);
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const tags = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations for tooltip data
    const relationsStart = Date.now();
    await this.populateRelations(tags);
    const relationsMs = Date.now() - relationsStart;

    logger.info("TagQueryBuilder.execute complete", {
      queryTimeMs: Date.now() - startTime,
      breakdown: { queryMs, countMs, transformMs, relationsMs },
      resultCount: tags.length,
      total,
    });

    return { tags, total };
  }

  /**
   * Transform a raw database row into a NormalizedTag
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL row with dynamic columns
  private transformRow(row: Record<string, any>): NormalizedTag {
    const directSceneCount = row.sceneCount || 0;
    const performerSceneCount = row.sceneCountViaPerformers || 0;
    // Use the greater of direct scene count or performer scene count
    const totalSceneCount = Math.max(directSceneCount, performerSceneCount);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- building partial NormalizedTag from DB row; Tag base type requires fields we don't populate
    const tag: any = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      description: row.description || null,
      aliases: this.parseJsonArray(row.aliases),
      parents: this.parseJsonArray(row.parentIds).map((id: string) => ({ id, name: "" })),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: this.transformUrl(row.imagePath, row.stashInstanceId),

      // Counts - use enhanced scene count
      scene_count: totalSceneCount,
      scene_count_direct: directSceneCount,
      scene_count_via_performers: performerSceneCount,
      image_count: row.imageCount || 0,
      gallery_count: row.galleryCount || 0,
      performer_count: row.performerCount || 0,
      studio_count: row.studioCount || 0,
      group_count: row.groupCount || 0,
      scene_marker_count: row.sceneMarkerCount || 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString?.() || row.stashCreatedAt || null,
      updated_at: row.stashUpdatedAt?.toISOString?.() || row.stashUpdatedAt || null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations
      children: [],
    };

    return tag as NormalizedTag;
  }

  /**
   * Populate tag relations (performers, studios, groups, galleries, parent names)
   * Includes minimal data for TooltipEntityGrid: id, name, image_path/cover
   */
  async populateRelations(tags: NormalizedTag[]): Promise<void> {
    if (tags.length === 0) return;

    const tagIds = tags.map((t) => t.id);
    const tagInstanceIds = [...new Set(tags.map((t) => t.instanceId))];

    // Collect all parent IDs that need name hydration
    const parentIds = new Set<string>();
    for (const tag of tags) {
      if (tag.parents && Array.isArray(tag.parents)) {
        for (const parent of tag.parents) {
          if (parent.id) {
            parentIds.add(parent.id);
          }
        }
      }
    }

    // Load all junctions in parallel (include parent tags lookup)
    // Filter by both tagId AND tagInstanceId for multi-instance correctness
    const [performerTags, studioTags, groupTags, galleryTags, parentTagRecords] = await Promise.all([
      prisma.performerTag.findMany({
        where: {
          tagId: { in: tagIds },
          tagInstanceId: { in: tagInstanceIds }
        },
        select: { tagId: true, tagInstanceId: true, performerId: true, performerInstanceId: true },
      }),
      prisma.studioTag.findMany({
        where: {
          tagId: { in: tagIds },
          tagInstanceId: { in: tagInstanceIds }
        },
        select: { tagId: true, tagInstanceId: true, studioId: true, studioInstanceId: true },
      }),
      prisma.groupTag.findMany({
        where: {
          tagId: { in: tagIds },
          tagInstanceId: { in: tagInstanceIds }
        },
        select: { tagId: true, tagInstanceId: true, groupId: true, groupInstanceId: true },
      }),
      prisma.galleryTag.findMany({
        where: {
          tagId: { in: tagIds },
          tagInstanceId: { in: tagInstanceIds }
        },
        select: { tagId: true, tagInstanceId: true, galleryId: true, galleryInstanceId: true },
      }),
      // Fetch parent tag names - filter by parent instanceIds matching tag instanceIds
      parentIds.size > 0
        ? prisma.stashTag.findMany({
            where: {
              id: { in: Array.from(parentIds) },
              stashInstanceId: { in: tagInstanceIds }
            },
            select: { id: true, stashInstanceId: true, name: true },
          })
        : [],
    ]);

    // Build parent name lookup map (by composite key) and hydrate parent names
    const parentNameMap = new Map<string, string>();
    for (const pt of parentTagRecords) {
      const key = `${pt.id}:${pt.stashInstanceId}`;
      parentNameMap.set(key, pt.name || "Unknown");
    }
    for (const tag of tags) {
      if (tag.parents && Array.isArray(tag.parents)) {
        const tagInstanceId = tag.instanceId;
        (tag as unknown as Record<string, unknown>).parents = tag.parents.map((p) => ({
          id: p.id,
          name: parentNameMap.get(`${p.id}:${tagInstanceId}`) || "Unknown",
        }));
      }
    }

    // Collect unique entity keys (id:instanceId) from junction tables
    const performerKeys = [...new Map(
      performerTags.map((j) => [`${j.performerId}:${j.performerInstanceId}`, { id: j.performerId, instanceId: j.performerInstanceId }])
    ).values()];
    const studioKeys = [...new Map(
      studioTags.map((j) => [`${j.studioId}:${j.studioInstanceId}`, { id: j.studioId, instanceId: j.studioInstanceId }])
    ).values()];
    const groupKeys = [...new Map(
      groupTags.map((j) => [`${j.groupId}:${j.groupInstanceId}`, { id: j.groupId, instanceId: j.groupInstanceId }])
    ).values()];
    const galleryKeys = [...new Map(
      galleryTags.map((j) => [`${j.galleryId}:${j.galleryInstanceId}`, { id: j.galleryId, instanceId: j.galleryInstanceId }])
    ).values()];

    // Build OR conditions for entity queries (need to match on composite keys)
    const performerOrConditions = performerKeys.map((k) => ({
      id: k.id,
      stashInstanceId: k.instanceId,
    }));
    const studioOrConditions = studioKeys.map((k) => ({
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
    const [performers, studios, groups, galleries] = await Promise.all([
      performerOrConditions.length > 0
        ? prisma.stashPerformer.findMany({ where: { OR: performerOrConditions } })
        : [],
      studioOrConditions.length > 0
        ? prisma.stashStudio.findMany({ where: { OR: studioOrConditions } })
        : [],
      groupOrConditions.length > 0
        ? prisma.stashGroup.findMany({ where: { OR: groupOrConditions } })
        : [],
      galleryOrConditions.length > 0
        ? prisma.stashGallery.findMany({ where: { OR: galleryOrConditions } })
        : [],
    ]);

    // Build lookup maps with minimal tooltip data by composite key (id:instanceId)
    const performersById = new Map<string, PerformerRef>(performers.map((p) => [`${p.id}:${p.stashInstanceId}`, {
      id: p.id,
      instanceId: p.stashInstanceId,
      name: p.name,
      disambiguation: p.disambiguation || null,
      gender: p.gender || null,
      image_path: this.transformUrl(p.imagePath, p.stashInstanceId),
      favorite: p.favorite ?? null,
      rating100: p.rating100 ?? null,
    }]));

    const studiosById = new Map<string, StudioRef>(studios.map((s) => [`${s.id}:${s.stashInstanceId}`, {
      id: s.id,
      instanceId: s.stashInstanceId,
      name: s.name,
      image_path: this.transformUrl(s.imagePath, s.stashInstanceId),
      favorite: s.favorite ?? null,
      parent_studio: s.parentId ? { id: s.parentId } : null,
    }]));

    const groupsById = new Map<string, GroupRef>(groups.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath, g.stashInstanceId),
      back_image_path: this.transformUrl(g.backImagePath, g.stashInstanceId),
    }]));

    const galleriesById = new Map<string, GalleryRef>(galleries.map((g) => [`${g.id}:${g.stashInstanceId}`, {
      id: g.id,
      instanceId: g.stashInstanceId,
      title: g.title || getGalleryFallbackTitle(g.folderPath, g.fileBasename),
      cover: this.transformUrl(g.coverPath, g.stashInstanceId),
    }]));

    // Build tag -> entities maps using composite keys
    // Key format: tagId:tagInstanceId -> entities[]
    const performersByTag = new Map<string, PerformerRef[]>();
    for (const pt of performerTags) {
      const performerKey = `${pt.performerId}:${pt.performerInstanceId}`;
      const performer = performersById.get(performerKey);
      if (!performer) continue; // Skip orphaned junction records
      const tagKey = `${pt.tagId}:${pt.tagInstanceId}`;
      const list = performersByTag.get(tagKey) || [];
      list.push(performer);
      performersByTag.set(tagKey, list);
    }

    const studiosByTag = new Map<string, StudioRef[]>();
    for (const st of studioTags) {
      const studioKey = `${st.studioId}:${st.studioInstanceId}`;
      const studio = studiosById.get(studioKey);
      if (!studio) continue; // Skip orphaned junction records
      const tagKey = `${st.tagId}:${st.tagInstanceId}`;
      const list = studiosByTag.get(tagKey) || [];
      list.push(studio);
      studiosByTag.set(tagKey, list);
    }

    const groupsByTag = new Map<string, GroupRef[]>();
    for (const gt of groupTags) {
      const groupKey = `${gt.groupId}:${gt.groupInstanceId}`;
      const group = groupsById.get(groupKey);
      if (!group) continue; // Skip orphaned junction records
      const tagKey = `${gt.tagId}:${gt.tagInstanceId}`;
      const list = groupsByTag.get(tagKey) || [];
      list.push(group);
      groupsByTag.set(tagKey, list);
    }

    const galleriesByTag = new Map<string, GalleryRef[]>();
    for (const gt of galleryTags) {
      const galleryKey = `${gt.galleryId}:${gt.galleryInstanceId}`;
      const gallery = galleriesById.get(galleryKey);
      if (!gallery) continue; // Skip orphaned junction records
      const tagKey = `${gt.tagId}:${gt.tagInstanceId}`;
      const list = galleriesByTag.get(tagKey) || [];
      list.push(gallery);
      galleriesByTag.set(tagKey, list);
    }

    // Populate tags with all relations using composite keys
    for (const tag of tags) {
      const tagInstanceId = tag.instanceId;
      const tagKey = `${tag.id}:${tagInstanceId}`;
      const tagRecord = tag as unknown as Record<string, unknown>;
      tagRecord.performers = performersByTag.get(tagKey) || [];
      tagRecord.studios = studiosByTag.get(tagKey) || [];
      tagRecord.groups = groupsByTag.get(tagKey) || [];
      tagRecord.galleries = galleriesByTag.get(tagKey) || [];
    }
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
export const tagQueryBuilder = new TagQueryBuilder();
