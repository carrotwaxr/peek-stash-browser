/**
 * GroupQueryBuilder - SQL-native group querying
 *
 * Builds parameterized SQL queries for group filtering, sorting, and pagination.
 * Eliminates the need to load all groups into memory.
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";
import type {
  GroupRelationRef,
  NormalizedGroup,
  PeekGroupFilter,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  GroupQueryRow,
  GroupRelationQueryRow,
} from "../types/internal/queryRows.js";
import { entityKey } from "../utils/entityRef.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { logger } from "../utils/logger.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import { type ViaSceneSpec, viaSceneClause } from "../utils/sqlClauses.js";
import {
  type FilterClause,
  buildDateFilter,
  buildFavoriteFilter,
  buildJunctionFilter,
  buildNumericFilter,
  buildTextFilter,
  parseCompositeFilterValues,
} from "../utils/sqlFilterBuilders.js";
import { parseJsonArray } from "../utils/sqlHelpers.js";
import { keepVisibleConditions } from "./EntityAccessService.js";
import { loadTooltipRelations } from "./TooltipRelations.js";

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
  specificInstanceId?: string; // Single instance filter for disambiguation on detail pages
  randomSeed?: number; // Seed for consistent random ordering
}

// Query result
export interface GroupQueryResult {
  groups: NormalizedGroup[];
  total: number;
}

/** A group's place in the collection hierarchy, as its detail page shows it */
export interface GroupHierarchy {
  containing_groups: GroupRelationRef[];
  sub_groups: GroupRelationRef[];
}

