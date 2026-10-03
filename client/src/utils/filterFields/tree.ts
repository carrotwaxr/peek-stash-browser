/**
 * The filter state as a tree: the root's rows and up to five groups of rows,
 * each container matching all or any of them (owner answer 3, b'). The state
 * stays one flat `PanelState` whose keys may carry a row prefix (Contract 3:
 * `g1.` a group, `2.` the second row of a key in its container, `g1=any` a
 * group's match, `match=any` the root's), so today's flat state is the case
 * "root rows, one per field, match all" and every old link, preset and
 * default preset reads as before.
 *
 * This module turns that state into a `PanelTree` and back (`treeOf`,
 * `stateOf`, canonical: rows in the panel table's order within a container,
 * groups numbered 1..n, at most `WHERE_LIMITS.rows` rows), writes and reads
 * it in the URL through each row's codec on a prefixed view of the
 * parameters, builds the request's `where` tree (`whereOf`, same-field rows
 * of an "any" container merged by the shared rule) and reads a stored one
 * back (`stateOfWhere`, for carousels), builds the filter object a list
 * request sends beside `where` (`filterObjectOf`), and compares two states
 * as a View does (`filtersEqual`, `viewModified`).
 *
 * Imports only relative modules and `@peek/shared-types` (see `options.ts`).
 */
import {
  type FieldSpec,
  type FilterPreset,
  type ListKind,
  type Match,
  PANEL_FIELDS,
  type PanelField,
  ROOT_MATCH_KEY,
  WHERE_LIMITS,
  type WhereGroup,
  type WhereLeaf,
  type WhereNode,
  anyMergeCap,
  anyMergeKey,
  groupKeyOf,
  isWhereGroup,
  parseRowKey,
  rowKeyOf,
} from "@peek/shared-types";
import {
  type PanelFilters,
  buildPanelFilter,
  normalizePanelState,
} from "./build";
import {
  type PanelState,
  type UrlParams,
  codecOf,
  entityParamFor,
  urlKeysOf,
  valuesOf,
} from "./codecs";
import { SPECS } from "./options";

export type { UrlParams };

/** One row: its panel field and its own keys, unprefixed */
export interface PanelRow {
  readonly field: PanelField;
  readonly state: PanelState;
}

/** A group: its match and its rows (a group holds only rows) */
export interface PanelRowGroup {
  readonly match: Match;
  readonly rows: readonly PanelRow[];
}

export interface PanelTree {
  readonly match: Match;
  readonly rows: readonly PanelRow[];
  readonly groups: readonly PanelRowGroup[];
  /** Contract-field keys a preset saved (a page's permanent criterion): root only, never a row */
  readonly permanent: PanelState;
}

/** A stored carousel leaf no panel row can read, with the container it came from (0 = root) */
export interface KeptLeaf {
  readonly group: number;
  readonly leaf: unknown;
}

type Specs = Readonly<Record<string, FieldSpec>>;

const GROUP_KEY = /^g([1-5])$/;

const matchOf = (value: unknown): Match => (value === "any" ? "any" : "all");

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// ── The rows' keys ────────────────────────────────────────────────────────

interface RowIndex {
  /** Each row's state keys (its key and companions) to the row's place */
  readonly stateKeys: ReadonlyMap<string, number>;
  /** Every URL key a row owns, and those a prefix may carry */
  readonly urlKeys: ReadonlySet<string>;
  readonly prefixedUrlKeys: ReadonlySet<string>;
  /** The singular card-count forms (`tagId`), read at the root only */
  readonly singulars: ReadonlySet<string>;
}

const indexes = new WeakMap<readonly PanelField[], RowIndex>();

/** A row list's keys, computed once per list */
function indexOf(rows: readonly PanelField[]): RowIndex {
  const cached = indexes.get(rows);
  if (cached !== undefined) return cached;
  const stateKeys = new Map<string, number>();
  rows.forEach((row, place) => {
    for (const key of codecOf(row).keys(row)) {
      if (!stateKeys.has(key)) stateKeys.set(key, place);
    }
  });
  const urlKeys = new Set(rows.flatMap((row) => urlKeysOf(row)));
  const singulars = new Set(
    rows
      .filter((row) => row.editor === "ref")
      .map((row) => entityParamFor(row.key))
      .filter((key) => !stateKeys.has(key))
  );
  const index: RowIndex = {
    stateKeys,
    urlKeys,
    prefixedUrlKeys: new Set([...urlKeys].filter((key) => !singulars.has(key))),
    singulars,
  };
  indexes.set(rows, index);
  return index;
}

