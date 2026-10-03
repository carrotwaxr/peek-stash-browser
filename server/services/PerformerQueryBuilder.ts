/**
 * PerformerQueryBuilder: the performer list in SQL.
 *
 * The performer builder on the base (`query/EntityQueryBuilder.ts`): this
 * file declares the performer's spec (table, per-user joins, columns,
 * tiebreak), its filter clauses from the parsed request, its sort map, its
 * row transform and its relations. The instance filter, the exclusion join,
 * the `ids` filter, the random sort and the count are the base's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { NormalizedPerformer, TagRef } from "../types/index.js";
import type { PerformerQueryRow } from "../types/internal/queryRows.js";
import type {
  MultiEnumFieldCriterion,
  MultiEnumModifier,
  NumberCriterion,
  ParsedFilter,
  RefCriterion,
  RefFieldCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { expandRefs, expandRefsEach } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  type ViaSceneSpec,
  allOf,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  careerYearsSql,
  dayNumberSql,
  exclusionJoin,
  fullDateSql,
  noClause,
  searchAll,
  stashIdsClause,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  jsonListArm,
  parseJsonArray,
  parseStashIds,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { zonedToday } from "../utils/zonedTime.js";
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

// Column list for SELECT - all StashPerformer fields plus user data; the
// counts as the viewer sees them (query/excludedCounts.ts)
const selectColumns = (ctx: QueryContext) =>
  `
    p.id, p.stashInstanceId, p.name, p.disambiguation, p.gender, p.birthdate, p.favorite AS stashFavorite,
    p.rating100 AS stashRating100,
    ${visibleCount(ctx, "p.sceneCount", "scenes")} AS sceneCount,
    ${visibleCount(ctx, "p.imageCount", "images")} AS imageCount,
    ${visibleCount(ctx, "p.galleryCount", "galleries")} AS galleryCount,
    ${visibleCount(ctx, "p.groupCount", "groups")} AS groupCount,
    p.details, p.aliasList, p.country, p.ethnicity, p.hairColor, p.eyeColor,
    p.heightCm, p.weightKg, p.measurements, p.fakeTits, p.penisLength, p.circumcised,
    p.tattoos, p.piercings,
    p.careerLength, p.deathDate, p.url, p.urls, p.stashIds, p.imagePath,
    p.stashCreatedAt, p.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    s.oCounter AS userOCounter, s.playCount AS userPlayCount,
    s.lastPlayedAt AS userLastPlayedAt, s.lastOAt AS userLastOAt
  `.trim();

const PERFORMER_SPEC: EntitySpec = {
  table: "StashPerformer",
  alias: "p",
  entityType: "performer",
  userJoins: [
    { table: "PerformerRating", alias: "r", entityIdCol: "performerId" },
    { table: "UserPerformerStats", alias: "s", entityIdCol: "performerId" },
  ],
  // The viewer's excluded links per performer, for the counts
  extraJoins: (ctx) => excludedCountsJoin(ctx, "performer", "p"),
  selectColumns: (ctx) => ({ sql: selectColumns(ctx), params: [] }),
  defaultSort: "name",
  // Equal values list by name, then by the base's key
  tiebreak: (field) =>
    field === "name" ? undefined : "p.name COLLATE NOCASE ASC",
};

/** A performer's tags */
const PERFORMER_TAGS: JunctionTarget = {
  kind: "junction",
  table: "PerformerTag",
  alias: "pt",
  parentAlias: "p",
  parentIdCol: "performerId",
  parentInstanceCol: "performerInstanceId",
  refIdCol: "tagId",
  refInstanceCol: "tagInstanceId",
};

/** Performers in one of the scenes */
const PERFORMERS_BY_SCENE: ViaSceneSpec = {
  alias: "p",
  junction: { table: "ScenePerformer", alias: "sp" },
  entityIdCol: "performerId",
  entityInstanceCol: "performerInstanceId",
  sceneIdCol: "sceneId",
  sceneInstanceCol: "sceneInstanceId",
};

