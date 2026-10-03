/**
 * Pins (Contract 5): the fields and one-tap filters a user keeps on a
 * list's chip bar, per list kind, at most `PIN_LIMIT` together. A pinned
 * field waits in the bar as an empty chip; a pinned filter is a field with
 * a value, toggled with one tap. A pinned filter acts on its key's first
 * root row: it is on while that row equals it, turning it on replaces the
 * row, turning it off removes it.
 *
 * Pure: the bar reads the stored pins through `useFilterPins` and saves
 * through `useSetPins`. Imports only relative modules and
 * `@peek/shared-types` (see `options.ts`).
 */
import {
  type ListKind,
  type ListPins,
  PANEL_FIELDS,
  PIN_LIMIT,
  type PanelField,
  type PinnedFilter,
  type RowKey,
  defaultPinsOf,
} from "@peek/shared-types";
import { newClientToken } from "../clientToken";
import { parseCompositeKey } from "../compositeKey";
import { normalizePanelState } from "./build";
import { type PanelState, codecOf } from "./codecs";
import {
  isRowActive,
  removeRow,
  rowState,
  sameRowState,
  setRow,
} from "./filterState";
import type { FilterOption } from "./options";

/** The row a pinned filter of `key` acts on */
const firstRootRow = (key: string): RowKey => ({
  group: 0,
  occurrence: 1,
  key,
});

/** The list's row for a key, when it may be pinned */
function pinnableRow(kind: ListKind, key: string): PanelField | undefined {
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  const row = rows.find((each) => each.key === key);
  return row === undefined || row.pinnable === false ? undefined : row;
}

/** Whether the list has the field and it may be pinned */
export const isPinnable = (kind: ListKind, key: string): boolean =>
  pinnableRow(kind, key) !== undefined;

/**
 * A list's pins: what the user stored, or the list's defaults when they
 * stored none. A pin on a key the list no longer has, or may not pin, is
 * left out.
 */
export function pinsOf(kind: ListKind, stored: ListPins | undefined): ListPins {
  const pins = stored ?? defaultPinsOf(kind);
  const known = (key: string) => pinnableRow(kind, key) !== undefined;
  if (pins.fields.every(known) && pins.filters.every((pin) => known(pin.key))) {
    return pins;
  }
  return {
    fields: pins.fields.filter(known),
    filters: pins.filters.filter((pin) => known(pin.key)),
  };
}

/**
 * The pins the bar draws: those on a field the list offers here. A field
 * the view fixes (the timeline's date, the folder's tags) is not offered,
 * nor is a key the list no longer has; the page's own locks are offered
 * (their rows are AND-ed with the page's criterion).
 */
export function visiblePins(
  kind: ListKind,
  pins: ListPins,
  options: readonly FilterOption[]
): ListPins {
  const offered = new Set(
    options
      .filter((option) => option.type !== "section-header")
      .map((option) => option.key)
  );
  const shown = (key: string) =>
    offered.has(key) && pinnableRow(kind, key) !== undefined;
  return {
    fields: pins.fields.filter(shown),
    filters: pins.filters.filter((pin) => shown(pin.key)),
  };
}

/** Whether the pins hold as many as a list keeps */
export const atCap = (pins: ListPins): boolean =>
  pins.fields.length + pins.filters.length >= PIN_LIMIT;

/** Whether the root's first row of the pin's key is the pin's value */
export function isPinnedFilterOn(
  kind: ListKind,
  root: PanelState,
  pin: PinnedFilter
): boolean {
  const row = rowState(kind, root, firstRootRow(pin.key));
  return Object.keys(row).length > 0 && sameRowState(kind, row, pin.state);
}

/**
 * The filters with the pinned filter turned over: on replaces its key's
 * first root row with the pin's value, off removes that row.
 */