// ── State to tree ─────────────────────────────────────────────────────────

/**
 * A row the tree keeps: one that filters, or a choice other than its
 * default (Clips' "All clips" sends nothing, but drops the default "With
 * preview only")
 */
function holdsFilter(field: PanelField, state: PanelState): boolean {
  if (codecOf(field).isActive(field, state)) return true;
  if (field.editor !== "choice") return false;
  const value = state[field.key];
  return (
    value !== field.defaultValue &&
    field.choices.some((choice) => choice.value === value)
  );
}

/** A container while it is read: its match, if declared, and its rows */
interface Container {
  readonly match: Match | undefined;
  readonly rows: readonly PanelRow[];
}

interface ParsedState {
  readonly match: Match;
  /** By number (0 the root), in order; a declared group with no row too */
  readonly containers: ReadonlyMap<number, Container>;
  readonly permanent: PanelState;
}

/** A row's state with its value as the row reads it (a value read as nothing dropped) */
function normalizedRow(field: PanelField, state: PanelState): PanelState {
  if (!(field.key in state)) return state;
  const value = codecOf(field).normalize(field, state[field.key]);
  if (value === state[field.key]) return state;
  return Object.fromEntries([
    ...Object.entries(state).filter(([key]) => key !== field.key),
    ...(value === undefined ? [] : [[field.key, value] as const]),
  ]);
}

/**
 * The state's containers: each key read through the key grammar, each
 * row's keys gathered, its value normalized, inactive rows dropped; rows in
 * the table's order (repeats in their occurrence order), at most
 * `WHERE_LIMITS.rows` in all, the root's first. A root key no row owns is a
 * permanent criterion when `specs` names it, else ignored, as is every
 * other unknown or out-of-range key.
 */
function parseState(
  rows: readonly PanelField[],
  specs: Specs | undefined,
  state: PanelState
): ParsedState {
  const { stateKeys } = indexOf(rows);
  let match: Match = "all";
  const declared = new Map<number, Match>();
  const permanent: Record<string, unknown> = {};
  /** container, then `place:occurrence`, to the row's keys */
  const gathered = new Map<
    number,
    Map<
      string,
      { place: number; occurrence: number; state: Record<string, unknown> }
    >
  >();

  for (const [raw, value] of Object.entries(state)) {
    if (value === undefined) continue;
    if (raw === ROOT_MATCH_KEY) {
      match = matchOf(value);
      continue;
    }
    const group = GROUP_KEY.exec(raw);
    if (group !== null) {
      declared.set(Number(group[1]), matchOf(value));
      continue;
    }
    const rowKey = parseRowKey(raw);
    if (rowKey === undefined) continue;
    const place = stateKeys.get(rowKey.key);
    if (place === undefined) {
      if (
        rowKey.group === 0 &&
        rowKey.occurrence === 1 &&
        specs?.[rowKey.key] !== undefined
      ) {
        permanent[rowKey.key] = value;
      }
      continue;
    }
    let container = gathered.get(rowKey.group);
    if (container === undefined) {
      container = new Map();
      gathered.set(rowKey.group, container);
    }
    const id = `${place}:${rowKey.occurrence}`;
    let row = container.get(id);
    if (row === undefined) {
      row = { place, occurrence: rowKey.occurrence, state: {} };
      container.set(id, row);
    }
    row.state[rowKey.key] = value;
  }

  const numbers = [
    ...new Set([0, ...gathered.keys(), ...declared.keys()]),
  ].sort((a, b) => a - b);
  let room: number = WHERE_LIMITS.rows;
  const containers = new Map<number, Container>();
  for (const number of numbers) {
    const active = [...(gathered.get(number)?.values() ?? [])]
      .sort((a, b) => a.place - b.place || a.occurrence - b.occurrence)
      .flatMap(({ place, state: rowState }) => {
        const field = rows[place];
        if (field === undefined) return [];
        const normalized = normalizedRow(field, rowState);
        return holdsFilter(field, normalized)
          ? [{ field, state: normalized }]
          : [];
      });
    const kept = active.slice(0, Math.max(room, 0));
    room -= kept.length;
    containers.set(number, {
      match: number === 0 ? match : declared.get(number),
      rows: kept,
    });
  }
  return { match, containers, permanent };
}

