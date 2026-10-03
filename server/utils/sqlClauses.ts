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
 * matches them with a row-value IN on its primary key (INCLUDES); a
 * junction INCLUDES on a page walking a sort index reads the refs list's
 * junction rows instead (junctionRefsList). An EXCLUDES stays inline up to
 * NEGATIVE_INLINE_LIMIT refs only; above it each row probes the refs CTE
 * (excludesRefsProbe), with no matched set. Never a ref list inside a correlated
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
  MultiEnumCriterion,
  NumberCriterion,
  RefCriterion,
  TextCriterion,
} from "../types/parsedFilters.js";
import { type EntityRef, distinctRefs, pairsJson } from "./entityRef.js";
import { expandRefs, expandRefsEach } from "./hierarchyUtils.js";
import { jsonListArm, likeContains, likeStartsWith } from "./sqlHelpers.js";
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

/**
 * The most refs an EXCLUDES matches inline. Above it each row's junction
 * rows (or its own key) probe the refs CTE (`excludesRefsProbe`): the
 * inline pairs cost every row a comparison per ref, the probe one index
 * search per junction row whatever the count. At 142k images and 207k
 * scenes the two are within 10 % up to 8 refs and the probe wins from 16
 * (49 favourite tags no image holds: 181 ms against 125; 40 rare scene
 * tags: 148 against 72), never slower on common tags (F11b).
 */
