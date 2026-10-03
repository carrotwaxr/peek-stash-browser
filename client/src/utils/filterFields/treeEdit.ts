/**
 * The editing tree the row editor works on (Contract 12): W9's `PanelTree`
 * with an id on every row and group, the user's order kept while the editor
 * is open, and (in carousels) the stored leaves no row can read, as kept rows
 * in their container. Only the Advanced view and the carousel builder use it;
 * they convert at their edges (`editTreeOf`, `panelTreeOf`, then `stateOf`).
 *
 * Same-field rows of an "any" container merge as the wire merges them: the
 * merge is W9's `mergeAnyRows` (the shared rule, `anyMergeKey`), and this
 * module only tracks which rows' ids it joined. The limits are
 * `WHERE_LIMITS`, counted after the merge, as the server counts them.
 *
 * Pure functions; imports only relative modules and `@peek/shared-types`
 * (see `options.ts`).
 */
import {
  type ListKind,
  type Match,
  PANEL_FIELDS,
  type PanelField,
  WHERE_LIMITS,
} from "@peek/shared-types";
import { type PanelState, codecOf } from "./codecs";
import { filterOptionsOf } from "./options";
import {
  type KeptLeaf,
  type PanelRow,
  type PanelRowGroup,
  type PanelTree,
  filtersEqual,
  mergeAnyRows,
  stateOf,
} from "./tree";

/** An editable row: its panel field, its own keys and an id */
export interface EditRow extends PanelRow {
  readonly id: string;
  readonly kind: "row";
}
/** A stored leaf no row can read: shown read-only, removable */
export interface KeptRow {
  readonly id: string;
  readonly kind: "kept";
  readonly leaf: unknown;
}
export type EditItem = EditRow | KeptRow;
export interface EditGroup {
  readonly id: string;
  readonly match: Match;
  readonly rows: readonly EditItem[];
}
export interface EditTree {
  readonly match: Match;
  readonly rows: readonly EditItem[];
  readonly groups: readonly EditGroup[];
  readonly permanent: PanelState;
}
/** `"root"` or a group's id */
export type ContainerId = string;

/** Rows of one container that will merge into one (A4's hint) */
export interface MergeNote {
  readonly containerId: ContainerId;
  /** The rows' panel key */
  readonly key: string;
  /** The rows' ids, the one that stays first */
  readonly rowIds: readonly string[];
}

const ROOT: ContainerId = "root";

// Ids as the carousel builder's rules had them: a module counter
let rowCounter = 0;
let groupCounter = 0;
const newRowId = () => `row-${++rowCounter}`;
const newGroupId = () => `group-${++groupCounter}`;

const isRow = (item: EditItem): item is EditRow => item.kind === "row";
const isKept = (item: EditItem): item is KeptRow => item.kind === "kept";

const editRowOf = (row: PanelRow, id = newRowId()): EditRow => ({
  id,
  kind: "row",
  field: row.field,
  state: row.state,
});

/**
 * A row that filters: its codec's `isActive`, or a choice other than its
 * default (Clips' "All clips"), as `tree.ts` keeps rows (`holdsFilter`)
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

const fieldOf = (kind: ListKind, key: string): PanelField | undefined =>
  (PANEL_FIELDS[kind] as readonly PanelField[]).find((row) => row.key === key);

const defaults = new Map<ListKind, ReadonlyMap<string, PanelState>>();

/** A new row's state: its default modifier where its editor offers a choice */
function defaultStateOf(kind: ListKind, key: string): PanelState {
  let byKey = defaults.get(kind);
  if (byKey === undefined) {
    byKey = new Map(
      filterOptionsOf(kind).flatMap((option) =>
        option.modifierKey === undefined || option.defaultModifier === undefined
          ? []
          : [[option.key, { [option.modifierKey]: option.defaultModifier }]]
      )
    );
    defaults.set(kind, byKey);
  }
  return byKey.get(key) ?? {};
}

// ── Building and reading ─────────────────────────────────────────────────

/**
 * The panel tree as an editing tree: an id on every row and group, and each
 * kept leaf after the rows of its container (0 the root, n the tree's nth
 * group; a number past the tree's groups gets a group of its own)
 */
