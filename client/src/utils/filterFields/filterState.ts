/**
 * The flat row operations behind the chip bar and every other surface that
 * edits one row at a time (Contract 11): read, replace and remove a row's
 * keys in the flat prefixed state (Contract 3: `g1.2.tagIds` is the second
 * Tags row of group 1), remove a group, clear the filters, and tell whether
 * a row filters or two row states are the same.
 *
 * A row's keys are its panel key and its companions (`tagIdsModifier`), so
 * every operation moves them together. Imports only relative modules and
 * `@peek/shared-types` (see `options.ts`).
 */
import {
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  type RowKey,
  groupKeyOf,
  parseRowKey,
  rowKeyOf,
} from "@peek/shared-types";
import { normalizePanelState } from "./build";
import { type PanelState, codecOf, valuesOf } from "./codecs";
import { stateOf, treeOf } from "./tree";

const GROUP_DECLARATION = /^g([1-5])$/;

const fieldOf = (kind: ListKind, key: string): PanelField | undefined =>
  PANEL_FIELDS[kind].find((row) => row.key === key);

/** The row's own keys, as the state names them under its prefix */
const prefixedKeysOf = (field: PanelField, at: RowKey): string[] =>
  codecOf(field)
    .keys(field)
    .map((key) => rowKeyOf(at.group, at.occurrence, key));

/** A row's own keys, unprefixed: what a row editor reads and writes */
export function rowState(
  kind: ListKind,
  state: PanelState,
  at: RowKey
): PanelState {
  const field = fieldOf(kind, at.key);
  if (field === undefined) return {};
  const found: Record<string, unknown> = {};
  for (const key of codecOf(field).keys(field)) {
    const value = state[rowKeyOf(at.group, at.occurrence, key)];
    if (value !== undefined) found[key] = value;
  }
  return found;
}

/**
 * The state with one row's keys replaced by `next` (its own keys,
 * unprefixed). A missing row is added; every other key stays as it is.
 */
export function setRow(
  kind: ListKind,
  state: PanelState,
  at: RowKey,
  next: PanelState
): PanelState {
  const field = fieldOf(kind, at.key);
  const owned = new Set(field === undefined ? [] : prefixedKeysOf(field, at));
  const prefix = rowKeyOf(at.group, at.occurrence, "");
  const rest = Object.entries(state).filter(([key]) => !owned.has(key));
  const added = Object.entries(next).filter(([, value]) => value !== undefined);
  return Object.fromEntries([
    ...rest,
    ...added.map(([key, value]) => [prefix + key, value] as const),
  ]);
}

/**
 * The state without that row, canonical: the key's later rows in its
 * container move up (`2.tagIds` becomes `tagIds`) and a group left with no
 * row goes.
 */
export function removeRow(
  kind: ListKind,
  state: PanelState,
  at: RowKey
): PanelState {
  return stateOf(kind, treeOf(kind, setRow(kind, state, at, {})));
}

/** The state without group `group` (its `gN` and every `gN.` key); later groups move up one */
export function removeGroup(
  _kind: ListKind,
  state: PanelState,
  group: number
): PanelState {
  const shifted = (number: number) => (number > group ? number - 1 : number);
  const entries: (readonly [string, unknown])[] = [];
  for (const [key, value] of Object.entries(state)) {
    const declared = GROUP_DECLARATION.exec(key);
    if (declared !== null) {
      const number = Number(declared[1]);
      if (number === group) continue;
      entries.push([groupKeyOf(shifted(number)), value]);
      continue;
    }
    const row = parseRowKey(key);
    if (row === undefined || row.group === 0) {
      entries.push([key, value]);
      continue;
    }
    if (row.group === group) continue;
    entries.push([
      rowKeyOf(shifted(row.group), row.occurrence, row.key),
      value,
    ]);
  }
  return Object.fromEntries(entries);
}

/** The state with every row and group gone: only a page's permanent keys stay */
export const clearFilters = (kind: ListKind, state: PanelState): PanelState =>
  treeOf(kind, state).permanent;

/** Whether the row, given its own keys, filters: the row codec's `isActive` */
export const isRowActive = (field: PanelField, state: PanelState): boolean =>
  codecOf(field).isActive(field, state);

/** A value in a form two equal states share: object keys sorted, undefined dropped */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, each]) => each !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, each]) => [key, canonical(each)] as const)
  );
}

/** Whether two states of one row are the same once each value is normalized */
export const sameRowState = (
  kind: ListKind,
  a: PanelState,
  b: PanelState
): boolean =>
  JSON.stringify(canonical(normalizePanelState(kind, a))) ===
  JSON.stringify(canonical(normalizePanelState(kind, b)));

/**
 * The state with one entity picked on a ref field's first root row
 * (`{ group: 0, occurrence: 1, key }`): the id joins the row's values (once),
 * leaves its exclusions (picking an excluded value includes it), and the
 * row's condition stays as it is, but for a presence choice ("Has none",
 * "Has any"), which ids cannot sit beside. A single row's value is replaced;
 * a row that is not there is added. `id` is the entity's `"id:instanceId"`.
 */
export function withRefValue(
  kind: ListKind,
  state: PanelState,
  key: string,
  id: string
): PanelState {
  const field = fieldOf(kind, key);
  if (field === undefined || field.editor !== "ref") return state;
  const at: RowKey = { group: 0, occurrence: 1, key };
  const row = rowState(kind, state, at);

  const values = valuesOf(row[key]);
  const picked = field.multi
    ? values.includes(id)
      ? values
      : [...values, id]
    : id;
  // The id leaves the row's exclusions; the last one going drops the key
  const excluded =
    field.excludeKey === undefined
      ? []
      : valuesOf(row[field.excludeKey]).filter((each) => each !== id);
  // A presence choice gives way to the value
  const presence =
    field.modifierKey !== undefined &&
    (row[field.modifierKey] === "IS_NULL" ||
      row[field.modifierKey] === "NOT_NULL");

  const next = Object.fromEntries(
    Object.entries(row).filter(
      ([each]) =>
        each !== field.excludeKey && !(presence && each === field.modifierKey)
    )
  );
  return setRow(kind, state, at, {
    ...next,
    [key]: picked,
    ...(field.excludeKey !== undefined && excluded.length > 0
      ? { [field.excludeKey]: excluded }
      : {}),
  });
}