/** The parsed state as a tree: groups without a row dropped, the rest in order */
const treeOfParsed = (parsed: ParsedState): PanelTree => ({
  match: parsed.match,
  rows: parsed.containers.get(0)?.rows ?? [],
  groups: [...parsed.containers]
    .filter(([number, group]) => number > 0 && group.rows.length > 0)
    .map(([, group]) => ({ match: group.match ?? "all", rows: group.rows })),
  permanent: parsed.permanent,
});

/**
 * The state as a tree: inactive rows dropped, values normalized, rows in
 * the panel table's order within each container, at most 20 rows and 5
 * groups (the rest dropped, so a hand-edited URL never turns into a 400)
 */
export const treeOf = (kind: ListKind, state: PanelState): PanelTree =>
  treeOfParsed(parseState(PANEL_FIELDS[kind], SPECS[kind], state));

/**
 * The state's group numbers in the order `treeOf` draws its groups (those
 * holding a row), so the bar's nth group chip is `gN` with N the nth entry
 * even when a hand-edited URL skips a number
 */
export const groupNumbersOf = (kind: ListKind, state: PanelState): number[] =>
  [...parseState(PANEL_FIELDS[kind], SPECS[kind], state).containers]
    .filter(([number, group]) => number > 0 && group.rows.length > 0)
    .map(([number]) => number);

/** How many rows and groups the tree holds, as the server counts them */
export const treeCounts = (
  tree: PanelTree
): { rows: number; groups: number } => ({
  rows:
    tree.rows.length +
    tree.groups.reduce((sum, group) => sum + group.rows.length, 0),
  groups: tree.groups.length,
});

// ── Tree to state ─────────────────────────────────────────────────────────

const orders = new WeakMap<
  readonly PanelField[],
  ReadonlyMap<string, number>
>();

/** Each row's place in the table, by key */
function orderOf(rows: readonly PanelField[]): ReadonlyMap<string, number> {
  let order = orders.get(rows);
  if (order === undefined) {
    order = new Map(rows.map((row, place) => [row.key, place]));
    orders.set(rows, order);
  }
  return order;
}

/** A container's active rows in the table's order (repeats keep theirs) */
function canonicalRows(
  order: ReadonlyMap<string, number>,
  rows: readonly PanelRow[]
): PanelRow[] {
  const placeOf = (row: PanelRow) =>
    order.get(row.field.key) ?? Number.MAX_SAFE_INTEGER;
  return rows
    .filter((row) => holdsFilter(row.field, row.state))
    .map((row, at) => ({ row, at }))
    .sort((a, b) => placeOf(a.row) - placeOf(b.row) || a.at - b.at)
    .map(({ row }) => row);
}

/** Each row's keys under its prefix: the Nth row of a key in the container is `N.` */
function eachPrefixedRow(
  group: number,
  rows: readonly PanelRow[],
  visit: (row: PanelRow, prefix: string) => void
) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const occurrence = (seen.get(row.field.key) ?? 0) + 1;
    seen.set(row.field.key, occurrence);
    visit(row, rowKeyOf(group, occurrence, ""));
  }
}

/** The tree as flat state, groups numbered from `numbers` */
function stateOfContainers(
  order: ReadonlyMap<string, number>,
  tree: {
    readonly match: Match;
    readonly rows: readonly PanelRow[];
    readonly groups: readonly (PanelRowGroup & { readonly number: number })[];
    readonly permanent: PanelState;
  }
): PanelState {
  const state: Record<string, unknown> = { ...tree.permanent };
  const put = (group: number, rows: readonly PanelRow[]) =>
    eachPrefixedRow(group, canonicalRows(order, rows), (row, prefix) => {
      for (const [key, value] of Object.entries(row.state)) {
        if (value !== undefined) state[prefix + key] = value;
      }
    });
  put(0, tree.rows);
  for (const group of tree.groups) {
    state[groupKeyOf(group.number)] = group.match;
    put(group.number, group.rows);
  }
  if (tree.match === "any") state[ROOT_MATCH_KEY] = "any";
  return state;
}

/** The groups that hold an active row, numbered 1..n */
const numberedGroups = (tree: PanelTree) =>
  tree.groups
    .filter((group) =>
      group.rows.some((row) => holdsFilter(row.field, row.state))
    )
    .map((group, at) => ({ ...group, number: at + 1 }));

