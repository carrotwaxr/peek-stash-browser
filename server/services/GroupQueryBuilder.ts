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
  FilterRef,
  ParsedFilter,
  RefCriterion,
  RefFieldCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type ParentKey,
  type SqlFragment,
  type ViaSceneSpec,
  allOf,
  buildCountFilter,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  noClause,
  refSetMatch,
  searchAll,
  viaSceneClause,
  visibleGuard,
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
  favoriteRefs,
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

/** The viewer whose exclusions apply, or null */
const viewerOf = (ctx: QueryContext): number | null =>
  ctx.applyExclusions ? ctx.userId : null;

/**
 * The collection's direct sub-collections that are live and the viewer can
 * see (`gsc`, through GroupRelation `gsr` by its primary key prefix): the
 * FROM after `SELECT ...`, the WHERE, and the parameters the FROM binds. A
 * sub-collection is on the collection's own instance, which the list
 * already allows.
 */
function visibleSubGroups(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("gsc", "group", viewerOf(ctx));
  return {
    sql: `FROM GroupRelation gsr JOIN StashGroup gsc ON gsc.id = gsr.subId AND gsc.stashInstanceId = gsr.subInstanceId${guard.join} WHERE gsr.containingId = g.id AND gsr.containingInstanceId = g.stashInstanceId AND gsr.subInstanceId = g.stashInstanceId AND ${guard.where}`,
    params: guard.params,
  };
}

/**
 * The collections directly containing it, live and visible to the viewer
 * (`gcp`, through GroupRelation `gcr` by its (subId, subInstanceId) index),
 * on its own instance: as `visibleSubGroups`
 */
function visibleContainingGroups(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("gcp", "group", viewerOf(ctx));
  return {
    sql: `FROM GroupRelation gcr JOIN StashGroup gcp ON gcp.id = gcr.containingId AND gcp.stashInstanceId = gcr.containingInstanceId${guard.join} WHERE gcr.subId = g.id AND gcr.subInstanceId = g.stashInstanceId AND gcr.containingInstanceId = g.stashInstanceId AND ${guard.where}`,
    params: guard.params,
  };
}

/** How many rows a `visible...` FROM reads, as a scalar subquery */
function countOf(from: FilterClause): FilterClause {
  return { sql: `(SELECT COUNT(*) ${from.sql})`, params: from.params };
}

/** The collection's live tags the viewer can see */
function tagCount(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("gtt", "tag", viewerOf(ctx));
  return {
    sql: `(SELECT COUNT(*) FROM GroupTag gtc JOIN StashTag gtt ON gtt.id = gtc.tagId AND gtt.stashInstanceId = gtc.tagInstanceId${guard.join} WHERE gtc.groupId = g.id AND gtc.groupInstanceId = g.stashInstanceId AND ${guard.where})`,
    params: guard.params,
  };
}

/**
 * The viewer's O count or plays summed over the collection's live scenes
 * they can see (Stash's group O count and play count, from the viewer's
 * own WatchHistory rows only): SceneGroup by its group index, each scene
 * by its key, the history by (user, instance, scene). Never missing: 0.
 */
function historySum(
  column: "oCount" | "playCount",
  ctx: QueryContext
): FilterClause {
  const guard = visibleGuard("gws", "scene", viewerOf(ctx));
  return {
    sql: `(SELECT COALESCE(SUM(gw.${column}), 0) FROM SceneGroup gwg JOIN StashScene gws ON gws.id = gwg.sceneId AND gws.stashInstanceId = gwg.sceneInstanceId${guard.join} JOIN WatchHistory gw ON gw.userId = ? AND gw.instanceId = gws.stashInstanceId AND gw.sceneId = gws.id WHERE gwg.groupId = g.id AND gwg.groupInstanceId = g.stashInstanceId AND ${guard.where})`,
    params: [...guard.params, ctx.userId],
  };
}

/**
 * The sub-group count column: the group's direct sub-groups that are live
 * and, with exclusions applied, not excluded for the user, as the
 * `sub_group_count` filter counts them. Each row probes GroupRelation's
 * primary key prefix (containingId, containingInstanceId), so a page of 40
 * groups is 40 lookups.
 */
