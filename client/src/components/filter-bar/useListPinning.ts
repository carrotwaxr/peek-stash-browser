/**
 * A list's pins as the chip bar and the sheet use them: the stored pins
 * (`useFilterPins`, the defaults while loading), the ones the list can show,
 * whether the cap is reached, and the header's pin actions for a field
 * (`ChipPinning`). Every change saves at once through `useSetPins`: pins are
 * never part of a draft.
 */
import { useMemo } from "react";
import type { ListKind, ListPins } from "@peek/shared-types";
import { useFilterPins, useSetPins } from "../../api/hooks/useFilterPins";
import type { FilterOption } from "../../utils/filterFields";
import {
  atCap,
  isPinnable,
  pinField,
  pinFilter,
  pinnedFilterOf,
  pinsOf,
  unpinField,
  unpinFilter,
  visiblePins,
} from "../../utils/filterFields/pins";
import type { ChipPinning } from "./ChipEditorHeader";

export interface ListPinning {
  /** Every pin the list keeps */
  readonly pins: ListPins;
  /** The pins this list's options can show */
  readonly shownPins: ListPins;
  /** Nothing more pins: the bar's pins, or the server's cap over every stored one */
  readonly capped: boolean;
  /** Saves the list's next pins; undefined or the same pins save nothing */
  readonly save: (next: ListPins | undefined) => void;
  /** Pins a field to the bar, or unpins it */
  readonly toggleField: (key: string) => void;
  /** The header's pin actions for a field; undefined when it cannot be pinned */
  readonly pinningOf: (key: string) => ChipPinning | undefined;
}

export function useListPinning(
  kind: ListKind,
  options: readonly FilterOption[]
): ListPinning {
  const stored = useFilterPins(kind);
  const { mutate: savePins } = useSetPins();
  const pins = useMemo(() => pinsOf(kind, stored), [kind, stored]);
  const shownPins = useMemo(
    () => visiblePins(kind, pins, options),
    [kind, pins, options]
  );
  const capped = atCap(shownPins) || atCap(pins);

  const save = (next: ListPins | undefined) => {
    if (next !== undefined && next !== pins) savePins({ kind, pins: next });
  };

  const toggleField = (key: string) =>
    save(
      pins.fields.includes(key)
        ? unpinField(pins, key)
        : pinField(kind, pins, key)
    );

  const pinningOf = (key: string): ChipPinning | undefined => {
    if (!isPinnable(kind, key)) return undefined;
    return {
      fieldPinned: pins.fields.includes(key),
      capped,
      isFilterPinned: (state) =>
        pinnedFilterOf(kind, pins, state, key) !== undefined,
      toggleField: () => toggleField(key),
      toggleFilter: (state) => {
        const pinned = pinnedFilterOf(kind, pins, state, key);
        save(
          pinned === undefined
            ? pinFilter(kind, pins, state, key)
            : unpinFilter(pins, pinned.id)
        );
      },
    };
  };

  return { pins, shownPins, capped, save, toggleField, pinningOf };
}
