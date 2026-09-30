/**
 * SceneQueryBuilder: the scene list in SQL.
 *
 * The scene builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the scene's spec (table, per-user joins, columns), its filter
 * clauses from the parsed request, its sort map, its row transform and its
 * relations. The instance filter, the exclusion join, the `ids` filter, the
 * random sort, the primary key ending every order and the count are the
 * base's.
 */
import type {
  Resolution,
  SortDirection,
} from "@peek/shared-types/filters/index.js";
import type {
  GalleryRef,
  GroupRef,
  NormalizedScene,
  PerformerRef,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  GroupRefRow,
  SceneQueryRow,
} from "../types/internal/queryRows.js";
import type {
  EnumCriterion,
  MultiEnumCriterion,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { readHistory } from "../utils/historyJson.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  buildDateFilter,
  buildEpochDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  noClause,
  refClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseJsonArray,
} from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
} from "./query/EntityQueryBuilder.js";
import {
  GALLERY_REF,
  GROUP_REF,
  type NestedEntity,
  PERFORMER_REF,
  STUDIO_REF,
  TAG_REF,
  groupRef,
  loadNestedRefs,
  loadRefsByKey,
} from "./query/nestedRefs.js";

export type {
  ByRefsOptions,
  ListQueryOptions,
  ListResult,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - all StashScene fields plus user data
const SELECT_COLUMNS = `
    s.id, s.stashInstanceId, s.title, s.code, s.date, s.studioId, s.rating100 AS stashRating100,
    s.duration, s.organized, s.details, s.director, s.urls, s.filePath, s.fileBitRate,
    s.fileFrameRate, s.fileWidth, s.fileHeight, s.fileVideoCodec,
    s.fileAudioCodec, s.fileSize, s.pathScreenshot, s.pathPreview,
    s.pathSprite, s.pathVtt, s.pathChaptersVtt, s.pathStream, s.pathCaption, s.captions,
    s.inheritedTagIds,
    s.oCounter AS stashOCounter, s.playCount AS stashPlayCount,
    s.playDuration AS stashPlayDuration, s.stashCreatedAt, s.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    w.playCount AS userPlayCount, w.playDuration AS userPlayDuration,
    w.lastPlayedAt AS userLastPlayedAt, w.oCount AS userOCount,
    w.resumeTime AS userResumeTime, w.oHistory AS userOHistory,
    w.playHistory AS userPlayHistory
  `.trim();

/**
 * The sorts a page reads from an index, the browse indexes (L6): the page
 * walks the index and stops at the page. The others (the viewer's rating,
 * plays and O count, random, the file columns) read every match and sort it.
 */
const INDEXED_SORTS: ReadonlySet<string> = new Set([
  "created_at",
  "updated_at",
  "date",
  "title",
  "duration",
  "performer_count",
  "tag_count",
]);

const SCENE_SPEC: EntitySpec = {
  table: "StashScene",
  alias: "s",
  entityType: "scene",
  userJoins: [
    { table: "SceneRating", alias: "r", entityIdCol: "sceneId" },
    { table: "WatchHistory", alias: "w", entityIdCol: "sceneId" },
  ],
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "created_at",
};

/** A scene's junction to another entity, for the ref filters */
const junction = (
  table: string,
  alias: string,
  refIdCol: string,
  refInstanceCol: string
): JunctionTarget => ({
  kind: "junction",
  table,
  alias,
  parentAlias: "s",
  parentIdCol: "sceneId",
  parentInstanceCol: "sceneInstanceId",
  refIdCol,
  refInstanceCol,
});
const SCENE_PERFORMERS = junction(
  "ScenePerformer",
  "sp",
  "performerId",
  "performerInstanceId"
);
const SCENE_TAGS = junction("SceneTag", "st", "tagId", "tagInstanceId");
/** The scene's inherited tags, written by scene tag inheritance */
const SCENE_INHERITED_TAGS = junction(
  "SceneInheritedTag",
  "sit",
  "tagId",
  "tagInstanceId"
);
const SCENE_GROUPS = junction("SceneGroup", "sg", "groupId", "groupInstanceId");
const SCENE_GALLERIES = junction(
  "SceneGallery",
  "sg",
  "galleryId",
  "galleryInstanceId"
);

/** A scene's collection with the scene's place in it (`SceneGroup.sceneIndex`) */
const SCENE_GROUP_REF: NestedEntity<
  GroupRefRow & { sceneIndex: number | null },
  GroupRef & { scene_index: number | null }
> = {
  ...GROUP_REF,
  columns: `${GROUP_REF.columns}, j.sceneIndex`,
  toRef: (row) => ({
    ...groupRef(row, row.stashInstanceId),
    scene_index: row.sceneIndex,
  }),
};

/** A scene's studio is a column of its own row, on the scene's instance */
const SCENE_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashScene",
  parentAlias: "s",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/**
 * The pixel height each resolution names; SEVEN_K and HUGE take Stash's
 * range minimums. PR 9 moves the filter to Stash's ranges.
 */
const RESOLUTION_HEIGHTS: Readonly<Record<Resolution, number>> = {
  VERY_LOW: 144,
  LOW: 240,
  R360P: 360,
  STANDARD: 480,
  WEB_HD: 540,
  STANDARD_HD: 720,
  FULL_HD: 1080,
  QUAD_HD: 1440,
  VR_HD: 1920,
  FOUR_K: 2160,
  FIVE_K: 2880,
  SIX_K: 3240,
  SEVEN_K: 3584,
  EIGHT_K: 4320,
  HUGE: 6144,
};

/**
 * The oldest performer's age on the scene's date (today's, without a date):
 * (scene date - birthdate) in years, as SQLite computes it
 */
const PERFORMER_AGE = `(
      SELECT MAX(
        CAST((julianday(COALESCE(s.date, date('now'))) - julianday(p.birthdate)) / 365.25 AS INTEGER)
      )
      FROM ScenePerformer sp
      JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
      WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND p.birthdate IS NOT NULL
    )`;

/**
 * Builds and executes SQL queries for scene filtering
 */
class SceneQueryBuilder extends EntityQueryBuilder<
  SceneQueryRow,
  NormalizedScene,
  "scene"
> {
  protected readonly spec = SCENE_SPEC;

  /**
   * The sort expressions. title, performer_count and tag_count read the
   * columns sync stores (SCENE_DERIVED_COLUMNS_SQL in StashSyncService):
   * titleSort is the displayed title with ASCII lower-cased, so its BINARY
   * order is the case-insensitive title order. Each has a (deletedAt,
   * column, id, stashInstanceId) index, which serves the whole order with
   * the base's key (created_at, updated_at, date and duration too, DESC).
   * last_o_at is the viewer's latest O time (the newest string of
   * WatchHistory.oHistory, stored as ISO text), scenes with none last in
   * either direction; it scans the viewer's history rows, like o_counter.
   * scene_index is the scene's number in the collection the request filters
   * by, and has an expression only with one (INCLUDES or INCLUDES_ALL):
   * without it the key falls back to the default sort.
   */
  protected sortMap(
    dir: SortDirection,
    filter: ParsedFilter<"scene">
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // Scene metadata
      created_at: column("s.stashCreatedAt"),
      updated_at: column("s.stashUpdatedAt"),
      date: column("s.date"),
      title: column("s.titleSort"),
      duration: column("s.duration"),
      filesize: column("s.fileSize"),
      bitrate: column("s.fileBitRate"),
      framerate: column("s.fileFrameRate"),
      path: column("s.filePath"),
      performer_count: column("s.performerCount"),
      tag_count: column("s.tagCount"),

      // The viewer's rating (SceneRating)
      rating: column("COALESCE(r.rating, 0)"),
      user_rating: column("COALESCE(r.rating, 0)"),

      // The viewer's history (WatchHistory)
      last_played_at: column("w.lastPlayedAt"),
      play_count: column("COALESCE(w.playCount, 0)"),
      play_duration: column("COALESCE(w.playDuration, 0)"),
      o_counter: column("COALESCE(w.oCount, 0)"),
      resume_time: column("COALESCE(w.resumeTime, 0)"),
      last_o_at: {
        sql: `(SELECT MAX(j.value) FROM json_each(w.oHistory) j) IS NULL, (SELECT MAX(j.value) FROM json_each(w.oHistory) j) ${dir}`,
        params: [],
      },
      ...this.sceneIndexSort(dir, filter),
    };
  }

  /**
   * Scene Number: the number of the scene in the filter's first collection,
   * scenes without one last. One ref joins the sort's group as an INNER JOIN
   * (the filter already keeps only its scenes, so the count is unchanged);
   * several refs LEFT JOIN the first, which no scene matches twice
   * (SceneGroup's key is scene and group, and the join names the scene's
   * instance). A bare ref matches that id on the scene's own instance.
   */
  private sceneIndexSort(
    dir: SortDirection,
    filter: ParsedFilter<"scene">
  ): Record<string, SortExpr> {
    const criterion = filter.groups;
    const first = criterion?.refs[0];
    if (
      criterion === undefined ||
      first === undefined ||
      criterion.modifier === "EXCLUDES"
    ) {
      return {};
    }
    const inner = criterion.refs.length === 1;
    const instance =
      first.instanceId === undefined ? "" : " AND sgi.groupInstanceId = ?";
    return {
      scene_index: {
        sql: `sgi.sceneIndex IS NULL, sgi.sceneIndex ${dir}`,
        params: [],
        joins: [
          {
            sql: `${inner ? "JOIN" : "LEFT JOIN"} SceneGroup sgi ON sgi.sceneId = s.id AND sgi.sceneInstanceId = s.stashInstanceId AND sgi.groupId = ?${instance}`,
            params: [
              first.id,
              ...(first.instanceId === undefined ? [] : [first.instanceId]),
            ],
          },
        ],
      },
    };
  }

  /** The scene filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"scene">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const { userId, allowedInstanceIds } = ctx;
    const refs = (
      name: string,
      target: JunctionTarget,
      criterion: RefCriterion
    ) =>
      refClause(target, criterion.refs, criterion.modifier, {
        name,
        allowedInstanceIds,
      });

    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause | undefined) => {
      if (clause !== undefined) clauses.push(clause);
    };

    // Metadata
    if (filter.duration) {
      push(buildNumericFilter(filter.duration, "COALESCE(s.duration, 0)"));
    }
    if (filter.resolution) push(this.resolutionClause(filter.resolution));
    if (filter.organized !== undefined) {
      push({ sql: "s.organized = ?", params: [filter.organized ? 1 : 0] });
    }

    // Related entities
    if (filter.performers) {
      push(refs("performers", SCENE_PERFORMERS, filter.performers));
    }
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));
    if (filter.studios) push(await this.studioClause(filter.studios, ctx));
    if (filter.groups) push(refs("groups", SCENE_GROUPS, filter.groups));
    if (filter.galleries) {
      push(refs("galleries", SCENE_GALLERIES, filter.galleries));
    }

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.play_count) {
      push(buildNumericFilter(filter.play_count, "COALESCE(w.playCount, 0)"));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, "COALESCE(w.oCount, 0)"));
    }

    // Text
    if (filter.title) push(buildTextFilter(filter.title, "s.title"));
    if (filter.details) push(buildTextFilter(filter.details, "s.details"));
    if (filter.director) push(buildTextFilter(filter.director, "s.director"));

    // Dates
    if (filter.date) push(buildDateFilter(filter.date, "s.date"));
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "s.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "s.stashUpdatedAt"));
    }
    if (filter.last_played_at) {
      push(buildEpochDateFilter(filter.last_played_at, "w.lastPlayedAt"));
    }

    // Numbers
    if (filter.bitrate) {
      push(buildNumericFilter(filter.bitrate, "COALESCE(s.fileBitRate, 0)"));
    }
    if (filter.framerate) {
      push(
        buildNumericFilter(filter.framerate, "COALESCE(s.fileFrameRate, 0)")
      );
    }
    if (filter.play_duration) {
      push(
        buildNumericFilter(filter.play_duration, "COALESCE(w.playDuration, 0)")
      );
    }

    // Counts, stored by sync (SCENE_DERIVED_COLUMNS_SQL): the scene's
    // ScenePerformer and SceneTag rows
    if (filter.performer_count) {
      push(buildNumericFilter(filter.performer_count, "s.performerCount"));
    }
    if (filter.tag_count) {
      push(buildNumericFilter(filter.tag_count, "s.tagCount"));
    }
    if (filter.performer_age) {
      push(buildNumericFilter(filter.performer_age, PERFORMER_AGE));
    }

    // Enums
    if (filter.orientation) push(this.orientationClause(filter.orientation));
    if (filter.video_codec) {
      push(buildTextFilter(filter.video_codec, "s.fileVideoCodec"));
    }
    if (filter.audio_codec) {
      push(buildTextFilter(filter.audio_codec, "s.fileAudioCodec"));
    }

    // The viewer's favorite entities
    if (filter.performer_favorite === true) {
      push(this.buildPerformerFavoriteFilter(userId));
    }
    if (filter.studio_favorite === true) {
      push(this.buildStudioFavoriteFilter(userId));
    }
    if (filter.tag_favorite === true) {
      push(this.buildTagFavoriteFilter(userId));
    }

    // Text search across title, details, path, performers, studio, tags
    if (q !== undefined) push(this.buildSearchQueryFilter(q, ctx));

    return clauses;
  }

  /**
   * The tag filter: the scene's own tags (SceneTag) and its inherited tags
   * (SceneInheritedTag), each arm in the same shape, read by index. With a
   * depth, INCLUDES_ALL is one clause per selected tag, each with its own
   * descendants (QUERIES-08). Under a sort with an index the page walks it
   * and probes each scene's tags by the junctions' keys (above 64 refs,
   * against the scenes the junctions' tag indexes list for the refs); under
   * one without, the tagged scenes are read from the junctions' tag indexes
   * (above 64 refs, the matched set). The count reads every match in no
   * order, so it takes the second form whatever the sort (`sortedByIndex`,
   * L8, L9).
   */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("tag", SCENE_TAGS, criterion, ctx, {
      name: "tags",
      inheritedJunction: SCENE_INHERITED_TAGS,
      sortedByIndex: INDEXED_SORTS.has(ctx.sortField),
    });
  }

  /** The studio filter, with the studios' descendants to the depth */
  private async studioClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("studio", SCENE_STUDIO, criterion, ctx, {
      name: "studios",
    });
  }

  private resolutionClause(criterion: EnumCriterion<Resolution>): FilterClause {
    const height = RESOLUTION_HEIGHTS[criterion.value];
    const col = "COALESCE(s.fileHeight, 0)";
    const operator = {
      EQUALS: "=",
      NOT_EQUALS: "!=",
      GREATER_THAN: ">",
      LESS_THAN: "<",
    }[criterion.modifier];
    return { sql: `${col} ${operator} ?`, params: [height] };
  }

  private orientationClause(
    criterion: MultiEnumCriterion<"LANDSCAPE" | "PORTRAIT" | "SQUARE">
  ): FilterClause {
    const conditions = criterion.values.map(
      (orientation) =>
        ({
          LANDSCAPE: "(s.fileWidth > s.fileHeight)",
          PORTRAIT: "(s.fileWidth < s.fileHeight)",
          SQUARE: "(s.fileWidth = s.fileHeight AND s.fileWidth > 0)",
        })[orientation]
    );
    return { sql: `(${conditions.join(" OR ")})`, params: [] };
  }

  /**
   * The search across the title, details, path, performers, studio and
   * tags: `likeContains(q)` with `ESCAPE '\'`, so a `%`, `_` or `\` in the
   * text matches itself. LOWER() on both sides folds ASCII case only, as
   * SQLite's LIKE does.
   */
  private buildSearchQueryFilter(
    searchQuery: string,
    ctx: QueryContext
  ): FilterClause {
    const query = searchQuery.trim();
    if (query === "") return noClause();
    const like = "LIKE LOWER(?) ESCAPE '\\'";
    const pattern = likeContains(query);

    // A name matches only through a live entity the viewer can see, on its
    // own instance, as the lists show it
    const visible = (excl: string, entityType: string, alias: string) =>
      ctx.applyExclusions
        ? `AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity ${excl} WHERE ${excl}.userId = ? AND ${excl}.entityType = '${entityType}' AND ${excl}.entityId = ${alias}.id AND (${excl}.instanceId = '' OR ${excl}.instanceId = ${alias}.stashInstanceId))`
        : "";
    const visibleParams = ctx.applyExclusions ? [ctx.userId] : [];

    const sql = `(
      LOWER(s.title) ${like} OR
      LOWER(s.details) ${like} OR
      LOWER(s.filePath) ${like} OR
      EXISTS (
        SELECT 1 FROM ScenePerformer sp
        INNER JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        AND p.deletedAt IS NULL
        ${visible("xp", "performer", "p")}
        AND LOWER(p.name) ${like}
      ) OR
      EXISTS (
        SELECT 1 FROM StashStudio st
        WHERE st.id = s.studioId AND st.stashInstanceId = s.stashInstanceId
        AND st.deletedAt IS NULL
        ${visible("xs", "studio", "st")}
        AND LOWER(st.name) ${like}
      ) OR
      EXISTS (
        SELECT 1 FROM SceneTag stag
        INNER JOIN StashTag t ON stag.tagId = t.id AND stag.tagInstanceId = t.stashInstanceId
        WHERE stag.sceneId = s.id AND stag.sceneInstanceId = s.stashInstanceId
        AND t.deletedAt IS NULL
        ${visible("xt", "tag", "t")}
        AND LOWER(t.name) ${like}
      )
    )`;

    return {
      sql,
      params: [
        pattern,
        pattern,
        pattern,
        ...visibleParams,
        pattern,
        ...visibleParams,
        pattern,
        ...visibleParams,
        pattern,
      ],
    };
  }

  /**
   * Build performer favorite filter clause
   * Returns scenes that have at least one favorite performer
   */
  private buildPerformerFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN PerformerRating pr ON sp.performerId = pr.performerId AND sp.performerInstanceId = pr.instanceId AND pr.userId = ?
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId AND pr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build studio favorite filter clause
   * Returns scenes that have a favorite studio
   */
  private buildStudioFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM StudioRating sr
        WHERE sr.studioId = s.studioId AND sr.instanceId = s.stashInstanceId AND sr.userId = ? AND sr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Build tag favorite filter clause
   * Returns scenes that have at least one favorite tag
   */
  private buildTagFavoriteFilter(userId: number): FilterClause {
    return {
      sql: `EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN TagRating tr ON st.tagId = tr.tagId AND st.tagInstanceId = tr.instanceId AND tr.userId = ?
        WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId AND tr.favorite = 1
      )`,
      params: [userId],
    };
  }

  /**
   * Transform a raw database row into a NormalizedScene
   */
  protected transformRow(row: SceneQueryRow): NormalizedScene {
    // Parse JSON fields
    const oHistory = readHistory(row.userOHistory);
    const playHistory = readHistory(row.userPlayHistory);

    // Determine last_o_at from o_history
    const lastOAt = oHistory.length > 0 ? oHistory[oHistory.length - 1] : null;

    // Create scene object with studioId preserved for population
    const scene = {
      id: row.id,
      instanceId: row.stashInstanceId,
      title: emptyToNull(row.title) ?? getSceneFallbackTitle(row.filePath),
      code: emptyToNull(row.code),
      date: emptyToNull(row.date),
      details: emptyToNull(row.details),
      director: emptyToNull(row.director),
      organized: row.organized,
      created_at: row.stashCreatedAt?.toISOString() ?? null,
      updated_at: row.stashUpdatedAt?.toISOString() ?? null,

      // URLs
      urls: parseJsonArray(row.urls),

      // Store studioId for later population
      studioId: row.studioId,

      // User data - Peek user data ONLY, never fall back to Stash user data
      // Stash data (stashOCounter, stashPlayCount, etc.) belongs to the Stash user,
      // not the Peek user. Each Peek user starts at 0 for these fields.
      rating: row.userRating ?? null,
      rating100: row.userRating ?? null,
      favorite: row.userFavorite ?? false,
      o_counter: row.userOCount ?? 0,
      play_count: row.userPlayCount ?? 0,
      play_duration: row.userPlayDuration ?? 0,
      resume_time: row.userResumeTime ?? 0,
      play_history: playHistory,
      // The stored ISO strings, as the JSON carries them
      o_history: oHistory,
      last_played_at: row.userLastPlayedAt?.toISOString() ?? null,
      last_o_at: lastOAt,

      // File data - build from individual columns
      files: row.filePath
        ? [
            {
              path: row.filePath,
              basename:
                emptyToNull(row.filePath.split("/").pop()?.split("\\").pop()) ??
                row.filePath,
              duration: row.duration,
              bit_rate: row.fileBitRate,
              frame_rate: row.fileFrameRate,
              width: row.fileWidth,
              height: row.fileHeight,
              video_codec: row.fileVideoCodec,
              audio_codec: row.fileAudioCodec,
              size: row.fileSize ? Number(row.fileSize) : null,
            },
          ]
        : [],

      // Paths - transform to proxy URLs with instanceId for multi-instance routing
      paths: {
        screenshot: toProxyUrl(row.pathScreenshot, row.stashInstanceId),
        preview: toProxyUrl(row.pathPreview, row.stashInstanceId),
        // Always null: Peek serves streams and captions through its own
        // routes, and the media proxy refuses both Stash routes
        stream: null,
        sprite: toProxyUrl(
          row.pathSprite ? `/scene/${row.id}/vtt/sprite` : null,
          row.stashInstanceId
        ),
        vtt: toProxyUrl(
          row.pathVtt ? `/scene/${row.id}/vtt/thumbs` : null,
          row.stashInstanceId
        ),
        chapters_vtt: toProxyUrl(row.pathChaptersVtt, row.stashInstanceId),
        caption: null,
      },

      // Lists carry no streams; single-scene lookups add them
      // (StashEntityService.getPlaybackStreams)
      sceneStreams: [],

      // Caption metadata for multi-language subtitle support
      captions: parseJsonArray<unknown>(row.captions),

      // Relations - populated separately after query
      studio: null as StudioRef | null,
      performers: [] as PerformerRef[],
      tags: [] as TagRef[],
      groups: [] as GroupRef[],
      galleries: [] as GalleryRef[],

      // Inherited tags - IDs parsed here, hydrated with names in populateRelations
      inheritedTagIds: parseJsonArray(row.inheritedTagIds),
      inheritedTags: [] as TagRef[], // Will be populated in populateRelations
    };

    return scene as NormalizedScene;
  }

  /**
   * Each scene's performers, tags, inherited tags, collections (with the
   * scene's place in each), galleries and studio, only those the viewer may
   * see (`query/nestedRefs.ts`): one statement per relation for the page,
   * driven from its (id, instance) pairs. A scene's studio and inherited
   * tags are on the scene's own instance.
   */
  protected async populateRelations(
    scenes: NormalizedScene[],
    ctx: QueryContext
  ): Promise<void> {
    if (scenes.length === 0) return;

    const onScene = (id: string, scene: NormalizedScene): EntityRef => ({
      id,
      instanceId: scene.instanceId,
    });
    const studioRefs = scenes.flatMap((scene) =>
      scene.studioId ? [onScene(scene.studioId, scene)] : []
    );
    const inheritedRefs = scenes.flatMap((scene) =>
      (scene.inheritedTagIds ?? []).map((tagId) => onScene(tagId, scene))
    );

    const [performers, tags, groups, galleries, studios, inherited] =
      await Promise.all([
        loadNestedRefs(PERFORMER_REF, SCENE_PERFORMERS, scenes, ctx),
        loadNestedRefs(TAG_REF, SCENE_TAGS, scenes, ctx),
        loadNestedRefs(SCENE_GROUP_REF, SCENE_GROUPS, scenes, ctx),
        loadNestedRefs(GALLERY_REF, SCENE_GALLERIES, scenes, ctx),
        loadRefsByKey(STUDIO_REF, studioRefs, ctx),
        loadRefsByKey(TAG_REF, inheritedRefs, ctx),
      ]);

    for (const scene of scenes) {
      const key = entityKey(scene.id, scene.instanceId);
      scene.performers = performers.get(key) ?? [];
      scene.tags = tags.get(key) ?? [];
      scene.groups = groups.get(key) ?? [];
      scene.galleries = galleries.get(key) ?? [];
      scene.studio = scene.studioId
        ? (studios.get(entityKey(scene.studioId, scene.instanceId)) ?? null)
        : null;
      scene.inheritedTags = (scene.inheritedTagIds ?? []).flatMap((tagId) => {
        const tag = inherited.get(entityKey(tagId, scene.instanceId));
        return tag ? [tag] : [];
      });
    }
  }
}

// Export singleton instance
export const sceneQueryBuilder = new SceneQueryBuilder();