/** Performers in a scene of one of the groups (a collection's Performers tab) */
const PERFORMERS_BY_GROUP: ViaSceneSpec = {
  ...PERFORMERS_BY_SCENE,
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
 * Performers in a scene of one of the studios; a scene's studio is on the
 * scene's instance, and viaSceneClause requires the scene to be live
 */
const PERFORMERS_BY_STUDIO: ViaSceneSpec = {
  ...PERFORMERS_BY_SCENE,
  via: {
    table: "StashScene",
    alias: "sc",
    sceneIdCol: "id",
    sceneInstanceCol: "stashInstanceId",
    refIdCol: "studioId",
    refInstanceCol: "stashInstanceId",
  },
};

/**
 * Performers sharing a scene with one of the performers ("appears with"),
 * never the performer itself; a performer named counts only while live and
 * not excluded for the viewer
 */
const PERFORMERS_BY_PERFORMER: ViaSceneSpec = {
  ...PERFORMERS_BY_SCENE,
  via: {
    table: "ScenePerformer",
    alias: "spw",
    sceneIdCol: "sceneId",
    sceneInstanceCol: "sceneInstanceId",
    refIdCol: "performerId",
    refInstanceCol: "performerInstanceId",
    related: { table: "StashPerformer", entityType: "performer" },
  },
  where:
    "NOT (spw.performerId = sp.performerId AND spw.performerInstanceId = sp.performerInstanceId)",
};

/**
 * A count over related rows as a number filter: the count's own parameters
 * (the viewer's id) come first, as the expression appears once, before the
 * criterion's values, in every form `buildNumericFilter` writes
 */
function countFilter(criterion: NumberCriterion, count: FilterClause) {
  const clause = buildNumericFilter(criterion, count.sql);
  if (!clause.sql) return clause;
  return { sql: clause.sql, params: [...count.params, ...clause.params] };
}

/** The performer's live tags the viewer can see */
function visibleTagCount(ctx: QueryContext): FilterClause {
  const viewer = ctx.applyExclusions;
  return {
    sql: `(SELECT COUNT(*) FROM PerformerTag ptc JOIN StashTag ptct ON ptct.id = ptc.tagId AND ptct.stashInstanceId = ptc.tagInstanceId${viewer ? ` ${exclusionJoin("ptcx", "tag", "ptc.tagId", "ptc.tagInstanceId")}` : ""} WHERE ptc.performerId = p.id AND ptc.performerInstanceId = p.stashInstanceId AND ptct.deletedAt IS NULL${viewer ? " AND ptcx.id IS NULL" : ""})`,
    params: viewer ? [ctx.userId] : [],
  };
}

/**
 * The live clips (Stash's markers) the viewer can see in the performer's
 * live scenes they can see, as the Clips page reads them: the clip's own
 * exclusion rows and its scene's
 */
function visibleMarkerCount(ctx: QueryContext): FilterClause {
  const viewer = ctx.applyExclusions;
  const excluded = viewer
    ? ` ${exclusionJoin("mcsx", "scene", "mcs.id", "mcs.stashInstanceId")} ${exclusionJoin("mccx", "clip", "mcc.id", "mcc.stashInstanceId")}`
    : "";
  return {
    sql: `(SELECT COUNT(*) FROM ScenePerformer mcp JOIN StashScene mcs ON mcs.id = mcp.sceneId AND mcs.stashInstanceId = mcp.sceneInstanceId JOIN StashClip mcc ON mcc.sceneId = mcs.id AND mcc.sceneInstanceId = mcs.stashInstanceId${excluded} WHERE mcp.performerId = p.id AND mcp.performerInstanceId = p.stashInstanceId AND mcs.deletedAt IS NULL AND mcc.deletedAt IS NULL${viewer ? " AND mcsx.id IS NULL AND mccx.id IS NULL" : ""})`,
    params: viewer ? [ctx.userId, ctx.userId] : [],
  };
}

/** Circumcised: any of the values, or not set ('' or NULL) and set */
function circumcisedClause(
  criterion: MultiEnumFieldCriterion<"CUT" | "UNCUT">
): FilterClause {
  switch (criterion.modifier) {
    case "IS_NULL":
      return {
        sql: "(p.circumcised IS NULL OR p.circumcised = '')",
        params: [],
      };
    case "NOT_NULL":
      return {
        sql: "(p.circumcised IS NOT NULL AND p.circumcised != '')",
        params: [],
      };
    case "INCLUDES":
      return {
        sql: `p.circumcised IN (${criterion.values.map(() => "?").join(", ")})`,
        params: [...criterion.values],
      };
  }
}

/**
 * Gender: any of the values or none of them, ignoring case (none of them
 * keeps performers without a gender, as beta.7's NOT_EQUALS did), or not set
 * ('' or NULL, as Stash reads it) and set
 */
function genderClause(
  criterion: MultiEnumFieldCriterion<string, MultiEnumModifier>
): FilterClause {
  switch (criterion.modifier) {
    case "IS_NULL":
      return { sql: "(p.gender IS NULL OR p.gender = '')", params: [] };
    case "NOT_NULL":
      return { sql: "(p.gender IS NOT NULL AND p.gender != '')", params: [] };
    case "INCLUDES":
    case "EXCLUDES": {
      const marks = criterion.values.map(() => "?").join(", ");
      return {
        sql:
          criterion.modifier === "INCLUDES"
            ? `UPPER(p.gender) IN (${marks})`
            : `(p.gender IS NULL OR UPPER(p.gender) NOT IN (${marks}))`,
        params: [...criterion.values],
      };
    }
  }
}

/**
 * A performer's age, Stash's way: today's, or the age reached at death. A
 * birthdate or death date of only a year, or a year and month, counts from
 * its first day. Today is the viewer's (`ctx.timeZone`), bound as its
 * `YYYY.MMDD` day number (`dayNumberSql`'s form), so near midnight the age
 * turns on the viewer's birthday, not UTC's.
 */
function ageClause(timeZone: string): FilterClause {
  const today = zonedToday(timeZone);
  return {
    sql: `CAST((CASE WHEN p.deathDate IS NULL THEN ? ELSE ${dayNumberSql("p.deathDate")} END) - ${dayNumberSql("p.birthdate")} AS INTEGER)`,
    params: [`${today.slice(0, 4)}.${today.slice(5, 7)}${today.slice(8, 10)}`],
  };
}

/**
 * The years of the performer's career, from Stash's free-text career field,
 * to the current year in the viewer's zone ("2015 - present")
 */
function careerYears(timeZone: string): FilterClause {
  return careerYearsSql(
    "p.careerLength",
    Number(zonedToday(timeZone).slice(0, 4))
  );
}

/**
 * A number derived from a date column (a year, an age): a performer without
 * the date never matches, NOT_EQUALS and NOT_BETWEEN included. IS_NULL and
 * NOT_NULL, which the contract allows none of here, filter nothing.
 */
function datedNumberClause(
  criterion: NumberCriterion,
  column: string,
  expr: string | FilterClause
): FilterClause {
  if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
    return noClause();
  }
  const value = typeof expr === "string" ? { sql: expr, params: [] } : expr;
  // buildNumericFilter writes the expression once, ahead of its own values
  const clause = buildNumericFilter(criterion, value.sql);
  if (!clause.sql) return clause;
  return {
    sql: `(${column} IS NOT NULL AND ${clause.sql})`,
    params: [...value.params, ...clause.params],
  };
}

