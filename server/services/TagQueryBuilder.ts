/**
 * TagQueryBuilder: the tag list in SQL.
 *
 * The tag builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the tag's spec (table, per-user joins, columns, tiebreak), its
 * filter clauses from the parsed request, its sort map, its row transform
 * and its relations (with its parents' names). The instance filter, the
 * exclusion join, the `ids` filter, the random sort and the count are the
 * base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type { NormalizedTag } from "../types/index.js";
import type { TagQueryRow } from "../types/internal/queryRows.js";
import type {
  FilterRef,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandTagIds } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
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
  type QueryContext,
  type SortExpr,
  expandRefs,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - all StashTag fields plus user data
const SELECT_COLUMNS = `
    t.id, t.stashInstanceId, t.name, t.favorite AS stashFavorite,
    t.sceneCount, t.imageCount, t.galleryCount, t.performerCount, t.studioCount, t.groupCount, t.sceneMarkerCount,
    t.sceneCountViaPerformers,
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
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "name",
  // Equal values list by name, then by the base's key
  tiebreak: (field) =>
    field === "name" ? undefined : "t.name COLLATE NOCASE ASC",
};

/** The scene count the card shows: the larger of the direct and via-performer counts */
const SCENE_COUNT =
  "MAX(COALESCE(t.sceneCount, 0), COALESCE(t.sceneCountViaPerformers, 0))";

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

  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Tag metadata, the name case-insensitive
      name: column("t.name COLLATE NOCASE"),
      created_at: column("t.stashCreatedAt"),
      updated_at: column("t.stashUpdatedAt"),

      // Counts
      scene_count: column(SCENE_COUNT),
      scenes_count: column(SCENE_COUNT),
      image_count: column("t.imageCount"),
      gallery_count: column("t.galleryCount"),
      performer_count: column("t.performerCount"),
      studio_count: column("t.studioCount"),
      group_count: column("t.groupCount"),
      scene_marker_count: column("t.sceneMarkerCount"),

      // The viewer's rating (TagRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),

      // The viewer's stats (UserTagStats)
      o_counter: column("COALESCE(us.oCounter, 0)"),
      play_count: column("COALESCE(us.playCount, 0)"),
    };
  }

  /** The tag filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"tag">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause) => clauses.push(clause);
    const junction = (
      name: string,
      target: JunctionTarget,
      criterion: RefCriterion
    ) =>
      refClause(target, criterion.refs, criterion.modifier, {
        name,
        allowedInstanceIds: ctx.allowedInstanceIds,
      });
    const via = (spec: ViaSceneSpec, criterion: RefCriterion) =>
      viaSceneClause(spec, criterion.refs, criterion.modifier);

    if (q !== undefined) push(this.searchClause(q));

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, "COALESCE(us.oCounter, 0)"));
    }
    if (filter.play_count) {
      push(buildNumericFilter(filter.play_count, "COALESCE(us.playCount, 0)"));
    }

    // Related entities
    if (filter.parents) push(await this.parentClause(filter.parents));
    if (filter.performers) {
      push(junction("performers", PERFORMER_TAGS, filter.performers));
    }
    if (filter.studios) {
      push(junction("studios", STUDIO_TAGS, filter.studios));
    }
    if (filter.scenes) push(via(TAGS_BY_SCENE, filter.scenes));
    if (filter.groups) push(via(TAGS_BY_GROUP, filter.groups));

    // Counts
    if (filter.scene_count) {
      push(buildNumericFilter(filter.scene_count, SCENE_COUNT));
    }

    // Text
    if (filter.name) push(buildTextFilter(filter.name, "t.name"));
    if (filter.description) {
      push(buildTextFilter(filter.description, "t.description"));
    }

    // Dates
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "t.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "t.stashUpdatedAt"));
    }

    return clauses;
  }

  /**
   * The parents filter on the `parentIds` JSON list, with the parents'
   * descendants to the depth: INCLUDES any of them, INCLUDES_ALL every one,
   * EXCLUDES none (a tag with no parents included)
   */
  private async parentClause(criterion: RefCriterion): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandTagIds
    );
    const conditions = refs.map(parentCondition);
    const params = conditions.flatMap((c) => c.params);
    switch (criterion.modifier) {
      case "INCLUDES":
        return {
          sql: `(${conditions.map((c) => c.sql).join(" OR ")})`,
          params,
        };
      case "INCLUDES_ALL":
        return {
          sql: `(${conditions.map((c) => c.sql).join(" AND ")})`,
          params,
        };
      case "EXCLUDES":
        return {
          sql: `(t.parentIds IS NULL OR NOT (${conditions.map((c) => c.sql).join(" OR ")}))`,
          params,
        };
    }
  }

  /**
   * The search across the name, description and aliases: `likeContains`
   * with `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  private searchClause(q: string): FilterClause {
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
      parents: parseJsonArray(row.parentIds).map((id: string) => ({
        id,
        name: "",
      })),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts: the larger of the direct and via-performer scene counts
      scene_count: Math.max(directSceneCount, performerSceneCount),
      scene_count_direct: directSceneCount,
      scene_count_via_performers: performerSceneCount,
      image_count: row.imageCount ?? 0,
      gallery_count: row.galleryCount ?? 0,
      performer_count: row.performerCount ?? 0,
      studio_count: row.studioCount ?? 0,
      group_count: row.groupCount ?? 0,
      scene_marker_count: row.sceneMarkerCount ?? 0,

      // Timestamps
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY
      rating: row.userRating,
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCounter ?? 0,
      play_count: row.userPlayCount ?? 0,

      // Relations
      children: [] as NormalizedTag[],
    };

    return tag as NormalizedTag;
  }

  /**
   * The card's relations for the whole page: at most TOOLTIP_LIMIT
   * performers, studios, collections and galleries with how many there are
   * (TooltipRelations), one statement per relation; and its parents' names
   */
  protected async populateRelations(
    tags: NormalizedTag[],
    ctx: QueryContext
  ): Promise<void> {
    if (tags.length === 0) return;

    const [relations] = await Promise.all([
      loadTooltipRelations("tag", tags, ctx.userId),
      this.hydrateParentNames(tags),
    ]);
    for (const tag of tags) {
      Object.assign(tag, relations.get(entityKey(tag.id, tag.instanceId)));
    }
  }

  /** The names of the page's parent tags, on each tag's own instance */
  private async hydrateParentNames(tags: NormalizedTag[]): Promise<void> {
    const parentIds = new Set(
      tags.flatMap((tag) => tag.parents.map((parent) => parent.id))
    );
    if (parentIds.size === 0) return;

    const parentTags = await prisma.stashTag.findMany({
      where: {
        id: { in: [...parentIds] },
        stashInstanceId: { in: [...new Set(tags.map((t) => t.instanceId))] },
      },
      select: { id: true, stashInstanceId: true, name: true },
    });
    const names = new Map(
      parentTags.map((parent) => [
        entityKey(parent.id, parent.stashInstanceId),
        emptyToNull(parent.name) ?? "Unknown",
      ])
    );
    for (const tag of tags) {
      tag.parents = tag.parents.map((parent) => ({
        id: parent.id,
        name: names.get(entityKey(parent.id, tag.instanceId)) ?? "Unknown",
      }));
    }
  }
}

// Export singleton instance
export const tagQueryBuilder = new TagQueryBuilder();
