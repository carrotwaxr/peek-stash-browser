/**
 * The `where` tree a list request carries beside its `<entity>_filter`: the
 * user's rows as a root of rows and groups, a group of rows only
 * (`shared/types/filters/tree.ts`). Each row names a field of the list's
 * contract table and its criterion parses with that field's own schema, so
 * the builders see the same parsed criteria as in `filter`, refs as (id,
 * instance) pairs.
 *
 * `ids` and `instance_id` are the page's own and never rows. Empty rows (an
 * unset panel option) and groups left empty drop without a record; the
 * limits (`WHERE_LIMITS`) count what stays, the rows as sent (the compiler
 * merges same-field rows later).
 */
import {
  type FieldSpec,
  LIST_FIELDS,
  type ListKind,
  MATCHES,
  type Match,
  WHERE_LIMITS,
  anyMergeCap,
  anyMergeKey,
} from "@peek/shared-types/filters/index.js";
import type {
  FilterRef,
  ParsedFilter,
  ParsedListRequest,
  ParsedWhereGroup,
  ParsedWhereLeaf,
} from "../types/parsedFilters.js";
import { entityKey } from "./entityRef.js";
import {
  type Problems,
  isEmptyCriterion,
  isPlainObject,
  schemaFor,
  walk,
} from "./listRequest.js";

export type ParsedWhereNode<E extends ListKind> =
  | ParsedWhereLeaf<E>
  | ParsedWhereGroup<E>;

/** The fields a row may not name: the page's own */
const PAGE_FIELDS: ReadonlySet<string> = new Set(["ids", "instance_id"]);

/** An own key, never one the prototype holds (`constructor`, `__proto__`) */
function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function isParsedGroup<E extends ListKind>(
  node: ParsedWhereNode<E>
): node is ParsedWhereGroup<E> {
  return "rules" in node;
}

function parseMatch(
  raw: unknown,
  path: string,
  problems: Problems
): Match | undefined {
  const match = MATCHES.find((m) => m === raw);
  if (match === undefined) problems.add(path, 'Expected "all" or "any"');
  return match;
}

/** One row; undefined when it is empty (no record) or has a problem */
function parseLeaf<E extends ListKind>(
  entity: E,
  input: Record<string, unknown>,
  path: string,
  problems: Problems
): ParsedWhereLeaf<E> | undefined {
  let field: unknown;
  let criterion: unknown;
  walk(
    input,
    path,
    new Map<string, (raw: unknown) => void>([
      ["field", (raw) => (field = raw)],
      ["criterion", (raw) => (criterion = raw)],
    ]),
    problems,
    "Unknown row key"
  );

  const fieldPath = `${path}.field`;
  if (typeof field !== "string") {
    problems.add(fieldPath, field === undefined ? "Required" : "Expected text");
    return undefined;
  }
  // Read as own data: a field the prototype holds (`constructor`) is no field
  const fields: Readonly<Record<string, FieldSpec>> = LIST_FIELDS[entity];
  const spec = hasOwn(fields, field) ? fields[field] : undefined;
  if (spec === undefined) {
    problems.add(fieldPath, "Unknown filter field");
    return undefined;
  }
  if (PAGE_FIELDS.has(field) || spec.kind === "instance") {
    problems.add(fieldPath, "Not a row field");
    return undefined;
  }

  if (isEmptyCriterion(criterion)) return undefined;
  const result = schemaFor(spec).safeParse(criterion);
  if (!result.success) {
    problems.addZod(`${path}.criterion`, result.error);
    return undefined;
  }
  // The boundary cast: the criterion was validated by its field's schema
  return { field, criterion: result.data } as ParsedWhereLeaf<E>;
}

/**
 * A group, or the root when `isRoot`: its match and its rules, the root's
 * rows and groups, a group's rows only. Undefined when it is left with no
 * rule or has a problem in its own keys.
 */