/**
 * The tree as flat state, canonical: rows in the panel table's order within
 * each container, groups without an active row dropped and the rest
 * numbered 1..n, each repeat of a key numbered 2..k
 */
export const stateOf = (kind: ListKind, tree: PanelTree): PanelState =>
  stateOfContainers(orderOf(PANEL_FIELDS[kind]), {
    ...tree,
    groups: numberedGroups(tree),
  });

// ── The URL ───────────────────────────────────────────────────────────────

/**
 * The parameters under a row's prefix (`g1.`, `2.`, `g1.2.`): a codec reads
 * and writes its keys through it unchanged. The empty prefix is the
 * parameters themselves.
 */
export function prefixedParams(params: UrlParams, prefix: string): UrlParams {
  if (prefix === "") return params;
  return {
    get: (name) => params.get(prefix + name),
    has: (name, ...value) => params.has(prefix + name, ...value),
    set: (name, value) => params.set(prefix + name, value),
  };
}

/** A prefixed view that never names the root-only card-count forms */
const withoutSingulars = (
  params: UrlParams,
  singulars: ReadonlySet<string>
): UrlParams => ({
  get: (name) => (singulars.has(name) ? null : params.get(name)),
  has: (name, ...value) =>
    singulars.has(name) ? false : params.has(name, ...value),
  set: (name, value) => params.set(name, value),
});

/**
 * Writes the state's filters to the URL in their canonical form: `match=any`
 * when set, then each group's `gN` and its rows, then the root's rows, each
 * through its codec's `writeUrl` under its prefix. `rows` are the page's
 * rows; the state's other keys are not written.
 */
export function writeTreeUrl(
  _kind: ListKind,
  rows: readonly PanelField[],
  state: PanelState,
  params: URLSearchParams
): void {
  const tree = treeOfParsed(parseState(rows, undefined, state));
  const write = (group: number, groupRows: readonly PanelRow[]) =>
    eachPrefixedRow(group, groupRows, (row, prefix) =>
      codecOf(row.field).writeUrl(
        row.field,
        row.state,
        prefixedParams(params, prefix)
      )
    );
  if (tree.match === "any") params.set(ROOT_MATCH_KEY, "any");
  tree.groups.forEach((group, at) => {
    params.set(groupKeyOf(at + 1), group.match);
    write(at + 1, group.rows);
  });
  write(0, tree.rows);
}

/**
 * The page's filters the URL names, in canonical form. Each distinct valid
 * prefix the parameters carry is read by every row's codec on that prefix's
 * view; the group declarations and `match` are read last. Lenient: an
 * out-of-range prefix (`g6.`, `21.`), a key no row owns or an unknown match
 * (`g1=foo` reads as all) is ignored, never an error. The singular
 * card-count forms (`tagId` with `instance`) are read at the root only.
 */
export function readTreeUrl(
  _kind: ListKind,
  rows: readonly PanelField[],
  params: URLSearchParams
): PanelState {
  const { prefixedUrlKeys, singulars } = indexOf(rows);
  const prefixes = new Set([""]);
  for (const key of params.keys()) {
    const rowKey = parseRowKey(key);
    if (
      rowKey === undefined ||
      (rowKey.group === 0 && rowKey.occurrence === 1) ||
      !prefixedUrlKeys.has(rowKey.key)
    ) {
      continue;
    }
    prefixes.add(rowKeyOf(rowKey.group, rowKey.occurrence, ""));
  }
  const state: Record<string, unknown> = {};
  for (const prefix of prefixes) {
    const view =
      prefix === ""
        ? params
        : withoutSingulars(prefixedParams(params, prefix), singulars);
    for (const field of rows) {
      for (const [key, value] of Object.entries(
        codecOf(field).readUrl(field, view)
      )) {
        state[prefix + key] = value;
      }
    }
  }
  for (const [key, value] of params) {
    if (GROUP_KEY.test(key)) state[key] = matchOf(value);
  }
  if (params.get(ROOT_MATCH_KEY) === "any") state[ROOT_MATCH_KEY] = "any";
  const tree = treeOfParsed(parseState(rows, undefined, state));
  return stateOfContainers(orderOf(rows), {
    ...tree,
    groups: numberedGroups(tree),
  });
}

/**
 * A URL key that holds the list's filters: a row's key or companion (the
 * range forms and the root's card-count form included), the same under a
 * valid prefix, `match` and `g1`..`g5`. Never `savedView` or the page's
 * keys (`tab`, `instance`, `image`).
 */
