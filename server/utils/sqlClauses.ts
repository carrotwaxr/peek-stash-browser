/**
 * SQL clause helpers shared by the query builders (items 34a and 74).
 *
 * Every ref is matched as an (id, instance) pair: a ref with an instance
 * matches that instance only, and a bare ref matches its id on every
 * instance, since two Stash servers reuse small ids.
 *
 * A ref set has two shapes. Up to PAIR_INLINE_LIMIT refs are bound inline
 * as OR-ed pairs inside one correlated EXISTS (or on the row itself). Above
 * it the refs travel as one JSON parameter into a materialized CTE, and the
 * matched entities into a second one; the list matches them with a
 * row-value IN on its primary key (INCLUDES) or a single-column key NOT IN
 * (EXCLUDES, see matchedSetClause). Never a ref list inside a correlated
 * subquery (re-evaluated per row, 12 s at 200k scenes) and never a
 * row-value `NOT IN (subquery)` (78 s: the set is scanned per row).
 */
import type { RefModifier } from "@peek/shared-types/filters/index.js";
import type { FilterRef } from "../types/parsedFilters.js";
import { type EntityRef, distinctRefs, pairsJson } from "./entityRef.js";

export type SqlParam = string | number | boolean;

/** A piece of SQL with the parameters its `?` placeholders bind, in order */
export interface SqlFragment {
  readonly sql: string;
  readonly params: SqlParam[];
}

/** One top-level `WITH` block: `name(cols) AS MATERIALIZED (...)` */
export interface Cte extends SqlFragment {
  readonly name: string;
}

/**
 * One filter's contribution to a list statement: its WHERE fragment ("" when
 * the filter is a no-op), and for the large ref shape the CTEs and the FROM
 * fragments (a join to a matched set) it needs.
 */
export interface FilterClause {
  sql: string;
  params: SqlParam[];
  ctes?: Cte[];
  joins?: SqlFragment[];
}

/**
 * The most refs one clause matches inline as OR-ed pairs (two bound
 * parameters each): far below SQLite's expression depth, where a chain of
 * 1,000 pairs fails to prepare.
 */
export const PAIR_INLINE_LIMIT = 64;

const EMPTY: FilterClause = { sql: "", params: [] };

/** No filter */
export function noClause(): FilterClause {
  return { sql: "", params: [] };
}

function isBare(ref: FilterRef): boolean {
  return ref.instanceId === undefined || ref.instanceId === "";
}

/**
 * The refs as OR-ed conditions on an id and an instance column:
 * `(idCol = ? AND instanceCol = ?)` for a ref with an instance, `(idCol = ?)`
 * for a bare one (an empty instance counts as bare). The caller wraps the
 * result in parentheses.
 */
export function pairs(
  idCol: string,
  instanceCol: string,
  refs: readonly FilterRef[]
): SqlFragment {
  const params: string[] = [];
  const terms = refs.map((ref) => {
    params.push(ref.id);
    if (isBare(ref)) {
      return `(${idCol} = ?)`;
    }
    params.push(ref.instanceId ?? "");
    return `(${idCol} = ? AND ${instanceCol} = ?)`;
  });
  return { sql: terms.join(" OR "), params };
}

/**
 * The refs as resolved (id, instance) pairs for the large shape: a bare ref
 * becomes one pair per allowed instance, so it matches its id on every
 * instance the viewer sees and no other.
 */
function resolvedPairs(
  refs: readonly FilterRef[],
  allowedInstanceIds: readonly string[]
): EntityRef[] {
  return distinctRefs(
    refs.flatMap((ref): EntityRef[] =>
      isBare(ref)
        ? allowedInstanceIds.map((instanceId) => ({ id: ref.id, instanceId }))
        : [{ id: ref.id, instanceId: ref.instanceId ?? "" }]
    )
  );
}

/** The CTE holding the refs of the large shape, read from one JSON parameter */
function refsCte(
  name: string,
  refs: readonly FilterRef[],
  allowedInstanceIds: readonly string[]
): Cte {
  return {
    name,
    sql: `${name}(id, inst) AS MATERIALIZED (SELECT DISTINCT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?) j)`,
    params: [pairsJson(resolvedPairs(refs, allowedInstanceIds))],
  };
}

