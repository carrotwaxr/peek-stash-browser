/**
 * SQL clause helpers shared by the query builders.
 *
 * Every ref is matched as an (id, instance) pair: a ref with an instance
 * matches that instance only, and a bare ref matches its id on every
 * instance, since two Stash servers reuse small ids.
 */
import type { FilterClause, ParsedFilterValue } from "./sqlFilterBuilders.js";

/**
 * The most refs one clause matches inline as OR-ed pairs (two bound
 * parameters each). A larger set needs the matched-set join, which the base
 * builder adds; until then a set far above this still prepares, up to
 * SQLite's expression depth.
 */
export const PAIR_INLINE_LIMIT = 64;

const EMPTY: FilterClause = { sql: "", params: [] };

/**
 * The refs as OR-ed conditions on an id and an instance column:
 * `(idCol = ? AND instanceCol = ?)` for a ref with an instance, `(idCol = ?)`
 * for a bare one (an empty instance counts as bare). The caller wraps the
 * result in parentheses.
 */
export function pairs(
  idCol: string,
  instanceCol: string,
  refs: readonly ParsedFilterValue[]
): FilterClause {
  const params: string[] = [];
  const terms = refs.map((ref) => {
    params.push(ref.id);
    if (ref.instanceId === undefined || ref.instanceId === "") {
      return `(${idCol} = ?)`;
    }
    params.push(ref.instanceId);
    return `(${idCol} = ? AND ${instanceCol} = ?)`;
  });
  return { sql: terms.join(" OR "), params };
}

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
 * and the refs are matched on its ref columns.
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
  /** A further condition inside the subquery ("sc.deletedAt IS NULL") */
  readonly where?: string;
}

/**
 * Filters the listed entity by what its scenes hold: groups holding a scene,
 * performers in a group's scenes. INCLUDES is one `EXISTS` over all refs,
 * EXCLUDES its `NOT EXISTS`, INCLUDES_ALL one `EXISTS` per ref, AND-ed. No
 * refs, or another modifier, is no filter.
 */
export function viaSceneClause(
  spec: ViaSceneSpec,
  refs: readonly ParsedFilterValue[],
  modifier: string
): FilterClause {
  if (refs.length === 0) return EMPTY;

  const { alias, junction: j, via } = spec;
  const from = via
    ? `${j.table} ${j.alias} JOIN ${via.table} ${via.alias} ON ${via.alias}.${via.sceneIdCol} = ${j.alias}.${spec.sceneIdCol} AND ${via.alias}.${via.sceneInstanceCol} = ${j.alias}.${spec.sceneInstanceCol}`
    : `${j.table} ${j.alias}`;
  const [refIdCol, refInstanceCol] = via
    ? [`${via.alias}.${via.refIdCol}`, `${via.alias}.${via.refInstanceCol}`]
    : [`${j.alias}.${spec.sceneIdCol}`, `${j.alias}.${spec.sceneInstanceCol}`];
  const keyed = `${j.alias}.${spec.entityIdCol} = ${alias}.id AND ${j.alias}.${spec.entityInstanceCol} = ${alias}.stashInstanceId`;
  const where = spec.where === undefined ? "" : ` AND ${spec.where}`;

  const exists = (matched: readonly ParsedFilterValue[]): FilterClause => {
    const p = pairs(refIdCol, refInstanceCol, matched);
    return {
      sql: `EXISTS (SELECT 1 FROM ${from} WHERE ${keyed}${where} AND (${p.sql}))`,
      params: p.params,
    };
  };

  switch (modifier) {
    case "INCLUDES":
      return exists(refs);
    case "EXCLUDES": {
      const clause = exists(refs);
      return { sql: `NOT ${clause.sql}`, params: clause.params };
    }
    case "INCLUDES_ALL": {
      const clauses = refs.map((ref) => exists([ref]));
      return {
        sql: `(${clauses.map((c) => c.sql).join(" AND ")})`,
        params: clauses.flatMap((c) => c.params),
      };
    }
    default:
      return EMPTY;
  }
}
