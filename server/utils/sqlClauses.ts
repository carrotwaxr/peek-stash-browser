/**
 * SQL clause helpers shared by the query builders (items 34a and 74).
 *
 * Every ref is matched as an (id, instance) pair: a ref with an instance
 * matches that instance only, and a bare ref matches its id on every
 * instance, since two Stash servers reuse small ids.
 *
 * A ref set has two shapes. Up to PAIR_INLINE_LIMIT refs are bound inline
 * as OR-ed pairs inside one correlated EXISTS (or on the row itself; or,
 * for a junction INCLUDES read in no order, a count or a sort with no
 * index, one row-value IN over the junction's ref index: see
 * junctionInList). Above it the refs travel as one JSON parameter into a
 * materialized CTE, and the matched entities into a second one; the list
 * matches them with a row-value IN on its primary key (INCLUDES) or a
 * single-column key NOT IN (EXCLUDES, see matchedSetClause); a junction
 * INCLUDES on a page walking a sort index reads the refs list's junction
 * rows instead (junctionRefsList). Never a ref list inside a correlated
 * subquery (re-evaluated per row, 12 s at 200k scenes; a materialized CTE
 * probed with IN from one is built once, plan `LIST SUBQUERY`) and never a
 * row-value `NOT IN (subquery)` (78 s: the set is scanned per row).
 *
 * The exclusion join, the instance filters and the per-field clauses
 * (numbers, dates, text, career years, favorites) the builders share live
 * here too.
 */
import type {
  RefModifier,
  Resolution,
} from "@peek/shared-types/filters/index.js";
import type {
  DateCriterion,
  EnumCriterion,
  FilterRef,
  NumberCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, distinctRefs, pairsJson } from "./entityRef.js";
import { jsonListArm, likeContains } from "./sqlHelpers.js";
import { jsonListOrEmpty } from "./sqlJson.js";
import { instantSpan } from "./zonedTime.js";

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
  /**
   * The clause the count statement uses instead: the same rows in a shape
   * for reading every match in no order (the scene tag filter under an
   * indexed sort, L9). Absent: the count uses this one. `allOf` and `anyOf`
   * drop it, which leaves their count on the page's form: the same rows.
   */
  count?: FilterClause;
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
 * Any set of (id, inst) works, a playlist's scenes included (F6).
 */
export function matchedSetClause(
  key: ParentKey,
  setName: string,
  modifier: "INCLUDES" | "EXCLUDES",
  ctes: Cte[]
): FilterClause {
  if (modifier === "INCLUDES") {
    return {
      sql: `(${key[0]}, ${key[1]}) IN (SELECT id, inst FROM ${setName})`,
      params: [],
      ctes,
    };
  }
  return {
    sql: `(${key[0]} || ':' || ${key[1]}) NOT IN (SELECT id || ':' || inst FROM ${setName})`,
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
  /**
   * The listed entity's key as the outer query holds it, when it is not
   * `<parentAlias>.id, <parentAlias>.stashInstanceId`: a clip's scene is
   * `c.sceneId, c.sceneInstanceId`, so every shape matches the junction on
   * the clip's own row before the scene is read (a rare scene tag's deep
   * clip page at 207k clips: 115 ms through the scene, 37 through the clip)
   */
  readonly parentKey?: ParentKey;
}

/** A listed row's key as two SQL expressions, its id and its instance */
export type ParentKey = readonly [id: string, instance: string];

/** The key a junction target's rows are matched on */
function parentKeyOf(target: JunctionTarget): ParentKey {
  return (
    target.parentKey ?? [
      `${target.parentAlias}.id`,
      `${target.parentAlias}.stashInstanceId`,
    ]
  );
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
   * A second junction holding the listed row's inherited refs, matched as
   * well in the same shape as the target's own (a scene's
   * `SceneInheritedTag` beside its `SceneTag`): the same columns, its own
   * table and alias. Junction targets only.
   */
  readonly inheritedJunction?: JunctionTarget;
  /** Most refs matched inline; Infinity keeps every set inline. Default PAIR_INLINE_LIMIT. */
  readonly inlineLimit?: number;
  /**
   * How the statement reads its rows, for a junction INCLUDES. `true`: in
   * a sort index's order, stopping at the page. Up to the inline limit
   * that is the correlated EXISTS per row; above it the junction rows of
   * the refs list, read by the ref index as a row-value IN
   * (junctionRefsList), with no matched set to build first. `false`: every
   * match, in no order (a count, or a sort with no index). Up to the limit
   * the matches are read once from the junction's ref index as a row-value
   * IN (junctionInList); above it the matched set. Absent: the default
   * shapes (the EXISTS, the matched set). EXCLUDES never changes (L8, L9).
   */
  readonly sortedByIndex?: boolean;
}

/** The pairs matched on a junction's ref columns */
function refPairs(
  target: JunctionTarget,
  refs: readonly FilterRef[]
): SqlFragment {
  return pairs(
    `${target.alias}.${target.refIdCol}`,
    `${target.alias}.${target.refInstanceCol}`,
    refs
  );
}

/**
 * The inline INCLUDES of a junction target: one EXISTS over all the pairs,
 * searching the junction's primary key from the listed row; with an
 * inherited junction, one more EXISTS on it, OR-ed.
 */
function junctionIncludes(
  target: JunctionTarget,
  refs: readonly FilterRef[],
  inheritedJunction: JunctionTarget | undefined
): FilterClause {
  const exists = (t: JunctionTarget): SqlFragment => {
    const p = refPairs(t, refs);
    const j = t.alias;
    const [id, instance] = parentKeyOf(t);
    return {
      sql: `EXISTS (SELECT 1 FROM ${t.table} ${j} WHERE ${j}.${t.parentIdCol} = ${id} AND ${j}.${t.parentInstanceCol} = ${instance} AND (${p.sql}))`,
      params: p.params,
    };
  };
  const direct = exists(target);
  if (inheritedJunction === undefined) return direct;
  const inherited = exists(inheritedJunction);
  return {
    sql: `(${direct.sql} OR ${inherited.sql})`,
    params: [...direct.params, ...inherited.params],
  };
}