export function isFilterUrlKey(kind: ListKind, key: string): boolean {
  if (key === ROOT_MATCH_KEY || GROUP_KEY.test(key)) return true;
  const rowKey = parseRowKey(key);
  if (rowKey === undefined) return false;
  const { urlKeys, prefixedUrlKeys } = indexOf(PANEL_FIELDS[kind]);
  return rowKey.group === 0 && rowKey.occurrence === 1
    ? urlKeys.has(rowKey.key)
    : prefixedUrlKeys.has(rowKey.key);
}

// ── The wire ──────────────────────────────────────────────────────────────

/** A criterion's parts the merge rule reads */
interface MergeParts {
  readonly value?: unknown;
  readonly modifier?: unknown;
  readonly depth?: unknown;
  readonly excludes?: unknown;
}

const criterionOf = (
  row: PanelRow,
  spec: FieldSpec
): MergeParts | undefined => {
  const criterion = codecOf(row.field).toCriterion(row.field, spec, row.state);
  return isObject(criterion) ? criterion : undefined;
};

const listOf = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? (value as unknown[]) : [];

/** A row that picks several values: only such a row can hold a union */
const picksSeveral = (field: PanelField): boolean =>
  (field.editor === "ref" || field.editor === "enum") && field.multi === true;

/** The row's merge key under the shared rule (Contract 2), else undefined */
function mergeKeyOf(row: PanelRow, spec: FieldSpec): string | undefined {
  if (!picksSeveral(row.field)) return undefined;
  const criterion = criterionOf(row, spec);
  const values = listOf(criterion?.value);
  if (criterion === undefined || values.length === 0) return undefined;
  return anyMergeKey(row.field.field, spec, {
    valueCount: values.length,
    ...(typeof criterion.modifier === "string"
      ? { modifier: criterion.modifier }
      : {}),
    ...(typeof criterion.depth === "number" ? { depth: criterion.depth } : {}),
    ...(Array.isArray(criterion.excludes)
      ? { excludes: criterion.excludes as unknown[] }
      : {}),
  });
}

/**
 * Two rows of one merge key as one: the first's state with the union of
 * both rows' values under "any of". Undefined when the row cannot send that
 * union as INCLUDES (a condition it lacks, the field's cap passed).
 */
function mergedRow(
  first: PanelRow,
  next: PanelRow,
  spec: FieldSpec
): PanelRow | undefined {
  const { field } = first;
  const merged: PanelRow = {
    field,
    state: {
      ...first.state,
      [field.key]: [
        ...new Set([
          ...valuesOf(first.state[field.key]),
          ...valuesOf(next.state[field.key]),
        ]),
      ],
      ...(field.modifierKey === undefined
        ? {}
        : { [field.modifierKey]: "INCLUDES" }),
    },
  };
  const criterion = criterionOf(merged, spec);
  const sent = listOf(criterion?.value).map(String);
  const wanted = new Set(
    [first, next].flatMap((row) =>
      listOf(criterionOf(row, spec)?.value).map(String)
    )
  );
  const modifier =
    typeof criterion?.modifier === "string"
      ? criterion.modifier
      : spec.kind === "ref" || spec.kind === "playlist" || spec.kind === "enum"
        ? spec.defaultModifier
        : undefined;
  return modifier === "INCLUDES" &&
    sent.length === wanted.size &&
    sent.every((value) => wanted.has(value)) &&
    sent.length <= anyMergeCap(spec)
    ? merged
    : undefined;
}

/**
 * Same-field rows of an "any" container as one row (Contract 2, through
 * each row's `toCriterion`): two rows that each read "any of" their values
 * (INCLUDES, or Has ALL of one value), with no excluded values and the same
 * depth, become one INCLUDES row over the union, in order, at the first
 * one's place. A union over the field's cap stays apart. The caller merges
 * only in an "any" container.
 */
export function mergeAnyRows(
  kind: ListKind,
  rows: readonly PanelRow[]
): PanelRow[] {
  const specs = SPECS[kind];
  const merged: PanelRow[] = [];
  const at = new Map<string, number>();
  for (const row of rows) {
    const spec = specs[row.field.field];
    const key = spec === undefined ? undefined : mergeKeyOf(row, spec);
    const place = key === undefined ? undefined : at.get(key);
    const into = place === undefined ? undefined : merged[place];
    const union =
      spec === undefined || into === undefined
        ? undefined
        : mergedRow(into, row, spec);
    if (place !== undefined && union !== undefined) {
      merged[place] = union;
      continue;
    }
    if (key !== undefined && place === undefined) at.set(key, merged.length);
    merged.push(row);
  }
  return merged;
}