export function editTreeOf(
  _kind: ListKind,
  tree: PanelTree,
  kept: readonly KeptLeaf[] = []
): EditTree {
  const keptIn = (group: number): KeptRow[] =>
    kept
      .filter((each) => each.group === group)
      .map((each) => ({ id: newRowId(), kind: "kept", leaf: each.leaf }));
  const groups: EditGroup[] = tree.groups.map((group, at) => ({
    id: newGroupId(),
    match: group.match,
    rows: [...group.rows.map((row) => editRowOf(row)), ...keptIn(at + 1)],
  }));
  const beyond = [
    ...new Set(
      kept
        .map((each) => each.group)
        .filter((group) => group > tree.groups.length)
    ),
  ].sort((a, b) => a - b);
  for (const group of beyond) {
    groups.push({ id: newGroupId(), match: "all", rows: keptIn(group) });
  }
  return {
    match: tree.match,
    rows: [...tree.rows.map((row) => editRowOf(row)), ...keptIn(0)],
    groups,
    permanent: tree.permanent,
  };
}

const panelRowsOf = (items: readonly EditItem[]): PanelRow[] =>
  items.filter(isRow).map(({ field, state }) => ({ field, state }));

/**
 * The editing tree as a panel tree and its kept leaves, numbered as
 * `stateOf` numbers the groups: those holding a row that filters 1..n in
 * order, then the groups with only kept leaves, so
 * `whereOf(kind, stateOf(kind, tree), kept)` puts each back in its group.
 * A group with no editable row is not in the tree.
 */
export function panelTreeOf(edit: EditTree): {
  tree: PanelTree;
  kept: readonly KeptLeaf[];
} {
  const filtering = edit.groups.filter((group) =>
    group.rows.some(
      (item) => isRow(item) && holdsFilter(item.field, item.state)
    )
  );
  const rest = edit.groups.filter((group) => !filtering.includes(group));
  const kept: KeptLeaf[] = [
    ...edit.rows.filter(isKept).map((row) => ({ group: 0, leaf: row.leaf })),
    ...[...filtering, ...rest].flatMap((group, at) =>
      group.rows
        .filter(isKept)
        .map((row) => ({ group: at + 1, leaf: row.leaf }))
    ),
  ];
  const groups: PanelRowGroup[] = edit.groups
    .filter((group) => group.rows.some(isRow))
    .map((group) => ({ match: group.match, rows: panelRowsOf(group.rows) }));
  return {
    tree: {
      match: edit.match,
      rows: panelRowsOf(edit.rows),
      groups,
      permanent: edit.permanent,
    },
    kept,
  };
}

// ── Operations ───────────────────────────────────────────────────────────

/** The tree with one container's items changed; unchanged for an unknown id */
function withItems(
  tree: EditTree,
  at: ContainerId,
  change: (items: readonly EditItem[]) => readonly EditItem[]
): EditTree {
  if (at === ROOT) return { ...tree, rows: change(tree.rows) };
  if (!tree.groups.some((group) => group.id === at)) return tree;
  return {
    ...tree,
    groups: tree.groups.map((group) =>
      group.id === at ? { ...group, rows: change(group.rows) } : group
    ),
  };
}

/** The container holding the item, else undefined */
function containerOf(tree: EditTree, id: string): ContainerId | undefined {
  if (tree.rows.some((item) => item.id === id)) return ROOT;
  return tree.groups.find((group) => group.rows.some((item) => item.id === id))
    ?.id;
}

/** The tree with one item replaced wherever it is */
function withItem(
  tree: EditTree,
  id: string,
  change: (item: EditItem) => EditItem
): EditTree {
  const at = containerOf(tree, id);
  return at === undefined
    ? tree
    : withItems(tree, at, (items) =>
        items.map((item) => (item.id === id ? change(item) : item))
      );
}

