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
  NumberCriterion,
  ParsedFilter,
  RefCriterion,
  TextCriterion,
} from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type FilterClause,
  type JunctionTarget,
  type ViaSceneSpec,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  buildTextFilter,
  careerYearsSql,
  noClause,
  viaSceneClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseJsonArray,
  parseStashIds,
} from "../utils/sqlHelpers.js";
import { loadTooltipRelations } from "./TooltipRelations.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
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
    p.careerLength, p.deathDate, p.url, p.stashIds, p.imagePath,
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

/** A performer's age today, from the birthdate, as SQLite computes it */
const AGE = `CAST((julianday(date('now')) - julianday(p.birthdate)) / 365.25 AS INTEGER)`;

/** The years of the performer's career, from Stash's free-text career field */
const CAREER_YEARS = careerYearsSql("p.careerLength");

/**
 * A number derived from a date column (a year, an age): a performer without
 * the date matches only NOT_EQUALS. The other modifiers the contract allows
 * none of here filter nothing.
 */
function datedNumberClause(
  criterion: NumberCriterion,
  column: string,
  expr: string
): FilterClause {
  const present = `${column} IS NOT NULL`;
  switch (criterion.modifier) {
    case "EQUALS":
      return { sql: `(${present} AND ${expr} = ?)`, params: [criterion.value] };
    case "NOT_EQUALS":
      return {
        sql: `(${column} IS NULL OR ${expr} != ?)`,
        params: [criterion.value],
      };
    case "GREATER_THAN":
      return { sql: `(${present} AND ${expr} > ?)`, params: [criterion.value] };
    case "LESS_THAN":
      return { sql: `(${present} AND ${expr} < ?)`, params: [criterion.value] };
    case "BETWEEN":
      return {
        sql: `(${present} AND ${expr} BETWEEN ? AND ?)`,
        params: [criterion.value, criterion.value2],
      };
    case "NOT_BETWEEN":
    case "IS_NULL":
    case "NOT_NULL":
      return noClause();
  }
}

/**
 * A text attribute compared whole, ignoring case (gender, and the free text
 * Stash keeps for ethnicity, hair and eye colour, breast type): NOT_EQUALS
 * keeps performers without one.
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
      career_length: { sql: `${CAREER_YEARS} ${dir} NULLS LAST`, params: [] },

      // Counts, as the viewer sees them
      scene_count: column(visibleCount(ctx, "p.sceneCount", "scenes")),
      scenes_count: column(visibleCount(ctx, "p.sceneCount", "scenes")),
      image_count: column(visibleCount(ctx, "p.imageCount", "images")),
      gallery_count: column(visibleCount(ctx, "p.galleryCount", "galleries")),
      group_count: column(visibleCount(ctx, "p.groupCount", "groups")),

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

  /** The performer filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"performer">,
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
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, "COALESCE(r.rating, 0)"));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, "COALESCE(s.oCounter, 0)"));
    }
    if (filter.play_count) {
      push(buildNumericFilter(filter.play_count, "COALESCE(s.playCount, 0)"));
    }

    // Related entities
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));
    if (filter.studios) push(via(PERFORMERS_BY_STUDIO, filter.studios));
    if (filter.scenes) push(via(PERFORMERS_BY_SCENE, filter.scenes));
    if (filter.groups) push(via(PERFORMERS_BY_GROUP, filter.groups));

    // Counts, as the viewer sees them
    if (filter.scene_count) {
      push(
        buildNumericFilter(
          filter.scene_count,
          visibleCount(ctx, "p.sceneCount", "scenes")
        )
      );
    }

    // Text; the name also matches the aliases
    if (filter.name) {
      push(buildTextFilter(filter.name, "p.name", ["p.aliasList"]));
    }
    if (filter.details) push(buildTextFilter(filter.details, "p.details"));
    if (filter.tattoos) push(buildTextFilter(filter.tattoos, "p.tattoos"));
    if (filter.piercings) {
      push(buildTextFilter(filter.piercings, "p.piercings"));
    }
    if (filter.measurements) {
      push(buildTextFilter(filter.measurements, "p.measurements"));
    }

    // Body
    if (filter.height) {
      push(buildNumericFilter(filter.height, "COALESCE(p.heightCm, 0)"));
    }
    if (filter.weight) {
      push(buildNumericFilter(filter.weight, "COALESCE(p.weightKg, 0)"));
    }
    if (filter.penis_length) {
      // No COALESCE: a performer without a length never matches, as in Stash
      push(buildNumericFilter(filter.penis_length, "p.penisLength"));
    }

    // Career: a performer without a value never matches
    if (filter.career_length) {
      push(buildNumericFilter(filter.career_length, CAREER_YEARS));
    }

    // Compared whole, ignoring case
    if (filter.gender) push(wholeTextClause(filter.gender, "p.gender"));
    const wholeText: [TextCriterion | undefined, string][] = [
      [filter.ethnicity, "p.ethnicity"],
      [filter.hair_color, "p.hairColor"],
      [filter.eye_color, "p.eyeColor"],
      [filter.fake_tits, "p.fakeTits"],
    ];
    for (const [criterion, column] of wholeText) {
      if (criterion) push(wholeTextClause(criterion, column));
    }

    // Years and age, from the dates
    if (filter.birth_year) {
      push(
        datedNumberClause(
          filter.birth_year,
          "p.birthdate",
          "CAST(SUBSTR(p.birthdate, 1, 4) AS INTEGER)"
        )
      );
    }
    if (filter.death_year) {
      push(
        datedNumberClause(
          filter.death_year,
          "p.deathDate",
          "CAST(SUBSTR(p.deathDate, 1, 4) AS INTEGER)"
        )
      );
    }
    if (filter.age) push(datedNumberClause(filter.age, "p.birthdate", AGE));

    // Dates
    if (filter.birthdate) {
      push(buildDateFilter(filter.birthdate, "p.birthdate"));
    }
    if (filter.death_date) {
      push(buildDateFilter(filter.death_date, "p.deathDate"));
    }
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "p.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "p.stashUpdatedAt"));
    }

    return clauses;
  }

  /** The tag filter, with the tags' descendants to the depth */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("tag", PERFORMER_TAGS, criterion, ctx, {
      name: "tags",
    });
  }

  /**
   * The search across the name and aliases: `likeContains` with
   * `ESCAPE '\'`, so a `%`, `_` or `\` in the text matches itself
   */
  private searchClause(q: string): FilterClause {
    const pattern = likeContains(q.toLowerCase());
    return {
      sql: "(LOWER(p.name) LIKE ? ESCAPE '\\' OR LOWER(p.aliasList) LIKE ? ESCAPE '\\')",
      params: [pattern, pattern],
    };
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
