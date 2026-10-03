import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  type ListPins,
  PANEL_FIELDS,
  type PinnedFilter,
  type RowKey,
  rowKeyOf,
} from "@peek/shared-types";
import { useFilterPins, useSetPins } from "../../api/hooks/useFilterPins";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import type { ListFilters } from "../../hooks/useListFilters";
import {
  type ChipParts,
  type FilterOption,
  rowChip,
} from "../../utils/filterFields";
import {
  atCap,
  isPinnable,
  isPinnedFilterOn,
  pinField,
  pinFilter,
  pinnedFilterOf,
  pinsOf,
  togglePinnedFilter,
  unpinField,
  unpinFilter,
  visiblePins,
} from "../../utils/filterFields/pins";
import Button from "../ui/Button";
import AddFilterMenu from "./AddFilterMenu";
import ChipEditor, {
  type ChipEditorClose,
  type ChipPinning,
} from "./ChipEditor";
import FilterChip from "./FilterChip";
import PinnedFilterToggle from "./PinnedFilterToggle";

interface PermanentFiltersMetadata {
  performers?: Array<{ id: string; name: string }>;
  studios?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
}

interface FilterBarProps {
  filters: ListFilters;
  /** The page's own criteria: a field they name has no chip */
  permanentFilters?: Record<string, unknown>;
  /** Their names, drawn as dimmed labels before the chips */
  permanentFiltersMetadata?: PermanentFiltersMetadata;
}

/**
 * The open editor. Its session keys its chip, so the chip and its editor
 * outlive the row's number: the session is the row's key when it opened,
 * which its chip already had, so opening remounts nothing.
 */
interface OpenEditor {
  readonly session: string;
  readonly at: RowKey;
  /** Opened from "+ Filter": closed with no row, focus goes back there */
  readonly fromMenu: boolean;
}

/** A chip the bar draws: a root row's, or the row an open editor adds */
interface ChipItem {
  readonly at: RowKey;
  readonly parts: ChipParts | null;
  readonly label: string;
  readonly entityType: string | undefined;
}

const NONE: Record<string, unknown> = {};

const keyOf = (at: RowKey): string => rowKeyOf(at.group, at.occurrence, at.key);

const sameAt = (a: RowKey, b: RowKey): boolean =>
  a.group === b.group && a.occurrence === b.occurrence && a.key === b.key;

/**
 * The list's filter chips: the page's permanent filters as dimmed labels,
 * the user's pinned filters as one-tap toggles, the pinned fields (an empty
 * chip, `Tags`, until set, then that field's chips in the same place), then
 * one chip per other root row of the filters (a field twice is two chips),
 * in the panel's order, then "+ Filter" and, while a filter is set,
 * "Clear all". A chip's body opens its editor in a popover under it
 * (`ChipEditor`), whose changes apply as they are made, and whose header
 * pins the field or its value; its button removes the row. A field picked
 * in "+ Filter" opens its chip's editor, or, when it is not in use, a
 * pending chip's that leaves nothing if closed empty.
 *
 * A pinned filter acts on its key's first root row: pressed while that row
 * holds its value (the row then draws no chip of its own), a tap sets or
 * removes the row, one history entry each. Pins are per list kind
 * (`useFilterPins`), saved as they change (`useSetPins`).
 */
