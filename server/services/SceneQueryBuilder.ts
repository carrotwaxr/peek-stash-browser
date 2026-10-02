/**
 * SceneQueryBuilder: the scene list in SQL.
 *
 * The scene builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the scene's spec (table, per-user joins, columns), its filter
 * clauses (a table with one function per field, and the search), its sort
 * map, its row transform and its relations. The instance filter, the exclusion join, the `ids` filter, the
 * random sort, the primary key ending every order and the count are the
 * base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
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
  MultiEnumCriterion,
  ParsedFilter,
  PlaylistCriterion,
  RefCriterion,
  RefFieldCriterion,
  TextCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import {
  ownPlaylistSql,
  viewablePlaylistSql,
} from "../utils/playlistAccessSql.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  type ParentKey,
  type PerformerAgeSource,
  type SqlFragment,
  allOf,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  countForms,
  exclusionJoin,
  instanceClause,
  matchedSetClause,
  noClause,
  performerAgeExists,
  performerTagsClause,
  refClause,
  resolutionClause,
  sceneUntaggedSql,
  searchAll,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  parseJsonArray,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../utils/sqlJson.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import {
  COMPLETED_SQL,
  IN_PROGRESS_SQL,
  watchStateClause,
} from "../utils/watchStateSql.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
  favoriteRefs,
  hierarchicalRefClause,
  refFieldClause,
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
    w.resumeTime AS userResumeTime,
    (SELECT MAX(j.value) FROM json_each(w.oHistory) j) AS userLastOAt
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

/** The junction Performer Age reads a scene's performers from */
const SCENE_PERFORMER_AGE: PerformerAgeSource = {
  junction: {
    table: "ScenePerformer",
    itemId: "sceneId",
    itemInstance: "sceneInstanceId",
    performerId: "performerId",
    performerInstance: "performerInstanceId",
  },
  item: { id: "s.id", instance: "s.stashInstanceId", date: "s.date" },
};

/** The scene's key, as a playlist item names it (`PlaylistItem.sceneId`, `instanceId`) */
const SCENE_KEY: ParentKey = ["s.id", "s.stashInstanceId"];

/**
 * The items of the playlists `access` lets through (a condition on `p`),
 * of these playlists only when `ids` is given: the FROM and WHERE of a
 * statement selecting `pi.sceneId, pi.instanceId`. With ids, SQLite reads
 * each playlist's items from PlaylistItem's unique key (playlistId,
 * instanceId, sceneId).
 */
function playlistItems(
  access: SqlFragment,
  ids?: readonly number[]
): SqlFragment {
  const only =
    ids === undefined
      ? ""
      : `pi.playlistId IN (${ids.map(() => "?").join(", ")}) AND `;
  return {
    sql: `FROM PlaylistItem pi JOIN Playlist p ON p.id = pi.playlistId WHERE ${only}${access.sql}`,
    params: [...(ids ?? []), ...access.params],
  };
}

/** Scenes among the items: a row-value IN on the scene's key, read once */
function inPlaylists(items: SqlFragment): FilterClause {
  return {
    sql: `(${SCENE_KEY[0]}, ${SCENE_KEY[1]}) IN (SELECT pi.sceneId, pi.instanceId ${items.sql})`,
    params: items.params,
  };
}

/**
 * Scenes in none of the items: the items' distinct scenes as a materialized
 * set, matched by the scene's key (`matchedSetClause`). At 215k scenes "in
 * none of my playlists" (2,549 items) adds about 40 ms to the count (150
 * against 112 ms unfiltered), where a correlated NOT EXISTS took 850 ms and
 * a row-value NOT IN 6 s (PlaylistItem has no scene index).
 */