/**
 * The clause matching the listed rows against a materialized set of
 * (id, inst). INCLUDES is a row-value IN on the primary key, which SQLite
 * drives from the set into one primary-key probe per member (3 ms for
 * 1,000 ids at 200k scenes). EXCLUDES is a NOT IN over the set's rows as
 * one text key each: SQLite builds an ephemeral index for a single-column
 * IN whatever it estimates the set's size to be (307 ms for 1,000 ids at
 * 200k scenes), where a row-value NOT IN scans the set per row (78 s) and
 * a LEFT JOIN anti-join gets no automatic index on a `json_each`-fed CTE
 * (5.3 s). The key's separator cannot occur in an id or an instance id.
 */
function matchedSetClause(
  alias: string,
  setName: string,
  modifier: "INCLUDES" | "EXCLUDES",
  ctes: Cte[]
): FilterClause {
  if (modifier === "INCLUDES") {
    return {
      sql: `(${alias}.id, ${alias}.stashInstanceId) IN (SELECT id, inst FROM ${setName})`,
      params: [],
      ctes,
    };
  }
  return {
    sql: `(${alias}.id || ':' || ${alias}.stashInstanceId) NOT IN (SELECT id || ':' || inst FROM ${setName})`,
    params: [],
    ctes,
  };
}

// =============================================================================
// REF FILTERS
// =============================================================================

/** Refs matched through a junction from the listed entity (a scene's tags) */
export interface JunctionTarget {
  readonly kind: "junction";
  readonly table: string;
  readonly alias: string;
  /** The listed entity's alias in the outer query */
  readonly parentAlias: string;
  /** The junction's columns holding the listed entity's id and instance */
  readonly parentIdCol: string;
  readonly parentInstanceCol: string;
  /** The junction's columns holding the ref's id and instance */
  readonly refIdCol: string;
  readonly refInstanceCol: string;
}

/** Refs matched on a column of the listed entity's own row (a scene's studio) */
export interface ColumnTarget {
  readonly kind: "column";
  readonly parentTable: string;
  readonly parentAlias: string;
  /** The row's columns holding the ref's id and instance, unqualified */
  readonly idCol: string;
  readonly instanceCol: string;
}

export interface RefClauseOptions {
  /** Names the large shape's CTEs (`<name>_refs`, `<name>_matched`): unique in the statement */
  readonly name: string;
  /** The instances a bare ref may match in the large shape, one pair each */
  readonly allowedInstanceIds: readonly string[];
  /**
   * A JSON list column of the listed row holding inherited ref ids, matched
   * as well (a scene's `inheritedTagIds`), unqualified. Junction targets only.
   */
  readonly inheritedJson?: string;
  /** Most refs matched inline; Infinity keeps every set inline. Default PAIR_INLINE_LIMIT. */
  readonly inlineLimit?: number;
}

/** The inline INCLUDES of a junction target: one EXISTS over all the pairs */
function junctionIncludes(
  target: JunctionTarget,
  refs: readonly FilterRef[],
  inheritedJson: string | undefined
): FilterClause {
  const { alias: j, parentAlias: x } = target;
  const p = pairs(
    `${j}.${target.refIdCol}`,
    `${j}.${target.refInstanceCol}`,
    refs
  );
  const direct = `EXISTS (SELECT 1 FROM ${target.table} ${j} WHERE ${j}.${target.parentIdCol} = ${x}.id AND ${j}.${target.parentInstanceCol} = ${x}.stashInstanceId AND (${p.sql}))`;
  if (inheritedJson === undefined) {
    return { sql: direct, params: p.params };
  }
  const inherited = pairs("je.value", `${x}.stashInstanceId`, refs);
  return {
    sql: `(${direct} OR EXISTS (SELECT 1 FROM json_each(${x}.${inheritedJson}) je WHERE ${inherited.sql}))`,
    params: [...p.params, ...inherited.params],
  };
}

