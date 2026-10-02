/**
 * GroupQueryBuilder: the group (collection) list in SQL.
 *
 * The group builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the group's spec (table, the rating join, columns with the
 * sub-group count, the name tiebreak), its filter clauses from the parsed
 * request, its sort map, its row transform and its relations, and the
 * detail page's hierarchy. The instance filter, the exclusion join, the
 * `ids` filter, the random sort and the count are the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type {
  GroupRelationRef,
  NormalizedGroup,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  GroupQueryRow,
  GroupRelationQueryRow,
} from "../types/internal/queryRows.js";
import type {
  ParsedFilter,
  RefFieldCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type SqlFragment,
  type ViaSceneSpec,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  refClause,
  searchAll,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  parseJsonArray,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
} from "./query/EntityQueryBuilder.js";
import { excludedCountsJoin, visibleCount } from "./query/excludedCounts.js";
import { STUDIO_REF, loadRefsByKey } from "./query/nestedRefs.js";

/** A group's place in the collection hierarchy, as its detail page shows it */
export interface GroupHierarchy {
  containing_groups: GroupRelationRef[];
  sub_groups: GroupRelationRef[];
}

// Column list for SELECT - all StashGroup fields plus user data; the
// counts as the viewer sees them (query/excludedCounts.ts)
const selectColumns = (ctx: QueryContext) =>
  `
    g.id, g.stashInstanceId, g.name, g.date, g.studioId, g.rating100 AS stashRating100,
    g.duration,
    ${visibleCount(ctx, "g.sceneCount", "scenes")} AS sceneCount,
    ${visibleCount(ctx, "g.performerCount", "performers")} AS performerCount,
    g.director, g.synopsis, g.urls, g.aliases,
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
function subGroupCountColumn(ctx: QueryContext): SqlFragment {
  const exclusion = ctx.applyExclusions
    ? `LEFT JOIN UserExcludedEntity se ON se.userId = ? AND se.entityType = 'group' AND se.entityId = sub.id AND (se.instanceId = '' OR se.instanceId = sub.stashInstanceId)`
    : "";
  return {
    sql: `(SELECT COUNT(*) FROM GroupRelation gr
        JOIN StashGroup sub ON sub.id = gr.subId AND sub.stashInstanceId = gr.subInstanceId AND sub.deletedAt IS NULL
        ${exclusion}
        WHERE gr.containingId = g.id AND gr.containingInstanceId = g.stashInstanceId AND gr.subInstanceId = g.stashInstanceId${ctx.applyExclusions ? " AND se.id IS NULL" : ""}) AS subGroupCount`,
    params: ctx.applyExclusions ? [ctx.userId] : [],
  };
}

const GROUP_SPEC: EntitySpec = {
  table: "StashGroup",
  alias: "g",
  entityType: "group",
  userJoins: [{ table: "GroupRating", alias: "r", entityIdCol: "groupId" }],
  // The viewer's excluded links per collection, for the counts
  extraJoins: (ctx) => excludedCountsJoin(ctx, "group", "g"),
  selectColumns: (ctx) => {
    const subGroupCount = subGroupCountColumn(ctx);
    return {
      sql: `${selectColumns(ctx)},\n    ${subGroupCount.sql}`,
      params: subGroupCount.params,
    };
  },
  defaultSort: "name",
  // Equal values list by name, then by the base's key
  tiebreak: (field) =>
    field === "name" ? undefined : "g.name COLLATE NOCASE ASC",
};

/** A group's studio, on the group's own row */
const GROUP_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashGroup",
  parentAlias: "g",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/** A group's tags */
const GROUP_TAGS: JunctionTarget = {
  kind: "junction",
  table: "GroupTag",
  alias: "gt",
  parentAlias: "g",
  parentIdCol: "groupId",
  parentInstanceCol: "groupInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/**
 * The groups containing a group: GroupRelation with the listed group as the
 * sub-group and the refs on the containing side (a parent collection's
 * direct sub-groups, as the card counts them)
 */
const GROUP_CONTAINING: JunctionTarget = {
  kind: "junction",
  table: "GroupRelation",
  alias: "grl",
  parentAlias: "g",
  parentIdCol: "subId",
  parentInstanceCol: "subInstanceId",
  refIdCol: "containingId",
  refInstanceCol: "containingInstanceId",
};

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
class GroupQueryBuilder extends EntityQueryBuilder<
  GroupQueryRow,
  NormalizedGroup,
  "group"
> {
  protected readonly spec = GROUP_SPEC;

  protected sortMap(
    dir: SortDirection,
    _filter: ParsedFilter<"group">,
    ctx: QueryContext
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Group metadata, the name case-insensitive
      name: column("g.name COLLATE NOCASE"),
      date: column("g.date"),
      created_at: column("g.stashCreatedAt"),
      updated_at: column("g.stashUpdatedAt"),

      // Counts, as the viewer sees them
      scene_count: column(visibleCount(ctx, "g.sceneCount", "scenes")),
      performer_count: column(
        visibleCount(ctx, "g.performerCount", "performers")
      ),
      duration: column("g.duration"),

      // The viewer's rating (GroupRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),
    };
  }

  /**
   * The group filter's clauses, one per field, in the order the statement
   * ANDs them. A ref field's CTEs are named from the leaf (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"group"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),

    // Related entities
    studios: (c, ctx) => this.studioClause(c, ctx),
    scenes: (c) => viaSceneClause(GROUPS_BY_SCENE, c.refs, c.modifier),
    performers: (c) => viaSceneClause(GROUPS_BY_PERFORMER, c.refs, c.modifier),
    tags: (c, ctx) => this.tagClause(c, ctx),
    containing_groups: (c, ctx) =>
      refClause(GROUP_CONTAINING, c.refs, c.modifier, {
        name: ctx.name,
        allowedInstanceIds: ctx.allowedInstanceIds,
      }),

    // The viewer's rating and the counts
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    scene_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "g.sceneCount", "scenes")),
    duration: (c) => buildNumericFilter(c, "g.duration"),

    // Text
    name: (c) => buildTextFilter(c, "g.name"),
    synopsis: (c) => buildTextFilter(c, "g.synopsis"),
    director: (c) => buildTextFilter(c, "g.director"),

    // Dates
    date: (c) => buildDayFilter(c, "g.date"),
    created_at: (c, ctx) =>
      buildInstantFilter(c, "g.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "g.stashUpdatedAt", ctx.timeZone),
  };

  /**
   * The studio filter, with the studios' descendants to the depth. A group
   * has one studio, so the parser never sends INCLUDES_ALL here.
   */
  private async studioClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("studio", GROUP_STUDIO, criterion, ctx, {
      name: ctx.name,
    });
  }

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    // "Has any" and "has none" count only tags the viewer can see
    return hierarchicalRefClause("tag", GROUP_TAGS, criterion, ctx, {
      name: ctx.name,
      related: { table: "StashTag", entityType: "tag" },
    });
  }

  /**
   * The search across the name and synopsis: every word must match
   * (`searchAll`), each as `likeContains` with `ESCAPE '\'`; no `LOWER()`
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: "(g.name LIKE ? ESCAPE '\\' OR g.synopsis LIKE ? ESCAPE '\\')",
      params: [pattern, pattern],
    }));
  }

  /**
   * Transform a raw database row into a NormalizedGroup
   */
  protected transformRow(row: GroupQueryRow): NormalizedGroup {
    const group = {
      id: row.id,
      instanceId: row.stashInstanceId, // For multi-instance correctness in populateRelations
      name: row.name,
      date: emptyToNull(row.date),
      director: emptyToNull(row.director),
      synopsis: emptyToNull(row.synopsis),
      urls: parseJsonArray(row.urls),
      aliases: emptyToNull(row.aliases),

      // Counts
      scene_count: Number(row.sceneCount ?? 0),
      performer_count: Number(row.performerCount ?? 0),
      sub_group_count: Number(row.subGroupCount),
      duration: row.duration ?? 0,

      // Image paths - transform to proxy URLs with instanceId for multi-instance routing
      front_image_path: toProxyUrl(row.frontImagePath, row.stashInstanceId),
      back_image_path: toProxyUrl(row.backImagePath, row.stashInstanceId),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,

      // Relations - populated separately
      studio: row.studioId
        ? ({ id: row.studioId, name: "" } as StudioRef)
        : null,
      studioId: emptyToNull(row.studioId), // For multi-instance correctness in populateRelations
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
   * (TooltipRelations), one statement per relation; and its studio, on the
   * group's instance, only when the viewer may see it (`query/nestedRefs.ts`)
   */
  protected async populateRelations(
    groups: NormalizedGroup[],
    ctx: QueryContext
  ): Promise<void> {
    if (groups.length === 0) return;

    const studioRefs = groups.flatMap((group): EntityRef[] =>
      group.studioId
        ? [{ id: group.studioId, instanceId: group.instanceId }]
        : []
    );
    const relations = await loadTooltipRelations("group", groups, ctx.userId);
    const studios = await loadRefsByKey(STUDIO_REF, studioRefs, ctx);
    for (const group of groups) {
      Object.assign(
        group,
        relations.get(entityKey(group.id, group.instanceId))
      );
      // The row's studio id until here; none when the viewer cannot see it
      group.studio = group.studioId
        ? (studios.get(entityKey(group.studioId, group.instanceId)) ?? null)
        : null;
    }
  }
}

// Export singleton instance
export const groupQueryBuilder = new GroupQueryBuilder();