function notInPlaylists(items: SqlFragment, name: string): FilterClause {
  const setName = `${name}_set`;
  return matchedSetClause(SCENE_KEY, setName, "EXCLUDES", [
    {
      name: setName,
      sql: `${setName}(id, inst) AS MATERIALIZED (SELECT DISTINCT pi.sceneId, pi.instanceId ${items.sql})`,
      params: items.params,
    },
  ]);
}

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
   * A scene sort's order for rows of `s` read outside the list statement (a
   * playlist's items): the viewer's rating and history joins on `s`, bound
   * to `userId` as the list writes them, then the sort's own joins; and the
   * expression the Scenes page sorts by, from the same sort map with an
   * empty filter (random through the list's seeded order). Without a
   * filter `scene_index` has no expression and gives the default sort's;
   * the playlist parser never sends it. The order holds no tiebreak: the
   * caller ends it with its own.
   */
  sortTerms(
    userId: number,
    sort: {
      field: string;
      direction: SortDirection;
      seed: number | undefined;
    }
  ): { joins: SqlFragment[]; order: SqlFragment } {
    const ctx: QueryContext = {
      userId,
      applyExclusions: true,
      allowedInstanceIds: [],
      specificInstanceId: undefined,
      sortField: sort.field,
      // No sort reads it
      timeZone: "UTC",
    };
    const expr = this.sortExpr(sort.field, sort.direction, sort.seed, {}, ctx);
    return {
      joins: [...this.userJoinFragments(userId), ...(expr.joins ?? [])],
      order: { sql: expr.sql, params: expr.params },
    };
  }

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
   * without it the key falls back to the default sort. playlist_position is
   * the same for the one playlist the request filters by.
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
      ...this.playlistPositionSort(dir, filter),
    };
  }

  /**
   * Playlist order: the scene's position in the one playlist the filter
   * includes. The filter already keeps only that playlist's scenes, and only
   * when the viewer may read it, so the INNER JOIN keeps the count; it
   * matches at most one row (PlaylistItem's key is playlist, instance and
   * scene). Without exactly one included playlist the key has no expression
   * and the default sort applies (the parser refuses it first).
   */
  private playlistPositionSort(
    dir: SortDirection,
    filter: ParsedFilter<"scene">
  ): Record<string, SortExpr> {
    const criterion = filter.playlists;
    const id = criterion?.ids[0];
    if (
      criterion === undefined ||
      id === undefined ||
      criterion.ids.length !== 1 ||
      (criterion.modifier !== "INCLUDES" &&
        criterion.modifier !== "INCLUDES_ALL")
    ) {
      return {};
    }
    return {
      playlist_position: {
        sql: `pip.position ${dir}`,
        params: [],
        joins: [
          {
            sql: "JOIN PlaylistItem pip ON pip.playlistId = ? AND pip.sceneId = s.id AND pip.instanceId = s.stashInstanceId",
            params: [id],
          },
        ],
      },
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
    // Only an including criterion names a collection; presence names none
    if (
      criterion === undefined ||
      first === undefined ||
      (criterion.modifier !== "INCLUDES" &&
        criterion.modifier !== "INCLUDES_ALL")
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

  /**
   * The scene filter's clauses, one per field, in the order the statement
   * ANDs them. A ref field's CTEs are named from the leaf (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"scene"> = {
    // Metadata
    duration: (c) => buildNumericFilter(c, "s.duration"),
    resolution: (c) => resolutionClause(c, "s.fileWidth", "s.fileHeight"),
    // No tag, own or inherited (the folder view's Untagged), or some tag
    tagged: (tagged) => {
      const untagged = sceneUntaggedSql("s");
      return { sql: tagged ? `NOT ${untagged}` : untagged, params: [] };
    },
    organized: (organized) => ({
      sql: "s.organized = ?",
      params: [organized ? 1 : 0],
    }),

    // Related entities
    // "Has any" and "has none" count only related rows the viewer can see
    performers: (c, ctx) =>
      refFieldClause(SCENE_PERFORMERS, c, ctx, {
        table: "StashPerformer",
        entityType: "performer",
      }),
    tags: (c, ctx) => this.tagClause(c, ctx),
    studios: (c, ctx) => this.studioClause(c, ctx),
    // With a depth, a collection's sub-collections too
    groups: (c, ctx) =>
      hierarchicalRefClause("group", SCENE_GROUPS, c, ctx, {
        name: ctx.name,
        related: { table: "StashGroup", entityType: "group" },
      }),
    galleries: (c, ctx) =>
      refFieldClause(SCENE_GALLERIES, c, ctx, {
        table: "StashGallery",
        entityType: "gallery",
      }),
    // Through the tags of the scene's performers
    performer_tags: (c, ctx) => this.performerTagsClause(c, ctx),
    // Peek's playlists: the viewer's own and shared ones by id, "any of my
    // playlists" their own only (owner answer 13)
    playlists: (c, ctx) => this.playlistClause(c, ctx),
    in_any_playlist: (inAny, ctx) => {
      const items = playlistItems(ownPlaylistSql("p", ctx.userId));
      return inAny ? inPlaylists(items) : notInPlaylists(items, ctx.name);
    },

    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    play_count: (c) => buildNumericFilter(c, "COALESCE(w.playCount, 0)"),
    o_counter: (c) => buildNumericFilter(c, "COALESCE(w.oCount, 0)"),
    // The History page's rules (utils/watchStateSql.ts), over the viewer's row
    watched: (on) => ({ sql: watchStateClause(COMPLETED_SQL, on), params: [] }),
    in_progress: (on) => ({
      sql: watchStateClause(IN_PROGRESS_SQL, on),
      params: [],
    }),

    // Text
    title: (c) => buildTextFilter(c, "s.title"),
    details: (c) => buildTextFilter(c, "s.details"),
    director: (c) => buildTextFilter(c, "s.director"),
    // The primary file's path only, as Peek stores it
    path: (c) => buildTextFilter(c, "s.filePath"),
    // Each URL on its own text, not the JSON list's
    url: (c) => buildTextFilter(c, null, { lists: ["s.urls"] }),
    code: (c) => buildTextFilter(c, "s.code"),
    captions: (c) => this.captionsClause(c),
    has_markers: (on, ctx) => this.markersClause(on, ctx),
    duplicated: (on, ctx) => this.duplicatedClause(on, ctx),

    // Dates
    date: (c) => buildDayFilter(c, "s.date"),
    created_at: (c, ctx) =>
      buildInstantFilter(c, "s.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "s.stashUpdatedAt", ctx.timeZone),
    last_played_at: (c, ctx) =>
      buildInstantFilter(c, "w.lastPlayedAt", ctx.timeZone),

    // Numbers
    bitrate: (c) => buildNumericFilter(c, "s.fileBitRate"),
    framerate: (c) => buildNumericFilter(c, "s.fileFrameRate"),
    play_duration: (c) => buildNumericFilter(c, "COALESCE(w.playDuration, 0)"),

    // Counts, stored by sync (SCENE_DERIVED_COLUMNS_SQL): the scene's
    // ScenePerformer and SceneTag rows
    performer_count: (c) => buildNumericFilter(c, "s.performerCount"),
    tag_count: (c) => buildNumericFilter(c, "s.tagCount"),
    performer_age: (c, ctx) =>
      performerAgeExists(
        c,
        SCENE_PERFORMER_AGE,
        ctx.applyExclusions ? ctx.userId : null
      ),

    // Enums
    orientation: (c) => this.orientationClause(c),
    video_codec: (c) => buildTextFilter(c, "s.fileVideoCodec"),
    audio_codec: (c) => buildTextFilter(c, "s.fileAudioCodec"),

    // The viewer's favorite entities; false is the negation of true
    performer_favorite: (on, ctx) => this.favoriteClause("performer", on, ctx),
    studio_favorite: (on, ctx) => this.favoriteClause("studio", on, ctx),
    tag_favorite: (on, ctx) => this.favoriteClause("tag", on, ctx),
  };

  /**
   * Scenes by playlist: INCLUDES any of the playlists, INCLUDES_ALL each
   * (one INCLUDES per id, AND-ed), EXCLUDES none. Only playlists the viewer
   * may read count (`viewablePlaylistSql`); any other id holds no scenes,
   * so it is never refused and a count reveals nothing about it (INCLUDES
   * matches nothing, EXCLUDES the whole list, as for an id that does not
   * exist). The viewer's exclusions apply to the scenes as on every list.
   */
  private playlistClause(
    criterion: PlaylistCriterion,
    ctx: LeafContext
  ): FilterClause {
    const viewable = viewablePlaylistSql("p", ctx.userId);
    switch (criterion.modifier) {
      case "INCLUDES":
        return inPlaylists(playlistItems(viewable, criterion.ids));
      case "INCLUDES_ALL":
        return allOf(
          criterion.ids.map((id) => inPlaylists(playlistItems(viewable, [id])))
        );
      case "EXCLUDES":
        return notInPlaylists(playlistItems(viewable, criterion.ids), ctx.name);
    }
  }

  /**
   * Captions: each element's `language_code`, compared whole (a language code
   * is lowercase as Stash stores it). A NULL or damaged list, or an element
   * that is not an object, holds no code, so IS_NULL lists it and NOT_EQUALS
   * keeps it.
   */
  private captionsClause(criterion: TextCriterion): FilterClause {
    const code =
      "CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.language_code') END";
    const codes = `SELECT 1 FROM json_each(${jsonListOrEmpty("s.captions")}) j WHERE ${code}`;
    switch (criterion.modifier) {
      case "EQUALS":
        return { sql: `EXISTS (${codes} = ?)`, params: [criterion.value] };
      case "NOT_EQUALS":
        return { sql: `NOT EXISTS (${codes} = ?)`, params: [criterion.value] };
      case "IS_NULL":
        return { sql: `NOT EXISTS (${codes} IS NOT NULL)`, params: [] };
      case "NOT_NULL":
        return { sql: `EXISTS (${codes} IS NOT NULL)`, params: [] };
      // Not offered: the parser refuses them
      case "INCLUDES":
      case "EXCLUDES":
      case "STARTS_WITH":
        return noClause();
    }
  }

  /**
   * Scenes with (true) or without (false) a live clip the viewer can see: not
   * deleted and, when exclusions apply, not hidden as a clip (the scene's own
   * exclusion is the statement's). The clip is on the scene's instance, and
   * the anti-join carries its every-instance arm.
   */
  private markersClause(on: boolean, ctx: LeafContext): FilterClause {
    const viewer = ctx.applyExclusions;
    const clause: FilterClause = {
      sql: `EXISTS (SELECT 1 FROM StashClip c${viewer ? ` ${exclusionJoin("ce", "clip", "c.id", "c.stashInstanceId")}` : ""} WHERE c.sceneId = s.id AND c.sceneInstanceId = s.stashInstanceId AND c.deletedAt IS NULL${viewer ? " AND ce.id IS NULL" : ""})`,
      params: viewer ? [ctx.userId] : [],
    };
    return on ? clause : { sql: `NOT ${clause.sql}`, params: clause.params };
  }

  /**
   * Scenes with (true) or without (false) another live scene the viewer can
   * see with the same primary phash, on the scene's own instance (a hash
   * shared with another server's scene is no duplicate: owner answer 15). A
   * scene without a hash, or with an empty one, has no duplicate, so false
   * lists it.
   */
  private duplicatedClause(on: boolean, ctx: LeafContext): FilterClause {
    const viewer = ctx.applyExclusions;
    const allowed = instanceClause("d", ctx.allowedInstanceIds);
    const twin: FilterClause = {
      sql: `(s.phash IS NOT NULL AND s.phash != '' AND EXISTS (SELECT 1 FROM StashScene d${viewer ? ` ${exclusionJoin("de", "scene", "d.id", "d.stashInstanceId")}` : ""} WHERE d.phash = s.phash AND d.deletedAt IS NULL AND ${allowed.sql} AND d.stashInstanceId = s.stashInstanceId AND NOT (d.id = s.id AND d.stashInstanceId = s.stashInstanceId)${viewer ? " AND de.id IS NULL" : ""}))`,
      params: [...(viewer ? [ctx.userId] : []), ...allowed.params],
    };
    return on ? twin : { sql: `NOT ${twin.sql}`, params: twin.params };
  }

  /** A ref filter on one of the scene's junctions, its CTEs named from the leaf */
  private refs(
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
   * The tag filter: the scene's own tags (SceneTag) and its inherited tags
   * (SceneInheritedTag), each arm in the same shape, read by index. With a
   * depth, INCLUDES_ALL is one clause per selected tag, each with its own
   * descendants (QUERIES-08). Under a sort with an index the page walks it
   * and probes each scene's tags by the junctions' keys (above 64 refs,
   * against the scenes the junctions' tag indexes list for the refs); under
   * one without, the tagged scenes are read from the junctions' tag indexes
   * (above 64 refs, the matched set). The count reads every match in no
   * order, so it takes the second form whatever the sort (`sortedByIndex`,
   * L8, L9). "Has none" is the folder view's Untagged (`tagged: false`: no
   * own or inherited tag row, the stored count read by its browse index),
   * "has any" its negation.
   */
  private async tagClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
      const untagged = sceneUntaggedSql("s");
      return {
        sql: criterion.modifier === "IS_NULL" ? untagged : `NOT ${untagged}`,
        params: [],
      };
    }
    return hierarchicalRefClause("tag", SCENE_TAGS, criterion, ctx, {
      name: ctx.name,
      inheritedJunction: SCENE_INHERITED_TAGS,
      sortedByIndex: INDEXED_SORTS.has(ctx.sortField) && !ctx.underAny,
    });
  }

  /**
   * Performer tags: the scene has a live performer the viewer can see that
   * holds one of the tags, expanded to their descendants to the depth
   * (`performerTagsClause`). INCLUDES_ALL is one clause per chosen tag, each
   * with its own descendants, AND-ed: each on some performer of the scene.
   * A page under a sort with an index walks it (`sortedByIndex`).
   */
  private async performerTagsClause(
    criterion: RefCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    const opts = {
      name: ctx.name,
      allowedInstanceIds: ctx.allowedInstanceIds,
      viewerId: ctx.applyExclusions ? ctx.userId : null,
      sortedByIndex: INDEXED_SORTS.has(ctx.sortField) && !ctx.underAny,
    };
    if (criterion.modifier === "INCLUDES_ALL") {
      const groups = await expandRefsEach(
        "tag",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      );
      if (groups.length === 0) return noClause();
      const each = groups.map((group, i) =>
        performerTagsClause(SCENE_PERFORMERS, group, "INCLUDES", {
          ...opts,
          name: `${ctx.name}_${i}`,
        })
      );
      // allOf keeps no count form: the count ANDs each clause's own
      const page = allOf(each);
      return opts.sortedByIndex
        ? { ...page, count: allOf(countForms(each)) }
        : page;
    }
    const refs = await expandRefs(
      "tag",
      criterion.refs,
      criterion.depth,
      ctx.allowedInstanceIds
    );
    return performerTagsClause(
      SCENE_PERFORMERS,
      refs,
      criterion.modifier,
      opts
    );
  }

  /** The studio filter, with the studios' descendants to the depth */
  private async studioClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("studio", SCENE_STUDIO, criterion, ctx, {
      name: ctx.name,
    });
  }

  /**
   * `tag_favorite`, `studio_favorite` and `performer_favorite`: the scene
   * has (`true`) or lacks (`false`) one of the viewer's favourites, through
   * the same shapes as the tag, studio and performer filters. Tags count
   * the scene's own and inherited tags and every sub-tag, studios their
   * sub-studios (depth -1, as the Tags and Studios filters take it). With
   * no favourites `true` matches nothing and `false` is no filter.
   */
  private async favoriteClause(
    kind: "tag" | "studio" | "performer",
    on: boolean,
    ctx: LeafContext
  ): Promise<FilterClause> {
    const refs = await favoriteRefs(kind, ctx);
    if (refs.length === 0) {
      return on ? { sql: "1 = 0", params: [] } : noClause();
    }
    const criterion: RefCriterion = {
      refs,
      modifier: on ? "INCLUDES" : "EXCLUDES",
      depth: -1,
    };
    if (kind === "tag") return this.tagClause(criterion, ctx);
    if (kind === "studio") return this.studioClause(criterion, ctx);
    return this.refs(SCENE_PERFORMERS, { ...criterion, depth: 0 }, ctx);
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
   * tags: every word must match (`searchAll`), a word found in any of the
   * six places, each as `likeContains` with `ESCAPE '\'`, so a `%`, `_` or
   * `\` in the text matches itself. No `LOWER()`: SQLite's LIKE folds ASCII
   * case, and a non-ASCII letter matches as typed.
   */
  protected override searchClause(
    searchQuery: string,
    ctx: QueryContext
  ): FilterClause {
    // A name matches only through a live entity the viewer can see, on its
    // own instance, as the lists show it
    const visible = (excl: string, entityType: string, alias: string) =>
      ctx.applyExclusions
        ? `AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity ${excl} WHERE ${excl}.userId = ? AND ${excl}.entityType = '${entityType}' AND ${excl}.entityId = ${alias}.id AND (${excl}.instanceId = '' OR ${excl}.instanceId = ${alias}.stashInstanceId))`
        : "";
    const visibleParams = ctx.applyExclusions ? [ctx.userId] : [];
    const like = "LIKE ? ESCAPE '\\'";

    const sql = `(
      s.title ${like} OR
      s.details ${like} OR
      s.filePath ${like} OR
      EXISTS (
        SELECT 1 FROM ScenePerformer sp
        INNER JOIN StashPerformer p ON sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
        WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        AND p.deletedAt IS NULL
        ${visible("xp", "performer", "p")}
        AND p.name ${like}
      ) OR
      EXISTS (
        SELECT 1 FROM StashStudio st
        WHERE st.id = s.studioId AND st.stashInstanceId = s.stashInstanceId
        AND st.deletedAt IS NULL
        ${visible("xs", "studio", "st")}
        AND st.name ${like}
      ) OR
      EXISTS (
        SELECT 1 FROM SceneTag stag
        INNER JOIN StashTag t ON stag.tagId = t.id AND stag.tagInstanceId = t.stashInstanceId
        WHERE stag.sceneId = s.id AND stag.sceneInstanceId = s.stashInstanceId
        AND t.deletedAt IS NULL
        ${visible("xt", "tag", "t")}
        AND t.name ${like}
      )
    )`;

    return searchAll(searchTerms(searchQuery), (pattern) => ({
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
    }));
  }

  /**
   * Transform a raw database row into a NormalizedScene
   */
  protected transformRow(row: SceneQueryRow): NormalizedScene {
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
      last_played_at: row.userLastPlayedAt?.toISOString() ?? null,
      last_o_at: row.userLastOAt,

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
