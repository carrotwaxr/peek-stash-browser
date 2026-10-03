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
import type { PanelRow } from "./tree";

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
 * One row's chip (a row of the state's tree, its keys unprefixed), or null
 * when it does not filter: the chip bar draws one per root row, repeats
 * included. Body measures read in `unitPreference`.
 */
export function rowChip(
  kind: ListKind,
  row: PanelRow,
  unitPreference?: string
): ChipParts | null {
  const spec = SPECS[kind][row.field.field];
  if (spec === undefined) return null;
  return codecOf(row.field).chip(row.field, spec, row.state, unitPreference);
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
