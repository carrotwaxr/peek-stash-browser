import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PANEL_FIELDS, type RowKey, rowKeyOf } from "@peek/shared-types";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import type { ListFilters } from "../../hooks/useListFilters";
import { type ChipParts, rowChip } from "../../utils/filterFields";
import ChipEditor, { type ChipEditorClose } from "./ChipEditor";
import FilterChip from "./FilterChip";

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
  /**
   * Moves focus out of the bar when the last chip goes (the Filters
   * button): a removed chip's button unmounts with focus on it
   */
  onFocusLeave?: (() => void) | undefined;
}

/**
 * The open editor. Its session keys its chip, so the chip and its editor
 * outlive the row's number: the session is the row's key when it opened,
 * which its chip already had, so opening remounts nothing.
 */
interface OpenEditor {
  readonly session: string;
  readonly at: RowKey;
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
 * then one chip per root row of the filters (a field twice is two chips),
 * in the panel's order. A chip's body opens its editor in a popover under
 * it (`ChipEditor`), whose changes apply as they are made; its button
 * removes the row.
 */
const FilterBar = ({
  filters,
  permanentFilters = NONE,
  permanentFiltersMetadata = NONE,
  onFocusLeave,
}: FilterBarProps) => {
  const { kind, tree, options } = filters;
  const { unitPreference } = useUnitPreference();
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const [editor, setEditor] = useState<OpenEditor | null>(null);

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

  // The open editor's row the list does not hold (it emptied): a chip of
  // its own after the field's last, else where the field sits in the panel
  const items = useMemo(() => {
    if (editor === null || chips.some((chip) => sameAt(chip.at, editor.at))) {
      return chips;
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
    chips.forEach((chip, index) => {
      if (chip.at.key === editor.at.key) at = index + 1;
    });
    if (at < 0) {
      at = chips.findIndex(
        (chip) => placeOf(chip.at.key) > placeOf(editor.at.key)
      );
    }
    if (at < 0) at = chips.length;
    return [...chips.slice(0, at), adding, ...chips.slice(at)];
  }, [chips, editor, options, kind]);

  /**
   * Focus leaves a chip that goes: to the next chip's remove button, else
   * the previous one's, else out of the bar. A removed row's next row of
   * the same field takes its number, and with it this chip, whose button
   * then keeps focus.
   */
  const focusNeighbour = useCallback(
    (at: RowKey, removed: boolean) => {
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
      else onFocusLeave?.();
    },
    [items, onFocusLeave]
  );

  const removeChip = (at: RowKey) => {
    focusNeighbour(at, true);
    filters.removeRow(at);
  };

  // A chip whose editor closed takes focus back once drawn under its own
  // key: a row renumbered while its editor was open is drawn anew
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const row = refocus.current;
    if (row === null) return;
    refocus.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    barRef.current
      ?.querySelector<HTMLElement>(`[data-chip-row="${row}"] [data-chip-edit]`)
      ?.focus();
  });

  const closeEditor = useCallback(
    (reason: ChipEditorClose) => {
      if (editor === null) return;
      const anchor = anchorRef.current;
      const active = document.activeElement;
      const hadFocus =
        active === null ||
        active === document.body ||
        (anchor?.closest("[data-chip]")?.contains(active) ?? false);
      const stays = chips.some((chip) => sameAt(chip.at, editor.at));
      if (reason === "removed" || (hadFocus && !stays)) {
        focusNeighbour(editor.at, reason === "removed");
      } else if (hadFocus) {
        anchor?.focus();
        refocus.current = keyOf(editor.at);
      }
      setEditor(null);
    },
    [editor, chips, focusNeighbour]
  );

  const toggle = (at: RowKey) => {
    const isOpen = editor !== null && sameAt(editor.at, at);
    // An open editor closes first, applying what waits
    if (editor !== null) closeRef.current?.();
    if (isOpen) return;
    setEditor({ session: keyOf(at), at });
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

  if (permanentLabels.length === 0 && items.length === 0) {
    return null;
  }

  return (
    <div ref={barRef} className="flex flex-wrap gap-2 mb-4">
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
    </div>
  );
};

export default FilterBar;
