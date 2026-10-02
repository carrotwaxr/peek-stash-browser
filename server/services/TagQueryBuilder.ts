/**
 * TagQueryBuilder: the tag list in SQL.
 *
 * The tag builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the tag's spec (table, per-user joins, columns, tiebreak), its
 * filter clauses from the parsed request, its sort map, its row transform
 * and its relations (with its parents and children). The instance filter,
 * the exclusion join, the `ids` filter, the random sort and the count are
 * the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { NormalizedTag } from "../types/index.js";
import type { TagQueryRow } from "../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  type SqlFragment,
  type SqlParam,
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
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
} from "./query/EntityQueryBuilder.js";
import { excludedCountsJoin, visibleCount } from "./query/excludedCounts.js";
import {
  TAG_REF,
  byName,
  loadRefsByKey,
  loadTagChildren,
} from "./query/nestedRefs.js";

// Column list for SELECT - all StashTag fields plus user data; the card's
// counts as the viewer sees them (query/excludedCounts.ts). The direct and
// via-performer scene counts stay as stored.
const selectColumns = (ctx: QueryContext) =>
  `
    t.id, t.stashInstanceId, t.name, t.favorite AS stashFavorite,
    t.sceneCount, t.sceneCountViaPerformers,
    ${visibleCount(ctx, "t.sceneCountAll", "scenes")} AS sceneCountAll,
    ${visibleCount(ctx, "t.imageCount", "images")} AS imageCount,
    ${visibleCount(ctx, "t.galleryCount", "galleries")} AS galleryCount,
    ${visibleCount(ctx, "t.performerCount", "performers")} AS performerCount,
    ${visibleCount(ctx, "t.studioCount", "studios")} AS studioCount,
    ${visibleCount(ctx, "t.groupCount", "groups")} AS groupCount,
    t.description, t.aliases, t.parentIds, t.imagePath,
    t.stashCreatedAt, t.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    us.oCounter AS userOCounter, us.playCount AS userPlayCount
  `.trim();

const TAG_SPEC: EntitySpec = {
  table: "StashTag",
  alias: "t",
  entityType: "tag",
  userJoins: [
    { table: "TagRating", alias: "r", entityIdCol: "tagId" },
    { table: "UserTagStats", alias: "us", entityIdCol: "tagId" },
  ],
  // The viewer's excluded links per tag, for the counts
  extraJoins: (ctx) => excludedCountsJoin(ctx, "tag", "t"),
  selectColumns: (ctx) => ({ sql: selectColumns(ctx), params: [] }),
  defaultSort: "name",
  // Equal values list by name, then by the base's key
  tiebreak: (field) =>
    field === "name" ? undefined : "t.name COLLATE NOCASE ASC",
};

/**
 * The scene count the card shows: the live scenes tagged directly or
 * inheriting the tag, each once, as the scene list's tag filter matches them
 * (LinkCountService), minus the ones the viewer cannot see
 */
const sceneCount = (ctx: QueryContext) =>
  visibleCount(ctx, "t.sceneCountAll", "scenes");

/** A junction holding the tag and another entity (a performer's tags) */
const tagJunction = (
  table: string,
  alias: string,
  refIdCol: string,
  refInstanceCol: string
): JunctionTarget => ({
  kind: "junction",
  table,
  alias,
  parentAlias: "t",
  parentIdCol: "tagId",
  parentInstanceCol: "tagInstanceId",
  refIdCol,
  refInstanceCol,
});
/** Tags on one of the performers */
const PERFORMER_TAGS = tagJunction(
  "PerformerTag",
  "pt",
  "performerId",
  "performerInstanceId"
);
/** Tags on one of the studios */
const STUDIO_TAGS = tagJunction(
  "StudioTag",
  "stt",
  "studioId",
  "studioInstanceId"
);