/**
 * The inline INCLUDES of a junction target read in no order (a count, or
 * a page sorted by no index): the listed rows named by the junction rows
 * holding the refs, as a
 * row-value IN that SQLite builds once from the junction's ref index (every
 * scene holding the tag, by `SceneTag_tagId_tagInstanceId_idx`) and probes
 * per row, where the correlated EXISTS searches the junction's primary key
 * per row. At 200k scenes a page by rating filtered on a tag of 46k scenes
 * takes 255 ms against 358, on a tag of 634 scenes 173 against 332, and
 * their counts 195 against 233 and 104 against 185 (L8). A page under a
 * sort with an index keeps the EXISTS: it walks the index and stops at the
 * page (2 ms, where building the list first costs 30); its count, which
 * walks nothing, takes this form (L9). An inherited junction joins the list
 * with UNION ALL, read by its own ref index: one list, built once.
 */
function junctionInList(
  target: JunctionTarget,
  refs: readonly FilterRef[],
  inheritedJunction: JunctionTarget | undefined
): FilterClause {
  const rows = (t: JunctionTarget): SqlFragment => {
    const p = refPairs(t, refs);
    const j = t.alias;
    return {
      sql: `SELECT ${j}.${t.parentIdCol}, ${j}.${t.parentInstanceCol} FROM ${t.table} ${j} WHERE (${p.sql})`,
      params: p.params,
    };
  };
  const arms = [target, ...(inheritedJunction ? [inheritedJunction] : [])].map(
    rows
  );
  const [id, instance] = parentKeyOf(target);
  return {
    sql: `(${id}, ${instance}) IN (${arms.map((a) => a.sql).join(" UNION ALL ")})`,
    params: arms.flatMap((a) => a.params),
  };
}

/**
 * The large INCLUDES of a junction target for a page walking a sort index:
 * the listed rows named by the junction rows of the refs list (read by the
 * junction's ref index, one probe per ref), as a row-value IN SQLite builds
 * once and probes as the page walks the sort index; an inherited junction's
 * rows of the list join it with UNION ALL, read by its ref index. No
 * matched set is built first: at 200k scenes a tag whose subtree is 72 tags
 * pages in 407 ms against 842, a set of 72 rare tags in 9 against 145 (L9).
 * The count and a sort with no index keep the matched set, faster for a
 * rare set there.
 */
function junctionRefsList(
  target: JunctionTarget,
  refsName: string,
  inheritedJunction: JunctionTarget | undefined
): string {
  const arms = [target, ...(inheritedJunction ? [inheritedJunction] : [])]
    .map((t) => refsRows(t, refsName))
    .join(" UNION ALL ");
  const [id, instance] = parentKeyOf(target);
  return `(${id}, ${instance}) IN (${arms})`;
}

/** A junction's rows of the refs list, driven from the refs by its ref index */
function refsRows(target: JunctionTarget, refsName: string): string {
  const j = target.alias;
  return `SELECT ${j}.${target.parentIdCol}, ${j}.${target.parentInstanceCol} FROM ${refsName} r CROSS JOIN ${target.table} ${j} ON ${j}.${target.refIdCol} = r.id AND ${j}.${target.refInstanceCol} = r.inst`;
}