/** Appends an empty row of the field `key` (its default modifier) to a container */
export function addRow(
  tree: EditTree,
  at: ContainerId,
  key: string,
  kind: ListKind
): EditTree {
  const field = fieldOf(kind, key);
  if (field === undefined) return tree;
  const row = editRowOf({ field, state: defaultStateOf(kind, key) });
  return withItems(tree, at, (items) => [...items, row]);
}

/**
 * Gives the row (a kept one included) the field `key` and that field's
 * default state; it keeps its id and place
 */
export function setRowField(
  tree: EditTree,
  rowId: string,
  key: string,
  kind: ListKind
): EditTree {
  const field = fieldOf(kind, key);
  if (field === undefined) return tree;
  return withItem(tree, rowId, () =>
    editRowOf({ field, state: defaultStateOf(kind, key) }, rowId)
  );
}

/** Replaces an editable row's state */
export function updateRow(
  tree: EditTree,
  rowId: string,
  state: PanelState
): EditTree {
  return withItem(tree, rowId, (item) =>
    isRow(item) ? { ...item, state } : item
  );
}

/** Removes a row or kept row wherever it is */
export function removeRow(tree: EditTree, rowId: string): EditTree {
  const at = containerOf(tree, rowId);
  return at === undefined
    ? tree
    : withItems(tree, at, (items) => items.filter((item) => item.id !== rowId));
}

/** Moves a row to the end of another container, with its id and state */
export function moveRow(
  tree: EditTree,
  rowId: string,
  to: ContainerId
): EditTree {
  const from = containerOf(tree, rowId);
  if (from === undefined || from === to) return tree;
  if (to !== ROOT && !tree.groups.some((group) => group.id === to)) return tree;
  const item = [
    ...tree.rows,
    ...tree.groups.flatMap((group) => group.rows),
  ].find((each) => each.id === rowId);
  if (item === undefined) return tree;
  return withItems(removeRow(tree, rowId), to, (items) => [...items, item]);
}

/** Adds an empty "all" group at the root; unchanged at the group limit */
export function addGroup(tree: EditTree): EditTree {
  if (!canAddGroup(tree)) return tree;
  return {
    ...tree,
    groups: [...tree.groups, { id: newGroupId(), match: "all", rows: [] }],
  };
}

/** Removes a group with its rows */
export function removeGroup(tree: EditTree, groupId: string): EditTree {
  return {
    ...tree,
    groups: tree.groups.filter((group) => group.id !== groupId),
  };
}

/** Sets the root's or a group's match */
export function setMatch(
  tree: EditTree,
  at: ContainerId,
  match: Match
): EditTree {
  if (at === ROOT) return { ...tree, match };
  return {
    ...tree,
    groups: tree.groups.map((group) =>
      group.id === at ? { ...group, match } : group
    ),
  };
}

// ── The merge ────────────────────────────────────────────────────────────

/** A container's rows that filter, in the panel table's order (repeats keep theirs) */
function canonicalRows(kind: ListKind, items: readonly EditItem[]): EditRow[] {
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  const placeOf = (row: EditRow) => {
    const place = rows.findIndex((field) => field.key === row.field.key);
    return place === -1 ? Number.MAX_SAFE_INTEGER : place;
  };
  return items
    .filter(isRow)
    .filter((row) => holdsFilter(row.field, row.state))
    .map((row, at) => ({ row, at }))
    .sort((a, b) => placeOf(a.row) - placeOf(b.row) || a.at - b.at)
    .map(({ row }) => row);
}

interface Merged {
  readonly row: EditRow;
  /** The ids of the rows it holds, the first row's first */
  readonly ids: readonly string[];
}

/**
 * The rows of an "any" container after W9's `mergeAnyRows`, each with the
 * ids it holds and the first one's id. `mergeAnyRows` reads rows in order,
 * so a row merged exactly when it adds no row to the merge of the rows up
 * to it, and it merged into the first earlier row it merges with alone.
 */