/** Tags on one of the scenes (the Tags page's scene filter) */
const TAGS_BY_SCENE: ViaSceneSpec = {
  alias: "t",
  junction: { table: "SceneTag", alias: "st" },
  entityIdCol: "tagId",
  entityInstanceCol: "tagInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** Tags on a scene of one of the groups (the Tags page's collection filter) */
const TAGS_BY_GROUP: ViaSceneSpec = {
  ...TAGS_BY_SCENE,
  via: {
    table: "SceneGroup",
    alias: "sg",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "groupId",
    refInstanceCol: "groupInstanceId",
  },
};

/**
 * One parent ref on the tag's `parentIds` JSON list. A tag's parents are on
 * the tag's own instance, so a ref with an instance matches tags on that
 * instance only; a bare ref matches the id on every instance.
 */
function parentCondition(ref: FilterRef): { sql: string; params: SqlParam[] } {
  const pattern = `%"${ref.id}"%`;
  return ref.instanceId === undefined || ref.instanceId === ""
    ? { sql: "t.parentIds LIKE ?", params: [pattern] }
    : {
        sql: "(t.stashInstanceId = ? AND t.parentIds LIKE ?)",
        params: [ref.instanceId, pattern],
      };
}

/**
 * Builds and executes SQL queries for tag filtering
 */
class TagQueryBuilder extends EntityQueryBuilder<
  TagQueryRow,
  NormalizedTag,
  "tag"
> {
  protected readonly spec = TAG_SPEC;

  protected sortMap(
    dir: SortDirection,
    _filter: ParsedFilter<"tag">,
    ctx: QueryContext
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Tag metadata, the name case-insensitive
      name: column("t.name COLLATE NOCASE"),
      created_at: column("t.stashCreatedAt"),
      updated_at: column("t.stashUpdatedAt"),

      // Counts, as the viewer sees them; the marker count is Stash's
      scene_count: column(sceneCount(ctx)),
      scenes_count: column(sceneCount(ctx)),
      image_count: column(visibleCount(ctx, "t.imageCount", "images")),
      gallery_count: column(visibleCount(ctx, "t.galleryCount", "galleries")),
      performer_count: column(
        visibleCount(ctx, "t.performerCount", "performers")
      ),
      studio_count: column(visibleCount(ctx, "t.studioCount", "studios")),
      group_count: column(visibleCount(ctx, "t.groupCount", "groups")),
      // Stash's count, markers on hidden scenes included: ordering only (the
      // page's Markers statistic is the viewer's own, `countRelations`)
      scene_marker_count: column("t.sceneMarkerCount"),

      // The viewer's rating (TagRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),

      // The viewer's stats (UserTagStats)
      o_counter: column("COALESCE(us.oCounter, 0)"),
      play_count: column("COALESCE(us.playCount, 0)"),
    };
  }

  /**
   * The tag filter's clauses, one per field, in the order the statement ANDs
   * them. A ref field's CTEs are named from the leaf (`ctx.name`); the nested
   * `scenes` and `groups` fields are keyed by those names.
   */
  protected override readonly fieldClauses: FieldClauses<"tag"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    o_counter: (c) => buildNumericFilter(c, "COALESCE(us.oCounter, 0)"),
    play_count: (c) => buildNumericFilter(c, "COALESCE(us.playCount, 0)"),

    // Related entities
    parents: (c, ctx) => this.parentClause(c, ctx),
    performers: (c, ctx) => this.junction(PERFORMER_TAGS, c, ctx),
    studios: (c, ctx) => this.junction(STUDIO_TAGS, c, ctx),
    scenes: (c) => viaSceneClause(TAGS_BY_SCENE, c.refs, c.modifier),
    groups: (c) => viaSceneClause(TAGS_BY_GROUP, c.refs, c.modifier),

    // Counts, as the viewer sees them
    scene_count: (c, ctx) => buildNumericFilter(c, sceneCount(ctx)),

    // Text
    name: (c) => buildTextFilter(c, "t.name"),
    description: (c) => buildTextFilter(c, "t.description"),

    // Dates
    created_at: (c) => buildDateFilter(c, "t.stashCreatedAt"),
    updated_at: (c) => buildDateFilter(c, "t.stashUpdatedAt"),
  };

  /** A ref filter on a junction, its CTEs named from the leaf */
  private junction(
    target: JunctionTarget,
    criterion: RefCriterion,
    ctx: LeafContext
  ): FilterClause {
    return refClause(target, criterion.refs, criterion.modifier, {
      name: ctx.name,
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /**
   * The parents filter on the `parentIds` JSON list, with the parents'
   * descendants to the depth: INCLUDES any of them, INCLUDES_ALL one of
   * each chosen parent's own group, EXCLUDES none (a tag with no parents
   * included)
   */
  private async parentClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    /** The OR chain of the refs' conditions, unwrapped */
    const anyOf = (refs: readonly FilterRef[]): SqlFragment => {
      const conditions = refs.map(parentCondition);
      return {
        sql: conditions.map((c) => c.sql).join(" OR "),
        params: conditions.flatMap((c) => c.params),
      };
    };
    // Each ref keeps its instance through the expansion, and a bare ref
    // expands on every allowed instance (utils/hierarchyUtils.ts)
    if (criterion.modifier === "INCLUDES_ALL") {
      // One group per chosen parent, each with its own descendants: under
      // any descendant of each (QUERIES-08)
      const groups = await expandRefsEach(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      );
      const each = groups.map((group) => {
        const c = anyOf(group);
        return group.length > 1 ? { ...c, sql: `(${c.sql})` } : c;
      });
      return {
        sql: `(${each.map((c) => c.sql).join(" AND ")})`,
        params: each.flatMap((c) => c.params),
      };
    }
    const any = anyOf(
      await expandRefs(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      )
    );
    switch (criterion.modifier) {
      case "INCLUDES":
        return { sql: `(${any.sql})`, params: any.params };
      case "EXCLUDES":
        return {
          sql: `(t.parentIds IS NULL OR NOT (${any.sql}))`,
          params: any.params,
        };
    }
  }

  /**
   * The search across the name, description and aliases: `likeContains`
   * with `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  protected override searchClause(q: string): FilterClause {
    const pattern = likeContains(q.toLowerCase());
    return {
      sql: "(LOWER(t.name) LIKE ? ESCAPE '\\' OR LOWER(t.description) LIKE ? ESCAPE '\\' OR LOWER(t.aliases) LIKE ? ESCAPE '\\')",
      params: [pattern, pattern, pattern],
    };
  }

  /**
   * Transform a raw database row into a NormalizedTag
   */
  protected transformRow(row: TagQueryRow): NormalizedTag {
    const directSceneCount = row.sceneCount ?? 0;
    const performerSceneCount = row.sceneCountViaPerformers ?? 0;

    const tag = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      description: emptyToNull(row.description),
      aliases: parseJsonArray(row.aliases),
      // The parent ids; populateRelations keeps the ones the viewer may
      // see, as their refs
      parents: parseJsonArray(row.parentIds).map((id) => ({ id })),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts: the card's scene count is the tag's Scenes tab (direct or
      // inherited, each scene once), beside its two parts
      scene_count: Number(row.sceneCountAll),
      scene_count_direct: directSceneCount,
      scene_count_via_performers: performerSceneCount,
      image_count: Number(row.imageCount ?? 0),
      gallery_count: Number(row.galleryCount ?? 0),
      performer_count: Number(row.performerCount ?? 0),
      studio_count: Number(row.studioCount ?? 0),
      group_count: Number(row.groupCount ?? 0),

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations: loaded for the page
      children: [],
    };

    return tag as NormalizedTag;
  }

  /**
   * The card's relations for the whole page: at most TOOLTIP_LIMIT
   * performers, studios, collections and galleries with how many there are
   * (TooltipRelations), one statement per relation; and its parents and
   * children (nestedRefs), one statement each
   */
  protected async populateRelations(
    tags: NormalizedTag[],
    ctx: QueryContext
  ): Promise<void> {
    if (tags.length === 0) return;

    const [relations] = await Promise.all([
      loadTooltipRelations("tag", tags, ctx.userId),
      this.hydrateHierarchy(tags, ctx),
    ]);
    for (const tag of tags) {
      Object.assign(tag, relations.get(entityKey(tag.id, tag.instanceId)));
    }
  }

  /**
   * The page's parents and children, on each tag's own instance: only the
   * live ones the viewer may see (a hidden or deleted parent is left out),
   * the parents in the tag's order, the children by name
   */
  private async hydrateHierarchy(
    tags: NormalizedTag[],
    ctx: QueryContext
  ): Promise<void> {
    const parentRefs = tags.flatMap((tag) =>
      tag.parents.map((parent) => ({
        id: parent.id,
        instanceId: tag.instanceId,
      }))
    );
    const [parents, children] = await Promise.all([
      loadRefsByKey(TAG_REF, parentRefs, ctx),
      loadTagChildren(tags, ctx),
    ]);
    for (const tag of tags) {
      tag.parents = tag.parents.flatMap((parent) => {
        const visible = parents.get(entityKey(parent.id, tag.instanceId));
        return visible ? [visible] : [];
      });
      tag.children = byName(
        children.get(entityKey(tag.id, tag.instanceId)) ?? []
      );
    }
  }
}

// Export singleton instance
export const tagQueryBuilder = new TagQueryBuilder();
