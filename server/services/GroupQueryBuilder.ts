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
import type { ParsedFilter, RefCriterion } from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type SqlFragment,
  type ViaSceneSpec,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  refClause,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseJsonArray,
} from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  expandRefs,
} from "./query/EntityQueryBuilder.js";
import { STUDIO_REF, loadRefsByKey } from "./query/nestedRefs.js";

/** A group's place in the collection hierarchy, as its detail page shows it */
export interface GroupHierarchy {
  containing_groups: GroupRelationRef[];
  sub_groups: GroupRelationRef[];
}

// Column list for SELECT - all StashGroup fields plus user data
const SELECT_COLUMNS = `
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
  selectColumns: (ctx) => {
    const subGroupCount = subGroupCountColumn(ctx);
    return {
      sql: `${SELECT_COLUMNS},\n    ${subGroupCount.sql}`,
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

  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
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

      // Counts
      scene_count: column("g.sceneCount"),
      performer_count: column("g.performerCount"),
      duration: column("g.duration"),

      // The viewer's rating (GroupRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),
    };
  }

  /**
   * The group filter's clauses, one per criterion the request carried.
   * `synopsis` and `director` are declared in the contract but have no
   * clause yet (a known gap in `shared/types/filters/fields.ts`).
   */
  protected async filterClauses(
    filter: ParsedFilter<"group">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause) => clauses.push(clause);
    const via = (spec: ViaSceneSpec, criterion: RefCriterion) =>
      viaSceneClause(spec, criterion.refs, criterion.modifier);

    if (q !== undefined) push(this.searchClause(q));

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));

    // Related entities
    if (filter.studios) push(await this.studioClause(filter.studios, ctx));
    if (filter.scenes) push(via(GROUPS_BY_SCENE, filter.scenes));
    if (filter.performers) push(via(GROUPS_BY_PERFORMER, filter.performers));
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));
    if (filter.containing_groups) {
      push(
        refClause(
          GROUP_CONTAINING,
          filter.containing_groups.refs,
          filter.containing_groups.modifier,
          {
            name: "containing_groups",
            allowedInstanceIds: ctx.allowedInstanceIds,
          }
        )
      );
    }

    // The viewer's rating and the counts
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.scene_count) {
      push(buildNumericFilter(filter.scene_count, "COALESCE(g.sceneCount, 0)"));
    }
    if (filter.duration) {
      push(buildNumericFilter(filter.duration, "COALESCE(g.duration, 0)"));
    }

    // Text
    if (filter.name) push(buildTextFilter(filter.name, "g.name"));

    // Dates
    if (filter.date) push(buildDateFilter(filter.date, "g.date"));
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "g.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "g.stashUpdatedAt"));
    }

    return clauses;
  }

  /**
   * The studio filter, with the studios' descendants to the depth. A group
   * has one studio, so the parser never sends INCLUDES_ALL here.
   */
  private async studioClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandStudioIds
    );
    return refClause(GROUP_STUDIO, refs, criterion.modifier, {
      name: "studios",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandTagIds
    );
    return refClause(GROUP_TAGS, refs, criterion.modifier, {
      name: "tags",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /**
   * The search across the name and synopsis: `likeContains` with
   * `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  private searchClause(q: string): FilterClause {
    const pattern = likeContains(q.toLowerCase());
    return {
      sql: "(LOWER(g.name) LIKE ? ESCAPE '\\' OR LOWER(g.synopsis) LIKE ? ESCAPE '\\')",
      params: [pattern, pattern],
    };
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

      // Counts
      scene_count: row.sceneCount ?? 0,
      performer_count: row.performerCount ?? 0,
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