function subGroupCountColumn(ctx: QueryContext): SqlFragment {
  const count = countOf(visibleSubGroups(ctx));
  return { sql: `${count.sql} AS subGroupCount`, params: count.params };
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
    filter: ParsedFilter<"group">,
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

      // The collection's tags the viewer can see, and the viewer's own O
      // count over its visible scenes: the values the filters read
      tag_count: this.countSort(tagCount(ctx), dir),
      o_counter: this.countSort(historySum("oCount", ctx), dir),
      ...this.subGroupOrderSort(dir, filter),

      // The viewer's rating (GroupRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),
    };
  }

  /**
   * Sub-collection order: the collection's index in the first collection
   * the filter's `containing_groups` includes, collections without one
   * (the filter's depth reaches collections further down) last. The LEFT
   * JOIN reads the one (containing, sub) row by GroupRelation's primary
   * key, on the collection's own instance, so the count is unchanged. A
   * collection has no expression without an including criterion: the key
   * falls back to the default sort (the parser refuses it first).
   */
  private subGroupOrderSort(
    dir: SortDirection,
    filter: ParsedFilter<"group">
  ): Record<string, SortExpr> {
    const criterion = filter.containing_groups;
    const first = criterion?.refs[0];
    if (
      criterion === undefined ||
      first === undefined ||
      (criterion.modifier !== "INCLUDES" &&
        criterion.modifier !== "INCLUDES_ALL")
    ) {
      return {};
    }
    return {
      sub_group_order: {
        sql: `sgo.orderIndex IS NULL, sgo.orderIndex ${dir}`,
        params: [],
        joins: [
          {
            sql: `LEFT JOIN GroupRelation sgo ON sgo.containingId = ? AND sgo.containingInstanceId = ${first.instanceId === undefined ? "g.stashInstanceId" : "?"} AND sgo.subId = g.id AND sgo.subInstanceId = g.stashInstanceId`,
            params:
              first.instanceId === undefined
                ? [first.id]
                : [first.id, first.instanceId],
          },
        ],
      },
    };
  }

  /**
   * The group filter's clauses, one per field, in the order the statement
   * ANDs them. A ref field's CTEs are named from the leaf (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"group"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    performer_favorite: (on, ctx) => this.performerFavoriteClause(on, ctx),
    o_counter: (c, ctx) => buildCountFilter(c, historySum("oCount", ctx)),
    play_count: (c, ctx) => buildCountFilter(c, historySum("playCount", ctx)),

    // Related entities
    studios: (c, ctx) => this.studioClause(c, ctx),
    scenes: (c, ctx) =>
      viaSceneClause(GROUPS_BY_SCENE, c.refs, c.modifier, ctx),
    performers: (c, ctx) =>
      viaSceneClause(GROUPS_BY_PERFORMER, c.refs, c.modifier, ctx),
    tags: (c, ctx) => this.tagClause(c, ctx),
    containing_groups: (c, ctx) =>
      this.hierarchyClause(
        visibleContainingGroups,
        ["gcp.id", "gcp.stashInstanceId"],
        "down",
        c,
        ctx
      ),
    sub_groups: (c, ctx) =>
      this.hierarchyClause(
        visibleSubGroups,
        ["gsc.id", "gsc.stashInstanceId"],
        "up",
        c,
        ctx
      ),

    // The viewer's rating and the counts
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    scene_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "g.sceneCount", "scenes")),
    sub_group_count: (c, ctx) =>
      buildCountFilter(c, countOf(visibleSubGroups(ctx))),
    containing_group_count: (c, ctx) =>
      buildCountFilter(c, countOf(visibleContainingGroups(ctx))),
    tag_count: (c, ctx) => buildCountFilter(c, tagCount(ctx)),
    duration: (c) => buildNumericFilter(c, "g.duration"),

    // Text
    name: (c) => buildTextFilter(c, "g.name"),
    synopsis: (c) => buildTextFilter(c, "g.synopsis"),
    director: (c) => buildTextFilter(c, "g.director"),
    // Stash's single aliases text as one phrase; any one of the links
    aliases: (c) => buildTextFilter(c, "g.aliases"),
    url: (c) => buildTextFilter(c, null, { lists: ["g.urls"] }),

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
   * `containing_groups` and `sub_groups`: a visible linked collection (a
   * containing one, or a sub-collection) among the refs with their
   * descendants to the depth (`containing_groups`, "down": the collections
   * under a ref within depth + 1 levels) or their ancestors
   * (`sub_groups`, "up": the collections holding a ref within depth + 1
   * levels). The expansion follows live links (utils/hierarchyUtils.ts)
   * and ends on a cycle; the link that matches must be to a collection the
   * viewer can see, so a hidden one links nothing. INCLUDES any,
   * INCLUDES_ALL one of each chosen ref's own group, EXCLUDES none (a
   * collection with no links kept). The refs match as pairs, above
   * PAIR_INLINE_LIMIT a refs CTE (`refSetMatch`).
   */
  private async hierarchyClause(
    links: (ctx: QueryContext) => FilterClause,
    key: ParentKey,
    direction: "down" | "up",
    criterion: RefCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    if (criterion.refs.length === 0) return noClause();
    const from = links(ctx);
    const holds = (refs: readonly FilterRef[], name: string): FilterClause => {
      const match = refSetMatch(key, refs, {
        name,
        allowedInstanceIds: ctx.allowedInstanceIds,
      });
      return {
        sql: `EXISTS (SELECT 1 ${from.sql} AND ${match.sql})`,
        params: [...from.params, ...match.params],
        ...(match.ctes ? { ctes: match.ctes } : {}),
      };
    };
    if (criterion.modifier === "INCLUDES_ALL") {
      const groups = await expandRefsEach(
        "group",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds,
        direction
      );
      return allOf(groups.map((group, i) => holds(group, `${ctx.name}_${i}`)));
    }
    const any = holds(
      await expandRefs(
        "group",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds,
        direction
      ),
      ctx.name
    );
    return criterion.modifier === "INCLUDES"
      ? any
      : { ...any, sql: `NOT ${any.sql}` };
  }

  /**
   * `performer_favorite`: a favourite performer of the viewer's (live, and
   * not one they hid: `favoriteRefs`) in one of the collection's live
   * scenes they can see (`true`), or none (`false`), as one EXISTS keyed on
   * the collection: SceneGroup by its group index, each scene's performers
   * by their key. The favourites match as pairs, above PAIR_INLINE_LIMIT a
   * refs CTE (`refSetMatch`): the via-scene INCLUDES, driven from the refs,
   * read every performer row of 267 favourites (0.9 s a count at 215k
   * scenes, against 4 ms keyed). With no favourites `true` matches nothing
   * and `false` is no filter.
   */
  private async performerFavoriteClause(
    on: boolean,
    ctx: LeafContext
  ): Promise<FilterClause> {
    const refs = await favoriteRefs("performer", ctx);
    if (refs.length === 0) {
      return on ? { sql: "1 = 0", params: [] } : noClause();
    }
    const scene = visibleGuard("gfs", "scene", viewerOf(ctx));
    const performer = visibleGuard("gfp", "performer", viewerOf(ctx));
    const match = refSetMatch(
      ["gfsp.performerId", "gfsp.performerInstanceId"],
      refs,
      { name: ctx.name, allowedInstanceIds: ctx.allowedInstanceIds }
    );
    const exists: FilterClause = {
      sql: `EXISTS (SELECT 1 FROM SceneGroup gfg JOIN StashScene gfs ON gfs.id = gfg.sceneId AND gfs.stashInstanceId = gfg.sceneInstanceId${scene.join} JOIN ScenePerformer gfsp ON gfsp.sceneId = gfs.id AND gfsp.sceneInstanceId = gfs.stashInstanceId JOIN StashPerformer gfp ON gfp.id = gfsp.performerId AND gfp.stashInstanceId = gfsp.performerInstanceId${performer.join} WHERE gfg.groupId = g.id AND gfg.groupInstanceId = g.stashInstanceId AND ${scene.where} AND ${performer.where} AND ${match.sql})`,
      params: [...scene.params, ...performer.params, ...match.params],
      ...(match.ctes ? { ctes: match.ctes } : {}),
    };
    return on ? exists : { ...exists, sql: `NOT ${exists.sql}` };
  }

  /**
   * The search across the name, synopsis and Stash's aliases text: every
   * word must match (`searchAll`), each as `likeContains` with `ESCAPE '\'`;
   * no `LOWER()`
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: "(g.name LIKE ? ESCAPE '\\' OR g.synopsis LIKE ? ESCAPE '\\' OR g.aliases LIKE ? ESCAPE '\\')",
      params: [pattern, pattern, pattern],
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
