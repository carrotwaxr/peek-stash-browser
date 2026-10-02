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
  NumberCriterion,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  type ViaSceneSpec,
  allOf,
  buildCountFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  instanceColumnClause,
  noClause,
  refClause,
  refSetMatch,
  searchAll,
  viaSceneClause,
  visibleGuard,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  jsonListArm,
  parseJsonArray,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../utils/sqlJson.js";
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

/** The viewer whose exclusions apply, or null */
const viewerOf = (ctx: QueryContext): number | null =>
  ctx.applyExclusions ? ctx.userId : null;

/**
 * The tag's live parents the viewer can see (`tpp`), read from its
 * `parentIds` (`tpj`) on its own instance: the FROM after `SELECT ...`, the
 * WHERE, and the parameters the FROM binds
 */
function visibleParents(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("tpp", "tag", viewerOf(ctx));
  return {
    sql: `FROM json_each(${jsonListOrEmpty("t.parentIds")}) tpj JOIN StashTag tpp ON tpp.id = tpj.value AND tpp.stashInstanceId = t.stashInstanceId${guard.join} WHERE ${guard.where}`,
    params: guard.params,
  };
}

/**
 * Every live tag the viewer can see (`tcc`) with each of its parents' ids
 * (`tcj.value`): the parent-child links whose child shows
 */
function visibleChildLinks(ctx: QueryContext): FilterClause {
  const guard = visibleGuard("tcc", "tag", viewerOf(ctx));
  return {
    sql: `FROM StashTag tcc CROSS JOIN json_each(${jsonListOrEmpty("tcc.parentIds")}) tcj${guard.join} WHERE ${guard.where}`,
    params: guard.params,
  };
}

/** The tag's visible parents, each once */
function parentCount(ctx: QueryContext): FilterClause {
  const parents = visibleParents(ctx);
  return {
    sql: `(SELECT COUNT(DISTINCT tpp.id) ${parents.sql})`,
    params: parents.params,
  };
}

/**
 * The tag's visible children: one grouped pass over the live tags' parent
 * lists (`<name>_children`, on the allowed instances), looked up by the
 * tag's key. `parentIds` has no index, so a per-row count would read every
 * tag's list for every tag.
 */
function childCount(ctx: LeafContext): FilterClause {
  const links = visibleChildLinks(ctx);
  const instances = instanceColumnClause(
    "tcc.stashInstanceId",
    ctx.allowedInstanceIds
  );
  const name = `${ctx.name}_children`;
  return {
    sql: `COALESCE((SELECT k.n FROM ${name} k WHERE k.pid = t.id AND k.inst = t.stashInstanceId), 0)`,
    params: [],
    ctes: [
      {
        name,
        sql: `${name}(pid, inst, n) AS MATERIALIZED (SELECT tcj.value, tcc.stashInstanceId, COUNT(DISTINCT tcc.id) ${links.sql} AND ${instances.sql} GROUP BY tcj.value, tcc.stashInstanceId)`,
        params: [...links.params, ...instances.params],
      },
    ],
  };
}

/**
 * The live clips (Stash's markers) the viewer can see in live scenes they
 * can see, with the tag as the primary tag or in the clip's tags, each
 * clip once
 */
function markerCount(ctx: QueryContext): FilterClause {
  const clip = visibleGuard("mc", "clip", viewerOf(ctx));
  const scene = visibleGuard("ms", "scene", viewerOf(ctx));
  const tagged =
    "SELECT mk.id AS cid, mk.stashInstanceId AS cinst FROM StashClip mk WHERE mk.primaryTagId = t.id AND mk.primaryTagInstanceId = t.stashInstanceId UNION SELECT ct.clipId, ct.clipInstanceId FROM ClipTag ct WHERE ct.tagId = t.id AND ct.tagInstanceId = t.stashInstanceId";
  return {
    sql: `(SELECT COUNT(*) FROM (${tagged}) mt JOIN StashClip mc ON mc.id = mt.cid AND mc.stashInstanceId = mt.cinst${clip.join} JOIN StashScene ms ON ms.id = mc.sceneId AND ms.stashInstanceId = mc.sceneInstanceId${scene.join} WHERE ${clip.where} AND ${scene.where})`,
    params: [...clip.params, ...scene.params],
  };
}

