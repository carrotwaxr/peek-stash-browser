/**
 * The filter chips of a list's state: one per active row of the panel
 * table, the same set the Filters badge counts. Imports only relative
 * modules and `@peek/shared-types` (see `options.ts`).
 */
import {
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
} from "@peek/shared-types";
import { type ChipParts, type PanelState, codecOf } from "./codecs";
import { SPECS } from "./options";

/** A chip's row key and its parts */
export interface FilterChip {
  readonly key: string;
  readonly parts: ChipParts;
}

/**
 * The state's chips in the panel's order. `free` names the rows the page
 * leaves to the panel (by key); a row it does not name has no chip.
 * Body measures read in `unitPreference`.
 */
export function chipsOf(
  kind: ListKind,
  state: PanelState,
  free?: readonly { readonly key: string }[],
  unitPreference?: string
): FilterChip[] {
  const shown =
    free === undefined ? undefined : new Set(free.map((o) => o.key));
  const rows: readonly PanelField[] = PANEL_FIELDS[kind];
  return rows.flatMap((row) => {
    const spec = SPECS[kind][row.field];
    if (spec === undefined || (shown !== undefined && !shown.has(row.key))) {
      return [];
    }
    const parts = codecOf(row).chip(row, spec, state, unitPreference);
    return parts === null ? [] : [{ key: row.key, parts }];
  });
}

/**
 * How many filters the state holds, one per active field (a list with its
 * condition and sub-entities is one): the Filters badge, and the chips
 */
export const activeFieldCount = (
  kind: ListKind,
  state: PanelState,
  free?: readonly { readonly key: string }[]
): number => chipsOf(kind, state, free).length;