function mergeWithIds(kind: ListKind, rows: readonly EditRow[]): Merged[] {
  const result = mergeAnyRows(kind, rows);
  if (result.length === rows.length) {
    return rows.map((row) => ({ row, ids: [row.id] }));
  }
  const firsts: EditRow[] = [];
  const joined = new Map<string, string[]>();
  let count = 0;
  rows.forEach((row, at) => {
    const length = mergeAnyRows(kind, rows.slice(0, at + 1)).length;
    if (length > count) {
      count = length;
      firsts.push(row);
      joined.set(row.id, [row.id]);
      return;
    }
    const into =
      firsts.find((first) => mergeAnyRows(kind, [first, row]).length === 1) ??
      [...firsts].reverse().find((first) => first.field.key === row.field.key);
    if (into !== undefined) joined.get(into.id)?.push(row.id);
  });
  return result.map((merged, at) => {
    const first = firsts[at];
    if (first === undefined) return { row: editRowOf(merged), ids: [] };
    return {
      row: { ...first, field: merged.field, state: merged.state },
      ids: joined.get(first.id) ?? [first.id],
    };
  });
}

/** A container as the wire sends it: rows that filter, canonical, merged under any, kept rows after */
function normalizedItems(
  kind: ListKind,
  match: Match,
  items: readonly EditItem[]
): EditItem[] {
  const rows = canonicalRows(kind, items);
  return [
    ...(match === "any"
      ? mergeWithIds(kind, rows).map((merged) => merged.row)
      : rows),
    ...items.filter(isKept),
  ];
}

/**
 * The tree as Apply sends it: rows that do not filter and groups left empty
 * dropped, rows in the panel table's order in every container (as `stateOf`
 * writes them), same-field rows of an "any" container merged by
 * `mergeAnyRows` (the first row's id stays), kept rows after the rows
 */
export function normalizeEditTree(tree: EditTree, kind: ListKind): EditTree {
  return {
    ...tree,
    rows: normalizedItems(kind, tree.match, tree.rows),
    groups: tree.groups
      .map((group) => ({
        ...group,
        rows: normalizedItems(kind, group.match, group.rows),
      }))
      .filter((group) => group.rows.length > 0),
  };
}

/** The rows that will merge, per "any" container (root first), for A4's hint */
export function mergeNotes(
  tree: EditTree,
  kind: ListKind
): readonly MergeNote[] {
  const containers = [
    { id: ROOT, match: tree.match, rows: tree.rows },
    ...tree.groups,
  ];
  return containers
    .filter((container) => container.match === "any")
    .flatMap((container) =>
      mergeWithIds(kind, canonicalRows(kind, container.rows))
        .filter((merged) => merged.ids.length > 1)
        .map((merged) => ({
          containerId: container.id,
          key: merged.row.field.key,
          rowIds: merged.ids,
        }))
    );
}

// ── Counts and limits ────────────────────────────────────────────────────

/** Rows as the server counts them: filtering rows after the merge, plus kept rows */
export function countRows(tree: EditTree, kind: ListKind): number {
  const normalized = normalizeEditTree(tree, kind);
  return (
    normalized.rows.length +
    normalized.groups.reduce((sum, group) => sum + group.rows.length, 0)
  );
}

/** The groups the editor holds, empty ones included */
export const countGroups = (tree: EditTree): number => tree.groups.length;

/** Another row would fit under `WHERE_LIMITS.rows` */
export const canAddRow = (tree: EditTree, kind: ListKind): boolean =>
  countRows(tree, kind) < WHERE_LIMITS.rows;

/**
 * Another group would fit under `WHERE_LIMITS.groups`; never inside a group
 * (one level of groups)
 */
export const canAddGroup = (tree: EditTree, at: ContainerId = ROOT): boolean =>
  at === ROOT && countGroups(tree) < WHERE_LIMITS.groups;

// ── Comparing ────────────────────────────────────────────────────────────

/**
 * Two editing trees filter the same: their states compared by `filtersEqual`
 * (canonical, ids ignored) and their kept leaves alike
 */
export function editTreesEqual(
  a: EditTree,
  b: EditTree,
  kind: ListKind
): boolean {
  const left = panelTreeOf(a);
  const right = panelTreeOf(b);
  return (
    filtersEqual(kind, stateOf(kind, left.tree), stateOf(kind, right.tree)) &&
    JSON.stringify(left.kept) === JSON.stringify(right.kept)
  );
}