/** A stored count column as the viewer sees it, as a number filter */
const storedCount =
  (column: string, relation: Parameters<typeof visibleCount>[2]) =>
  (c: NumberCriterion, ctx: QueryContext) =>
    buildNumericFilter(c, visibleCount(ctx, column, relation));

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
    children: (c, ctx) => this.childClause(c, ctx),
    performers: (c, ctx) => this.junction(PERFORMER_TAGS, c, ctx),
    studios: (c, ctx) => this.junction(STUDIO_TAGS, c, ctx),
    scenes: (c, ctx) => viaSceneClause(TAGS_BY_SCENE, c.refs, c.modifier, ctx),
    groups: (c, ctx) => viaSceneClause(TAGS_BY_GROUP, c.refs, c.modifier, ctx),

    // Counts, as the viewer sees them
    scene_count: (c, ctx) => buildNumericFilter(c, sceneCount(ctx)),
    parent_count: (c, ctx) => buildCountFilter(c, parentCount(ctx)),
    child_count: (c, ctx) => buildCountFilter(c, childCount(ctx)),
    image_count: storedCount("t.imageCount", "images"),
    gallery_count: storedCount("t.galleryCount", "galleries"),
    performer_count: storedCount("t.performerCount", "performers"),
    studio_count: storedCount("t.studioCount", "studios"),
    group_count: storedCount("t.groupCount", "groups"),
    marker_count: (c, ctx) => buildCountFilter(c, markerCount(ctx)),

    // Text
    name: (c) => buildTextFilter(c, "t.name"),
    description: (c) => buildTextFilter(c, "t.description"),

    // Dates
    created_at: (c, ctx) =>
      buildInstantFilter(c, "t.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "t.stashUpdatedAt", ctx.timeZone),
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
   * The parents filter: a visible parent in the tag's `parentIds` (read
   * through json_each, on the tag's own instance) among the refs with their
   * descendants to the depth, so the tags under a ref within depth + 1
   * levels (Stash's rule). INCLUDES any, INCLUDES_ALL one of each chosen
   * parent's own group, EXCLUDES none (a tag with no parents kept). The
   * refs match as pairs, above PAIR_INLINE_LIMIT a refs CTE (`refSetMatch`).
   */
  private async parentClause(
    criterion: RefCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    if (criterion.refs.length === 0) return noClause();
    const parents = visibleParents(ctx);
    const holds = (refs: readonly FilterRef[], name: string): FilterClause => {
      const match = refSetMatch(["tpp.id", "tpp.stashInstanceId"], refs, {
        name,
        allowedInstanceIds: ctx.allowedInstanceIds,
      });
      return {
        sql: `EXISTS (SELECT 1 ${parents.sql} AND ${match.sql})`,
        params: [...parents.params, ...match.params],
        ...(match.ctes ? { ctes: match.ctes } : {}),
      };
    };
    // Each ref keeps its instance through the expansion, and a bare ref
    // expands on every allowed instance (utils/hierarchyUtils.ts)
    if (criterion.modifier === "INCLUDES_ALL") {
      const groups = await expandRefsEach(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      );
      return allOf(groups.map((group, i) => holds(group, `${ctx.name}_${i}`)));
    }
    const any = holds(
      await expandRefs(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      ),
      ctx.name
    );
    return criterion.modifier === "INCLUDES"
      ? any
      : { ...any, sql: `NOT ${any.sql}` };
  }

  /**
   * The children filter: the refs with their ancestors to the depth (F3's
   * "up"), then the tags holding one of them as a visible child, so the
   * tags having a ref as a child within depth + 1 levels. INCLUDES is a
   * row-value IN on the tag's key, read once; EXCLUDES a NOT IN over one
   * text key per link (never a row-value NOT IN), with no NULL in the set;
   * INCLUDES_ALL one IN per chosen child, each with its own ancestors.
   */
  private async childClause(
    criterion: RefCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    if (criterion.refs.length === 0) return noClause();
    const links = visibleChildLinks(ctx);
    const parentsOf = (
      refs: readonly FilterRef[],
      name: string,
      modifier: "INCLUDES" | "EXCLUDES"
    ): FilterClause => {
      const match = refSetMatch(["tcc.id", "tcc.stashInstanceId"], refs, {
        name,
        allowedInstanceIds: ctx.allowedInstanceIds,
      });
      const ctes = match.ctes ? { ctes: match.ctes } : {};
      const params = [...links.params, ...match.params];
      return modifier === "INCLUDES"
        ? {
            sql: `(t.id, t.stashInstanceId) IN (SELECT tcj.value, tcc.stashInstanceId ${links.sql} AND ${match.sql})`,
            params,
            ...ctes,
          }
        : {
            sql: `(t.id || ':' || t.stashInstanceId) NOT IN (SELECT tcj.value || ':' || tcc.stashInstanceId ${links.sql} AND tcj.value IS NOT NULL AND ${match.sql})`,
            params,
            ...ctes,
          };
    };
    if (criterion.modifier === "INCLUDES_ALL") {
      const groups = await expandRefsEach(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds,
        "up"
      );
      return allOf(
        groups.map((group, i) =>
          parentsOf(group, `${ctx.name}_${i}`, "INCLUDES")
        )
      );
    }
    return parentsOf(
      await expandRefs(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds,
        "up"
      ),
      ctx.name,
      criterion.modifier
    );
  }

  /**
   * The search across the name, description and aliases: every word must
   * match (`searchAll`), each as `likeContains` with `ESCAPE '\'`, an alias
   * read one at a time; no `LOWER()`
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: `(t.name LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR ${jsonListArm("t.aliases")})`,
      params: [pattern, pattern, pattern],
    }));
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