/** A row as a wire leaf named by its table key; undefined when it sends nothing */
function leafOf<K extends ListKind>(
  kind: K,
  row: PanelRow
): WhereLeaf<K> | undefined {
  const spec = SPECS[kind][row.field.field];
  if (spec === undefined) return undefined;
  const criterion = codecOf(row.field).toCriterion(row.field, spec, row.state);
  return criterion === undefined
    ? undefined
    : ({ field: row.field.field, criterion } as WhereLeaf<K>);
}

/**
 * The user's rows as the request's `where` tree: each active row a leaf
 * through its codec's `toCriterion` (named by its table key, a nested-path
 * field included), each group with a row a group, same-field rows of an
 * "any" container merged (`mergeAnyRows`), and each kept leaf back in its
 * container after the rows. Permanent keys are never leaves. Undefined when
 * no rule is left.
 */
export function whereOf<K extends ListKind>(
  kind: K,
  state: PanelState,
  kept: readonly KeptLeaf[] = []
): WhereGroup<K> | undefined {
  const parsed = parseState(PANEL_FIELDS[kind], SPECS[kind], state);
  const numbers = [
    ...new Set([
      ...parsed.containers.keys(),
      ...kept.map((each) => each.group),
    ]),
  ].sort((a, b) => a - b);
  const rulesOf = (number: number, match: Match): WhereNode<K>[] => {
    const rows = parsed.containers.get(number)?.rows ?? [];
    return [
      ...(match === "any" ? mergeAnyRows(kind, rows) : rows).flatMap((row) => {
        const leaf = leafOf(kind, row);
        return leaf === undefined ? [] : [leaf];
      }),
      ...kept
        .filter((each) => each.group === number)
        .map((each) => each.leaf as WhereLeaf<K>),
    ];
  };
  const rules: WhereNode<K>[] = rulesOf(0, parsed.match);
  for (const number of numbers) {
    if (number === 0) continue;
    const match = parsed.containers.get(number)?.match ?? "all";
    const groupRules = rulesOf(number, match);
    if (groupRules.length > 0) rules.push({ match, rules: groupRules });
  }
  return rules.length === 0 ? undefined : { match: parsed.match, rules };
}

/**
 * The request's filter object beside `whereOf`'s tree (FILTERS-12): the
 * state's permanent contract keys (a View that saved a page's criterion)
 * with the page's own criteria (`permanent`, winning on a clash), and the
 * list's default criteria no row of the state decides (Clips' "With
 * preview only", which a Has Preview row in any container replaces, "All
 * clips" included). The user's rows are never here: a page's Tags and the
 * user's Tags row both apply, AND-ed, not merged into one criterion.
 */
export function filterObjectOf<K extends ListKind>(
  kind: K,
  state: PanelState,
  permanent: PanelState = {}
): PanelFilters[K] {
  const parsed = parseState(PANEL_FIELDS[kind], SPECS[kind], state);
  const fixed = { ...parsed.permanent, ...permanent };
  const decided = new Set(
    [...parsed.containers.values()].flatMap((container) =>
      container.rows.map((row) => row.field.field)
    )
  );
  // Built with no row's keys, the filter holds the page's criteria and the
  // rows' defaults only
  return Object.fromEntries(
    Object.entries(buildPanelFilter(kind, fixed)).filter(
      ([field]) => field in fixed || !decided.has(field)
    )
  ) as PanelFilters[K];
}

/** The first row of the leaf's field that reads its criterion, else undefined */
function rowOfLeaf(kind: ListKind, leaf: unknown): PanelRow | undefined {
  if (!isObject(leaf) || typeof leaf.field !== "string") return undefined;
  const spec = SPECS[kind][leaf.field];
  if (spec === undefined) return undefined;
  for (const field of PANEL_FIELDS[kind]) {
    if (field.field !== leaf.field) continue;
    const codec = codecOf(field);
    const state = codec.fromCriterion(field, spec, leaf.criterion);
    if (codec.isActive(field, state)) return { field, state };
  }
  return undefined;
}

