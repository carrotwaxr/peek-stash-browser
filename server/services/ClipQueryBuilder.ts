/**
 * The clip list on the base query builder (item 74): the Clips page, a
 * scene's clips and a clip by id.
 *
 * A clip shows only while its scene does: the scene is joined on the clip's
 * (sceneId, sceneInstanceId) and must be live, and the viewer's exclusions
 * apply to both, the clip's own rows (its tags cascade to it) through the
 * base's join and the scene's through the spec's second join. Its primary
 * tag and tag list load with the page's relations, only the tags the viewer
 * may see. A clip has no per-user data, so no user joins. The instance
 * filter, the random sort and the count are the base's.
 *
 * How it plans (S5, measured at 207k and 300k clips): the default page
 * (newest first) walks `StashClip_browse_idx` and stops after its rows,
 * each clip's scene read by its key (`deletedAt` never drives it, see the
 * spec); the count checks each scene live on
 * `StashScene_id_stashInstanceId_deletedAt_idx` from the index alone. A
 * filter on the clip's tags, its scene's tags or its scene's performers
 * matches a list of the parents the junction's ref index names
 * (`sortedByIndex: false`): SQLite drives from it when it is short, and
 * builds it once and probes it per clip when it is long (beside a studio or
 * a scene, which drive, each probes per clip). The scene is an INNER JOIN
 * the planner may reorder, so a studio drives from its own scenes; forcing
 * the clip first (`CROSS JOIN`) made a studio's page 13 times slower.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { ClipTagRef } from "../types/api/clips.js";
import type { ClipRow, ClipTagRefRow } from "../types/internal/queryRows.js";
import type {
  ClipListRequest,
  FilterRef,
  RefCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type RefClauseOptions,
  allOf,
  anyOf,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  exclusionJoin,
  refClause,
  searchAll,
} from "../utils/sqlClauses.js";
import { searchTerms } from "../utils/sqlHelpers.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
} from "./query/EntityQueryBuilder.js";
import {
  type NestedEntity,
  type NestedLink,
  loadNestedRefs,
} from "./query/nestedRefs.js";

/**
 * A clip with its scene and tags as the database holds them: ClipService
 * turns the paths into proxy URLs and the dates into ISO strings
 * (`ClipWithRelations` in `shared/types/api/clips.ts`)
 */
export interface ClipWithRelations {
  id: string;
  instanceId: string;
  sceneId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  screenshotPath: string | null;
  isGenerated: boolean;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;
  primaryTag: ClipTagRef | null;
  tags: ClipTagRef[];
  scene: {
    id: string;
    title: string | null;
    pathScreenshot: string | null;
    studioId: string | null;
    stashInstanceId: string;
  };
}

/** A scene's clips: the scene by (id, instance), a bare id on every allowed instance */
export interface SceneClipsOptions {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly scene: FilterRef;
  /** Clips without a generated preview too */
  readonly includeUngenerated: boolean;
}

/** A clip by its ref: a bare id matches it on every allowed instance */
export interface ClipByIdOptions {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly ref: FilterRef;
}

const SELECT_COLUMNS = `c.id, c.stashInstanceId, c.sceneId, c.sceneInstanceId,
  c.title, c.seconds, c.endSeconds,
  c.primaryTagId, c.primaryTagInstanceId,
  c.screenshotPath,
  c.isGenerated, c.stashCreatedAt, c.stashUpdatedAt,
  s.title AS sceneTitle, s.pathScreenshot AS scenePathScreenshot,
  s.studioId AS sceneStudioId`;

/** The clip's scene, on its (id, instance): a clip without one does not list */
const SCENE_JOIN =
  "INNER JOIN StashScene s ON c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId";

/** Clips of a scene: the clip's own scene columns */
const CLIP_SCENE: ColumnTarget = {
  kind: "column",
  parentTable: "StashClip",
  parentAlias: "c",
  idCol: "sceneId",
  instanceCol: "sceneInstanceId",
};

/** A tag on the clip itself: its primary tag ... */
const PRIMARY_TAG: ColumnTarget = {
  kind: "column",
  parentTable: "StashClip",
  parentAlias: "c",
  idCol: "primaryTagId",
  instanceCol: "primaryTagInstanceId",
};

/** The primary tag as a nested ref's link: a column of the clip's own row */
const PRIMARY_TAG_LINK: NestedLink = {
  table: "StashClip",
  parentIdCol: "id",
  parentInstanceCol: "stashInstanceId",
  refIdCol: "primaryTagId",
  refInstanceCol: "primaryTagInstanceId",
};