/** The large shape's matched set: the listed rows holding any of the refs */
function matchedCte(
  target: JunctionTarget | ColumnTarget,
  name: string,
  refsName: string,
  inheritedJson: string | undefined
): Cte {
  if (target.kind === "column") {
    return {
      name,
      sql: `${name}(id, inst) AS MATERIALIZED (SELECT DISTINCT x.id, x.stashInstanceId FROM ${refsName} r CROSS JOIN ${target.parentTable} x ON x.${target.idCol} = r.id AND x.${target.instanceCol} = r.inst WHERE x.deletedAt IS NULL)`,
      params: [],
    };
  }
  const j = target.alias;
  // Driven from the refs, so each is one index probe on the junction
  const direct = `SELECT ${j}.${target.parentIdCol}, ${j}.${target.parentInstanceCol} FROM ${refsName} r CROSS JOIN ${target.table} ${j} ON ${j}.${target.refIdCol} = r.id AND ${j}.${target.refInstanceCol} = r.inst`;
  if (inheritedJson === undefined) {
    return {
      name,
      sql: `${name}(id, inst) AS MATERIALIZED (SELECT DISTINCT ${direct.slice("SELECT ".length)})`,
      params: [],
    };
  }
  // The inherited arm reads every live row's list once; UNION keeps the set
  return {
    name,
    sql: `${name}(id, inst) AS MATERIALIZED (${direct} UNION SELECT x.id, x.stashInstanceId FROM StashScene x, json_each(x.${inheritedJson}) je WHERE x.deletedAt IS NULL AND (je.value, x.stashInstanceId) IN (SELECT id, inst FROM ${refsName}))`,
    params: [],
  };
}

/** The AND of the clauses, each already parenthesised where it needs to be */
export function allOf(clauses: FilterClause[]): FilterClause {
  return {
    sql: `(${clauses.map((c) => c.sql).join(" AND ")})`,
    params: clauses.flatMap((c) => c.params),
    ...gathered(clauses),
  };
}

function gathered(clauses: readonly FilterClause[]): {
  ctes?: Cte[];
  joins?: SqlFragment[];
} {
  const ctes = clauses.flatMap((c) => c.ctes ?? []);
  const joins = clauses.flatMap((c) => c.joins ?? []);
  return {
    ...(ctes.length > 0 ? { ctes } : {}),
    ...(joins.length > 0 ? { joins } : {}),
  };
}

/**
 * Filters the listed entity by refs of another entity: INCLUDES any of them,
 * INCLUDES_ALL every one (one INCLUDES per ref, AND-ed), EXCLUDES none. No
 * refs is no filter. The shape follows `refs.length` (see the module
 * comment); a large INCLUDES_ALL is one small INCLUDES per ref.
 */
export function refClause(
  target: JunctionTarget | ColumnTarget,
  refs: readonly FilterRef[],
  modifier: RefModifier,
  opts: RefClauseOptions
): FilterClause {
  if (refs.length === 0) return EMPTY;
  if (modifier === "INCLUDES_ALL") {
    return allOf(
      refs.map((ref, i) =>
        refClause(target, [ref], "INCLUDES", {
          ...opts,
          name: `${opts.name}_${i}`,
        })
      )
    );
  }

  const limit = opts.inlineLimit ?? PAIR_INLINE_LIMIT;
  if (refs.length > limit) {
    const refsName = `${opts.name}_refs`;
    const setName = `${opts.name}_matched`;
    return matchedSetClause(target.parentAlias, setName, modifier, [
      refsCte(refsName, refs, opts.allowedInstanceIds),
      matchedCte(target, setName, refsName, opts.inheritedJson),
    ]);
  }

  if (target.kind === "column") {
    const col = `${target.parentAlias}.${target.idCol}`;
    const p = pairs(col, `${target.parentAlias}.${target.instanceCol}`, refs);
    return modifier === "INCLUDES"
      ? { sql: `(${p.sql})`, params: p.params }
      : { sql: `(${col} IS NULL OR NOT (${p.sql}))`, params: p.params };
  }

  const includes = junctionIncludes(target, refs, opts.inheritedJson);
  return modifier === "INCLUDES"
    ? includes
    : { sql: `NOT ${includes.sql}`, params: includes.params };
}

// =============================================================================
// THE LISTED ENTITY'S OWN ID
// =============================================================================

export interface IdClauseOptions {
  /** Names the large shape's CTE (`<name>_refs`). Default "ids". */
  readonly name?: string;
  readonly allowedInstanceIds: readonly string[];
  readonly inlineLimit?: number;
}

/**
 * The listed rows named by (id, instance) refs: INCLUDES only these (none
 * matches nothing), EXCLUDES all but these (none is no filter). Above the
 * inline limit the refs are a materialized set the row is matched against
 * by its primary key.
 */
