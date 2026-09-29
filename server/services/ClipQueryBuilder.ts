/**
 * The clip list on the base query builder (item 74): the Clips page, a
 * scene's clips and a clip by id.
 *
 * A clip shows only while its scene does: the scene is joined on the clip's
 * (sceneId, sceneInstanceId) and must be live, and the viewer's exclusions
 * apply to both, the clip's own rows (its tags cascade to it) through the
 * base's join and the scene's through the spec's second join. A clip has no
 * per-user data, so no user joins. The instance filter, the random sort and
 * the count are the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type { ClipRow, ClipTagQueryRow } from "../types/internal/queryRows.js";
import type { ClipListRequest, FilterRef } from "../types/parsedFilters.js";
import { entityKey, pairsJson } from "../utils/entityRef.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  anyOf,
  exclusionJoin,
  refClause,
} from "../utils/sqlClauses.js";
import { likeContains } from "../utils/sqlHelpers.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
} from "./query/EntityQueryBuilder.js";

/** A clip's tag as the row carries it */
export interface ClipTagRef {
  id: string;
  name: string;
  color: string | null;
}

/** A clip with its scene and tags (ClipService turns the paths into proxy URLs) */
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

/** A clip by its Stash id, on any allowed instance */
export interface ClipByIdOptions {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly id: string;
}

const SELECT_COLUMNS = `c.id, c.stashInstanceId, c.sceneId, c.sceneInstanceId,
  c.title, c.seconds, c.endSeconds,
  c.primaryTagId, c.primaryTagInstanceId,
  c.screenshotPath,
  c.isGenerated, c.stashCreatedAt, c.stashUpdatedAt,
  s.title AS sceneTitle, s.pathScreenshot AS scenePathScreenshot,
  s.studioId AS sceneStudioId,
  pt.name AS primaryTagName, pt.color AS primaryTagColor`;

/** The clip's scene, on its (id, instance): a clip without one does not list */
const SCENE_JOIN =
  "INNER JOIN StashScene s ON c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId";
const PRIMARY_TAG_JOIN =
  "LEFT JOIN StashTag pt ON c.primaryTagId = pt.id AND c.primaryTagInstanceId = pt.stashInstanceId";

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

/** A tag on the clip's scene (the joined scene `s`) */
const SCENE_TAGS: JunctionTarget = {
  kind: "junction",
  table: "SceneTag",
  alias: "st",
  parentAlias: "s",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
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
    joins: [SCENE_JOIN, PRIMARY_TAG_JOIN],
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
      { sql: "s.deletedAt IS NULL", params: [] },
      ...(ctx.applyExclusions ? [{ sql: "es.id IS NULL", params: [] }] : []),
    ],
    selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
    defaultSort: "stashCreatedAt",
    tiebreak: (direction) => `c.id ${direction}`,
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
   * The search and the filter parameters. The five ref filters match
   * INCLUDES whatever the modifier, as before the port (B11 wires
   * INCLUDES_ALL and EXCLUDES on tags, scene tags and performers).
   */
  protected filterClauses(
    filter: ClipListRequest["filter"],
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const opts = (name: string) => ({
      name,
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
    const clauses: FilterClause[] = [];
    if (q !== undefined) {
      clauses.push({
        sql: "c.title LIKE ? ESCAPE '\\'",
        params: [likeContains(q)],
      });
    }
    if (filter.isGenerated !== undefined) {
      clauses.push({
        sql: "c.isGenerated = ?",
        params: [filter.isGenerated ? 1 : 0],
      });
    }
    if (filter.sceneId) {
      clauses.push(
        refClause(CLIP_SCENE, filter.sceneId.refs, "INCLUDES", opts("scene"))
      );
    }
    if (filter.tagIds) {
      const { refs } = filter.tagIds;
      clauses.push(
        anyOf([
          refClause(PRIMARY_TAG, refs, "INCLUDES", opts("primary_tag")),
          refClause(CLIP_TAGS, refs, "INCLUDES", opts("clip_tags")),
        ])
      );
    }
    if (filter.sceneTagIds) {
      clauses.push(
        refClause(
          SCENE_TAGS,
          filter.sceneTagIds.refs,
          "INCLUDES",
          opts("scene_tags")
        )
      );
    }
    if (filter.performerIds) {
      clauses.push(
        refClause(
          SCENE_PERFORMERS,
          filter.performerIds.refs,
          "INCLUDES",
          opts("performers")
        )
      );
    }
    if (filter.studioId) {
      clauses.push(
        refClause(
          SCENE_STUDIO,
          filter.studioId.refs,
          "INCLUDES",
          opts("studio")
        )
      );
    }
    return Promise.resolve(clauses);
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
      primaryTag: row.primaryTagId
        ? {
            id: row.primaryTagId,
            name: row.primaryTagName ?? "",
            color: row.primaryTagColor,
          }
        : null,
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

  /** The page's tag lists, in one statement driven from its (id, instance) pairs */
  protected async populateRelations(clips: ClipWithRelations[]): Promise<void> {
    if (clips.length === 0) return;

    const rows = await prisma.$queryRawUnsafe<ClipTagQueryRow[]>(
      `WITH page(pid, pinst) AS (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?))
SELECT ct.clipId, ct.clipInstanceId, t.id AS tagId, t.name AS tagName, t.color AS tagColor
FROM page pg
CROSS JOIN ClipTag ct ON ct.clipId = pg.pid AND ct.clipInstanceId = pg.pinst
INNER JOIN StashTag t ON t.id = ct.tagId AND t.stashInstanceId = ct.tagInstanceId`,
      pairsJson(clips.map((c) => ({ id: c.id, instanceId: c.instanceId })))
    );

    const byClip = new Map<string, ClipTagRef[]>();
    for (const row of rows) {
      const key = entityKey(row.clipId, row.clipInstanceId);
      const tags = byClip.get(key) ?? [];
      tags.push({ id: row.tagId, name: row.tagName, color: row.tagColor });
      byClip.set(key, tags);
    }
    for (const clip of clips) {
      clip.tags = byClip.get(entityKey(clip.id, clip.instanceId)) ?? [];
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
          sceneId: { refs: [options.scene], modifier: "INCLUDES", depth: 0 },
          ...(options.includeUngenerated ? {} : { isGenerated: true }),
        },
        specificInstanceId: undefined,
        dropped: [],
      },
    });
  }

  /**
   * A clip by its Stash id, with the viewer's exclusions and allowed
   * instances applied (invariant 3); the newest when two instances share
   * the id.
   */
  async getClipById(
    options: ClipByIdOptions
  ): Promise<ClipWithRelations | null> {
    const [clip] = await this.getByRefs({
      userId: options.userId,
      allowedInstanceIds: options.allowedInstanceIds,
      refs: [{ id: options.id, instanceId: undefined }],
    });
    return clip ?? null;
  }
}

export const clipQueryBuilder = new ClipQueryBuilder();