export function togglePinnedFilter(
  kind: ListKind,
  root: PanelState,
  pin: PinnedFilter
): PanelState {
  const at = firstRootRow(pin.key);
  return isPinnedFilterOn(kind, root, pin)
    ? removeRow(kind, root, at)
    : setRow(kind, root, at, normalizePanelState(kind, pin.state));
}

/** The pins with a field pinned; undefined when refused (at the cap, or not a pinnable field) */
export function pinField(
  kind: ListKind,
  pins: ListPins,
  key: string
): ListPins | undefined {
  if (pinnableRow(kind, key) === undefined) return undefined;
  if (pins.fields.includes(key)) return pins;
  if (atCap(pins)) return undefined;
  return { ...pins, fields: [...pins.fields, key] };
}

/** The pins without that field; the last one going leaves empty lists, not the defaults */
export const unpinField = (pins: ListPins, key: string): ListPins => ({
  ...pins,
  fields: pins.fields.filter((each) => each !== key),
});

/**
 * A row's state as a pinned filter holds it: its key and companions only,
 * normalized (the list's measures are metric already), and ref ids that
 * name their instance (`id:instanceId`; a bare id is left out, since it
 * would match the id on every server). Undefined when nothing is left to
 * filter by.
 */
function pinStateOf(
  kind: ListKind,
  row: PanelField,
  state: PanelState
): PanelState | undefined {
  const own = Object.fromEntries(
    codecOf(row)
      .keys(row)
      .flatMap((key) => {
        const value = state[key];
        return value === undefined ? [] : [[key, value] as const];
      })
  );
  const refKeys = new Set(
    row.editor === "ref" && row.source !== "playlists"
      ? [row.key, row.excludeKey]
      : []
  );
  const named = (id: unknown) =>
    typeof id === "string" && parseCompositeKey(id).instanceId !== undefined;
  // A ref key keeps the ids that name their instance, and goes without one
  const normalized = Object.fromEntries(
    Object.entries(normalizePanelState(kind, own)).flatMap(([key, value]) => {
      if (!refKeys.has(key)) return [[key, value] as const];
      if (!Array.isArray(value)) return named(value) ? [[key, value]] : [];
      const kept = value.filter(named);
      return kept.length > 0 ? [[key, kept] as const] : [];
    })
  );
  return isRowActive(row, normalized) ? normalized : undefined;
}

/** The pinned filter of `key` whose value is the row's, if one is pinned */
export function pinnedFilterOf(
  kind: ListKind,
  pins: ListPins,
  state: PanelState,
  key: string
): PinnedFilter | undefined {
  const row = pinnableRow(kind, key);
  const value = row === undefined ? undefined : pinStateOf(kind, row, state);
  if (value === undefined) return undefined;
  return pins.filters.find(
    (pin) => pin.key === key && sameRowState(kind, pin.state, value)
  );
}

/**
 * The pins with a row's value pinned as a one-tap filter ("Pin as quick
 * filter"). `state` is the row's own keys, unprefixed. Its id is a client
 * token (`newClientToken`: `crypto.randomUUID` throws over plain HTTP). The
 * same value pinned already leaves the pins as they are; undefined when
 * refused (at the cap, an empty row, or a field that may not be pinned).
 */
export function pinFilter(
  kind: ListKind,
  pins: ListPins,
  state: PanelState,
  key: string
): ListPins | undefined {
  const row = pinnableRow(kind, key);
  if (row === undefined) return undefined;
  const value = pinStateOf(kind, row, state);
  if (value === undefined) return undefined;
  if (pinnedFilterOf(kind, pins, value, key) !== undefined) return pins;
  if (atCap(pins)) return undefined;
  return {
    ...pins,
    filters: [...pins.filters, { id: newClientToken(), key, state: value }],
  };
}

/** The pins without that pinned filter */
export const unpinFilter = (pins: ListPins, id: string): ListPins => ({
  ...pins,
  filters: pins.filters.filter((pin) => pin.id !== id),
});
