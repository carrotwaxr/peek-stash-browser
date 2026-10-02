/**
 * The panel's state to a list's request filter, from the field table: each
 * row's codec builds its criterion, then a page's permanent criteria (a
 * performer page's `performers`, the folder view's `tag_count`, the
 * timeline's `date`) apply over them. A new panel filter is a row in
 * `shared/types/filters/panel/`; nothing here names a field.
 *
 * Imports only relative modules and `@peek/shared-types` (see `options.ts`).
 */
import {
  type FieldSpec,
  type GalleryFilterInput,
  type GroupFilterInput,
  type ImageFilterInput,
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  type PerformerFilterInput,
  type RefField,
  type SceneFilterInput,
  type StudioFilterInput,
  type TagFilterInput,
} from "@peek/shared-types";
import type { ClipFilterParams } from "../../api/clips";
import {
  CODECS,
  type PanelState,
  type RefCriterion,
  codecOf,
  refCriterionOf,
} from "./codecs";
import { SPECS } from "./options";

/** Each list's request filter (clips: the GET parameters) */
export interface PanelFilters {
  scene: SceneFilterInput;
  performer: PerformerFilterInput;
  studio: StudioFilterInput;
  tag: TagFilterInput;
  group: GroupFilterInput;
  gallery: GalleryFilterInput;
  image: ImageFilterInput;
  clip: ClipFilterParams;
}

/** A list's rows and the contract fields they fill */
export interface PanelTable {
  readonly rows: readonly PanelField[];
  readonly specs: Readonly<Record<string, FieldSpec>>;
}