/** A clip's tag as a nested ref: its name and color */
const CLIP_TAG_REF: NestedEntity<ClipTagRefRow, ClipTagRef> = {
  table: "StashTag",
  entityType: "tag",
  columns: "x.name, x.color",
  toRef: (row) => ({ id: row.id, name: row.name, color: row.color }),
};

/** ... or one of its tag list */
const CLIP_TAGS: JunctionTarget = {
  kind: "junction",
  table: "ClipTag",
  alias: "ct",
  parentAlias: "c",
  parentIdCol: "clipId",
  parentInstanceCol: "clipInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/**
 * A tag on the clip's scene, matched on the clip's own scene columns: while
 * the default page walks StashClip_browse_idx, a clip whose scene lacks the
 * tag is passed over from the index before its scene is read
 */
const SCENE_TAGS: JunctionTarget = {
  kind: "junction",
  table: "SceneTag",
  alias: "st",
  parentAlias: "s",
  parentKey: ["c.sceneId", "c.sceneInstanceId"],
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/** A tag the clip's scene inherits (from its performers, studio, groups) */
const SCENE_INHERITED_TAGS: JunctionTarget = {
  ...SCENE_TAGS,
  table: "SceneInheritedTag",
  alias: "sit",
};

/** A performer in the clip's scene */
const SCENE_PERFORMERS: JunctionTarget = {
  kind: "junction",
  table: "ScenePerformer",
  alias: "sp",
  parentAlias: "s",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol: "performerId",
  refInstanceCol: "performerInstanceId",
};

/** The clip's scene's studio */
const SCENE_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashScene",
  parentAlias: "s",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/** A clip ref clause's options: the CTE name, and the index shape when the list drives */
function refOptions(ctx: LeafContext, name: string): RefClauseOptions {
  return {
    name,
    allowedInstanceIds: ctx.allowedInstanceIds,
    ...(ctx.lists === true ? { sortedByIndex: false } : {}),
  };
}

/**
 * A clip leaf's CTE name: the one the statement always had for the field's
 * own values (`studio`, `scene`), the leaf's for its excludes
 * (`studios_not`), so the two leaves of one field never share a name
 */
function cteName(ctx: LeafContext, field: string, own: string): string {
  return ctx.name === field ? own : ctx.name;
}

/**
 * A tag on the clip itself: its primary tag or one of its tag list, each
 * ref with its sub-tags to the criterion's depth. Has ANY is either holding
 * any of the refs; Has ALL each ref (with its sub-tags) held by one or the
 * other (one OR per ref, AND-ed), so a clip with T1 as its primary tag and
 * T2 in its list has both; Has NONE neither holding any (the primary tag's
 * EXCLUDES keeps a clip without one). An OR of the two EXCLUDES would keep
 * a clip holding a ref in only one of them. The CTEs are the statement's
 * own (`primary_tag`, `clip_tags`), the excludes' leaf's prefixed with its
 * name.
 */
async function clipTagClause(
  criterion: RefCriterion,
  ctx: LeafContext
): Promise<FilterClause> {
  const prefix = ctx.name === "tags" ? "" : `${ctx.name}_`;
  const opts = (name: string) => refOptions(ctx, `${prefix}${name}`);
  const { depth } = criterion;
  const allowed = ctx.allowedInstanceIds;
  const either = (matched: readonly FilterRef[], tag: string) =>
    anyOf([
      refClause(PRIMARY_TAG, matched, "INCLUDES", opts(`${tag}primary_tag`)),
      refClause(CLIP_TAGS, matched, "INCLUDES", opts(`${tag}clip_tags`)),
    ]);
  switch (criterion.modifier) {
    case "INCLUDES":
      return either(
        await expandRefs("tag", criterion.refs, depth, allowed),
        ""
      );
    case "INCLUDES_ALL": {
      const groups = await expandRefsEach(
        "tag",
        criterion.refs,
        depth,
        allowed
      );
      return allOf(groups.map((group, i) => either(group, `all${i}_`)));
    }
    case "EXCLUDES": {
      const refs = await expandRefs("tag", criterion.refs, depth, allowed);
      return allOf([
        refClause(PRIMARY_TAG, refs, "EXCLUDES", opts("primary_tag")),
        refClause(CLIP_TAGS, refs, "EXCLUDES", opts("clip_tags")),
      ]);
    }
  }
}

/** A ref criterion that names the clips the statement drives from: a studio's or scenes' INCLUDES */
function drives(criterion: RefCriterion | undefined): boolean {
  return (
    criterion !== undefined &&
    criterion.modifier !== "EXCLUDES" &&
    criterion.refs.length > 0
  );
}

class ClipQueryBuilder extends EntityQueryBuilder<
  ClipRow,
  ClipWithRelations,
  "clip"
> {
  protected readonly spec: EntitySpec = {
    table: "StashClip",
    alias: "c",
    entityType: "clip",
    userJoins: [],
    joins: [SCENE_JOIN],
    // The scene's exclusion rows: a clip hides with its scene
    extraJoins: (ctx) =>
      ctx.applyExclusions
        ? [
            {
              sql: exclusionJoin(
                "es",
                "scene",
                "c.sceneId",
                "c.sceneInstanceId"
              ),
              params: [ctx.userId],
            },
          ]
        : [],
    extraBaseWhere: (ctx) => [
      // `+` keeps deletedAt from driving the scene: with sqlite_stat1 alone
      // (no STAT4 samples) SQLite averages deletedAt over its distinct
      // values, takes the live scenes for a few thousand and lists the clips
      // from every live scene, then sorts them (325 ms a page at 207k clips,
      // against 0.4 with the hint). The scene is still read by its key, the
      // check done on StashScene_id_stashInstanceId_deletedAt_idx.
      { sql: "+s.deletedAt IS NULL", params: [] },
      ...(ctx.applyExclusions ? [{ sql: "es.id IS NULL", params: [] }] : []),
    ],
    selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
    defaultSort: "stashCreatedAt",
  };

  protected sortMap(direction: SortDirection): Record<string, SortExpr> {
    const by = (sql: string): SortExpr => ({
      sql: `${sql} ${direction}`,
      params: [],
    });
    return {
      stashCreatedAt: by("c.stashCreatedAt"),
      stashUpdatedAt: by("c.stashUpdatedAt"),
      title: by("c.title"),
      seconds: by("c.seconds"),
      sceneTitle: by("s.title"),
      duration: by("(c.endSeconds - c.seconds)"),
    };
  }

  /**
   * The clip filter's clauses, one per field in the order the statement
   * ANDs them, and the search. The clip's tags, its scene's tags and its
   * scene's performers take Has ANY, Has ALL and Has NONE; the studio is
   * single-valued (INCLUDES or EXCLUDES, which keeps a scene without one).
   * The tags, scene tags and studio take a depth (their sub-tags and
   * sub-studios). A scene tag is one the scene holds (SceneTag) or inherits
   * (SceneInheritedTag), in every modifier, as on the scene list. The
   * duration is the end less the start (a clip without an end matches no
   * comparison), the dates the clip's epoch columns in the viewer's day.
   *
   * Has ANY and Has ALL on a junction (the clip's tag list, its scene's tags
   * and performers) match the list of parents the junction's ref index
   * names (`sortedByIndex: false`), which SQLite drives from when it is
   * short (the primary tag's index beside it: MULTI-INDEX OR) and builds
   * once and probes when it is long, where a correlated EXISTS probed the
   * junction for every clip (a clip tag: 50 ms to 0.7 at 207k clips). A
   * studio or scenes it includes name few clips and drive the statement
   * themselves; beside one each other filter probes those clips (EXISTS),
   * which is cheaper than reading a common tag's whole list first (a studio
   * and a clip tag: 10 ms, against 13 with the list). Has NONE keeps its NOT
   * EXISTS per clip. Whether a studio or scenes drive is a fact of the whole
   * filter, which `leafContextFor` hands each clause as `lists`. The CTE
   * names stay the ones the statement always had; a field's excludes take
   * their leaf's (`cteName`).
   */
  protected override readonly fieldClauses: FieldClauses<"clip"> = {
    is_generated: (isGenerated) => ({
      sql: "c.isGenerated = ?",
      params: [isGenerated ? 1 : 0],
    }),
    scenes: (c, ctx) =>
      refClause(
        CLIP_SCENE,
        c.refs,
        c.modifier,
        refOptions(ctx, cteName(ctx, "scenes", "scene"))
      ),
    tags: (c, ctx) => clipTagClause(c, ctx),
    scene_tags: (c, ctx) =>
      hierarchicalRefClause("tag", SCENE_TAGS, c, ctx, {
        name: cteName(ctx, "scene_tags", "scene_tags"),
        inheritedJunction: SCENE_INHERITED_TAGS,
        ...(ctx.lists === true ? { sortedByIndex: false } : {}),
      }),
    performers: (c, ctx) =>
      refClause(
        SCENE_PERFORMERS,
        c.refs,
        c.modifier,
        refOptions(ctx, cteName(ctx, "performers", "performers"))
      ),
    studios: (c, ctx) =>
      hierarchicalRefClause("studio", SCENE_STUDIO, c, ctx, {
        name: cteName(ctx, "studios", "studio"),
        ...(ctx.lists === true ? { sortedByIndex: false } : {}),
      }),
    duration: (c) => buildNumericFilter(c, "(c.endSeconds - c.seconds)"),
    created_at: (c, ctx) =>
      buildInstantFilter(c, "c.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "c.stashUpdatedAt", ctx.timeZone),
    title: (c) => buildTextFilter(c, "c.title"),
  };

  /** No studio and no scenes include: the filter's clauses list by their junctions' indexes */
  protected override leafContextFor(
    filter: ClipListRequest["filter"],
    ctx: LeafContext
  ): LeafContext {
    return {
      ...ctx,
      lists: !drives(filter.studios) && !drives(filter.scenes),
    };
  }

  /** The search across the title: every word must match (`searchAll`) */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: "c.title LIKE ? ESCAPE '\\'",
      params: [pattern],
    }));
  }

  protected transformRow(row: ClipRow): ClipWithRelations {
    return {
      id: row.id,
      instanceId: row.stashInstanceId,
      sceneId: row.sceneId,
      title: row.title,
      seconds: row.seconds,
      endSeconds: row.endSeconds,
      primaryTagId: row.primaryTagId,
      screenshotPath: row.screenshotPath,
      isGenerated: row.isGenerated,
      stashCreatedAt: row.stashCreatedAt,
      stashUpdatedAt: row.stashUpdatedAt,
      // Filled by populateRelations
      primaryTag: null,
      tags: [],
      scene: {
        id: row.sceneId,
        title: row.sceneTitle,
        pathScreenshot: row.scenePathScreenshot,
        studioId: row.sceneStudioId,
        stashInstanceId: row.sceneInstanceId,
      },
    };
  }

  /**
   * Each clip's primary tag and tag list, only the tags the viewer may see
   * (`query/nestedRefs.ts`: a deleted tag, or one held for a pending
   * recompute, is no chip): one statement each for the page, driven from
   * its (id, instance) pairs
   */
  protected async populateRelations(
    clips: ClipWithRelations[],
    ctx: QueryContext
  ): Promise<void> {
    if (clips.length === 0) return;

    const [primaryTags, tags] = await Promise.all([
      loadNestedRefs(CLIP_TAG_REF, PRIMARY_TAG_LINK, clips, ctx),
      loadNestedRefs(CLIP_TAG_REF, CLIP_TAGS, clips, ctx),
    ]);
    for (const clip of clips) {
      const key = entityKey(clip.id, clip.instanceId);
      clip.primaryTag = primaryTags.get(key)?.[0] ?? null;
      clip.tags = tags.get(key) ?? [];
    }
  }

  /** A scene's clips the viewer can see, by time, every one (no page, no count) */
  async getClipsForScene(
    options: SceneClipsOptions
  ): Promise<ClipWithRelations[]> {
    return this.readAll({
      userId: options.userId,
      allowedInstanceIds: options.allowedInstanceIds,
      request: {
        page: 1,
        perPage: 1,
        q: undefined,
        sort: { field: "seconds", direction: "ASC", seed: undefined },
        filter: {
          scenes: { refs: [options.scene], modifier: "INCLUDES", depth: 0 },
          ...(options.includeUngenerated ? {} : { is_generated: true }),
        },
        specificInstanceId: undefined,
      },
    });
  }

  /**
   * The clips a ref names, with the viewer's exclusions and allowed
   * instances applied (invariant 3): one when the ref names its instance,
   * one per allowed instance holding the id when it is bare (the caller
   * refuses that as ambiguous)
   */
  async getClipById(options: ClipByIdOptions): Promise<ClipWithRelations[]> {
    return this.getByRefs({
      userId: options.userId,
      allowedInstanceIds: options.allowedInstanceIds,
      refs: [options.ref],
    });
  }
}

export const clipQueryBuilder = new ClipQueryBuilder();
