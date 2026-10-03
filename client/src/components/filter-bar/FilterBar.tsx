import {
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PANEL_FIELDS,
  type PinnedFilter,
  type RowKey,
  rowKeyOf,
} from "@peek/shared-types";
import { LucideSlidersHorizontal } from "lucide-react";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import type { ListFilters } from "../../hooks/useListFilters";
import {
  type ChipParts,
  type FilterOption,
  type PanelState,
  filtersEqual,
  rowChip,
} from "../../utils/filterFields";
import {
  isPinnedFilterOn,
  togglePinnedFilter,
  unpinFilter,
} from "../../utils/filterFields/pins";
import AdvancedFilterView from "../filter-rows/AdvancedFilterView";
import Button from "../ui/Button";
import AddFilterMenu from "./AddFilterMenu";
import ChipEditor, { type ChipEditorClose } from "./ChipEditor";
import FilterChip from "./FilterChip";
import type { SheetFocus } from "./FilterSheet";
import GroupChip from "./GroupChip";
import PinnedFilterToggle from "./PinnedFilterToggle";
import {
  type PermanentFiltersMetadata,
  groupText,
  permanentChipsOf,
} from "./chipText";
import { useListPinning } from "./useListPinning";

interface FilterBarProps {
  filters: ListFilters;
  /** The page's own criteria: a field they name has no chip */
  permanentFilters?: Record<string, unknown>;
  /** Their names, drawn as dimmed labels before the chips */
  permanentFiltersMetadata?: PermanentFiltersMetadata;
  /**
   * Set on a phone or a TV (the `sheet` surface): a chip's body and
   * "+ Filter" open the filter sheet at that row or at its field list,
   * instead of a popover, and the row scrolls sideways
   */
  onOpenSheet?: ((focus: SheetFocus) => void) | undefined;
  /**
   * Drawn after the group chips, before "+ Filter" (TV mode: the list's
   * "Filters" button and Views menu, so the D-pad meets the pins first)
   */
  trailing?: ReactNode;
  /** "+ Filter" itself, for the list's `f` key */
  addFilterRef?: RefObject<HTMLButtonElement | null>;
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

/** The Advanced view's opening: at a group (1 to 5), else at the root */
interface AdvancedOpen {
  readonly focusGroup: number | undefined;
  /** The filters an editor's flush just wrote, which the list draws a render later */
  readonly over: PanelState | undefined;
}

const keyOf = (at: RowKey): string => rowKeyOf(at.group, at.occurrence, at.key);

const sameAt = (a: RowKey, b: RowKey): boolean =>
  a.group === b.group && a.occurrence === b.occurrence && a.key === b.key;

/**
 * The list's filter chips: the page's permanent filters as dimmed labels,
 * the user's pinned filters as one-tap toggles, the pinned fields (an empty
 * chip, `Tags`, until set, then that field's chips in the same place), then
 * one chip per other root row of the filters (a field twice is two chips),
 * in the panel's order, then one chip per group (its match and its rows'
 * field names; its body opens the Advanced view at the group, its button
 * removes the group), led by "Match any" when the root matches any, then
 * `trailing` (TV mode's "Filters" and Views), "+ Filter", "Advanced" (the
 * row view) and, while a filter is set, "Clear all". A chip's body opens its editor in a popover under it
 * (`ChipEditor`), whose changes apply as they are made, and whose header
 * pins the field or its value; its button removes the row. A field picked
 * in "+ Filter" opens its chip's editor, or, when it is not in use, a
 * pending chip's that leaves nothing if closed empty.
 *
 * On a phone or a TV (`onOpenSheet`), the row scrolls sideways and a chip
 * or "+ Filter" opens the filter sheet (`FilterSheet`) instead: the edit
 * applies there with "Show N results". Pinned filters and group chips act
 * as on a desktop.
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
  onOpenSheet,
  trailing = null,
  addFilterRef,
}: FilterBarProps) => {
  const { kind, tree, options } = filters;
  const { unitPreference } = useUnitPreference();
  const barRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const ownAddRef = useRef<HTMLButtonElement>(null);
  const addRef = addFilterRef ?? ownAddRef;
  const closeRef = useRef<(() => PanelState | undefined) | null>(null);
  const [editor, setEditor] = useState<OpenEditor | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedOpen | null>(null);

  const {
    pins,
    shownPins,
    capped,
    save,
    toggleField: toggleFieldPin,
    pinningOf,
  } = useListPinning(kind, options);

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
    [items, shownPins, addRef]
  );

  // One chip per group, numbered as the URL numbers them (`g1`...), its
  // text from its rows' field names
  const groupChips = useMemo(
    () =>
      tree.groups.map((group, index) => ({
        number: index + 1,
        text: groupText(
          group.match,
          group.rows.map(
            (row) =>
              options.find((option) => option.key === row.field.key)?.label ??
              row.field.key
          )
        ),
      })),
    [tree, options]
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
    [editor, drawn, focusNeighbour, addRef]
  );

  const toggle = (at: RowKey) => {
    const isOpen = editor !== null && sameAt(editor.at, at);
    // An open editor closes first, applying what waits
    if (editor !== null) closeRef.current?.();
    if (isOpen) return;
    setEditor({ session: keyOf(at), at, fromMenu: false });
  };

  // A field picked in "+ Filter": its first chip's editor (a first row a
  // pressed pin draws is its chip too), else a pending chip's for a new row
  // of the field
  const pick = (option: FilterOption) => {
    if (editor !== null) closeRef.current?.();
    const chip = drawn.find((each) => each.at.key === option.key);
    const covered = pinnedFilters.some(
      ({ pin, on }) => on && pin.key === option.key
    );
    const at = chip?.at ?? {
      group: 0,
      occurrence: covered
        ? 1
        : tree.rows.filter((row) => row.field.key === option.key).length + 1,
      key: option.key,
    };
    setEditor({
      session: keyOf(at),
      at,
      fromMenu: chip === undefined && !covered,
    });
  };

  // The open editor closed, applying what waits: the list's filters after
  // it, for a write in the same handler (the list draws the flush later)
  const closeOpenEditor = (): PanelState | undefined =>
    editor === null ? undefined : closeRef.current?.();

  const openAdvanced = (focusGroup?: number) => {
    setAdvanced({ focusGroup, over: closeOpenEditor() });
  };

  // Focus leaves a removed group's chip for the next group's, which takes
  // its number (the same element, so its button keeps focus), else the
  // previous group's, else "+ Filter"
  const removeGroupChip = (number: number) => {
    if (number >= groupChips.length) {
      const previous = barRef.current?.querySelector<HTMLElement>(
        `[data-chip-row="g${number - 1}"] [data-chip-remove]`
      );
      (previous ?? addRef.current)?.focus();
    }
    filters.removeGroup(number);
  };

  const clearAll = () => {
    if (editor !== null) setEditor(null);
    filters.clear();
    addRef.current?.focus();
  };

  // One tap: on sets its key's first root row, off removes it
  const togglePin = (pin: PinnedFilter) => {
    const current = closeOpenEditor() ?? filters.filters;
    filters.commit(togglePinnedFilter(kind, current, pin));
  };

  const moveEditor = useCallback((at: RowKey) => {
    setEditor((open) => (open === null ? open : { ...open, at }));
  }, []);

  // A detail page's own filters: a plain label, no edit and no remove
  // (also the Advanced view's "Fixed by this page", which then names them)
  const permanentChips = useMemo(
    () => permanentChipsOf(permanentFiltersMetadata),
    [permanentFiltersMetadata]
  );
  const permanentLabels = permanentChips.map(
    ({ parts }) => `${parts.label}: ${(parts.values ?? []).join(", ")}`
  );

  const hasFilters = tree.rows.length > 0 || tree.groups.length > 0;

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="Filters"
      className={
        onOpenSheet === undefined
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-themed pb-1 [&>*]:shrink-0"
      }
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
      {tree.match === "any" && (
        <GroupChip
          rowKey="match"
          text="Match any"
          onEdit={() => openAdvanced()}
        />
      )}
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
            onToggle={() =>
              onOpenSheet === undefined ? toggle(item.at) : onOpenSheet(item.at)
            }
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
      {groupChips.map(({ number, text }) => (
        <GroupChip
          key={`g${number}`}
          rowKey={`g${number}`}
          text={text}
          onEdit={() => openAdvanced(number)}
          onRemove={() => removeGroupChip(number)}
        />
      ))}
      {trailing}
      <AddFilterMenu
        filters={filters}
        pinnedFields={shownPins.fields}
        pinCapped={capped}
        onTogglePin={toggleFieldPin}
        onPick={pick}
        triggerRef={addRef}
        {...(onOpenSheet === undefined
          ? {}
          : { onOpen: () => onOpenSheet("add") })}
      />
      <div data-tv-search-item="advanced-filters">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openAdvanced()}
          aria-haspopup="dialog"
          aria-expanded={advanced !== null}
          className="rounded-full"
          icon={
            <LucideSlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          }
        >
          Advanced
        </Button>
      </div>
      {hasFilters && (
        <Button variant="tertiary" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      )}
      <AdvancedFilterView
        isOpen={advanced !== null}
        onClose={() => setAdvanced(null)}
        kind={kind}
        value={filters.filters}
        {...(advanced?.over === undefined ? {} : { openedOver: advanced.over })}
        // Nothing changed: no write (no history entry, the page stays)
        onApply={(next) => {
          if (!filtersEqual(kind, next, filters.filters)) filters.commit(next);
        }}
        permanentChips={permanentChips}
        {...(advanced?.focusGroup === undefined
          ? {}
          : { focusGroup: advanced.focusGroup })}
      />
    </div>
  );
};

export default FilterBar;