const FilterBar = ({
  filters,
  permanentFilters = NONE,
  permanentFiltersMetadata = NONE,
}: FilterBarProps) => {
  const { kind, tree, options } = filters;
  const { unitPreference } = useUnitPreference();
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const [editor, setEditor] = useState<OpenEditor | null>(null);

  const stored = useFilterPins(kind);
  const { mutate: savePins } = useSetPins();
  const pins = useMemo(() => pinsOf(kind, stored), [kind, stored]);
  const shownPins = useMemo(
    () => visiblePins(kind, pins, options),
    [kind, pins, options]
  );
  // The bar's pins, and the server's cap over every stored one
  const capped = atCap(shownPins) || atCap(pins);
  const save = (next: ListPins | undefined) => {
    if (next !== undefined && next !== pins) savePins({ kind, pins: next });
  };

  // Each pinned filter, pressed while its key's first root row holds it
  const pinnedFilters = useMemo(
    () =>
      shownPins.filters.map((pin) => ({
        pin,
        on: isPinnedFilterOn(kind, filters.filters, pin),
      })),
    [kind, shownPins, filters.filters]
  );

  // One chip per root row the page leaves free, each naming its own row
  const chips = useMemo(() => {
    const free = new Map(
      options
        .filter((option) => permanentFilters[option.key] === undefined)
        .map((option) => [option.key, option] as const)
    );
    const seen = new Map<string, number>();
    return tree.rows.flatMap((row): ChipItem[] => {
      const key = row.field.key;
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      const option = free.get(key);
      if (option === undefined) return [];
      const parts = rowChip(kind, row, unitPreference);
      if (parts === null) return [];
      return [
        {
          at: { group: 0, occurrence, key },
          parts,
          label: option.label ?? key,
          entityType: option.entityType,
        },
      ];
    });
  }, [kind, tree, options, permanentFilters, unitPreference]);

  // The pinned fields first, each its rows' chips or an empty chip, then
  // the other rows; a row a pressed pinned filter stands for draws no chip,
  // unless its editor is open
  const drawn = useMemo(() => {
    const pinnedKeys = new Set(shownPins.fields);
    const covered = new Set(
      pinnedFilters.filter(({ on }) => on).map(({ pin }) => pin.key)
    );
    const fieldItems = shownPins.fields.flatMap((key): ChipItem[] => {
      const rows = chips.filter((chip) => chip.at.key === key);
      if (rows.length > 0) return rows;
      const option = options.find((each) => each.key === key);
      if (option === undefined || permanentFilters[key] !== undefined) {
        return [];
      }
      return [
        {
          at: { group: 0, occurrence: 1, key },
          parts: null,
          label: option.label ?? key,
          entityType: option.entityType,
        },
      ];
    });
    const rest = chips.filter(
      (chip) =>
        !pinnedKeys.has(chip.at.key) &&
        !(
          covered.has(chip.at.key) &&
          chip.at.occurrence === 1 &&
          !(editor !== null && sameAt(editor.at, chip.at))
        )
    );
    return [...fieldItems, ...rest];
  }, [chips, shownPins, pinnedFilters, options, permanentFilters, editor]);

  // The open editor's row the list does not hold (it emptied): a chip of
  // its own after the field's last, else where the field sits in the panel
  const items = useMemo(() => {
    if (editor === null || drawn.some((chip) => sameAt(chip.at, editor.at))) {
      return drawn;
    }
    const option = options.find((each) => each.key === editor.at.key);
    const adding: ChipItem = {
      at: editor.at,
      parts: null,
      label: option?.label ?? editor.at.key,
      entityType: option?.entityType,
    };
    const placeOf = (key: string) =>
      PANEL_FIELDS[kind].findIndex((row) => row.key === key);
    let at = -1;
    drawn.forEach((chip, index) => {
      if (chip.at.key === editor.at.key) at = index + 1;
    });
    if (at < 0) {
      at = drawn.findIndex(
        (chip) => placeOf(chip.at.key) > placeOf(editor.at.key)
      );
    }
    if (at < 0) at = drawn.length;
    return [...drawn.slice(0, at), adding, ...drawn.slice(at)];
  }, [drawn, editor, options, kind]);

  /**
   * Focus leaves a chip that goes: to the next chip's remove button, else
   * the previous one's, else out of the bar. A removed row's next row of
   * the same field takes its number, and with it this chip, whose button
   * then keeps focus. A pinned field's last row leaves its empty chip in
   * the same place (the same element), whose body takes focus.
   */
  const focusNeighbour = useCallback(
    (at: RowKey, removed: boolean) => {
      if (
        removed &&
        at.group === 0 &&
        shownPins.fields.includes(at.key) &&
        items.filter((item) => item.at.key === at.key).length === 1
      ) {
        barRef.current
          ?.querySelector<HTMLElement>(
            `[data-chip-row="${keyOf(at)}"] [data-chip-edit]`
          )
          ?.focus();
        return;
      }
      const index = items.findIndex((item) => sameAt(item.at, at));
      const next = index < 0 ? undefined : items[index + 1];
      const target =
        removed &&
        next !== undefined &&
        next.at.group === at.group &&
        next.at.key === at.key
          ? at
          : (next ?? (index < 1 ? undefined : items[index - 1]))?.at;
      const wrapper =
        target === undefined
          ? null
          : (barRef.current?.querySelector(
              `[data-chip-row="${keyOf(target)}"]`
            ) ?? null);
      const button =
        wrapper?.querySelector<HTMLElement>("[data-chip-remove]") ??
        wrapper?.querySelector<HTMLElement>("[data-chip-edit]");
      if (button) button.focus();
      else addRef.current?.focus();
    },
    [items, shownPins]
  );

  const removeChip = (at: RowKey) => {
    focusNeighbour(at, true);
    filters.removeRow(at);
  };

  // A chip whose editor closed takes focus back once drawn under its own
  // key: a row renumbered while its editor was open is drawn anew, and a
  // row the list does not show yet (its navigation still pending) is drawn
  // on a later render. Focus that moved on meanwhile stays where it is.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const row = refocus.current;
    if (row === null) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) {
      refocus.current = null;
      return;
    }
    const chip = barRef.current?.querySelector<HTMLElement>(
      `[data-chip-row="${row}"] [data-chip-edit]`
    );
    if (!chip) return;
    refocus.current = null;
    chip.focus();
  });

  const closeEditor = useCallback(
    (reason: ChipEditorClose, held: boolean) => {
      if (editor === null) return;
      const anchor = anchorRef.current;
      const active = document.activeElement;
      const hadFocus =
        active === null ||
        active === document.body ||
        (anchor?.closest("[data-chip]")?.contains(active) ?? false);
      // The editor's own word: the list may still draw the URL before its
      // last commit
      const stays = held || drawn.some((chip) => sameAt(chip.at, editor.at));
      if (hadFocus && !stays && reason !== "removed" && editor.fromMenu) {
        addRef.current?.focus();
      } else if (reason === "removed" || (hadFocus && !stays)) {
        focusNeighbour(editor.at, reason === "removed");
      } else if (hadFocus) {
        anchor?.focus();
        refocus.current = keyOf(editor.at);
      }
      setEditor(null);
    },
    [editor, drawn, focusNeighbour]
  );

  const toggle = (at: RowKey) => {
    const isOpen = editor !== null && sameAt(editor.at, at);
    // An open editor closes first, applying what waits
    if (editor !== null) closeRef.current?.();
    if (isOpen) return;
    setEditor({ session: keyOf(at), at, fromMenu: false });
  };

  // A field picked in "+ Filter": its first chip's editor, else a pending
  // chip's for a new row of the field
  const pick = (option: FilterOption) => {
    if (editor !== null) closeRef.current?.();
    const chip = drawn.find((each) => each.at.key === option.key);
    const at = chip?.at ?? {
      group: 0,
      occurrence:
        tree.rows.filter((row) => row.field.key === option.key).length + 1,
      key: option.key,
    };
    setEditor({ session: keyOf(at), at, fromMenu: chip === undefined });
  };

  const clearAll = () => {
    if (editor !== null) setEditor(null);
    filters.clear();
    addRef.current?.focus();
  };

  // One tap: on sets its key's first root row, off removes it
  const togglePin = (pin: PinnedFilter) => {
    if (editor !== null) closeRef.current?.();
    filters.commit(togglePinnedFilter(kind, filters.filters, pin));
  };

  const toggleFieldPin = (key: string) =>
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
      toggleField: () => toggleFieldPin(key),
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

  const moveEditor = useCallback((at: RowKey) => {
    setEditor((open) => (open === null ? open : { ...open, at }));
  }, []);

  // A detail page's own filters: a plain label, no edit and no remove
  const permanentLabels = [
    ...(permanentFiltersMetadata.performers ?? []).map(
      (performer) => `Performer: ${performer.name}`
    ),
    ...(permanentFiltersMetadata.studios ?? []).map(
      (studio) => `Studio: ${studio.name}`
    ),
    ...(permanentFiltersMetadata.tags ?? []).map((tag) => `Tag: ${tag.name}`),
  ];

  const hasFilters = tree.rows.length > 0 || tree.groups.length > 0;

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="Filters"
      className="flex flex-wrap items-center gap-2"
    >
      {permanentLabels.map((label, index) => (
        <div
          key={`${index}-${label}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
            opacity: 0.7,
          }}
        >
          <span>{label}</span>
        </div>
      ))}
      {pinnedFilters.map(({ pin, on }) => (
        <PinnedFilterToggle
          key={pin.id}
          kind={kind}
          pin={pin}
          on={on}
          entityType={
            options.find((option) => option.key === pin.key)?.entityType
          }
          onToggle={() => togglePin(pin)}
          onUnpin={() => save(unpinFilter(pins, pin.id))}
        />
      ))}
      {items.map((item) => {
        const open = editor !== null && sameAt(editor.at, item.at);
        const key = keyOf(item.at);
        return (
          <FilterChip
            // A row that took the open editor's old number is another chip
            key={
              open
                ? editor.session
                : editor !== null && key === editor.session
                  ? `${key}~`
                  : key
            }
            rowKey={key}
            parts={item.parts}
            label={item.label}
            entityType={item.entityType}
            open={open}
            anchorRef={open ? anchorRef : undefined}
            onToggle={() => toggle(item.at)}
            onRemove={() => removeChip(item.at)}
          >
            {open && (
              <ChipEditor
                filters={filters}
                pinning={pinningOf(item.at.key)}
                rowKey={item.at}
                anchorRef={anchorRef}
                closeRef={closeRef}
                onRowKeyChange={moveEditor}
                onClose={closeEditor}
              />
            )}
          </FilterChip>
        );
      })}
      <AddFilterMenu
        filters={filters}
        pinnedFields={shownPins.fields}
        pinCapped={capped}
        onTogglePin={toggleFieldPin}
        onPick={pick}
        triggerRef={addRef}
      />
      {hasFilters && (
        <Button variant="tertiary" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      )}
    </div>
  );
};

export default FilterBar;