/** The large shape's matched set: the listed rows holding any of the refs */
function matchedCte(
  target: JunctionTarget | ColumnTarget,
  name: string,
  refsName: string,
  inheritedJunction: JunctionTarget | undefined
): Cte {
  if (target.kind === "column") {
    return {
      name,
      sql: `${name}(id, inst) AS MATERIALIZED (SELECT DISTINCT x.id, x.stashInstanceId FROM ${refsName} r CROSS JOIN ${target.parentTable} x ON x.${target.idCol} = r.id AND x.${target.instanceCol} = r.inst WHERE x.deletedAt IS NULL)`,
      params: [],
    };
  }
  // Driven from the refs, so each is one index probe on the junction
  const direct = refsRows(target, refsName);
  if (inheritedJunction === undefined) {
    return {
      name,
      sql: `${name}(id, inst) AS MATERIALIZED (SELECT DISTINCT ${direct.slice("SELECT ".length)})`,
      params: [],
    };
  }
  // The inherited junction's rows too, by its ref index; UNION keeps the set
  return {
    name,
    sql: `${name}(id, inst) AS MATERIALIZED (${direct} UNION ${refsRows(inheritedJunction, refsName)})`,
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

/**
 * The OR of the clauses (a clip's primary tag or its tag list), with their
 * CTEs gathered. A clause that joins (restricts the FROM) cannot be OR-ed.
 */
export function anyOf(clauses: FilterClause[]): FilterClause {
  if (clauses.some((c) => (c.joins ?? []).length > 0)) {
    throw new Error("anyOf cannot OR a clause that joins");
  }
  return {
    sql: `(${clauses.map((c) => c.sql).join(" OR ")})`,
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
    if (
      modifier === "INCLUDES" &&
      target.kind === "junction" &&
      opts.sortedByIndex === true
    ) {
      return {
        sql: junctionRefsList(target, refsName, opts.inheritedJunction),
        params: [],
        ctes: [refsCte(refsName, refs, opts.allowedInstanceIds)],
      };
    }
    const setName = `${opts.name}_matched`;
    const key: ParentKey =
      target.kind === "junction"
        ? parentKeyOf(target)
        : [`${target.parentAlias}.id`, `${target.parentAlias}.stashInstanceId`];
    return matchedSetClause(key, setName, modifier, [
      refsCte(refsName, refs, opts.allowedInstanceIds),
      matchedCte(target, setName, refsName, opts.inheritedJunction),
    ]);
  }

  if (target.kind === "column") {
    const col = `${target.parentAlias}.${target.idCol}`;
    const p = pairs(col, `${target.parentAlias}.${target.instanceCol}`, refs);
    return modifier === "INCLUDES"
      ? { sql: `(${p.sql})`, params: p.params }
      : { sql: `(${col} IS NULL OR NOT (${p.sql}))`, params: p.params };
  }

  if (modifier === "INCLUDES" && opts.sortedByIndex === false) {
    return junctionInList(target, refs, opts.inheritedJunction);
  }
  const includes = junctionIncludes(target, refs, opts.inheritedJunction);
  return modifier === "INCLUDES"
    ? includes
    : { sql: `NOT ${includes.sql}`, params: includes.params };
}

/**
 * The related entity a junction's ref columns name, for a presence check
 * that counts only related rows the viewer can see (a relation filter never
 * follows a deleted or hidden row): its table, keyed by `id` and
 * `stashInstanceId` and soft-deleted through `deletedAt`, its
 * `UserExcludedEntity` type, and the viewer whose exclusions apply (null
 * when none do).
 */
export interface LiveRef {
  readonly table: string;
  readonly entityType: string;
  readonly userId: number | null;
}

export interface RefPresenceOptions {
  /** A second junction of the listed row's inherited refs: either counts */
  readonly inheritedJunction?: JunctionTarget;
  /** Count a junction row only when its related row is live and not excluded */
  readonly liveRef?: LiveRef;
}

/**
 * "Has any" (`present`) or "has none" of a ref relation, whatever the ids:
 * on a column its IS NOT NULL or IS NULL; on a junction a keyed EXISTS or
 * NOT EXISTS, one per junction with an inherited one (any in either, none
 * in both). With `liveRef` a junction row counts only when its related row
 * is live and, for a viewer, has no exclusion row on its own instance or on
 * every one (`exclusionJoin` under the junction's alias plus `_x`, never
 * `e`, the list's own).
 */
export function refPresenceClause(
  target: JunctionTarget | ColumnTarget,
  present: boolean,
  opts: RefPresenceOptions = {}
): FilterClause {
  if (target.kind === "column") {
    const col = `${target.parentAlias}.${target.idCol}`;
    return {
      sql: `(${col} ${present ? "IS NOT NULL" : "IS NULL"})`,
      params: [],
    };
  }
  const { liveRef } = opts;
  const exists = (t: JunctionTarget): FilterClause => {
    const j = t.alias;
    const [id, instance] = parentKeyOf(t);
    const keyed = `${j}.${t.parentIdCol} = ${id} AND ${j}.${t.parentInstanceCol} = ${instance}`;
    if (liveRef === undefined) {
      return {
        sql: `EXISTS (SELECT 1 FROM ${t.table} ${j} WHERE ${keyed})`,
        params: [],
      };
    }
    const r = `${j}_ref`;
    const refId = `${j}.${t.refIdCol}`;
    const refInstance = `${j}.${t.refInstanceCol}`;
    const live = `JOIN ${liveRef.table} ${r} ON ${r}.id = ${refId} AND ${r}.stashInstanceId = ${refInstance}`;
    if (liveRef.userId === null) {
      return {
        sql: `EXISTS (SELECT 1 FROM ${t.table} ${j} ${live} WHERE ${keyed} AND ${r}.deletedAt IS NULL)`,
        params: [],
      };
    }
    const x = `${j}_x`;
    return {
      sql: `EXISTS (SELECT 1 FROM ${t.table} ${j} ${live} ${exclusionJoin(x, liveRef.entityType, refId, refInstance)} WHERE ${keyed} AND ${r}.deletedAt IS NULL AND ${x}.id IS NULL)`,
      params: [liveRef.userId],
    };
  };
  const arms = [
    target,
    ...(opts.inheritedJunction ? [opts.inheritedJunction] : []),
  ].map(exists);
  const params = arms.flatMap((a) => a.params);
  if (arms.length === 1) {
    const sql = arms.map((a) => a.sql).join("");
    return present ? { sql, params } : { sql: `NOT ${sql}`, params };
  }
  return present
    ? { sql: `(${arms.map((a) => a.sql).join(" OR ")})`, params }
    : {
        sql: `(${arms.map((a) => `NOT ${a.sql}`).join(" AND ")})`,
        params,
      };
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
    return matchedSetClause(
      [`${alias}.id`, `${alias}.stashInstanceId`],
      refsName,
      modifier,
      [refsCte(refsName, refs, opts.allowedInstanceIds)]
    );
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
 * The viewer's exclusion rows of one entity type as a LEFT JOIN, binding the
 * user id: a row for the entity's own instance or a legacy global row ('').
 * The caller keeps rows with none (`<alias>.id IS NULL`), an anti-join, so
 * the joined `COUNT(*)` stays exact and no id list is ever bound (P2029).
 */
export function exclusionJoin(
  alias: string,
  entityType: string,
  idCol: string,
  instanceCol: string
): string {
  return `LEFT JOIN UserExcludedEntity ${alias} ON ${alias}.userId = ? AND ${alias}.entityType = '${entityType}' AND ${alias}.entityId = ${idCol} AND (${alias}.instanceId = '' OR ${alias}.instanceId = ${instanceCol})`;
}

/**
 * The viewer's allowed instances (enabled, selected, past their first
 * sync). An empty list matches nothing: a caller that means "no instance
 * filter" does not exist (invariant 11).
 */
export function instanceClause(
  alias: string,
  allowedInstanceIds: readonly string[]
): FilterClause {
  return instanceColumnClause(`${alias}.stashInstanceId`, allowedInstanceIds);
}

/**
 * The same rule for a column that is not `<alias>.stashInstanceId` (a
 * per-user table's `instanceId`, a raw statement's own name). An empty list
 * matches nothing.
 */
export function instanceColumnClause(
  column: string,
  allowedInstanceIds: readonly string[]
): SqlFragment & { readonly params: string[] } {
  if (allowedInstanceIds.length === 0) {
    return { sql: "1 = 0", params: [] };
  }
  return {
    sql: `${column} IN (${allowedInstanceIds.map(() => "?").join(", ")})`,
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

/** Each clause's count form (FilterClause.count), or the clause itself */
export function countForms(clauses: readonly FilterClause[]): FilterClause[] {
  return clauses.map((c) => c.count ?? c);
}

/**
 * The clauses as one WHERE, with their CTEs and joins gathered in order.
 * Two CTEs with one name throw: the statement would fail to prepare, or one
 * clause would read the other's set. A clause names its CTEs from its leaf's
 * name, unique in the statement.
 */
export function combine(clauses: readonly FilterClause[]): CombinedClauses {
  const active = clauses.filter((c) => c.sql !== "");
  const ctes = clauses.flatMap((c) => c.ctes ?? []);
  const names = new Set<string>();
  for (const cte of ctes) {
    if (names.has(cte.name)) {
      throw new Error(`Duplicate CTE name ${cte.name}`);
    }
    names.add(cte.name);
  }
  return {
    where: active.map((c) => c.sql).join(" AND "),
    params: active.flatMap((c) => c.params),
    ctes,
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
 * to be live (`StashScene.deletedAt IS NULL`) and, with the viewer's
 * exclusions applied, not excluded for them.
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
    /**
     * The refs' own table, when a via row counts only while the entity it
     * names is live and, for a viewer, not excluded for them ("appears
     * with" a performer the viewer hid matches no one)
     */
    readonly related?: {
      readonly table: string;
      readonly entityType: string;
    };
  };
  /** A further condition inside the subquery ("sc.organized = 1") */
  readonly where?: string;
}

/** Whose exclusions a clause reads: the viewer's, when they apply */
export interface ExclusionContext {
  readonly userId: number;
  readonly applyExclusions: boolean;
}

/** The alias of the scene row joined for its `deletedAt` */
const LIVE_SCENE = "lsc";

/**
 * The aliases of the via-scene anti-joins: the scene's exclusion rows, the
 * related ref's row and its exclusion rows. Never `e`, the outer
 * statement's own exclusion join.
 */
const SCENE_EXCLUDED = "vse";
const RELATED = "vr";
const RELATED_EXCLUDED = "vre";

/**
 * Filters the listed entity by what its scenes hold: groups holding a scene,
 * performers in a group's scenes. INCLUDES is one clause over all refs,
 * EXCLUDES a keyed `NOT EXISTS` (never `NOT IN`), INCLUDES_ALL one clause
 * per ref, AND-ed. With `via`, INCLUDES is a row-value IN driven from the
 * ref (the via row by its ref index, the junction by the scene, the live
 * scene by its key), which at 200k scenes takes milliseconds where the
 * correlated EXISTS took hundreds; the scene-keyed form (no `via`) keeps the
 * EXISTS, one full-key probe per row. With the viewer's exclusions applied
 * every arm anti-joins the scene's exclusion rows (`exclusionJoin`, its
 * every-instance arm included), so a scene the viewer hid links nothing:
 * neither a match nor, under EXCLUDES, an exclusion. No refs, or another
 * modifier, is no filter.
 */
export function viaSceneClause(
  spec: ViaSceneSpec,
  refs: readonly FilterRef[],
  modifier: string,
  ctx: ExclusionContext
): FilterClause {
  if (refs.length === 0) return EMPTY;

  const { alias, junction: j, via } = spec;
  // The via row is the scene itself when it is the scene table; otherwise
  // the live scene is joined on the scene columns of the given table
  const viaIsScene = via?.table === "StashScene";
  const liveAlias = via?.table === "StashScene" ? via.alias : LIVE_SCENE;
  const liveJoin = (t: AliasedTable, idCol: string, instanceCol: string) =>
    viaIsScene
      ? ""
      : ` JOIN StashScene ${LIVE_SCENE} ON ${LIVE_SCENE}.id = ${t.alias}.${idCol} AND ${LIVE_SCENE}.stashInstanceId = ${t.alias}.${instanceCol}`;
  const [refIdCol, refInstanceCol] = via
    ? [`${via.alias}.${via.refIdCol}`, `${via.alias}.${via.refInstanceCol}`]
    : [`${j.alias}.${spec.sceneIdCol}`, `${j.alias}.${spec.sceneInstanceCol}`];
  const keyed = `${j.alias}.${spec.entityIdCol} = ${alias}.id AND ${j.alias}.${spec.entityInstanceCol} = ${alias}.stashInstanceId`;

  // What every arm requires after the live scene's join: the scene not
  // excluded for the viewer, and the related ref live and not excluded
  const viewer = ctx.applyExclusions ? ctx.userId : null;
  const guardJoins: string[] = [];
  const guardWhere = [`${liveAlias}.deletedAt IS NULL`];
  const guardParams: SqlParam[] = [];
  if (viewer !== null) {
    guardJoins.push(
      exclusionJoin(
        SCENE_EXCLUDED,
        "scene",
        `${liveAlias}.id`,
        `${liveAlias}.stashInstanceId`
      )
    );
    guardWhere.push(`${SCENE_EXCLUDED}.id IS NULL`);
    guardParams.push(viewer);
  }
  if (via?.related) {
    guardJoins.push(
      `JOIN ${via.related.table} ${RELATED} ON ${RELATED}.id = ${refIdCol} AND ${RELATED}.stashInstanceId = ${refInstanceCol}`
    );
    guardWhere.push(`${RELATED}.deletedAt IS NULL`);
    if (viewer !== null) {
      guardJoins.push(
        exclusionJoin(
          RELATED_EXCLUDED,
          via.related.entityType,
          `${RELATED}.id`,
          `${RELATED}.stashInstanceId`
        )
      );
      guardWhere.push(`${RELATED_EXCLUDED}.id IS NULL`);
      guardParams.push(viewer);
    }
  }
  const guards = guardJoins.map((join) => ` ${join}`).join("");
  const where = [
    ...guardWhere,
    ...(spec.where === undefined ? [] : [spec.where]),
  ].join(" AND ");

  /** The keyed EXISTS: the junction, the via row on the scene, the live scene */
  const exists = (matched: readonly FilterRef[]): FilterClause => {
    const p = pairs(refIdCol, refInstanceCol, matched);
    const viaJoin = via
      ? ` JOIN ${via.table} ${via.alias} ON ${via.alias}.${via.sceneIdCol} = ${j.alias}.${spec.sceneIdCol} AND ${via.alias}.${via.sceneInstanceCol} = ${j.alias}.${spec.sceneInstanceCol}`
      : "";
    return {
      sql: `EXISTS (SELECT 1 FROM ${j.table} ${j.alias}${viaJoin}${liveJoin(j, spec.sceneIdCol, spec.sceneInstanceCol)}${guards} WHERE ${keyed} AND ${where} AND (${p.sql}))`,
      params: [...guardParams, ...p.params],
    };
  };

  /** The via form's row-value IN, driven from the ref */
  const inMatched = (matched: readonly FilterRef[]): FilterClause => {
    if (!via) return exists(matched);
    const p = pairs(refIdCol, refInstanceCol, matched);
    return {
      sql: `(${alias}.id, ${alias}.stashInstanceId) IN (SELECT ${j.alias}.${spec.entityIdCol}, ${j.alias}.${spec.entityInstanceCol} FROM ${via.table} ${via.alias} JOIN ${j.table} ${j.alias} ON ${j.alias}.${spec.sceneIdCol} = ${via.alias}.${via.sceneIdCol} AND ${j.alias}.${spec.sceneInstanceCol} = ${via.alias}.${via.sceneInstanceCol}${liveJoin(via, via.sceneIdCol, via.sceneInstanceCol)}${guards} WHERE ${where} AND (${p.sql}))`,
      params: [...guardParams, ...p.params],
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

// =============================================================================
// PER-FIELD CLAUSES (numbers, dates, text, career years, favorites)
// =============================================================================

/**
 * A number criterion's clause on a column or expression. A row without a
 * value (NULL) matches only IS_NULL: every comparison, NOT_EQUALS and
 * NOT_BETWEEN included, leaves it out, as Stash does. BETWEEN with one side
 * is at least or at most it.
 *
 * @param criterion - The parsed criterion
 * @param columnExpr - The SQL column or expression (e.g. "r.rating", "s.performerCount")
 */
export function buildNumericFilter(
  criterion: NumberCriterion,
  columnExpr: string
): FilterClause {
  switch (criterion.modifier) {
    case "IS_NULL":
      return { sql: `${columnExpr} IS NULL`, params: [] };
    case "NOT_NULL":
      return { sql: `${columnExpr} IS NOT NULL`, params: [] };
    case "EQUALS":
      return { sql: `${columnExpr} = ?`, params: [criterion.value] };
    case "NOT_EQUALS":
      return { sql: `${columnExpr} != ?`, params: [criterion.value] };
    case "GREATER_THAN":
      return { sql: `${columnExpr} > ?`, params: [criterion.value] };
    case "LESS_THAN":
      return { sql: `${columnExpr} < ?`, params: [criterion.value] };
    case "BETWEEN": {
      const { value, value2 } = criterion;
      if (value !== undefined && value2 !== undefined) {
        return {
          sql: `${columnExpr} BETWEEN ? AND ?`,
          params: [value, value2],
        };
      }
      if (value !== undefined) {
        return { sql: `${columnExpr} >= ?`, params: [value] };
      }
      if (value2 !== undefined) {
        return { sql: `${columnExpr} <= ?`, params: [value2] };
      }
      return noClause();
    }
    case "NOT_BETWEEN":
      return {
        sql: `${columnExpr} NOT BETWEEN ? AND ?`,
        params: [criterion.value, criterion.value2],
      };
  }
}

/**
 * A date column as Stash reads it: a year alone (`1995`) is its 1 January
 * and a year and month (`1995-06`) its first day. SQLite reads a bare `1995`
 * as a Julian day number and `1995-06` as no date, so a partial date must
 * be completed before `strftime` or `date` sees it. A NULL stays NULL.
 */
export function fullDateSql(col: string): string {
  return `CASE length(${col}) WHEN 4 THEN ${col} || '-01-01' WHEN 7 THEN ${col} || '-01' ELSE ${col} END`;
}

/**
 * The whole years from `birth` to `at`, Stash's arithmetic: the difference
 * of `YYYY.MMDD` read as a number, cut to its integer part. Both dates may
 * be partial (see fullDateSql).
 */
export function ageYearsSql(at: string, birth: string): string {
  return `CAST(strftime('%Y.%m%d', ${fullDateSql(at)}) - strftime('%Y.%m%d', ${fullDateSql(birth)}) AS INTEGER)`;
}

/** The junction that joins a dated item to its performers, and the item's own columns */
export interface PerformerAgeSource {
  readonly junction: {
    readonly table: string;
    readonly itemId: string;
    readonly itemInstance: string;
    readonly performerId: string;
    readonly performerInstance: string;
  };
  /** The item's id, instance and date columns as the statement names them (`s.id`) */
  readonly item: {
    readonly id: string;
    readonly instance: string;
    readonly date: string;
  };
}

/**
 * Performer Age on a dated item (a scene; an image or gallery later): the
 * item matches when any of its performers was in range on the item's date.
 * An item without a date never matches, nor does a performer without a
 * birthdate or a deleted one, nor one the viewer cannot see: pass the
 * viewer's id when exclusions apply (their hides, restrictions and cascades
 * in `UserExcludedEntity`, with the instance), null when they do not. The
 * performer is on the item's own instance.
 *
 * IS_NULL and NOT_NULL, which the contract allows none of here, and a
 * criterion without a bound filter nothing.
 */
export function performerAgeExists(
  criterion: NumberCriterion,
  source: PerformerAgeSource,
  viewerId: number | null
): FilterClause {
  if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
    return noClause();
  }
  const age = buildNumericFilter(
    criterion,
    ageYearsSql(source.item.date, "p.birthdate")
  );
  if (!age.sql) return age;
  const { junction, item } = source;
  const visible =
    viewerId === null
      ? ""
      : ` AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity x WHERE x.userId = ? AND x.entityType = 'performer' AND x.entityId = p.id AND (x.instanceId = '' OR x.instanceId = p.stashInstanceId))`;
  return {
    sql: `(${item.date} IS NOT NULL AND EXISTS (SELECT 1 FROM ${junction.table} sp JOIN StashPerformer p ON p.id = sp.${junction.performerId} AND p.stashInstanceId = sp.${junction.performerInstance} WHERE sp.${junction.itemId} = ${item.id} AND sp.${junction.itemInstance} = ${item.instance} AND p.deletedAt IS NULL AND p.birthdate IS NOT NULL${visible} AND ${age.sql}))`,
    params: viewerId === null ? age.params : [viewerId, ...age.params],
  };
}

/**
 * A date criterion's clause on a text day column Stash keeps (`s.date`,
 * `p.birthdate`): each row's day is `fullDateSql(column)` cut to its first
 * 10 characters, so a `YYYY` or `YYYY-MM` value is its first day, compared
 * as text with the criterion's day (a date-time value's first 10
 * characters, as written: a day column has no zone). EQUALS is the day,
 * NOT_EQUALS any other, GREATER_THAN after it, LESS_THAN before it; BETWEEN
 * includes both days, and one side alone is from that day on or up to it;
 * NOT_BETWEEN is outside both. A row without a date matches only IS_NULL:
 * every comparison, the negatives included, leaves it out (Stash's rule).
 *
 * @param criterion - The parsed criterion
 * @param column - The text column (e.g. "s.date", "p.birthdate")
 */
export function buildDayFilter(
  criterion: DateCriterion,
  column: string
): FilterClause {
  const day = `substr(${fullDateSql(column)}, 1, 10)`;
  const dayOf = (value: string) => value.slice(0, 10);
  switch (criterion.modifier) {
    case "IS_NULL":
      return { sql: `${column} IS NULL`, params: [] };
    case "NOT_NULL":
      return { sql: `${column} IS NOT NULL`, params: [] };
    case "EQUALS":
      return { sql: `${day} = ?`, params: [dayOf(criterion.value)] };
    case "NOT_EQUALS":
      return { sql: `${day} != ?`, params: [dayOf(criterion.value)] };
    case "GREATER_THAN":
      return { sql: `${day} > ?`, params: [dayOf(criterion.value)] };
    case "LESS_THAN":
      return { sql: `${day} < ?`, params: [dayOf(criterion.value)] };
    case "BETWEEN": {
      const { value, value2 } = criterion;
      if (value !== undefined && value2 !== undefined) {
        return {
          sql: `(${day} >= ? AND ${day} <= ?)`,
          params: [dayOf(value), dayOf(value2)],
        };
      }
      if (value !== undefined) {
        return { sql: `${day} >= ?`, params: [dayOf(value)] };
      }
      if (value2 !== undefined) {
        return { sql: `${day} <= ?`, params: [dayOf(value2)] };
      }
      return noClause();
    }
    case "NOT_BETWEEN":
      return {
        sql: `(${day} < ? OR ${day} > ?)`,
        params: [dayOf(criterion.value), dayOf(criterion.value2)],
      };
  }
}

/**
 * A date criterion's clause on a column of epoch milliseconds (Stash's
 * created and updated times since migration `20261002000600`, the viewer's
 * `w.lastPlayedAt`): a `YYYY-MM-DD` value is that day in the viewer's zone,
 * `[its first instant, the next day's)` (`instantSpan` in
 * `utils/zonedTime.ts`), a date-time value its one millisecond. EQUALS is
 * in the span, NOT_EQUALS outside it, GREATER_THAN after it (from the next
 * day's start), LESS_THAN before it; BETWEEN runs from the start of the
 * first to the end of the second, and one side alone is from it on or up
 * to its end; NOT_BETWEEN is outside. A row without a value matches only
 * IS_NULL, as `buildDayFilter`. A value no span can be made of (the parser
 * refuses one) adds no clause.
 *
 * @param criterion - The parsed criterion
 * @param column - The epoch column (e.g. "s.stashCreatedAt")
 * @param timeZone - The viewer's IANA zone (`QueryContext.timeZone`)
 */
export function buildInstantFilter(
  criterion: DateCriterion,
  column: string,
  timeZone: string
): FilterClause {
  const spanOf = (value: string | undefined) =>
    value === undefined ? undefined : instantSpan(value, timeZone);
  /** One span's clause, none when the value makes no span */
  const within = (
    value: string,
    clause: (span: { start: number; end: number }) => FilterClause
  ): FilterClause => {
    const span = spanOf(value);
    return span === undefined ? noClause() : clause(span);
  };
  switch (criterion.modifier) {
    case "IS_NULL":
      return { sql: `${column} IS NULL`, params: [] };
    case "NOT_NULL":
      return { sql: `${column} IS NOT NULL`, params: [] };
    case "EQUALS":
      return within(criterion.value, ({ start, end }) => ({
        sql: `(${column} >= ? AND ${column} < ?)`,
        params: [start, end],
      }));
    case "NOT_EQUALS":
      return within(criterion.value, ({ start, end }) => ({
        sql: `(${column} < ? OR ${column} >= ?)`,
        params: [start, end],
      }));
    case "GREATER_THAN":
      return within(criterion.value, ({ end }) => ({
        sql: `${column} >= ?`,
        params: [end],
      }));
    case "LESS_THAN":
      return within(criterion.value, ({ start }) => ({
        sql: `${column} < ?`,
        params: [start],
      }));
    case "BETWEEN": {
      const first = spanOf(criterion.value);
      const last = spanOf(criterion.value2);
      if (first !== undefined && last !== undefined) {
        return {
          sql: `(${column} >= ? AND ${column} < ?)`,
          params: [first.start, last.end],
        };
      }
      if (first !== undefined) {
        return { sql: `${column} >= ?`, params: [first.start] };
      }
      if (last !== undefined) {
        return { sql: `${column} < ?`, params: [last.end] };
      }
      return noClause();
    }
    case "NOT_BETWEEN": {
      const first = spanOf(criterion.value);
      const last = spanOf(criterion.value2);
      return first !== undefined && last !== undefined
        ? {
            sql: `(${column} < ? OR ${column} >= ?)`,
            params: [first.start, last.end],
          }
        : noClause();
    }
  }
}

/**
 * The search box's clause: every term must match, each through `termClause`
 * on the term's `likeContains` pattern (an AND of one clause per term, so the
 * terms may be found in different places), no terms no clause. SQL's AND
 * stops at the first term a row fails.
 */
export function searchAll(
  terms: readonly string[],
  termClause: (pattern: string) => FilterClause
): FilterClause {
  if (terms.length === 0) return noClause();
  return allOf(terms.map((term) => termClause(likeContains(term))));
}

/** SQL: the text after the last `/` or `\` in `col`, else all of it (`extractBasename`) */
function basenameSql(col: string): string {
  const upToSeparator = `rtrim(${col}, replace(replace(${col}, '/', ''), '\\', ''))`;
  return `COALESCE(NULLIF(substr(${col}, length(${upToSeparator}) + 1), ''), ${col})`;
}

/** SQL: `col` without its extension (`stripExtension`) */
function stemSql(col: string): string {
  const upToDot = `length(rtrim(${col}, replace(${col}, '.', '')))`;
  return `CASE WHEN ${upToDot} BETWEEN 1 AND length(${col}) - 1 THEN substr(${col}, 1, ${upToDot} - 1) ELSE ${col} END`;
}

/**
 * SQL: a gallery's name as its card shows it: its title, else its file's name
 * without the extension, else its folder's own name (`getGalleryFallbackTitle`).
 * `alias` is the gallery table's alias, a code constant. The gallery search,
 * the Title filter and the picker read it.
 */
export function galleryNameSql(alias: string): string {
  return `COALESCE(NULLIF(${alias}.title, ''), ${stemSql(`NULLIF(${alias}.fileBasename, '')`)}, ${basenameSql(`NULLIF(${alias}.folderPath, '')`)})`;
}

/**
 * Build a text comparison filter clause.
 * Handles INCLUDES, EXCLUDES, EQUALS, NOT_EQUALS, IS_NULL, NOT_NULL.
 *
 * INCLUDES and EXCLUDES are one phrase (no word split) matched with
 * `LIKE ? ESCAPE '\'` on a `likeContains` pattern, so `%`, `_` and `\` in
 * the text match themselves; SQLite's LIKE ignores ASCII case and a
 * non-ASCII letter matches itself exactly. They read the column, each `also`
 * column (plain text) and each of `lists` (a JSON list column, matched per
 * element through `jsonListArm`): any one matching for INCLUDES, none for
 * EXCLUDES (a NULL column still passes).
 * EQUALS, NOT_EQUALS, IS_NULL and NOT_NULL read only the column; with a null
 * column ("only the lists") they read the lists: EQUALS an element equal to
 * the text, IS_NULL every list NULL, '' or '[]', and NOT_NULL the rest.
 *
 * @param filter - Filter with value and modifier
 * @param column - Primary SQL column name (e.g. "p.name"), or null for a
 *   filter on the lists alone
 * @param columns - `also`: extra plain columns; `lists`: JSON list columns
 */
export function buildTextFilter(
  filter:
    | { value?: string | null; modifier?: string | null }
    | undefined
    | null,
  column: string | null,
  { also = [], lists = [] }: { also?: string[]; lists?: string[] } = {}
): FilterClause {
  const none: FilterClause = { sql: "", params: [] };
  if (!filter) return none;

  const { value, modifier = "INCLUDES" } = filter;
  const listsOnly = column === null;
  const emptyList = (list: string) =>
    `${list} IS NULL OR ${list} = '' OR ${list} = '[]'`;

  // IS_NULL and NOT_NULL don't require a value
  if (modifier === "IS_NULL") {
    if (!listsOnly) {
      return { sql: `(${column} IS NULL OR ${column} = '')`, params: [] };
    }
    if (lists.length === 0) return none;
    return {
      sql: `(${lists.map((list) => `(${emptyList(list)})`).join(" AND ")})`,
      params: [],
    };
  }
  if (modifier === "NOT_NULL") {
    if (!listsOnly) {
      return {
        sql: `(${column} IS NOT NULL AND ${column} != '')`,
        params: [],
      };
    }
    if (lists.length === 0) return none;
    return {
      sql: `(${lists.map((list) => `NOT (${emptyList(list)})`).join(" OR ")})`,
      params: [],
    };
  }

  // All other modifiers require a value
  if (!value) return none;

  const columns = listsOnly ? also : [column, ...also];
  const pattern = likeContains(value);

  switch (modifier) {
    case "INCLUDES": {
      const arms = [
        ...columns.map((col) => `${col} LIKE ? ESCAPE '\\'`),
        ...lists.map((list) => jsonListArm(list)),
      ];
      if (arms.length === 0) return none;
      return {
        sql: `(${arms.join(" OR ")})`,
        params: arms.map(() => pattern),
      };
    }
    case "EXCLUDES": {
      const arms = [
        ...columns.map(
          (col) => `(${col} IS NULL OR ${col} NOT LIKE ? ESCAPE '\\')`
        ),
        ...lists.map((list) => `NOT ${jsonListArm(list)}`),
      ];
      if (arms.length === 0) return none;
      return {
        sql: `(${arms.join(" AND ")})`,
        params: arms.map(() => pattern),
      };
    }
    case "EQUALS":
    case "NOT_EQUALS": {
      const equals = modifier === "EQUALS";
      if (!listsOnly) {
        return equals
          ? { sql: `LOWER(${column}) = LOWER(?)`, params: [value] }
          : {
              sql: `(${column} IS NULL OR LOWER(${column}) != LOWER(?))`,
              params: [value],
            };
      }
      if (lists.length === 0) return none;
      const arms = lists.map(
        (list) =>
          `EXISTS (SELECT 1 FROM json_each(${jsonListOrEmpty(list)}) a WHERE LOWER(a.value) = LOWER(?))`
      );
      return {
        sql: equals
          ? `(${arms.join(" OR ")})`
          : `(${arms.map((arm) => `NOT ${arm}`).join(" AND ")})`,
        params: arms.map(() => value),
      };
    }
    case null:
    default:
      return none;
  }
}

/**
 * The years a performer's career spans, from Stash's free-text career field,
 * as an SQL expression over `column`, or NULL. "YYYY -" and
 * "YYYY - present" (or current, or now, in any case) count to the current
 * year, "YYYY - YYYY" to the end year; the start is after 1900 and not in
 * the future, the end not before the start nor after next year; an en or em
 * dash counts as the hyphen, and spaces around the parts do not matter.
 * "- YYYY" and any other text give NULL. These are the legacy
 * `parseCareerLength`'s dated forms (item 38), in SQL so the Career Length
 * filter and sort run in the list statement; PR 9 revisits the meaning
 * against Stash's. The current year is SQLite's (`now`, UTC).
 *
 * It evaluates per row, as a scalar subquery whose nested FROM computes the
 * normalised text, its hyphen and its two parts once: written as one inline
 * expression each part repeats the text's functions, three times as slow
 * (once over 55k performers through Prisma: 64 ms against 202; a page sorted
 * by it 110 ms against 257, and 44 ms by name).
 */
export function careerYearsSql(column: string): string {
  const space = "char(32, 9, 10, 13)";
  const fourDigits = "'[0-9][0-9][0-9][0-9]'";
  const start = "CAST(career_start AS INTEGER)";
  const end = "CAST(career_end AS INTEGER)";
  return [
    "(SELECT CASE",
    `WHEN career_start NOT GLOB ${fourDigits} OR ${start} <= 1900 THEN NULL`,
    `WHEN career_end IN ('', 'present', 'current', 'now') THEN CASE WHEN ${start} <= career_year THEN career_year - ${start} END`,
    `WHEN career_end GLOB ${fourDigits} AND ${end} >= ${start} AND ${end} <= career_year + 1 THEN ${end} - ${start}`,
    "END",
    // No hyphen: substr(x, 1, -1) is '', which no year matches
    `FROM (SELECT trim(substr(career_text, 1, career_dash - 1), ${space}) AS career_start, trim(substr(career_text, career_dash + 1), ${space}) AS career_end, CAST(strftime('%Y', 'now') AS INTEGER) AS career_year`,
    `FROM (SELECT career_text, instr(career_text, '-') AS career_dash`,
    `FROM (SELECT lower(trim(replace(replace(${column}, char(8211), '-'), char(8212), '-'), ${space})) AS career_text))))`,
  ].join(" ");
}

/**
 * Build a boolean favorite filter clause.
 * Filters on r.favorite column.
 *
 * @param favorite - true for favorites, false for non-favorites, undefined for no filter
 */
export function buildFavoriteFilter(
  favorite: boolean | undefined
): FilterClause {
  if (favorite === undefined) {
    return { sql: "", params: [] };
  }

  if (favorite) {
    return { sql: "r.favorite = 1", params: [] };
  } else {
    return { sql: "(r.favorite = 0 OR r.favorite IS NULL)", params: [] };
  }
}

/**
 * A scene with no tag, its own or inherited: its stored count of `SceneTag`
 * rows is 0 (the browse index `(deletedAt, tagCount, ...)` reads it) and it
 * has no `SceneInheritedTag` row (the junction's primary key). The folder
 * view's Untagged: a scene with an inherited tag is in that tag's folder.
 */
export function sceneUntaggedSql(alias: string): string {
  return `(${alias}.tagCount = 0 AND NOT EXISTS (SELECT 1 FROM SceneInheritedTag ${alias}ut WHERE ${alias}ut.sceneId = ${alias}.id AND ${alias}ut.sceneInstanceId = ${alias}.stashInstanceId))`;
}

/**
 * Stash's resolution ranges, in pixels on a file's shorter side, copied as
 * they are, overlaps included (VR_HD 1920 to 2159 sits inside FOUR_K 1920 to
 * 2559): `stash/pkg/models/resolution.go` (`resolutionRanges`).
 */
export const RESOLUTION_RANGES: Readonly<
  Record<Resolution, { readonly min: number; readonly max: number }>
> = {
  VERY_LOW: { min: 144, max: 239 },
  LOW: { min: 240, max: 359 },
  R360P: { min: 360, max: 479 },
  STANDARD: { min: 480, max: 539 },
  WEB_HD: { min: 540, max: 719 },
  STANDARD_HD: { min: 720, max: 1079 },
  FULL_HD: { min: 1080, max: 1439 },
  QUAD_HD: { min: 1440, max: 1919 },
  VR_HD: { min: 1920, max: 2159 },
  FOUR_K: { min: 1920, max: 2559 },
  FIVE_K: { min: 2560, max: 2999 },
  SIX_K: { min: 3000, max: 3583 },
  SEVEN_K: { min: 3584, max: 3839 },
  EIGHT_K: { min: 3840, max: 6143 },
  HUGE: { min: 6144, max: 9999 },
};

/**
 * The resolution filter over a file's width and height columns, as Stash
 * builds it (`stash/pkg/sqlite/criterion_handlers.go`,
 * `resolutionCriterionHandler`): the shorter side against the range, so a
 * portrait 1080 by 1920 file is 1080p. EQUALS is `BETWEEN min AND max`,
 * NOT_EQUALS `NOT BETWEEN`, GREATER_THAN is past the range's top and
 * LESS_THAN under its bottom. No COALESCE: a file with no size is NULL
 * here and never matches, not even NOT_EQUALS. The bounds are the table's
 * own numbers, so they are written in, not bound.
 */
export function resolutionClause(
  criterion: EnumCriterion<Resolution>,
  widthCol: string,
  heightCol: string
): FilterClause {
  const { min, max } = RESOLUTION_RANGES[criterion.value];
  const shorter = `MIN(${widthCol}, ${heightCol})`;
  const sql = {
    EQUALS: `${shorter} BETWEEN ${min} AND ${max}`,
    NOT_EQUALS: `${shorter} NOT BETWEEN ${min} AND ${max}`,
    GREATER_THAN: `${shorter} > ${max}`,
    LESS_THAN: `${shorter} < ${min}`,
  }[criterion.modifier];
  return { sql, params: [] };
}