function parseGroup<E extends ListKind>(
  entity: E,
  input: Record<string, unknown>,
  path: string,
  isRoot: boolean,
  problems: Problems
): ParsedWhereGroup<E> | undefined {
  let match: Match | undefined;
  let rawRules: unknown;
  walk(
    input,
    path,
    new Map<string, (raw: unknown, path: string) => void>([
      [
        "match",
        (raw, matchPath) => (match = parseMatch(raw, matchPath, problems)),
      ],
      ["rules", (raw) => (rawRules = raw)],
    ]),
    problems,
    "Unknown group key"
  );
  if (!hasOwn(input, "match")) problems.add(`${path}.match`, "Required");
  if (rawRules === undefined) {
    problems.add(`${path}.rules`, "Required");
    return undefined;
  }
  if (!Array.isArray(rawRules)) {
    problems.add(`${path}.rules`, "Expected a list");
    return undefined;
  }

  const rules: ParsedWhereNode<E>[] = [];
  rawRules.forEach((item: unknown, index) => {
    const itemPath = `${path}.rules[${index}]`;
    if (!isPlainObject(item)) {
      problems.add(itemPath, "Expected a row or a group");
      return;
    }
    if (hasOwn(item, "rules") || hasOwn(item, "match")) {
      if (!isRoot) {
        problems.add(itemPath, "Groups nest one level");
        return;
      }
      const group = parseGroup(entity, item, itemPath, false, problems);
      if (group) rules.push(group);
      return;
    }
    const leaf = parseLeaf(entity, item, itemPath, problems);
    if (leaf) rules.push(leaf);
  });

  if (match === undefined || rules.length === 0) return undefined;
  return { match, rules };
}

/** The ids a criterion names, `refs` and `excludes`; 0 for a criterion of another kind */
function refCountOf(criterion: unknown): number {
  if (!isPlainObject(criterion)) return 0;
  const { refs, excludes } = criterion;
  return (
    (Array.isArray(refs) ? refs.length : 0) +
    (Array.isArray(excludes) ? excludes.length : 0)
  );
}

interface TreeCounts {
  rows: number;
  groups: number;
  refs: number;
}

function countInto<E extends ListKind>(
  group: ParsedWhereGroup<E>,
  counts: TreeCounts
): void {
  for (const node of group.rules) {
    if (isParsedGroup(node)) {
      counts.groups += 1;
      countInto(node, counts);
    } else {
      counts.rows += 1;
      counts.refs += refCountOf(node.criterion);
    }
  }
}

/**
 * `where` parsed against the list's contract table; undefined when absent or
 * left empty. Problems go to `problems` at their path (`where.rules[0].field`),
 * the limits at `path` itself.
 */
export function parseWhere<E extends ListKind>(
  entity: E,
  raw: unknown,
  path: string,
  problems: Problems
): ParsedWhereGroup<E> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isPlainObject(raw)) {
    problems.add(path, "Expected an object");
    return undefined;
  }
  const root = parseGroup(entity, raw, path, true, problems);
  if (!root) return undefined;

  const counts: TreeCounts = { rows: 0, groups: 0, refs: 0 };
  countInto(root, counts);
  if (counts.rows > WHERE_LIMITS.rows) {
    problems.add(path, `At most ${WHERE_LIMITS.rows} rows`);
  }
  if (counts.groups > WHERE_LIMITS.groups) {
    problems.add(path, `At most ${WHERE_LIMITS.groups} groups`);
  }
  if (counts.refs > WHERE_LIMITS.refs) {
    problems.add(path, `At most ${WHERE_LIMITS.refs} values in where`);
  }
  return root;
}

/**
 * Whether a root row names what a sort reads: a ref, playlist or multi-enum
 * criterion INCLUDES or INCLUDES_ALL with values; any other kind with a value
 */