/**
 * A stored `where` tree (a carousel's) as flat state, the inverse of
 * `whereOf`: each leaf read by the first row of its field that can, each
 * group numbered in order. A leaf no row can read, or a group nested deeper
 * than the grammar holds, is kept whole with its container's number, so
 * `whereOf(kind, state, kept)` puts it back.
 */
export function stateOfWhere(
  kind: ListKind,
  where: unknown
): { state: PanelState; kept: readonly KeptLeaf[] } {
  if (!isWhereGroup(where)) return { state: {}, kept: [] };
  const kept: KeptLeaf[] = [];
  const read = (group: number, nodes: readonly unknown[]): PanelRow[] =>
    nodes.flatMap((node) => {
      const row = isWhereGroup(node) ? undefined : rowOfLeaf(kind, node);
      if (row === undefined) kept.push({ group, leaf: node });
      return row === undefined ? [] : [row];
    });
  const rootLeaves = where.rules.filter((node) => !isWhereGroup(node));
  const groups = where.rules.filter(isWhereGroup).map((group, at) => ({
    number: at + 1,
    match: matchOf(group.match),
    rows: read(at + 1, group.rules),
  }));
  const rows = read(0, rootLeaves);
  // A leaf kept from the root goes before the groups' (the order whereOf writes)
  kept.sort((a, b) => a.group - b.group);
  return {
    state: stateOfContainers(orderOf(PANEL_FIELDS[kind]), {
      match: matchOf(where.match),
      rows,
      groups,
      permanent: {},
    }),
    kept,
  };
}

// ── Comparing ─────────────────────────────────────────────────────────────

/** A number as an editor writes it and the string the URL reads back */
const sameScalar = (a: unknown, b: unknown): boolean =>
  (typeof a === "number" && typeof b === "string" && String(a) === b) ||
  (typeof b === "number" && typeof a === "string" && String(b) === a);

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b) || sameScalar(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((each, at) => sameValue(each, b[at]))
    );
  }
  if (!isObject(a) || !isObject(b)) return false;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return (
    keys.length ===
      Object.keys(b).filter((key) => b[key] !== undefined).length &&
    keys.every((key) => sameValue(a[key], b[key]))
  );
};

/** The state canonical, each ref row's ids sorted */
function comparable(kind: ListKind, state: unknown): PanelState {
  const canonical = stateOf(
    kind,
    treeOf(kind, normalizePanelState(kind, isObject(state) ? state : {}))
  );
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  const idKeys = new Set(
    rows.flatMap((field) =>
      field.editor === "ref"
        ? [
            field.key,
            ...(field.excludeKey === undefined ? [] : [field.excludeKey]),
          ]
        : []
    )
  );
  return Object.fromEntries(
    Object.entries(canonical).map(([key, value]) => {
      const rowKey = parseRowKey(key);
      return rowKey !== undefined &&
        idKeys.has(rowKey.key) &&
        Array.isArray(value)
        ? [key, [...valuesOf(value)].sort()]
        : [key, value];
    })
  );
}

/**
 * Two states filter the same: compared in canonical form (inactive rows
 * dropped, groups and repeats renumbered), each ref row's ids in any order,
 * a number equal to the string the URL reads back for it
 */
export const filtersEqual = (
  kind: ListKind,
  a: PanelState,
  b: PanelState
): boolean => sameValue(comparable(kind, a), comparable(kind, b));

/** A sort as a View compares it: Random without its seed */
const sortFieldOf = (sort: string): string =>
  /^random_\d+$/.test(sort) ? "random" : sort;

/**
 * The list differs from the View it shows: its filters or its sort, never
 * its view mode, density, page size or columns (owner W-Q2). A stored View
 * is read leniently: filters not an object read as none, a View without a
 * sort or a direction names none to differ from, a lower-case direction is
 * its upper case.
 */
export function viewModified(
  kind: ListKind,
  view: Pick<FilterPreset, "filters" | "sort" | "direction">,
  current: { filters: PanelState; sort: string; direction: string }
): boolean {
  if (
    !filtersEqual(
      kind,
      isObject(view.filters) ? view.filters : {},
      current.filters
    )
  ) {
    return true;
  }
  if (
    typeof view.sort === "string" &&
    view.sort !== "" &&
    sortFieldOf(view.sort) !== sortFieldOf(current.sort)
  ) {
    return true;
  }
  const direction =
    typeof view.direction === "string" ? view.direction.toUpperCase() : "";
  return (
    (direction === "ASC" || direction === "DESC") &&
    direction !== current.direction.toUpperCase()
  );
}