export const NEGATIVE_INLINE_LIMIT = 8;

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
  /**
   * Most refs matched inline; Infinity keeps every set inline. Default
   * PAIR_INLINE_LIMIT, and NEGATIVE_INLINE_LIMIT for an EXCLUDES.
   */
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
   * shapes (the EXISTS, the matched set). EXCLUDES never changes (L8, L9,
   * F11b).
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
 * comment); a large INCLUDES_ALL is one small INCLUDES per ref, and an
 * EXCLUDES above NEGATIVE_INLINE_LIMIT probes the refs per row.
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

  if (
    modifier === "EXCLUDES" &&
    refs.length > (opts.inlineLimit ?? NEGATIVE_INLINE_LIMIT)
  ) {
    return excludesRefsProbe(target, refs, opts);
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
 * EXCLUDES over more than NEGATIVE_INLINE_LIMIT refs: the refs as one JSON
 * parameter in a materialized CTE (`<name>_refs`, a bare ref one pair per
 * allowed instance), probed per row. A junction target keeps a keyed NOT
 * EXISTS on each junction (the inherited one too, AND-ed), its rows read by
 * the primary key from the row's key and matched with
 * `(+ref, refInstance) IN` the CTE, which SQLite builds once (`LIST
 * SUBQUERY`); the `+` keeps the junction's ref index out, so the probe
 * starts from the row. A column target matches its key as one text key NOT
 * IN the refs' keys (an ephemeral index, never a row-value NOT IN), and
 * keeps a row with no value. No matched set: building one costs every
 * junction row of the refs, 12 times the probe for 40 common tags at 207k
 * scenes (564 ms against 37), whatever the sort (F11b).
 */
function excludesRefsProbe(
  target: JunctionTarget | ColumnTarget,
  refs: readonly FilterRef[],
  opts: RefClauseOptions
): FilterClause {
  const refsName = `${opts.name}_refs`;
  const ctes = [refsCte(refsName, refs, opts.allowedInstanceIds)];
  if (target.kind === "column") {
    const col = `${target.parentAlias}.${target.idCol}`;
    const inst = `${target.parentAlias}.${target.instanceCol}`;
    return {
      sql: `(${col} IS NULL OR (${col} || ':' || ${inst}) NOT IN (SELECT id || ':' || inst FROM ${refsName}))`,
      params: [],
      ctes,
    };
  }
  const notExists = (t: JunctionTarget): string => {
    const j = t.alias;
    const [id, instance] = parentKeyOf(t);
    return `NOT EXISTS (SELECT 1 FROM ${t.table} ${j} WHERE ${j}.${t.parentIdCol} = ${id} AND ${j}.${t.parentInstanceCol} = ${instance} AND (+${j}.${t.refIdCol}, ${j}.${t.refInstanceCol}) IN (SELECT id, inst FROM ${refsName}))`;
  };
  const { inheritedJunction } = opts;
  return {
    sql:
      inheritedJunction === undefined
        ? notExists(target)
        : `(${notExists(target)} AND ${notExists(inheritedJunction)})`,
    params: [],
    ctes,
  };
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
 * in both). With `liveRef` a junction row, or the row a column names,
 * counts only when the related row is live and, for a viewer, has no
 * exclusion row on its own instance or on every one (`exclusionJoin` under
 * the junction's alias, or `<parent alias>_<column>`, plus `_x`, never `e`,
 * the list's own). A column needs it only where hiding the related entity
 * does not cascade to the row (a collection's studio).
 */
export function refPresenceClause(
  target: JunctionTarget | ColumnTarget,
  present: boolean,
  opts: RefPresenceOptions = {}
): FilterClause {
  const { liveRef } = opts;
  if (target.kind === "column") {
    const col = `${target.parentAlias}.${target.idCol}`;
    if (liveRef === undefined) {
      return {
        sql: `(${col} ${present ? "IS NOT NULL" : "IS NULL"})`,
        params: [],
      };
    }
    const r = `${target.parentAlias}_${target.idCol}_ref`;
    const keyed = `${r}.id = ${col} AND ${r}.stashInstanceId = ${target.parentAlias}.${target.instanceCol} AND ${r}.deletedAt IS NULL`;
    const negate = present ? "" : "NOT ";
    if (liveRef.userId === null) {
      return {
        sql: `${negate}EXISTS (SELECT 1 FROM ${liveRef.table} ${r} WHERE ${keyed})`,
        params: [],
      };
    }
    const x = `${target.parentAlias}_${target.idCol}_x`;
    return {
      sql: `${negate}EXISTS (SELECT 1 FROM ${liveRef.table} ${r} ${exclusionJoin(x, liveRef.entityType, `${r}.id`, `${r}.stashInstanceId`)} WHERE ${keyed} AND ${x}.id IS NULL)`,
      params: [liveRef.userId],
    };
  }
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
 * A text day column's day as the grid reads it (`buildDayFilter`) and the
 * timeline's bars count it: `fullDateSql` cut to `YYYY-MM-DD`, so a partial
 * date is its first day.
 */
export function wholeDaySql(col: string): string {
  return `substr(${fullDateSql(col)}, 1, 10)`;
}

/**
 * The whole years from `birth` to `at`, Stash's arithmetic: the difference
 * of `YYYY.MMDD` read as a number, cut to its integer part. Both dates may
 * be partial (see fullDateSql).
 */
export function ageYearsSql(at: string, birth: string): string {
  return `CAST(${dayNumberSql(at)} - ${dayNumberSql(birth)} AS INTEGER)`;
}

/**
 * A date column as the number `YYYY.MMDD` that Stash's age arithmetic
 * subtracts (a partial date completed first, see fullDateSql); NULL for no
 * date or text that is no date. As text it orders as the date does.
 */
export function dayNumberSql(col: string): string {
  return `strftime('%Y.%m%d', ${fullDateSql(col)})`;
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

/** The viewer's hides, restrictions and cascades on performer `p`, one `?` for the viewer */
const HIDDEN_PERFORMER_SQL =
  "NOT EXISTS (SELECT 1 FROM UserExcludedEntity x WHERE x.userId = ? AND x.entityType = 'performer' AND x.entityId = p.id AND (x.instanceId = '' OR x.instanceId = p.stashInstanceId))";

/**
 * An item's performers that count toward its performers' ages: the live ones
 * with a birthdate that the viewer can see, on the item's own instance, as
 * the FROM after `SELECT ...` and its WHERE (`p` is the performer). The
 * viewer's hides, restrictions and cascades are the `UserExcludedEntity`
 * rows of their id (with the instance, and the every-instance arm): pass
 * the viewer's id when exclusions apply, null when they do not.
 */
function performerAgeRows(
  source: PerformerAgeSource,
  viewerId: number | null
): FilterClause {
  const { junction, item } = source;
  const visible = viewerId === null ? "" : ` AND ${HIDDEN_PERFORMER_SQL}`;
  return {
    sql: `FROM ${junction.table} sp JOIN StashPerformer p ON p.id = sp.${junction.performerId} AND p.stashInstanceId = sp.${junction.performerInstance} WHERE sp.${junction.itemId} = ${item.id} AND sp.${junction.itemInstance} = ${item.instance} AND p.deletedAt IS NULL AND p.birthdate IS NOT NULL${visible}`,
    params: viewerId === null ? [] : [viewerId],
  };
}

/**
 * Performer Age on a dated item (a scene, an image, a gallery): the
 * item matches when any of its performers was in range on the item's date.
 * An item without a date never matches, nor does a performer without a
 * birthdate or a deleted one, nor one the viewer cannot see (see
 * `performerAgeRows`). The performer is on the item's own instance.
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
  const rows = performerAgeRows(source, viewerId);
  return {
    sql: `(${source.item.date} IS NOT NULL AND EXISTS (SELECT 1 ${rows.sql} AND ${age.sql}))`,
    params: [...rows.params, ...age.params],
  };
}

/**
 * The Performer Age sort's value for a dated item, as Stash orders it: the
 * age of the youngest performer for an ascending sort, of the oldest for a
 * descending one, at the item's date (a partial birthdate or date counts
 * from its first day, `dayNumberSql`). NULL without a date, or with no
 * performer the viewer can see that has a birthdate: the caller orders
 * those last (`NULLS LAST`) in both directions.
 *
 * The age rises as the birthdate falls, so the youngest performer is the
 * one born last: the value is the item's `YYYY.MMDD` less the latest (or,
 * for the oldest, earliest) performer's, cut to its integer part, as
 * `ageYearsSql` reads each pair. The performers' day numbers are one
 * materialized CTE inside the scalar subquery (the viewer's hidden ones
 * left out), computed once per statement; the junction is read by the
 * item's key and each row looks its performer up in the CTE. Reading the
 * performer table and the viewer's exclusions per junction row cost 0.9 s a
 * page at 215k scenes, the CTE 0.2.
 */
export function performerAgeSort(
  source: PerformerAgeSource,
  viewerId: number | null,
  direction: "ASC" | "DESC"
): FilterClause {
  const { junction, item } = source;
  const join =
    viewerId === null
      ? ""
      : ` ${exclusionJoin("pax", "performer", "p.id", "p.stashInstanceId")}`;
  const hidden = viewerId === null ? "" : " AND pax.id IS NULL";
  const pick = direction === "ASC" ? "MAX" : "MIN";
  return {
    sql: `(WITH pa AS MATERIALIZED (SELECT p.id AS id, p.stashInstanceId AS inst, ${dayNumberSql("p.birthdate")} AS day FROM StashPerformer p${join} WHERE p.deletedAt IS NULL AND p.birthdate IS NOT NULL${hidden}) SELECT CAST(${dayNumberSql(item.date)} - ${pick}(pa.day) AS INTEGER) FROM ${junction.table} sp JOIN pa ON pa.id = sp.${junction.performerId} AND pa.inst = sp.${junction.performerInstance} WHERE sp.${junction.itemId} = ${item.id} AND sp.${junction.itemInstance} = ${item.instance})`,
    params: viewerId === null ? [] : [viewerId],
  };
}

export interface PerformerTagsOptions {
  /**
   * Names the CTEs (`<name>_refs`, `<name>_matched`): unique in the
   * statement
   */
  readonly name: string;
  /** The instances a bare ref may match in the large shape, one pair each */
  readonly allowedInstanceIds: readonly string[];
  /** The viewer whose exclusions apply, or null when none do */
  readonly viewerId: number | null;
  /**
   * The page walks a sort index and stops at the page: it takes the keyed
   * EXISTS (NOT EXISTS), and the count (`FilterClause.count`) the form read
   * in no order. Otherwise both take the latter.
   */
  readonly sortedByIndex?: boolean;
  /** Most refs matched inline. Default PAIR_INLINE_LIMIT. */
  readonly inlineLimit?: number;
}

/**
 * Items by their performers' tags (the `performer_tags` filter of scenes,
 * images and galleries, through `performerTagsFieldClause`): an
 * item matches when one of its performers holds one of the tags, the refs
 * already expanded to their descendants. A performer counts only while it
 * is live and, with the viewer's exclusions applied, while neither it nor
 * the tag is excluded for the viewer (`exclusionJoin`, its every-instance
 * arm included), so a hidden performer or tag neither makes a match nor,
 * under EXCLUDES, drops an item. The performer is on the item's own
 * instance (the junction's rows say so). No refs is no filter.
 *
 * Up to the inline limit the refs are OR-ed pairs; above it they travel as
 * one JSON parameter into a materialized CTE (`<name>_refs`). Each
 * statement takes the shape that suits how it reads its rows, as the scene
 * tag filter does (`sortedByIndex`). Read in no order (a count, a sort with
 * no index), the items holding a tag are read once, driven from the tags
 * (`PerformerTag`'s tag index, the performer by its key, the junction by
 * its performer index): INCLUDES is a row-value IN on the item's key over
 * them, EXCLUDES reads them into a matched set (`<name>_matched`,
 * `matchedSetClause`). A page walking a sort index stops at the page: a
 * keyed EXISTS (NOT EXISTS) from the item reads its performers' tags by
 * `PerformerTag`'s primary key and, above the limit, checks each against
 * the refs list built once (`+pt.tagId`: probing the key once per ref took
 * 910 ms for 72 refs, against 231).
 *
 * At 215k scenes (8 instances): the most used performer tag (33k scenes)
 * counts in 63 ms and pages by date in under 1 ms (the IN list paged 79);
 * a tag of 34 descendants with 49k scenes counts in 135. EXCLUDES counts in
 * 96 to 161 ms (NOT EXISTS 230 to 306) and pages by rating in 108 to 178.
 * The walk's worst case is a set no visible performer holds: the whole
 * index, 140 to 230 ms.
 */
export function performerTagsClause(
  junction: JunctionTarget,
  refs: readonly FilterRef[],
  modifier: "INCLUDES" | "EXCLUDES",
  opts: PerformerTagsOptions
): FilterClause {
  if (refs.length === 0) return EMPTY;
  const j = junction.alias;
  const viewer = opts.viewerId;
  const guardJoins =
    viewer === null
      ? ""
      : ` ${exclusionJoin("pte", "performer", "p.id", "p.stashInstanceId")} ${exclusionJoin("ptte", "tag", "pt.tagId", "pt.tagInstanceId")}`;
  const guardWhere = `p.deletedAt IS NULL${viewer === null ? "" : " AND pte.id IS NULL AND ptte.id IS NULL"}`;
  const guardParams: SqlParam[] = viewer === null ? [] : [viewer, viewer];
  const performer = `CROSS JOIN StashPerformer p ON p.id = pt.performerId AND p.stashInstanceId = pt.performerInstanceId`;

  const large = refs.length > (opts.inlineLimit ?? PAIR_INLINE_LIMIT);
  const refsName = `${opts.name}_refs`;
  const refsCtes = large
    ? [refsCte(refsName, refs, opts.allowedInstanceIds)]
    : [];
  const inline = large
    ? { sql: "", params: [] }
    : pairs("pt.tagId", "pt.tagInstanceId", refs);
  const [id, instance] = parentKeyOf(junction);

  // The items holding any of the tags, driven from the tags
  const from = large
    ? `${refsName} r CROSS JOIN PerformerTag pt ON pt.tagId = r.id AND pt.tagInstanceId = r.inst`
    : "PerformerTag pt";
  const holding: SqlFragment = {
    sql: `SELECT ${j}.${junction.parentIdCol}, ${j}.${junction.parentInstanceCol} FROM ${from} ${performer}${guardJoins} CROSS JOIN ${junction.table} ${j} ON ${j}.${junction.refIdCol} = p.id AND ${j}.${junction.refInstanceCol} = p.stashInstanceId WHERE ${guardWhere}${large ? "" : ` AND (${inline.sql})`}`,
    params: [...guardParams, ...inline.params],
  };

  // The item's performers' tags by PerformerTag's primary key, checked
  // against the refs: for a page walking a sort index
  const held: FilterClause = {
    sql: `EXISTS (SELECT 1 FROM ${junction.table} ${j} CROSS JOIN PerformerTag pt ON pt.performerId = ${j}.${junction.refIdCol} AND pt.performerInstanceId = ${j}.${junction.refInstanceCol} ${performer}${guardJoins} WHERE ${j}.${junction.parentIdCol} = ${id} AND ${j}.${junction.parentInstanceCol} = ${instance} AND ${large ? `(+pt.tagId, pt.tagInstanceId) IN (SELECT id, inst FROM ${refsName})` : `(${inline.sql})`} AND ${guardWhere})`,
    params: [...guardParams, ...inline.params],
    ...(large ? { ctes: refsCtes } : {}),
  };

  let read: FilterClause;
  let walk: FilterClause;
  if (modifier === "INCLUDES") {
    read = {
      sql: `(${id}, ${instance}) IN (${holding.sql})`,
      params: holding.params,
      ...(large ? { ctes: refsCtes } : {}),
    };
    walk = held;
  } else {
    const setName = `${opts.name}_matched`;
    read = matchedSetClause([id, instance], setName, "EXCLUDES", [
      ...refsCtes,
      {
        name: setName,
        sql: `${setName}(id, inst) AS MATERIALIZED (SELECT DISTINCT ${holding.sql.slice("SELECT ".length)})`,
        params: holding.params,
      },
    ]);
    walk = { ...held, sql: `NOT ${held.sql}` };
  }
  return opts.sortedByIndex === true ? { ...walk, count: read } : read;
}

/**
 * The `performer_tags` field of a list whose items reach their performers
 * through `junction` (a scene's, an image's or a gallery's): the chosen tags
 * with their descendants to the depth (`expandRefs`), matched through
 * `performerTagsClause`. INCLUDES_ALL is one clause per chosen tag, each
 * with its own descendants, AND-ed: each on some performer of the item;
 * under `sortedByIndex` the count ANDs each clause's count form.
 */
export async function performerTagsFieldClause(
  junction: JunctionTarget,
  criterion: RefCriterion,
  opts: PerformerTagsOptions
): Promise<FilterClause> {
  if (criterion.modifier === "INCLUDES_ALL") {
    const groups = await expandRefsEach(
      "tag",
      criterion.refs,
      criterion.depth,
      opts.allowedInstanceIds
    );
    if (groups.length === 0) return noClause();
    const each = groups.map((group, i) =>
      performerTagsClause(junction, group, "INCLUDES", {
        ...opts,
        name: `${opts.name}_${i}`,
      })
    );
    // allOf keeps no count form: the count ANDs each clause's own
    const page = allOf(each);
    return opts.sortedByIndex === true
      ? { ...page, count: allOf(countForms(each)) }
      : page;
  }
  const refs = await expandRefs(
    "tag",
    criterion.refs,
    criterion.depth,
    opts.allowedInstanceIds
  );
  return performerTagsClause(junction, refs, criterion.modifier, opts);
}

/**
 * Performer Count on an item that stores no count (an image, a gallery):
 * the item's live performers the viewer can see, a correlated count over
 * its performer junction, read by the junction's primary key from the
 * item's key, the performer by its own. A deleted performer is not
 * counted, nor, with the viewer's exclusions applied (`viewerId`), one
 * excluded for them (`exclusionJoin` under `pce`, its every-instance arm
 * included). The builders pass null for a viewer with no performer
 * exclusion row (`exclusionViewer`): the anti-join would keep every row.
 * The performer is on the item's own instance.
 */
export function performerCountClause(
  criterion: NumberCriterion,
  junction: JunctionTarget,
  viewerId: number | null
): FilterClause {
  return buildCountFilter(criterion, performerCountSql(junction, viewerId));
}

/**
 * The count `performerCountClause` compares, as a scalar subquery with its
 * parameters (the viewer's id, when `viewerId` is given): the same value a
 * Performer Count sort orders by
 */
export function performerCountSql(
  junction: JunctionTarget,
  viewerId: number | null
): FilterClause {
  const [id, instance] = parentKeyOf(junction);
  const viewer =
    viewerId === null
      ? ""
      : ` ${exclusionJoin("pce", "performer", "pcp.id", "pcp.stashInstanceId")}`;
  return {
    sql: `(SELECT COUNT(*) FROM ${junction.table} pc CROSS JOIN StashPerformer pcp ON pcp.id = pc.${junction.refIdCol} AND pcp.stashInstanceId = pc.${junction.refInstanceCol}${viewer} WHERE pc.${junction.parentIdCol} = ${id} AND pc.${junction.parentInstanceCol} = ${instance} AND pcp.deletedAt IS NULL${viewerId === null ? "" : " AND pce.id IS NULL"})`,
    params: viewerId === null ? [] : [viewerId],
  };
}

/**
 * A date criterion's clause on a text day column Stash keeps (`s.date`,
 * `p.birthdate`): each row's day is `wholeDaySql(column)`, so a `YYYY` or
 * `YYYY-MM` value is its first day, compared
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
  const day = wholeDaySql(column);
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
 * SQL: an image's name as its card shows it: its title, else its file's name
 * without the extension (`getImageFallbackTitle`), NULL with neither. That is
 * the stored `titleSort` (`IMAGE_DERIVED_COLUMNS_SQL`, written by every sync
 * batch), ASCII lower-cased: LIKE and the text filter's `LOWER()` fold ASCII
 * case only, so a lower-cased name matches exactly what the name would. It
 * is read as a column because the expression over `filePath` costs 2.7 s per
 * list (page and count) over 142k images, against 30 ms. `alias` is the
 * image table's alias, a code constant. The image search and the Title filter
 * read it.
 */
export function imageNameSql(alias: string): string {
  return `${alias}.titleSort`;
}

/**
 * Build a text comparison filter clause.
 * Handles INCLUDES, EXCLUDES, EQUALS, NOT_EQUALS, STARTS_WITH, IS_NULL,
 * NOT_NULL.
 *
 * INCLUDES and EXCLUDES are one phrase (no word split) matched with
 * `LIKE ? ESCAPE '\'` on a `likeContains` pattern, so `%`, `_` and `\` in
 * the text match themselves; SQLite's LIKE ignores ASCII case and a
 * non-ASCII letter matches itself exactly. They read the column, each `also`
 * column (plain text) and each of `lists` (a JSON list column, matched per
 * element through `jsonListArm`): any one matching for INCLUDES, none for
 * EXCLUDES (a NULL column still passes). STARTS_WITH is the same one phrase
 * as a prefix of the column, an `also` column or a list element.
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
    case "STARTS_WITH": {
      const arms = [
        ...columns.map((col) => `${col} LIKE ? ESCAPE '\\'`),
        ...lists.map((list) => jsonListArm(list)),
      ];
      if (arms.length === 0) return none;
      const prefix = likeStartsWith(value);
      return {
        sql: `(${arms.join(" OR ")})`,
        params: arms.map(() => prefix),
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
 * The stash-box ids in `column` (`stashIds`, a JSON list of
 * `{ endpoint, stash_id }`; `column` is a code constant): EQUALS one of
 * them, ignoring case; IS_NULL none, NOT_NULL any. An element that is not an
 * object holds none, and a NULL or damaged column holds no element.
 */
export function stashIdsClause(
  criterion: TextCriterion,
  column: string
): FilterClause {
  const id =
    "CASE WHEN si.type = 'object' THEN json_extract(si.value, '$.stash_id') END";
  const any = (where: string) =>
    `EXISTS (SELECT 1 FROM json_each(${jsonListOrEmpty(column)}) si WHERE ${where})`;
  switch (criterion.modifier) {
    case "EQUALS":
      return { sql: any(`LOWER(${id}) = LOWER(?)`), params: [criterion.value] };
    case "IS_NULL":
      return { sql: `NOT ${any(`COALESCE(${id}, '') != ''`)}`, params: [] };
    case "NOT_NULL":
      return { sql: any(`COALESCE(${id}, '') != ''`), params: [] };
    // Not offered: the parser refuses them
    case "INCLUDES":
    case "EXCLUDES":
    case "NOT_EQUALS":
    case "STARTS_WITH":
      return noClause();
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

/**
 * The orientation filter over a file's width and height columns: landscape
 * is wider than tall, portrait taller than wide, square equal and not zero.
 * Several values match any one of them; a file with no size matches none.
 */
export function orientationClause(
  criterion: MultiEnumCriterion<"LANDSCAPE" | "PORTRAIT" | "SQUARE">,
  widthCol: string,
  heightCol: string
): FilterClause {
  const conditions = criterion.values.map(
    (orientation) =>
      ({
        LANDSCAPE: `(${widthCol} > ${heightCol})`,
        PORTRAIT: `(${widthCol} < ${heightCol})`,
        SQUARE: `(${widthCol} = ${heightCol} AND ${widthCol} > 0)`,
      })[orientation]
  );
  return { sql: `(${conditions.join(" OR ")})`, params: [] };
}

// =============================================================================
// VISIBLE RELATED ROWS, REF SETS AND COUNTS (tag and studio hierarchy, F12)
// =============================================================================

/**
 * What keeps a related row (a tag's parent or child, a studio's parent, a
 * clip) only while it is live and, for a viewer, has no exclusion row on
 * its own instance or on every one: the `exclusionJoin` under
 * `<alias>_x` (never `e`, the list's own) to append after the row's table,
 * the WHERE terms, and the parameters the join binds. No viewer (their
 * exclusions do not apply): no join, the row live.
 */
export interface VisibleGuard {
  readonly join: string;
  readonly where: string;
  readonly params: SqlParam[];
}

export function visibleGuard(
  alias: string,
  entityType: string,
  viewer: number | null
): VisibleGuard {
  if (viewer === null) {
    return { join: "", where: `${alias}.deletedAt IS NULL`, params: [] };
  }
  const x = `${alias}_x`;
  return {
    join: ` ${exclusionJoin(x, entityType, `${alias}.id`, `${alias}.stashInstanceId`)}`,
    where: `${alias}.deletedAt IS NULL AND ${x}.id IS NULL`,
    params: [viewer],
  };
}

/**
 * A key (an id and an instance expression) matched against refs: up to the
 * inline limit as OR-ed pairs, above it as a row-value IN over a
 * materialized refs CTE (`<name>_refs`, a bare ref one pair per allowed
 * instance), so no statement holds an OR term per ref of a large
 * expansion. No refs matches nothing.
 */
export function refSetMatch(
  key: ParentKey,
  refs: readonly FilterRef[],
  opts: RefClauseOptions
): FilterClause {
  if (refs.length === 0) return { sql: "0", params: [] };
  if (refs.length > (opts.inlineLimit ?? PAIR_INLINE_LIMIT)) {
    const refsName = `${opts.name}_refs`;
    return {
      sql: `(${key[0]}, ${key[1]}) IN (SELECT id, inst FROM ${refsName})`,
      params: [],
      ctes: [refsCte(refsName, refs, opts.allowedInstanceIds)],
    };
  }
  const p = pairs(key[0], key[1], refs);
  return { sql: `(${p.sql})`, params: p.params };
}

/**
 * A number criterion on a count over related rows (a scalar subquery): the
 * count's own parameters first, since it appears once, before the
 * criterion's values, in every form `buildNumericFilter` writes; its CTEs
 * kept
 */
export function buildCountFilter(
  criterion: NumberCriterion,
  count: FilterClause
): FilterClause {
  const clause = buildNumericFilter(criterion, count.sql);
  if (!clause.sql) return clause;
  return {
    sql: clause.sql,
    params: [...count.params, ...clause.params],
    ...(count.ctes ? { ctes: count.ctes } : {}),
  };
}