function namesSomething(criterion: unknown): boolean {
  if (typeof criterion === "boolean") return true;
  if (!isPlainObject(criterion)) return false;
  const values = criterion.refs ?? criterion.ids ?? criterion.values;
  if (Array.isArray(values)) {
    return (
      (criterion.modifier === "INCLUDES" ||
        criterion.modifier === "INCLUDES_ALL") &&
      values.length > 0
    );
  }
  return criterion.value !== undefined || criterion.value2 !== undefined;
}

/**
 * The criteria a sort reads (Scene Number, Playlist order, Collection
 * order): the filter object's, then for each other field the first root row
 * of an "all" root that names something. A row inside a group, or under an
 * "any" root, never decides a sort.
 */
export function topLevelCriteria<E extends ListKind>(
  filter: ParsedFilter<E>,
  where: ParsedWhereGroup<E> | undefined
): ParsedFilter<E> {
  const first = new Map<string, unknown>();
  if (where?.match === "all") {
    for (const node of where.rules) {
      if (isParsedGroup(node) || first.has(node.field)) continue;
      if (namesSomething(node.criterion)) first.set(node.field, node.criterion);
    }
  }
  // The boundary cast: each criterion is a parsed one of its own field
  return { ...Object.fromEntries(first), ...filter } as ParsedFilter<E>;
}

/** The filter's criteria (but `ids`) as rows, then every root row of an "all" root */
export function topLevelLeaves<E extends ListKind>(
  request: Pick<ParsedListRequest<E>, "filter"> & {
    readonly where?: ParsedWhereGroup<E> | undefined;
  }
): ParsedWhereLeaf<E>[] {
  const filter: Readonly<Record<string, unknown>> = request.filter;
  const leaves = Object.entries(filter).flatMap(([field, criterion]) =>
    field === "ids" || criterion === undefined
      ? []
      : // The boundary cast: each criterion is a parsed one of its own field
        [{ field, criterion } as ParsedWhereLeaf<E>]
  );
  if (request.where?.match === "all") {
    for (const node of request.where.rules) {
      if (!isParsedGroup(node)) leaves.push(node);
    }
  }
  return leaves;
}

/** A flat filter as a where of its rows, before parsing */
export interface FlatWhere {
  readonly match: "all";
  readonly rules: readonly {
    readonly field: string;
    readonly criterion: unknown;
  }[];
}

/**
 * A flat `<entity>_filter` (a stored carousel's or preset's) as an "all"
 * root of one row per key. Every key stays for the parse to judge, but `ids`
 * and `instance_id`, which stay in the filter.
 */
export function whereOfFlatFilter(
  flat: Readonly<Record<string, unknown>>
): FlatWhere {
  return {
    match: "all",
    rules: Object.entries(flat)
      .filter(([field]) => !PAGE_FIELDS.has(field))
      .map(([field, criterion]) => ({ field, criterion })),
  };
}

/** Whether `raw` is a where tree, not a flat filter: an object of exactly `match` and `rules` */
export function isWhereShape(
  raw: unknown
): raw is { readonly match: unknown; readonly rules: unknown } {
  if (!isPlainObject(raw)) return false;
  const keys = Object.keys(raw);
  return keys.length === 2 && hasOwn(raw, "match") && hasOwn(raw, "rules");
}

/**
 * The values a parsed criterion names, in its own shape: a ref criterion's
 * `refs` (deduplicated by `entityKey`), a playlist criterion's `ids` and a
 * multi-valued enum's `values` (each deduplicated by value); undefined for
 * any other criterion
 */
type MergeValues =
  | { readonly kind: "refs"; readonly list: readonly FilterRef[] }
  | { readonly kind: "ids"; readonly list: readonly number[] }
  | { readonly kind: "values"; readonly list: readonly string[] };

function mergeValuesOf(criterion: unknown): MergeValues | undefined {
  if (!isPlainObject(criterion)) return undefined;
  const { refs, ids, values } = criterion;
  // The parser's shapes: each list holds only its own kind of value
  if (Array.isArray(refs)) return { kind: "refs", list: refs as FilterRef[] };
  if (Array.isArray(ids)) return { kind: "ids", list: ids as number[] };
  if (Array.isArray(values)) {
    return { kind: "values", list: values as string[] };
  }
  return undefined;
}