export function idClause(
  alias: string,
  refs: readonly FilterRef[],
  modifier: "INCLUDES" | "EXCLUDES",
  opts: IdClauseOptions
): FilterClause {
  if (refs.length === 0) {
    return modifier === "INCLUDES" ? { sql: "0", params: [] } : EMPTY;
  }
  const limit = opts.inlineLimit ?? PAIR_INLINE_LIMIT;
  if (refs.length > limit) {
    const refsName = `${opts.name ?? "ids"}_refs`;
    return matchedSetClause(alias, refsName, modifier, [
      refsCte(refsName, refs, opts.allowedInstanceIds),
    ]);
  }
  const p = pairs(`${alias}.id`, `${alias}.stashInstanceId`, refs);
  return modifier === "INCLUDES"
    ? { sql: `(${p.sql})`, params: p.params }
    : { sql: `NOT (${p.sql})`, params: p.params };
}

// =============================================================================
// INSTANCES, ORDER, COMBINING
// =============================================================================

/**
 * The viewer's allowed instances (enabled, selected, past their first
 * sync). An empty list matches nothing: a caller that means "no instance
 * filter" does not exist (invariant 11).
 */
export function instanceClause(
  alias: string,
  allowedInstanceIds: readonly string[]
): FilterClause {
  if (allowedInstanceIds.length === 0) {
    return { sql: "1 = 0", params: [] };
  }
  return {
    sql: `${alias}.stashInstanceId IN (${allowedInstanceIds.map(() => "?").join(", ")})`,
    params: [...allowedInstanceIds],
  };
}

/** One instance, for a detail page disambiguating an id; none is no filter */
export function specificInstanceClause(
  alias: string,
  instanceId: string | undefined
): FilterClause {
  if (instanceId === undefined || instanceId === "") return EMPTY;
  return { sql: `${alias}.stashInstanceId = ?`, params: [instanceId] };
}

/**
 * Stash's seeded random order, the seed bound three times, never
 * interpolated; `% 2147483647` at each step keeps large seeds in integer
 * range.
 */
export function randomOrder(alias: string, seed: number): SqlFragment {
  const id = `${alias}.id`;
  return {
    sql: `(((((${id} + ?) % 2147483647) * ((${id} + ?) % 2147483647) % 2147483647) * 52959209 % 2147483647 + ((${id} + ?) * 1047483763 % 2147483647)) % 2147483647)`,
    params: [seed, seed, seed],
  };
}

export interface CombinedClauses {
  /** The non-empty clauses AND-ed; "" when none */
  where: string;
  params: SqlParam[];
  ctes: Cte[];
  joins: SqlFragment[];
}

/** The clauses as one WHERE, with their CTEs and joins gathered in order */
export function combine(clauses: readonly FilterClause[]): CombinedClauses {
  const active = clauses.filter((c) => c.sql !== "");
  return {
    where: active.map((c) => c.sql).join(" AND "),
    params: active.flatMap((c) => c.params),
    ctes: clauses.flatMap((c) => c.ctes ?? []),
    joins: clauses.flatMap((c) => c.joins ?? []),
  };
}

// =============================================================================
// VIA-SCENE FILTERS
// =============================================================================

/** A table in a via-scene subquery, with its alias */
interface AliasedTable {
  readonly table: string;
  readonly alias: string;
}

/**
 * How a listed entity reaches its scenes, and where the refs are matched.
 *
 * The junction links the listed entity (outer alias `alias`, keyed by `id`
 * and `stashInstanceId`) to its scenes. Without `via` the refs are scenes,
 * matched on the junction's scene columns. With `via` they are what a scene
 * links to (a group, a studio): `via` is joined to the junction on the scene
 * and the refs are matched on its ref columns. Every arm requires the scene
 * to be live (`StashScene.deletedAt IS NULL`).
 */
export interface ViaSceneSpec {
  /** The listed entity's alias in the outer query ("g" for StashGroup g) */
  readonly alias: string;
  /** The junction from the listed entity to its scenes */
  readonly junction: AliasedTable;
  /** The junction's columns holding the listed entity's id and instance */
  readonly entityIdCol: string;
  readonly entityInstanceCol: string;
  /** The junction's columns holding the scene's id and instance */
  readonly sceneIdCol: string;
  readonly sceneInstanceCol: string;
  /** The table holding the refs when they are not scenes */
  readonly via?: AliasedTable & {
    /** Its columns holding the scene's id and instance */
    readonly sceneIdCol: string;
    readonly sceneInstanceCol: string;
    /** Its columns the refs are matched on */
    readonly refIdCol: string;
    readonly refInstanceCol: string;
  };
  /** A further condition inside the subquery ("sc.organized = 1") */
  readonly where?: string;
}

