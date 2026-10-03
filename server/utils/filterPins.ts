/**
 * Pinned fields and filters, per list (9b): what a user may store in
 * `User.filterPins` and what a list shows from it.
 *
 * A list's pins are the panel rows kept on its chip bar (`fields`, by panel
 * key) and saved filters kept there (`filters`: a row's key with its value).
 * A list with nothing stored shows `defaultPinsOf(kind)`; a list stored empty
 * stays empty. The panel table (`PANEL_FIELDS`) says which keys exist, which
 * may be pinned, and which companion keys (modifier, depth, exclude) a row's
 * state may carry.
 */
import {
  LIST_KINDS,
  type ListKind,
  PANEL_FIELDS,
  PIN_LIMIT,
  type PanelField,
  defaultPinsOf,
} from "@peek/shared-types/filters/index.js";
import type {
  FilterPins,
  ListPins,
  PinnedFilter,
} from "@peek/shared-types/filters/index.js";
import type { ApiErrorIssue } from "../types/api/common.js";
import { parseFilterRef } from "./listRequest.js";

/** A body over this many bytes is refused whole */
export const PINS_MAX_BYTES = 16 * 1024;

/** The longest `label` of a pinned filter */
export const PIN_LABEL_MAX = 60;

/** A pinned filter's id: a client token (32 hex), or a seed's `default-<name>` */
const PIN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A Peek playlist id */
const PLAYLIST_ID_PATTERN = /^[1-9]\d{0,17}$/;