/** The union of two lists of one kind, in order, or undefined when it passes `cap` */
function unionOf(
  first: MergeValues,
  second: MergeValues,
  cap: number
): MergeValues | undefined {
  let list: readonly unknown[];
  if (first.kind === "refs" && second.kind === "refs") {
    const seen = new Set<string>();
    list = [...first.list, ...second.list].filter((ref) => {
      const k = entityKey(ref.id, ref.instanceId ?? "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } else if (first.kind === second.kind) {
    list = [...new Set<unknown>([...first.list, ...second.list])];
  } else {
    return undefined;
  }
  if (list.length > cap) return undefined;
  // The boundary cast: the union holds the values of `first`'s kind
  return { kind: first.kind, list } as MergeValues;
}

/** A merged leaf's criterion: INCLUDES over the union, the first leaf's other keys kept */
function mergedCriterion(criterion: unknown, values: MergeValues): unknown {
  const own = isPlainObject(criterion) ? criterion : {};
  return { ...own, [values.kind]: values.list, modifier: "INCLUDES" };
}

/**
 * The container's rows with the same-field rows an "any" container can
 * merge made one: the rows `anyMergeKey` gives one key (a ref, playlist or
 * multi-valued enum field read as "any of its values", at one depth, with
 * no excludes) become one INCLUDES over the union of their values, at the
 * first row's place, so twenty one-tag rows read the junction once. A
 * union over the field's cap (`anyMergeCap`) stays apart: the row that
 * would pass it starts the key's next merged row. Groups pass through
 * unchanged, and an "all" container is returned as it is.
 */
export function mergeAnyLeaves<E extends ListKind>(
  entity: ListKind,
  group: ParsedWhereGroup<E>
): ParsedWhereGroup<E> {
  if (group.match !== "any") return group;
  const fields: Readonly<Record<string, FieldSpec>> = LIST_FIELDS[entity];
  const rules: ParsedWhereNode<E>[] = [];
  /** The merge key's current row: its place in `rules` and its values */
  const open = new Map<string, { at: number; values: MergeValues }>();
  for (const node of group.rules) {
    if (isParsedGroup(node)) {
      rules.push(node);
      continue;
    }
    const spec = hasOwn(fields, node.field) ? fields[node.field] : undefined;
    const values = mergeValuesOf(node.criterion);
    const criterion: Readonly<Record<string, unknown>> = isPlainObject(
      node.criterion
    )
      ? node.criterion
      : {};
    const key =
      spec === undefined || values === undefined
        ? undefined
        : anyMergeKey(node.field, spec, {
            modifier:
              typeof criterion.modifier === "string"
                ? criterion.modifier
                : null,
            depth: typeof criterion.depth === "number" ? criterion.depth : null,
            excludes: Array.isArray(criterion.excludes)
              ? criterion.excludes
              : null,
            valueCount: values.list.length,
          });
    if (key === undefined || spec === undefined || values === undefined) {
      rules.push(node);
      continue;
    }
    const current = open.get(key);
    const union =
      current === undefined
        ? undefined
        : unionOf(current.values, values, anyMergeCap(spec));
    if (current !== undefined && union !== undefined) {
      const first = rules[current.at];
      if (first !== undefined && !isParsedGroup(first)) {
        // The boundary cast: the merged criterion is a parsed one of the
        // first row's own field, INCLUDES over values of its kind
        rules[current.at] = {
          field: first.field,
          criterion: mergedCriterion(first.criterion, union),
        } as ParsedWhereLeaf<E>;
      }
      open.set(key, { at: current.at, values: union });
      continue;
    }
    open.set(key, { at: rules.length, values });
    rules.push(node);
  }
  return { match: group.match, rules };
}