/** The alias of the scene row joined for its `deletedAt` */
const LIVE_SCENE = "lsc";

/**
 * Filters the listed entity by what its scenes hold: groups holding a scene,
 * performers in a group's scenes. INCLUDES is one clause over all refs,
 * EXCLUDES a keyed `NOT EXISTS` (never `NOT IN`), INCLUDES_ALL one clause
 * per ref, AND-ed. With `via`, INCLUDES is a row-value IN driven from the
 * ref (the via row by its ref index, the junction by the scene, the live
 * scene by its key), which at 200k scenes takes milliseconds where the
 * correlated EXISTS took hundreds; the scene-keyed form (no `via`) keeps the
 * EXISTS, one full-key probe per row. No refs, or another modifier, is no
 * filter.
 */
export function viaSceneClause(
  spec: ViaSceneSpec,
  refs: readonly FilterRef[],
  modifier: string
): FilterClause {
  if (refs.length === 0) return EMPTY;

  const { alias, junction: j, via } = spec;
  // The via row is the scene itself when it is the scene table; otherwise
  // the live scene is joined on the scene columns of the given table
  const viaIsScene = via?.table === "StashScene";
  const liveAlias = via?.table === "StashScene" ? via.alias : LIVE_SCENE;
  const live = `${liveAlias}.deletedAt IS NULL`;
  const liveJoin = (t: AliasedTable, idCol: string, instanceCol: string) =>
    viaIsScene
      ? ""
      : ` JOIN StashScene ${LIVE_SCENE} ON ${LIVE_SCENE}.id = ${t.alias}.${idCol} AND ${LIVE_SCENE}.stashInstanceId = ${t.alias}.${instanceCol}`;
  const where = spec.where === undefined ? "" : ` AND ${spec.where}`;
  const [refIdCol, refInstanceCol] = via
    ? [`${via.alias}.${via.refIdCol}`, `${via.alias}.${via.refInstanceCol}`]
    : [`${j.alias}.${spec.sceneIdCol}`, `${j.alias}.${spec.sceneInstanceCol}`];
  const keyed = `${j.alias}.${spec.entityIdCol} = ${alias}.id AND ${j.alias}.${spec.entityInstanceCol} = ${alias}.stashInstanceId`;

  /** The keyed EXISTS: the junction, the via row on the scene, the live scene */
  const exists = (matched: readonly FilterRef[]): FilterClause => {
    const p = pairs(refIdCol, refInstanceCol, matched);
    const viaJoin = via
      ? ` JOIN ${via.table} ${via.alias} ON ${via.alias}.${via.sceneIdCol} = ${j.alias}.${spec.sceneIdCol} AND ${via.alias}.${via.sceneInstanceCol} = ${j.alias}.${spec.sceneInstanceCol}`
      : "";
    return {
      sql: `EXISTS (SELECT 1 FROM ${j.table} ${j.alias}${viaJoin}${liveJoin(j, spec.sceneIdCol, spec.sceneInstanceCol)} WHERE ${keyed} AND ${live}${where} AND (${p.sql}))`,
      params: p.params,
    };
  };

  /** The via form's row-value IN, driven from the ref */
  const inMatched = (matched: readonly FilterRef[]): FilterClause => {
    if (!via) return exists(matched);
    const p = pairs(refIdCol, refInstanceCol, matched);
    return {
      sql: `(${alias}.id, ${alias}.stashInstanceId) IN (SELECT ${j.alias}.${spec.entityIdCol}, ${j.alias}.${spec.entityInstanceCol} FROM ${via.table} ${via.alias} JOIN ${j.table} ${j.alias} ON ${j.alias}.${spec.sceneIdCol} = ${via.alias}.${via.sceneIdCol} AND ${j.alias}.${spec.sceneInstanceCol} = ${via.alias}.${via.sceneInstanceCol}${liveJoin(via, via.sceneIdCol, via.sceneInstanceCol)} WHERE ${live}${where} AND (${p.sql}))`,
      params: p.params,
    };
  };

  switch (modifier) {
    case "INCLUDES":
      return inMatched(refs);
    case "EXCLUDES": {
      const clause = exists(refs);
      return { sql: `NOT ${clause.sql}`, params: clause.params };
    }
    case "INCLUDES_ALL":
      return allOf(refs.map((ref) => inMatched([ref])));
    default:
      return EMPTY;
  }
}