/** What a check returns: the normalized pins, or every problem found */
export type ListPinsResult = { pins: ListPins } | { issues: ApiErrorIssue[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The modifiers that mean "has none" and "has any": a value with no ids or text */
const PRESENCE = new Set(["IS_NULL", "NOT_NULL"]);

/** Whether a state value holds something to filter by */
function hasValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(hasValue);
  if (isObject(value)) return Object.values(value).some(hasValue);
  return false;
}

/** The keys a row's state may hold: its own and its companions' */
function stateKeysOf(row: PanelField): Set<string> {
  const keys = new Set([row.key]);
  if (row.modifierKey !== undefined) keys.add(row.modifierKey);
  if (row.hierarchyKey !== undefined) keys.add(row.hierarchyKey);
  if (row.editor === "ref" && row.excludeKey !== undefined) {
    keys.add(row.excludeKey);
  }
  return keys;
}

/** Whether the row's own value, or its presence modifier, selects something */
function isActive(row: PanelField, state: Record<string, unknown>): boolean {
  if (
    row.modifierKey !== undefined &&
    typeof state[row.modifierKey] === "string" &&
    PRESENCE.has(state[row.modifierKey] as string)
  ) {
    return true;
  }
  const value = state[row.key];
  if (row.editor === "choice") {
    // a stored boolean reads as its choice: true as Yes, false as Any
    if (typeof value === "boolean") return value;
    return (
      typeof value === "string" && value !== "" && value !== row.defaultValue
    );
  }
  if (row.editor === "toggle") return value === true || value === "true";
  return hasValue(value);
}

/** Checks a ref row's ids (the row's key and its exclude companion) */
function checkRefIds(
  row: PanelField,
  state: Record<string, unknown>,
  basePath: string,
  add: (path: string, message: string) => void
): void {
  if (row.editor !== "ref") return;
  const playlists = row.source === "playlists";
  const keys = [
    row.key,
    ...(row.excludeKey === undefined ? [] : [row.excludeKey]),
  ];
  for (const key of keys) {
    const value = state[key];
    if (value === undefined) continue;
    const list = Array.isArray(value) ? value : [value];
    const listed = Array.isArray(value);
    list.forEach((id: unknown, index) => {
      const path = `${basePath}.${key}${listed ? `[${index}]` : ""}`;
      if (playlists) {
        const ok =
          typeof id === "number"
            ? Number.isSafeInteger(id) && id > 0
            : typeof id === "string" && PLAYLIST_ID_PATTERN.test(id);
        if (!ok) add(path, "Expected a playlist id (a positive integer)");
        return;
      }
      const ref = typeof id === "string" ? parseFilterRef(id) : undefined;
      if (ref?.instanceId === undefined) {
        add(path, "Expected id:instanceId");
      }
    });
  }
}

/** Checks one pinned filter, reporting under `filters[index]` */
function checkFilter(
  rows: ReadonlyMap<string, PanelField>,
  filter: unknown,
  index: number,
  seenIds: Set<string>,
  add: (path: string, message: string) => void
): PinnedFilter | undefined {
  const base = `filters[${index}]`;
  if (!isObject(filter)) {
    add(base, "Expected a pinned filter");
    return undefined;
  }
  const problemsBefore = { count: 0 };
  const report = (path: string, message: string) => {
    problemsBefore.count++;
    add(path, message);
  };

  const { id, key, state, label } = filter;
  if (typeof id !== "string" || !PIN_ID_PATTERN.test(id)) {
    report(`${base}.id`, "Expected 1 to 64 letters, digits, _ or -");
  } else if (seenIds.has(id)) {
    report(`${base}.id`, "Duplicate filter id");
  } else {
    seenIds.add(id);
  }

  if (label !== undefined) {
    if (typeof label !== "string" || label.length > PIN_LABEL_MAX) {
      report(
        `${base}.label`,
        `Expected text of at most ${PIN_LABEL_MAX} characters`
      );
    }
  }

  const row = typeof key === "string" ? rows.get(key) : undefined;
  if (row === undefined) {
    report(`${base}.key`, "Not a filter of this list");
  } else if (row.pinnable === false) {
    report(`${base}.key`, "This filter cannot be pinned");
  } else if (!isObject(state)) {
    report(`${base}.state`, "Expected the filter's values");
  } else {
    const allowed = stateKeysOf(row);
    let keysOk = true;
    for (const stateKey of Object.keys(state)) {
      if (!allowed.has(stateKey)) {
        keysOk = false;
        report(`${base}.state.${stateKey}`, "Not a key of this filter");
      }
    }
    if (keysOk) {
      const before = problemsBefore.count;
      checkRefIds(row, state, `${base}.state`, report);
      if (problemsBefore.count === before && !isActive(row, state)) {
        report(`${base}.state`, "Expected a value to filter by");
      }
    }
  }

  if (problemsBefore.count > 0) return undefined;
  const pinned = filter as unknown as PinnedFilter;
  return {
    id: pinned.id,
    key: pinned.key,
    state: pinned.state,
    ...(label === undefined ? {} : { label: pinned.label }),
  };
}

/**
 * Checks a list's pins as a client sends them. Returns the pins reduced to
 * their declared members, or every problem found with its path
 * (`fields[0]`, `filters[1].state.tagIds[0]`). `rows` is the list's panel
 * table; only a test passes another.
 */
export function validateListPins(
  kind: ListKind,
  body: unknown,
  rows: readonly PanelField[] = PANEL_FIELDS[kind]
): ListPinsResult {
  const issues: ApiErrorIssue[] = [];
  const add = (path: string, message: string) => {
    issues.push({ path, message });
  };

  // JSON.stringify answers undefined for a body with no JSON form
  const text = JSON.stringify(body) as string | undefined;
  if (Buffer.byteLength(text ?? "") > PINS_MAX_BYTES) {
    return { issues: [{ path: "", message: "Pins are limited to 16 KB" }] };
  }
  if (!isObject(body)) {
    return { issues: [{ path: "", message: "Expected the list's pins" }] };
  }

  const byKey = new Map(rows.map((row) => [row.key, row]));
  const { fields, filters } = body;

  const pinnedFields: string[] = [];
  if (!Array.isArray(fields)) {
    add("fields", "Expected a list of field keys");
  } else {
    const seen = new Set<string>();
    fields.forEach((field: unknown, index) => {
      const path = `fields[${index}]`;
      const row = typeof field === "string" ? byKey.get(field) : undefined;
      if (typeof field !== "string" || row === undefined) {
        add(path, "Not a filter of this list");
      } else if (row.pinnable === false) {
        add(path, "This filter cannot be pinned");
      } else if (seen.has(field)) {
        add(path, "Pinned twice");
      } else {
        seen.add(field);
        pinnedFields.push(field);
      }
    });
  }

  const pinnedFilters: PinnedFilter[] = [];
  if (!Array.isArray(filters)) {
    add("filters", "Expected a list of pinned filters");
  } else {
    const seenIds = new Set<string>();
    filters.forEach((filter: unknown, index) => {
      const checked = checkFilter(byKey, filter, index, seenIds, add);
      if (checked) pinnedFilters.push(checked);
    });
  }

  if (
    Array.isArray(fields) &&
    Array.isArray(filters) &&
    fields.length + filters.length > PIN_LIMIT
  ) {
    add("pins", `At most ${PIN_LIMIT} pins in all`);
  }

  if (issues.length > 0) return { issues };
  return { pins: { fields: pinnedFields, filters: pinnedFilters } };
}

/**
 * Every list's pins from the stored column: a list with no stored entry shows
 * its defaults, a stored empty list stays empty. A stored field or filter the
 * panel no longer offers is left out, so a changed table never breaks a page.
 */
export function pinsOf(stored: unknown): FilterPins {
  const entries = isObject(stored) ? stored : {};
  const pins = {} as Record<ListKind, ListPins>;
  for (const kind of LIST_KINDS) {
    const entry = entries[kind];
    if (
      !isObject(entry) ||
      !Array.isArray(entry.fields) ||
      !Array.isArray(entry.filters)
    ) {
      pins[kind] = defaultPinsOf(kind);
      continue;
    }
    const panelRows: readonly PanelField[] = PANEL_FIELDS[kind];
    const byKey = new Map(panelRows.map((row) => [row.key, row]));
    const fields: string[] = [];
    for (const field of entry.fields as unknown[]) {
      const row = typeof field === "string" ? byKey.get(field) : undefined;
      if (row && row.pinnable !== false && !fields.includes(row.key)) {
        fields.push(row.key);
      }
    }
    const seenIds = new Set<string>();
    const filters: PinnedFilter[] = [];
    (entry.filters as unknown[]).forEach((filter, index) => {
      const kept = checkFilter(byKey, filter, index, seenIds, () => undefined);
      if (kept) filters.push(kept);
    });
    pins[kind] = { fields, filters };
  }
  return pins;
}