/** Groups holding one of the scenes (a scene's Collections tab) */
const GROUPS_BY_SCENE: ViaSceneSpec = {
  alias: "g",
  junction: { table: "SceneGroup", alias: "sg" },
  entityIdCol: "groupId",
  entityInstanceCol: "groupInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** Groups with a scene of one of the performers (a performer's Collections tab) */
const GROUPS_BY_PERFORMER: ViaSceneSpec = {
  ...GROUPS_BY_SCENE,
  via: {
    table: "ScenePerformer",
    alias: "sp",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
  },
};

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

  /**
   * The sub-group count column: the group's direct sub-groups that are live
   * and, with exclusions applied, not excluded for the user. A sub-group is on
   * the group's own instance, which the list already allows. Each row probes
   * GroupRelation's primary key prefix (containingId, containingInstanceId),
   * so a page of 40 groups is 40 lookups.
   */
  private buildSubGroupCountColumn(
    userId: number,
    applyExclusions: boolean
  ): { sql: string; params: number[] } {
    const exclusion = applyExclusions
      ? `LEFT JOIN UserExcludedEntity se ON se.userId = ? AND se.entityType = 'group' AND se.entityId = sub.id AND (se.instanceId = '' OR se.instanceId = sub.stashInstanceId)`
      : "";
    return {
      sql: `(SELECT COUNT(*) FROM GroupRelation gr
        JOIN StashGroup sub ON sub.id = gr.subId AND sub.stashInstanceId = gr.subInstanceId AND sub.deletedAt IS NULL
        ${exclusion}
        WHERE gr.containingId = g.id AND gr.containingInstanceId = g.stashInstanceId AND gr.subInstanceId = g.stashInstanceId${applyExclusions ? " AND se.id IS NULL" : ""}) AS subGroupCount`,
      params: applyExclusions ? [userId] : [],
    };
  }

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
        LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'group' AND e.entityId = g.id AND (e.instanceId = '' OR e.instanceId = g.stashInstanceId)`,
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
  private buildInstanceFilter(
    allowedInstanceIds: string[] | undefined
  ): FilterClause {
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
   * Build filter for a specific instance ID (for disambiguation on detail pages)
   */
  private buildSpecificInstanceFilter(
    instanceId: string | undefined
  ): FilterClause {
    if (!instanceId) {
      return { sql: "", params: [] };
    }
    return {
      sql: `g.stashInstanceId = ?`,
      params: [instanceId],
    };
  }

  /**
   * Build ID filter clause
   */
  private buildIdFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | string[]
      | undefined
      | null
  ): FilterClause {
    const ids = Array.isArray(filter) ? filter : filter?.value;
    if (!ids || ids.length === 0) {
      return { sql: "", params: [] };
    }

    const modifier = Array.isArray(filter)
      ? "INCLUDES"
      : filter?.modifier || "INCLUDES";
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
    filter:
      | {
          value?: string[] | null;
          modifier?: string | null;
          depth?: number | null;
        }
      | undefined
      | null
  ): Promise<FilterClause> {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    // Parse composite keys ("5:instance-1" -> "5") since UI sends composite format
    const { parsed } = parseCompositeFilterValues(filter.value);
    let ids = parsed.map((p) => p.id);
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

      case null:
      default:
        return { sql: "", params: [] };
    }
  }

  /**
   * Build scenes filter clause
   * Filter groups by scenes they contain
   */
  private buildScenesFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    return viaSceneClause(
      GROUPS_BY_SCENE,
      parseCompositeFilterValues(filter?.value ?? []).parsed,
      filter?.modifier ?? "INCLUDES"
    );
  }

  /**
   * Build performer filter clause
   * Groups don't have direct performer relationships - we check via scenes
   */
  private buildPerformerFilter(
    filter:
      | { value?: string[] | null; modifier?: string | null }
      | undefined
      | null
  ): FilterClause {
    return viaSceneClause(
      GROUPS_BY_PERFORMER,
      parseCompositeFilterValues(filter?.value ?? []).parsed,
      filter?.modifier ?? "INCLUDES"
    );
  }

  /**
   * Build tag filter clause with hierarchy support
   */
  private async buildTagFilterWithHierarchy(
    filter:
      | {
          value?: string[] | null;
          modifier?: string | null;
          depth?: number | null;
        }
      | undefined
      | null
  ): Promise<FilterClause> {
    if (!filter || !filter.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }

    // Parse composite keys ("284:instance-1" -> "284") since UI sends composite format
    const { parsed } = parseCompositeFilterValues(filter.value);
    let ids = parsed.map((p) => p.id);
    const { modifier, depth } = filter;

    // Expand IDs if depth is specified and not 0
    if (depth !== undefined && depth !== null && depth !== 0) {
      ids = await expandTagIds(ids, depth);
    }

    return buildJunctionFilter(
      coerceEntityRefs(ids),
      "GroupTag",
      "groupId",
      "groupInstanceId",
      "tagId",
      "tagInstanceId",
      "g",
      modifier || "INCLUDES"
    );
  }

  /**
   * Parent collection filter: the direct sub-groups (depth 0, as the card
   * counts them) of the groups named. An "id:instance" value matches that
   * group on its instance; a bare id matches that id on every instance.
   */
  private buildContainingGroupsFilter(
    filter: PeekGroupFilter["containing_groups"]
  ): FilterClause {
    if (!filter?.value || filter.value.length === 0) {
      return { sql: "", params: [] };
    }
    return buildJunctionFilter(
      coerceEntityRefs(filter.value),
      "GroupRelation",
      "subId",
      "subInstanceId",
      "containingId",
      "containingInstanceId",
      "g",
      filter.modifier ?? "INCLUDES"
    );
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
  private buildSortClause(
    sort: string,
    direction: "ASC" | "DESC",
    randomSeed?: number
  ): string {
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
    const {
      userId,
      page,
      perPage,
      applyExclusions = true,
      filters,
      searchQuery,
      allowedInstanceIds,
      specificInstanceId,
      randomSeed,
    } = options;

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
      const specificFilter =
        this.buildSpecificInstanceFilter(specificInstanceId);
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

    // Studio filter
    if (filters?.studios) {
      const studioFilter = await this.buildStudioFilterWithHierarchy(
        filters.studios
      );
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

    // Parent collection filter
    const containingFilter = this.buildContainingGroupsFilter(
      filters?.containing_groups
    );
    if (containingFilter.sql) {
      whereClauses.push(containingFilter);
    }

    // Rating filter
    if (filters?.rating100) {
      const ratingFilter = buildNumericFilter(
        filters.rating100,
        "COALESCE(r.rating, 0)"
      );
      if (ratingFilter.sql) {
        whereClauses.push(ratingFilter);
      }
    }

    // Scene count filter
    if (filters?.scene_count) {
      const sceneCountFilter = buildNumericFilter(
        filters.scene_count,
        "COALESCE(g.sceneCount, 0)"
      );
      if (sceneCountFilter.sql) {
        whereClauses.push(sceneCountFilter);
      }
    }

    // Duration filter
    if (filters?.duration) {
      const durationFilter = buildNumericFilter(
        filters.duration,
        "COALESCE(g.duration, 0)"
      );
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
      const createdAtFilter = buildDateFilter(
        filters.created_at,
        "g.stashCreatedAt"
      );
      if (createdAtFilter.sql) {
        whereClauses.push(createdAtFilter);
      }
    }

    if (filters?.updated_at) {
      const updatedAtFilter = buildDateFilter(
        filters.updated_at,
        "g.stashUpdatedAt"
      );
      if (updatedAtFilter.sql) {
        whereClauses.push(updatedAtFilter);
      }
    }

    // Combine WHERE clauses
    const whereSQL = whereClauses
      .map((c) => c.sql)
      .filter(Boolean)
      .join(" AND ");
    const whereParams = whereClauses.flatMap((c) => c.params);

    // Build sort clause
    const sortClause = this.buildSortClause(
      options.sort,
      options.sortDirection,
      randomSeed
    );

    // Build full query
    const subGroupCount = this.buildSubGroupCountColumn(
      userId,
      applyExclusions
    );
    const offset = (page - 1) * perPage;
    const sql = `
      SELECT ${this.SELECT_COLUMNS},
        ${subGroupCount.sql}
      ${fromClause.sql}
      WHERE ${whereSQL}
      ORDER BY ${sortClause}
      LIMIT ? OFFSET ?
    `;

    const params = [
      ...subGroupCount.params,
      ...fromClause.params,
      ...whereParams,
      perPage,
      offset,
    ];

    logger.debug("GroupQueryBuilder.execute", {
      whereClauseCount: whereClauses.length,
      applyExclusions,
      sort: options.sort,
      sortDirection: options.sortDirection,
      paramCount: params.length,
    });

    // Execute query
    const queryStart = Date.now();
    const rows = await prisma.$queryRawUnsafe<GroupQueryRow[]>(sql, ...params);
    const queryMs = Date.now() - queryStart;

    // Count query
    const countStart = Date.now();
    let total: number;

    // Check if we have any user-data filters that require the JOINs
    const hasUserDataFilters =
      filters?.favorite !== undefined || filters?.rating100 !== undefined;

    if (hasUserDataFilters || applyExclusions) {
      // COUNT(*) counts each group once: the rating LEFT JOIN in
      // buildFromClause matches at most one row (a unique key), and the
      // exclusion join, which can match two (global and per-instance), keeps a
      // group only when it matched none (e.id IS NULL).
      const countSql = `
        SELECT COUNT(*) as total
        ${fromClause.sql}
        WHERE ${whereSQL}
      `;
      const countParams = [...fromClause.params, ...whereParams];
      const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        countSql,
        ...countParams
      );
      total = Number(countResult[0]?.total ?? 0n);
    } else {
      // Fast path: count without JOINs
      const baseWhereClauses = whereClauses.filter(
        (c) => !c.sql.includes("r.")
      );
      const baseWhereSQL = baseWhereClauses
        .map((c) => c.sql)
        .filter(Boolean)
        .join(" AND ");
      const baseWhereParams = baseWhereClauses.flatMap((c) => c.params);

      const countSql = `
        SELECT COUNT(*) as total
        FROM StashGroup g
        WHERE ${baseWhereSQL || "1=1"}
      `;
      const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
        countSql,
        ...baseWhereParams
      );
      total = Number(countResult[0]?.total || 0);
    }
    const countMs = Date.now() - countStart;

    const transformStart = Date.now();
    const groups = rows.map((row) => this.transformRow(row));
    const transformMs = Date.now() - transformStart;

    // Populate relations (tags, studio)
    const relationsStart = Date.now();
    await this.populateRelations(groups, userId);
    const relationsMs = Date.now() - relationsStart;

    logger.debug("GroupQueryBuilder.execute complete", {
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
  private transformRow(row: GroupQueryRow): NormalizedGroup {
    const group = {
      id: row.id,
      instanceId: row.stashInstanceId, // For multi-instance correctness in populateRelations
      name: row.name,
      date: row.date || null,
      director: row.director || null,
      synopsis: row.synopsis || null,
      urls: parseJsonArray(row.urls),

      // Counts
      scene_count: row.sceneCount || 0,
      performer_count: row.performerCount || 0,
      sub_group_count: Number(row.subGroupCount),
      duration: row.duration || 0,

      // Image paths - transform to proxy URLs with instanceId for multi-instance routing
      front_image_path: toProxyUrl(row.frontImagePath, row.stashInstanceId),
      back_image_path: toProxyUrl(row.backImagePath, row.stashInstanceId),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: Boolean(row.userFavorite),

      // Relations - populated separately
      studio: row.studioId
        ? ({ id: row.studioId, name: "" } as StudioRef)
        : null,
      studioId: row.studioId || null, // For multi-instance correctness in populateRelations
      tags: [] as TagRef[],
      scenes: [] as { id: string }[],
    };

    return group as NormalizedGroup;
  }

  /**
   * A group's place in the collection hierarchy: the groups containing it, by
   * name, and its sub-groups, in Stash's order (`orderIndex`), each with the
   * link's description. The first query drives from GroupRelation's reverse
   * index (subId, subInstanceId), the second from its primary key prefix.
   * Both leave out deleted groups and those excluded for the user (hidden,
   * restricted, empty), as the list's sub-group count does. The other end is
   * held to the group's own instance, which the caller already allows.
   */
  async getHierarchy(
    groupId: string,
    instanceId: string,
    userId: number
  ): Promise<GroupHierarchy> {
    const visible = `LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'group' AND e.entityId = other.id AND (e.instanceId = '' OR e.instanceId = other.stashInstanceId)`;

    const [containing, sub] = await Promise.all([
      prisma.$queryRawUnsafe<GroupRelationQueryRow[]>(
        `SELECT other.id, other.stashInstanceId, other.name, gr.description
        FROM GroupRelation gr
        JOIN StashGroup other ON other.id = gr.containingId AND other.stashInstanceId = gr.containingInstanceId AND other.deletedAt IS NULL
        ${visible}
        WHERE gr.subId = ? AND gr.subInstanceId = ? AND gr.containingInstanceId = ? AND e.id IS NULL
        ORDER BY other.name COLLATE NOCASE ASC, other.id ASC`,
        userId,
        groupId,
        instanceId,
        instanceId
      ),
      prisma.$queryRawUnsafe<GroupRelationQueryRow[]>(
        `SELECT other.id, other.stashInstanceId, other.name, gr.description
        FROM GroupRelation gr
        JOIN StashGroup other ON other.id = gr.subId AND other.stashInstanceId = gr.subInstanceId AND other.deletedAt IS NULL
        ${visible}
        WHERE gr.containingId = ? AND gr.containingInstanceId = ? AND gr.subInstanceId = ? AND e.id IS NULL
        ORDER BY gr.orderIndex ASC, other.id ASC`,
        userId,
        groupId,
        instanceId,
        instanceId
      ),
    ]);

    const toRef = (row: GroupRelationQueryRow): GroupRelationRef => ({
      group: { id: row.id, name: row.name, instanceId: row.stashInstanceId },
      description: row.description,
    });
    return {
      containing_groups: containing.map(toRef),
      sub_groups: sub.map(toRef),
    };
  }

  /**
   * The card's relations for the whole page: its tags, at most
   * TOOLTIP_LIMIT performers and galleries with how many there are
   * (TooltipRelations), one statement per relation; and its studio
   */
  async populateRelations(
    groups: NormalizedGroup[],
    userId: number
  ): Promise<void> {
    if (groups.length === 0) return;

    const [relations] = await Promise.all([
      loadTooltipRelations("group", groups, userId),
      this.hydrateStudios(groups, userId),
    ]);
    for (const group of groups) {
      Object.assign(
        group,
        relations.get(entityKey(group.id, group.instanceId))
      );
    }
  }

  /**
   * Each group's studio with its tooltip data (id, name, image_path), on the
   * group's instance, when the user can see it
   */
  private async hydrateStudios(
    groups: NormalizedGroup[],
    userId: number
  ): Promise<void> {
    const studioConditions = [
      ...new Map(
        groups.flatMap((g) =>
          g.studioId
            ? [
                [
                  entityKey(g.studioId, g.instanceId),
                  { id: g.studioId, stashInstanceId: g.instanceId },
                ] as const,
              ]
            : []
        )
      ).values(),
    ];

    // Keep only studios this user may see (hidden, restricted, deleted or
    // on an instance they don't use)
    const visibleStudioConditions = await keepVisibleConditions(
      userId,
      "studio",
      studioConditions
    );
    const studios =
      visibleStudioConditions.length > 0
        ? await prisma.stashStudio.findMany({
            where: { OR: visibleStudioConditions },
          })
        : [];

    const studiosByKey = new Map<string, StudioRef>();
    for (const s of studios) {
      const key = entityKey(s.id, s.stashInstanceId);
      studiosByKey.set(key, {
        id: s.id,
        instanceId: s.stashInstanceId,
        name: s.name,
        image_path: toProxyUrl(s.imagePath, s.stashInstanceId),
        favorite: s.favorite,
        parent_studio: s.parentId ? { id: s.parentId } : null,
      });
    }

    for (const group of groups) {
      if (group.studio?.id) {
        const studioData = studiosByKey.get(
          entityKey(group.studio.id, group.instanceId)
        );
        if (studioData) {
          group.studio = studioData;
        }
      }
    }
  }
}

// Export singleton instance
export const groupQueryBuilder = new GroupQueryBuilder();