/** A list's whole panel table */
export const panelTableOf = (kind: ListKind): PanelTable => ({
  rows: PANEL_FIELDS[kind],
  specs: SPECS[kind],
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A permanent date range given as the panel holds one, `{ start, end }` */
const isPanelDateRange = (value: unknown): boolean =>
  isObject(value) && !("modifier" in value);

/**
 * A page's permanent criterion of a field: a ref merges with the panel's
 * picks of that field; a date range in panel shape goes through the date
 * codec; anything else is sent as it is and wins over the panel's
 */
function permanentCriterion(
  name: string,
  spec: FieldSpec,
  permanent: unknown,
  table: PanelTable,
  state: PanelState
): unknown {
  if (spec.kind === "ref") {
    const row = table.rows.find(
      (each): each is RefField => each.editor === "ref" && each.field === name
    );
    return refCriterionOf(spec, row, state, permanent);
  }
  if (spec.kind === "date" && isPanelDateRange(permanent)) {
    return CODECS.date.toCriterion(
      { key: name, field: name, label: name, group: "dates", editor: "date" },
      spec,
      { [name]: permanent }
    );
  }
  return permanent;
}

/**
 * A list's request filter from the panel's state: each row's criterion,
 * then the state's contract fields that are no panel key (a page's
 * permanent criteria). A field with a `path` nests there
 * (`scenes_filter.groups`); clips flatten into their GET parameters (a
 * list and its `<param>Modifier`, a single ref's one id).
 */
export function buildPanelFilter<K extends ListKind>(
  kind: K,
  state: PanelState,
  table: PanelTable = panelTableOf(kind)
): PanelFilters[K] {
  const specs = new Map(Object.entries(table.specs));
  const filter: Record<string, unknown> = {};

  const place = (name: string, spec: FieldSpec, criterion: unknown) => {
    if (criterion === undefined) return;
    if (spec.kind === "ref" && kind === "clip") {
      const { value, modifier } = criterion as RefCriterion;
      filter[name] = spec.single ? value[0] : value;
      if (spec.modifiers.length > 1) filter[`${name}Modifier`] = modifier;
      return;
    }
    if (spec.kind === "ref" && spec.path !== undefined) {
      const [outer, inner] = spec.path;
      const nested = filter[outer];
      filter[outer] = {
        ...(isObject(nested) ? nested : {}),
        [inner]: criterion,
      };
      return;
    }
    filter[name] = criterion;
  };

  for (const row of table.rows) {
    const spec = specs.get(row.field);
    if (spec === undefined) {
      throw new Error(`${kind} panel row ${row.key}: no field ${row.field}`);
    }
    place(row.field, spec, codecOf(row).toCriterion(row, spec, state));
  }

  const panelKeys = new Set(
    table.rows.flatMap((row) => codecOf(row).keys(row))
  );
  for (const [name, permanent] of Object.entries(state)) {
    const spec = specs.get(name);
    if (spec === undefined || panelKeys.has(name) || permanent === undefined) {
      continue;
    }
    place(name, spec, permanentCriterion(name, spec, permanent, table, state));
  }

  return filter as PanelFilters[K];
}

/** A stored request filter as panel state, and what no row could read */
export interface ReadPanelFilter {
  readonly state: PanelState;
  /** Each stored criterion no row edits, as stored */
  readonly kept: Readonly<Record<string, unknown>>;
}

/**
 * A stored request filter (a carousel's rules) read back into the panel's
 * state, the inverse of `buildPanelFilter`: each row's codec reads its
 * field's criterion (`fromCriterion`; a field with a `path` from where it
 * nests). Every criterion no row reads, or a row cannot edit (a modifier
 * it does not offer, a key it does not know), is kept as stored, so
 * building the state again and merging `kept` under it loses nothing.
 * Clips' flat GET parameters are not read.
 */
export function readPanelFilter(
  kind: Exclude<ListKind, "clip">,
  filter: unknown,
  table: PanelTable = panelTableOf(kind)
): ReadPanelFilter {
  if (!isObject(filter)) return { state: {}, kept: {} };
  const state: Record<string, unknown> = {};
  /** The top-level criteria read, and the nested ones by their outer key */
  const read = new Set<string>();
  const readNested = new Map<string, Set<string>>();

  for (const row of table.rows) {
    const spec = table.specs[row.field];
    if (spec === undefined) {
      throw new Error(`${kind} panel row ${row.key}: no field ${row.field}`);
    }
    const path = spec.kind === "ref" ? spec.path : undefined;
    const outer = path?.[0] ?? row.field;
    const holder = path === undefined ? filter : filter[outer];
    const name = path?.[1] ?? row.field;
    const done = path === undefined ? read : readNested.get(outer);
    if (!isObject(holder) || !(name in holder) || done?.has(name)) continue;

    const codec = codecOf(row);
    const rowState = codec.fromCriterion(row, spec, holder[name]);
    if (!codec.isActive(row, rowState)) continue;
    Object.assign(state, rowState);
    if (path === undefined) read.add(name);
    else readNested.set(outer, new Set([...(done ?? []), name]));
  }

  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    const nested = readNested.get(key);
    if (read.has(key)) continue;
    if (nested === undefined || !isObject(value)) {
      kept[key] = value;
      continue;
    }
    const rest = Object.entries(value).filter(([inner]) => !nested.has(inner));
    if (rest.length > 0) kept[key] = Object.fromEntries(rest);
  }
  return { state, kept };
}

/**
 * A list's state as its rows read it: each row's value normalized (a body
 * measure read leniently, the old feet-and-inches height as centimetres; a
 * value left with nothing is dropped). A default preset becomes state
 * without going through the URL, so the list reads it through this. Returns
 * the same object when nothing changes.
 */
export function normalizePanelState(
  kind: ListKind,
  state: PanelState
): PanelState {
  let next: Record<string, unknown> | undefined;
  for (const row of PANEL_FIELDS[kind]) {
    if (!(row.key in state)) continue;
    const value = state[row.key];
    const normalized = codecOf(row).normalize(row, value);
    if (normalized === value) continue;
    next ??= { ...state };
    next[row.key] = normalized;
  }
  return next === undefined
    ? state
    : Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== undefined)
      );
}