/**
 * A text attribute compared whole, ignoring case (the free text Stash keeps
 * for ethnicity, hair and eye colour, breast type): NOT_EQUALS keeps
 * performers without one.
 */
function wholeTextClause(
  criterion: { readonly modifier: string; readonly value?: string },
  column: string
): FilterClause {
  if (criterion.value === undefined) return noClause();
  switch (criterion.modifier) {
    case "EQUALS":
      return { sql: `UPPER(${column}) = UPPER(?)`, params: [criterion.value] };
    case "NOT_EQUALS":
      return {
        sql: `(${column} IS NULL OR UPPER(${column}) != UPPER(?))`,
        params: [criterion.value],
      };
    default:
      return noClause();
  }
}

/** A height or weight of 0 is none */
const zeroToNull = (value: number | null): number | null =>
  value === 0 ? null : value;

/**
 * Builds and executes SQL queries for performer filtering
 */
class PerformerQueryBuilder extends EntityQueryBuilder<
  PerformerQueryRow,
  NormalizedPerformer,
  "performer"
> {
  protected readonly spec = PERFORMER_SPEC;

  /**
   * The sort expressions. career_length lists performers without a value
   * last in both directions.
   */
  protected sortMap(
    dir: SortDirection,
    _filter: ParsedFilter<"performer">,
    ctx: QueryContext
  ): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    const career = careerYears(ctx.timeZone);
    return {
      // Performer metadata, the name case-insensitive
      name: column("p.name COLLATE NOCASE"),
      created_at: column("p.stashCreatedAt"),
      updated_at: column("p.stashUpdatedAt"),
      birthdate: column("p.birthdate"),
      height: column("p.heightCm"),
      weight: column("p.weightKg"),
      measurements: column("p.measurements COLLATE NOCASE"),
      penis_length: column("p.penisLength"),
      career_length: {
        sql: `${career.sql} ${dir} NULLS LAST`,
        params: career.params,
      },

      // Counts, as the viewer sees them
      scene_count: column(visibleCount(ctx, "p.sceneCount", "scenes")),
      scenes_count: column(visibleCount(ctx, "p.sceneCount", "scenes")),
      image_count: column(visibleCount(ctx, "p.imageCount", "images")),
      gallery_count: column(visibleCount(ctx, "p.galleryCount", "galleries")),
      group_count: column(visibleCount(ctx, "p.groupCount", "groups")),

      // The performer's live tags and clips the viewer can see, as the
      // filters count them
      tag_count: this.countSort(visibleTagCount(ctx), dir),
      marker_count: this.countSort(visibleMarkerCount(ctx), dir),

      // The viewer's rating (PerformerRating)
      rating: column("COALESCE(r.rating, 0)"),
      rating100: column("COALESCE(r.rating, 0)"),

      // The viewer's stats (UserPerformerStats)
      o_counter: column("COALESCE(s.oCounter, 0)"),
      play_count: column("COALESCE(s.playCount, 0)"),
      last_played_at: column("s.lastPlayedAt"),
      last_o_at: column("s.lastOAt"),
    };
  }

  /**
   * The performer filter's clauses, one per field, in the order the
   * statement ANDs them. A ref field's CTEs are named from the leaf
   * (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"performer"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    o_counter: (c) => buildNumericFilter(c, "COALESCE(s.oCounter, 0)"),
    play_count: (c) => buildNumericFilter(c, "COALESCE(s.playCount, 0)"),

    // Related entities
    tags: (c, ctx) => this.tagClause(c, ctx),
    tag_favorite: (on, ctx) => this.tagFavoriteClause(on, ctx),
    // Through the scenes the viewer can see
    studios: (c, ctx) => this.studioClause(c, ctx),
    scenes: (c, ctx) =>
      viaSceneClause(PERFORMERS_BY_SCENE, c.refs, c.modifier, ctx),
    groups: (c, ctx) =>
      viaSceneClause(PERFORMERS_BY_GROUP, c.refs, c.modifier, ctx),
    performers: (c, ctx) =>
      viaSceneClause(PERFORMERS_BY_PERFORMER, c.refs, c.modifier, ctx),

    // Counts, as the viewer sees them
    scene_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "p.sceneCount", "scenes")),
    image_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "p.imageCount", "images")),
    gallery_count: (c, ctx) =>
      buildNumericFilter(c, visibleCount(ctx, "p.galleryCount", "galleries")),
    tag_count: (c, ctx) => countFilter(c, visibleTagCount(ctx)),
    marker_count: (c, ctx) => countFilter(c, visibleMarkerCount(ctx)),

    // Text; the name also matches the aliases, each on its own
    name: (c) => buildTextFilter(c, "p.name", { lists: ["p.aliasList"] }),
    aliases: (c) => buildTextFilter(c, null, { lists: ["p.aliasList"] }),
    disambiguation: (c) => buildTextFilter(c, "p.disambiguation"),
    country: (c) => buildTextFilter(c, "p.country"),
    // Any one of the performer's links
    url: (c) => buildTextFilter(c, null, { lists: ["p.urls"] }),
    stash_id: (c) => stashIdsClause(c, "p.stashIds"),
    circumcised: (c) => circumcisedClause(c),
    details: (c) => buildTextFilter(c, "p.details"),
    tattoos: (c) => buildTextFilter(c, "p.tattoos"),
    piercings: (c) => buildTextFilter(c, "p.piercings"),
    measurements: (c) => buildTextFilter(c, "p.measurements"),

    // Body: a performer without a value matches only IS_NULL
    height: (c) => buildNumericFilter(c, "p.heightCm"),
    weight: (c) => buildNumericFilter(c, "p.weightKg"),
    // A performer without a value never matches a comparison, as in Stash
    penis_length: (c) => buildNumericFilter(c, "p.penisLength"),

    // Career: a performer without a value (or with text that names no years)
    // matches only IS_NULL
    career_length: (c, ctx) => {
      // buildNumericFilter writes the expression once, ahead of its values
      const years = careerYears(ctx.timeZone);
      const clause = buildNumericFilter(c, years.sql);
      return clause.sql
        ? { sql: clause.sql, params: [...years.params, ...clause.params] }
        : clause;
    },

    // Compared whole, ignoring case
    gender: (c) => genderClause(c),
    ethnicity: (c) => wholeTextClause(c, "p.ethnicity"),
    hair_color: (c) => wholeTextClause(c, "p.hairColor"),
    eye_color: (c) => wholeTextClause(c, "p.eyeColor"),
    fake_tits: (c) => wholeTextClause(c, "p.fakeTits"),

    // Years and age, from the dates
    birth_year: (c) =>
      datedNumberClause(
        c,
        "p.birthdate",
        `CAST(SUBSTR(${fullDateSql("p.birthdate")}, 1, 4) AS INTEGER)`
      ),
    death_year: (c) =>
      datedNumberClause(
        c,
        "p.deathDate",
        `CAST(SUBSTR(${fullDateSql("p.deathDate")}, 1, 4) AS INTEGER)`
      ),
    age: (c, ctx) =>
      datedNumberClause(c, "p.birthdate", ageClause(ctx.timeZone)),

    // Dates
    birthdate: (c) => buildDayFilter(c, "p.birthdate"),
    death_date: (c) => buildDayFilter(c, "p.deathDate"),
    created_at: (c, ctx) =>
      buildInstantFilter(c, "p.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "p.stashUpdatedAt", ctx.timeZone),
  };

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    // "Has any" and "has none" count only tags the viewer can see
    return hierarchicalRefClause("tag", PERFORMER_TAGS, criterion, ctx, {
      name: ctx.name,
      related: { table: "StashTag", entityType: "tag" },
    });
  }

  /**
   * Performers in the visible scenes of the studios, with the studios'
   * descendants to the depth (a studio page's Performers tab with its
   * sub-studios). INCLUDES_ALL is one clause per selected studio, each with
   * its own descendants, AND-ed, as the hierarchical filters take it.
   */
  private async studioClause(
    criterion: RefCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    if (criterion.modifier === "INCLUDES_ALL") {
      const groups = await expandRefsEach(
        "studio",
        criterion.refs,
        criterion.depth,
        ctx.allowedInstanceIds
      );
      return allOf(
        groups.map((group) =>
          viaSceneClause(PERFORMERS_BY_STUDIO, group, "INCLUDES", ctx)
        )
      );
    }
    const refs = await expandRefs(
      "studio",
      criterion.refs,
      criterion.depth,
      ctx.allowedInstanceIds
    );
    return viaSceneClause(PERFORMERS_BY_STUDIO, refs, criterion.modifier, ctx);
  }

  /**
   * `tag_favorite`: the performer has (`true`) or lacks (`false`) one of the
   * viewer's favourite tags (a favourite they hid does not count) or a tag
   * under one, through the tag filter's shapes. With no favourites `true`
   * matches nothing and `false` is no filter.
   */
  private async tagFavoriteClause(
    on: boolean,
    ctx: LeafContext
  ): Promise<FilterClause> {
    const refs = await favoriteRefs("tag", ctx);
    if (refs.length === 0) {
      return on ? { sql: "1 = 0", params: [] } : noClause();
    }
    return this.tagClause(
      { refs, modifier: on ? "INCLUDES" : "EXCLUDES", depth: -1 },
      ctx
    );
  }

  /**
   * The search across the name and aliases: every word must match
   * (`searchAll`), each as `likeContains` with `ESCAPE '\'`, so a `%`, `_`
   * or `\` in the text matches itself, an alias read one at a time. No
   * `LOWER()`: SQLite's LIKE folds ASCII case, and a non-ASCII letter matches
   * as typed.
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: `(p.name LIKE ? ESCAPE '\\' OR ${jsonListArm("p.aliasList")})`,
      params: [pattern, pattern],
    }));
  }

  /**
   * Transform a raw database row into a NormalizedPerformer
   */
  protected transformRow(row: PerformerQueryRow): NormalizedPerformer {
    const performer = {
      id: row.id,
      instanceId: row.stashInstanceId,
      name: row.name,
      disambiguation: emptyToNull(row.disambiguation),
      gender: emptyToNull(row.gender),
      birthdate: emptyToNull(row.birthdate),
      details: emptyToNull(row.details),
      alias_list: parseJsonArray(row.aliasList),
      country: emptyToNull(row.country),
      ethnicity: emptyToNull(row.ethnicity),
      hair_color: emptyToNull(row.hairColor),
      eye_color: emptyToNull(row.eyeColor),
      height_cm: zeroToNull(row.heightCm),
      weight: zeroToNull(row.weightKg),
      measurements: emptyToNull(row.measurements),
      fake_tits: emptyToNull(row.fakeTits),
      penis_length: row.penisLength,
      circumcised: row.circumcised,
      tattoos: emptyToNull(row.tattoos),
      piercings: emptyToNull(row.piercings),
      career_length: emptyToNull(row.careerLength),
      death_date: emptyToNull(row.deathDate),
      url: emptyToNull(row.url),
      urls: parseJsonArray(row.urls),
      stash_ids: parseStashIds(row.stashIds),

      // Image path - transform to proxy URL with instanceId for multi-instance routing
      image_path: toProxyUrl(row.imagePath, row.stashInstanceId),

      // Counts
      scene_count: Number(row.sceneCount ?? 0),
      image_count: Number(row.imageCount ?? 0),
      gallery_count: Number(row.galleryCount ?? 0),
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
      last_played_at: row.userLastPlayedAt?.toISOString() ?? null,
      last_o_at: row.userLastOAt?.toISOString() ?? null,

      // Relations - populated separately
      tags: [] as TagRef[],
    };

    return performer as NormalizedPerformer;
  }

  /**
   * The card's relations for the whole page: its tags, and at most
   * TOOLTIP_LIMIT studios, collections and galleries with how many there
   * are (TooltipRelations), one statement per relation
   */
  protected async populateRelations(
    performers: NormalizedPerformer[],
    ctx: QueryContext
  ): Promise<void> {
    const relations = await loadTooltipRelations(
      "performer",
      performers,
      ctx.userId
    );
    for (const performer of performers) {
      Object.assign(
        performer,
        relations.get(entityKey(performer.id, performer.instanceId))
      );
    }
  }
}

// Export singleton instance
export const performerQueryBuilder = new PerformerQueryBuilder();
