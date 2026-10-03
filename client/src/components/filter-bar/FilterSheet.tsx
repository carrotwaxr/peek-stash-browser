import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ListKind,
  PANEL_FIELDS,
  type PanelField,
  type RowKey,
  rowKeyOf,
} from "@peek/shared-types";
import { LucideSlidersHorizontal } from "lucide-react";
import { useListCount } from "../../api/hooks/useListCount";
import { useFlushableDebounce } from "../../hooks/useDebounce";
import type { ListFilters } from "../../hooks/useListFilters";
import {
  type FilterChip,
  type FilterOption,
  type PanelState,
  clearFilters,
  filtersEqual,
  isRowActive,
  removeGroup,
  removeRow,
  setRow,
  stateOf,
  treeOf,
} from "../../utils/filterFields";
import {
  isPinnedFilterOn,
  togglePinnedFilter,
  unpinFilter,
} from "../../utils/filterFields/pins";
import AdvancedFilterView from "../filter-rows/AdvancedFilterView";
import Button from "../ui/Button";
import FieldEditor from "../ui/FieldEditor";
import Modal from "../ui/Modal";
import AddFilterMenu from "./AddFilterMenu";
import ChipEditorHeader from "./ChipEditorHeader";
import GroupChip from "./GroupChip";
import PinnedFilterToggle from "./PinnedFilterToggle";
import { groupText } from "./chipText";
import { TYPING_DELAY, isTyped } from "./typing";
import { useListPinning } from "./useListPinning";

/** Where the sheet opens: at a root row's editor, or at its field list */
export type SheetFocus = RowKey | "add";

/**
 * The count request for a draft: the list's request over it (the page's
 * permanent filters and a detail tab's lock included), and where to count
 * it (`/library/<plural>/count` unless named); null while the list cannot
 * ask yet
 */
export type CountRequestOf = (
  draft: PanelState
) => { path?: string; body: Record<string, unknown> } | null;

interface FilterSheetProps {
  filters: ListFilters;
  open: boolean;
  /** Opened from a chip (its row) or "+ Filter" (the field list) */
  focusKey?: SheetFocus | undefined;
  onClose: () => void;
  countRequestOf: CountRequestOf;
  /** The page's own criteria: a field they name has no row */
  permanentFilters?: Record<string, unknown>;
  /** The page's own filters by name, for the Advanced view */
  permanentChips?: readonly FilterChip[];
}

/** One editor in the sheet: a root row of the draft, or one waiting for a value */
interface SheetRow {
  /** Stable while the sheet is open, so an emptied row keeps its editor and focus */
  readonly id: string;
  readonly key: string;
  readonly state: PanelState;
}

const NONE: Record<string, unknown> = {};
const NO_CHIPS: readonly FilterChip[] = [];

/**
 * The filter sheet on a phone or a TV: a full-height `Modal` titled
 * "Filters" over a draft of the list's filters (a `PanelState`, taken when
 * it opens). It lists the pinned filters (one-tap toggles of the draft),
 * Advanced and Clear all, one editor per root row in one column (each a
 * `FieldEditor` under its `ChipEditorHeader`, whose pin buttons save at
 * once), the groups as chips (opening the Advanced view), and the list's
 * fields ("+ Filter" drawn inline). Nothing reaches the list until the
 * footer's "Show N results": each edit asks only the count (typing 300 ms
 * after the last key) through the page's `countRequestOf`, and the footer
 * reads "Show results" while counting or after a failed count. Show N
 * applies the draft once (one history entry) and closes; Escape, the close
 * button or the backdrop discard it.
 *
 * The rows are the sheet's own while it is open: an emptied row keeps its
 * editor (and focus) until Show N or close, and a row added from the field
 * list waits empty until it has a value. Advanced replaces the sheet with
 * the row view over the same draft; its Apply commits to the list and
 * closes both.
 */
const FilterSheet = (props: FilterSheetProps) =>
  props.open ? <OpenSheet {...props} /> : null;

/** What the sheet's helpers read: the list, its panel and the rows it edits */
interface SheetContext {
  readonly kind: ListKind;
  readonly fields: readonly PanelField[];
  /** The options of the rows the sheet edits (the page leaves them free), by key */
  readonly free: ReadonlyMap<string, FilterOption>;
}

const fieldOf = (ctx: SheetContext, key: string) =>
  ctx.fields.find((row) => row.key === key);

/** Whether a sheet row filters: a row waiting for a value does not */
const isActive = (ctx: SheetContext, row: SheetRow) => {
  const field = fieldOf(ctx, row.key);
  return field !== undefined && isRowActive(field, row.state);
};

/** Where a field sits in the panel, for placing a new row */
const placeOf = (ctx: SheetContext, key: string) =>
  ctx.fields.findIndex((row) => row.key === key);

/** The rows with `row` after the last of its field, else in the panel's order */
function insertRow(
  ctx: SheetContext,
  rows: readonly SheetRow[],
  row: SheetRow
): SheetRow[] {
  let at = -1;
  rows.forEach((each, index) => {
    if (each.key === row.key) at = index + 1;
  });
  if (at < 0) {
    at = rows.findIndex(
      (each) => placeOf(ctx, each.key) > placeOf(ctx, row.key)
    );
  }
  if (at < 0) at = rows.length;
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

/** The draft: `base` with its free root rows replaced by the sheet's */
function draftOf(
  ctx: SheetContext,
  base: PanelState,
  rows: readonly SheetRow[]
): PanelState {
  const tree = treeOf(ctx.kind, base);
  const sheetRows = rows.flatMap((row) => {
    const field = fieldOf(ctx, row.key);
    return field !== undefined && isRowActive(field, row.state)
      ? [{ field, state: row.state }]
      : [];
  });
  return stateOf(ctx.kind, {
    ...tree,
    rows: [
      ...tree.rows.filter((row) => !ctx.free.has(row.field.key)),
      ...sheetRows,
    ],
  });
}

/**
 * The sheet's rows for a whole new draft (a pinned toggle, a value picked
 * in the field list, a group removed): each of its free root rows keeps the
 * id and the place of the row it was; a row waiting for a value of its
 * field takes it, else it goes after its field's last row
 */
function rowsOf(
  ctx: SheetContext,
  next: PanelState,
  previous: readonly SheetRow[],
  newId: () => string
): SheetRow[] {
  const incoming = new Map<string, PanelState[]>();
  for (const row of treeOf(ctx.kind, next).rows) {
    if (!ctx.free.has(row.field.key)) continue;
    incoming.set(row.field.key, [
      ...(incoming.get(row.field.key) ?? []),
      row.state,
    ]);
  }
  const take = (key: string) => incoming.get(key)?.shift();
  const kept = previous.flatMap((row): SheetRow[] => {
    if (!isActive(ctx, row)) return [row];
    const state = take(row.key);
    return state === undefined ? [] : [{ ...row, state }];
  });
  let rows = kept.map((row) => {
    if (isActive(ctx, row)) return row;
    const state = take(row.key);
    return state === undefined ? row : { ...row, state };
  });
  for (const [key, states] of incoming) {
    for (const state of states) {
      rows = insertRow(ctx, rows, { id: newId(), key, state });
    }
  }
  return rows;
}

/**
 * Each row's control id, `filter-<rowKeyOf(...)>` with dots as dashes: the
 * rows with a value numbered as the draft numbers them, a waiting row after
 * its field's last
 */
function controlIdsOf(
  ctx: SheetContext,
  rows: readonly SheetRow[]
): ReadonlyMap<string, string> {
  const active = new Map<string, number>();
  for (const row of rows) {
    if (isActive(ctx, row)) active.set(row.key, (active.get(row.key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const waiting = new Map<string, number>();
  return new Map(
    rows.map((row) => {
      let occurrence: number;
      if (isActive(ctx, row)) {
        occurrence = (seen.get(row.key) ?? 0) + 1;
        seen.set(row.key, occurrence);
      } else {
        const extra = (waiting.get(row.key) ?? 0) + 1;
        waiting.set(row.key, extra);
        occurrence = (active.get(row.key) ?? 0) + extra;
      }
      const key = rowKeyOf(0, occurrence, row.key).replace(/\./g, "-");
      return [row.id, `filter-${key}`] as const;
    })
  );
}

/** What takes focus next: a row's control (by its id) or the field list */
type FocusTarget = { readonly id: string } | "add" | undefined;

const OpenSheet = ({
  filters,
  open,
  focusKey,
  onClose,
  countRequestOf,
  permanentFilters = NONE,
  permanentChips = NO_CHIPS,
}: FilterSheetProps) => {
  const { kind, options } = filters;
  const pinning = useListPinning(kind, options);
  const nextId = useRef(0);
  const newId = () => {
    nextId.current += 1;
    return `sheet-row-${nextId.current}`;
  };

  const ctx = useMemo<SheetContext>(
    () => ({
      kind,
      fields: PANEL_FIELDS[kind],
      free: new Map(
        options
          .filter(
            (option) =>
              option.type !== "section-header" &&
              permanentFilters[option.key] === undefined
          )
          .map((option) => [option.key, option] as const)
      ),
    }),
    [kind, options, permanentFilters]
  );

  // Taken once, when the sheet opens; a chip's row with no value (a pinned
  // field's empty chip) waits as a new row of its field
  const [opened] = useState(() => {
    const first = rowsOf(ctx, filters.filters, [], newId);
    const focusOf = (rows: SheetRow[], id: string): FocusTarget => {
      const control = controlIdsOf(ctx, rows).get(id);
      return control === undefined ? undefined : { id: control };
    };
    if (focusKey === undefined || focusKey === "add") {
      return { rows: first, focus: focusKey as FocusTarget };
    }
    const found =
      focusKey.group === 0
        ? first.filter((row) => row.key === focusKey.key)[
            focusKey.occurrence - 1
          ]
        : undefined;
    if (found) return { rows: first, focus: focusOf(first, found.id) };
    if (!ctx.free.has(focusKey.key)) {
      return { rows: first, focus: undefined as FocusTarget };
    }
    const waiting = { id: newId(), key: focusKey.key, state: {} };
    const rows = insertRow(ctx, first, waiting);
    return { rows, focus: focusOf(rows, waiting.id) };
  });
  const [base, setBase] = useState<PanelState>(filters.filters);
  const [rows, setRows] = useState<readonly SheetRow[]>(opened.rows);
  const draft = useMemo(() => draftOf(ctx, base, rows), [ctx, base, rows]);
  const tree = useMemo(() => treeOf(kind, draft), [kind, draft]);
  const controlIds = useMemo(() => controlIdsOf(ctx, rows), [ctx, rows]);

  // The count follows the draft, typing once it pauses
  const [counted, setCounted] = useState<PanelState>(draft);
  const typing = useFlushableDebounce(
    (next: PanelState) => setCounted(next),
    TYPING_DELAY
  );
  const request = countRequestOf(counted);
  const count = useListCount(kind, request?.body ?? null, {
    enabled: open,
    ...(request?.path === undefined ? {} : { path: request.path }),
  });

  const [advanced, setAdvanced] = useState<{ focusGroup?: number } | null>(
    null
  );

  // Focus: the row a chip opened, the field list, or a row just added
  const [focus, setFocus] = useState<{ target: FocusTarget }>({
    target: opened.focus,
  });
  const bodyRef = useRef<HTMLDivElement>(null);

  // Runs after the dialog's own focus on open (a child's effects run first)
  useEffect(() => {
    const { target } = focus;
    if (target === undefined) return;
    const element =
      target === "add"
        ? bodyRef.current?.querySelector<HTMLElement>('[role="combobox"]')
        : document.getElementById(target.id);
    element?.scrollIntoView({ block: "nearest" });
    element?.focus();
  }, [focus]);

  /** Moves focus to a row's control once drawn */
  const focusRow = (nextRows: readonly SheetRow[], id: string) => {
    const control = controlIdsOf(ctx, nextRows).get(id);
    if (control !== undefined) setFocus({ target: { id: control } });
  };

  /** A whole new draft: the rows follow it, and it counts at once */
  const replaceDraft = (next: PanelState) => {
    const nextRows = rowsOf(ctx, next, rows, newId);
    setBase(next);
    setRows(nextRows);
    typing.cancel();
    setCounted(draftOf(ctx, next, nextRows));
  };

  const editRow = (id: string, state: PanelState) => {
    const nextRows = rows.map((row) =>
      row.id === id ? { ...row, state } : row
    );
    setRows(nextRows);
    const next = draftOf(ctx, base, nextRows);
    const field = fieldOf(ctx, rows.find((row) => row.id === id)?.key ?? "");
    if (field !== undefined && isTyped(field)) {
      typing.run(next);
    } else {
      typing.cancel();
      setCounted(next);
    }
  };

  const removeSheetRow = (id: string) => {
    const nextRows = rows.filter((row) => row.id !== id);
    setRows(nextRows);
    typing.cancel();
    setCounted(draftOf(ctx, base, nextRows));
  };

  // A field picked in the list: its first row's editor, else a new row
  const pickField = (option: FilterOption) => {
    const existing = rows.find((row) => row.key === option.key);
    if (existing) {
      focusRow(rows, existing.id);
      return;
    }
    const added = { id: newId(), key: option.key, state: {} };
    const nextRows = insertRow(ctx, rows, added);
    setRows(nextRows);
    focusRow(nextRows, added.id);
  };

  // The draft as a list's filters, for the field list (a value picked there
  // goes to the draft)
  const draftFilters: ListFilters = {
    kind,
    filters: draft,
    tree,
    options,
    commit: replaceDraft,
    setRow: (at, next) => replaceDraft(setRow(kind, draft, at, next)),
    removeRow: (at) => replaceDraft(removeRow(kind, draft, at)),
    removeGroup: (group) => replaceDraft(removeGroup(kind, draft, group)),
    clear: () => replaceDraft(clearFilters(kind, draft)),
  };

  const clearAll = () => {
    const next = clearFilters(kind, draft);
    setBase(next);
    setRows([]);
    typing.cancel();
    setCounted(next);
  };

  const apply = (next: PanelState) => {
    if (!filtersEqual(kind, next, filters.filters)) filters.commit(next);
    onClose();
  };

  // A number only once this draft's count has come back
  const shown =
    count.isFetching || count.isError || !filtersEqual(kind, counted, draft)
      ? undefined
      : count.data;
  const showText =
    shown === undefined
      ? "Show results"
      : `Show ${shown.toLocaleString()} ${shown === 1 ? "result" : "results"}`;

  const hasFilters = tree.rows.length > 0 || tree.groups.length > 0;
  const groups = tree.groups.map((group, index) => ({
    number: index + 1,
    text: groupText(
      group.match,
      group.rows.map(
        (row) =>
          options.find((option) => option.key === row.field.key)?.label ??
          row.field.key
      )
    ),
  }));

  return (
    <>
      <Modal
        isOpen={advanced === null}
        onClose={onClose}
        title="Filters"
        size="full"
        footer={
          <Button
            variant="primary"
            className="w-full"
            onClick={() => apply(draft)}
          >
            {showText}
          </Button>
        }
      >
        <div ref={bodyRef} data-tv-cells="" className="flex flex-col gap-4">
          {pinning.shownPins.filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {pinning.shownPins.filters.map((pin) => (
                <PinnedFilterToggle
                  key={pin.id}
                  kind={kind}
                  pin={pin}
                  on={isPinnedFilterOn(kind, draft, pin)}
                  entityType={
                    options.find((option) => option.key === pin.key)?.entityType
                  }
                  onToggle={() =>
                    replaceDraft(togglePinnedFilter(kind, draft, pin))
                  }
                  onUnpin={() =>
                    pinning.save(unpinFilter(pinning.pins, pin.id))
                  }
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAdvanced({})}
              aria-haspopup="dialog"
              className="rounded-full"
              icon={
                <LucideSlidersHorizontal
                  className="w-4 h-4"
                  aria-hidden="true"
                />
              }
            >
              Advanced
            </Button>
            {(hasFilters || rows.length > 0) && (
              <Button variant="tertiary" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
          {(tree.match === "any" || groups.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {tree.match === "any" && (
                <GroupChip
                  rowKey="match"
                  text="Match any"
                  onEdit={() => setAdvanced({})}
                />
              )}
              {groups.map(({ number, text }) => (
                <GroupChip
                  key={`g${number}`}
                  rowKey={`g${number}`}
                  text={text}
                  onEdit={() => setAdvanced({ focusGroup: number })}
                  onRemove={() =>
                    replaceDraft(removeGroup(kind, draft, number))
                  }
                />
              ))}
            </div>
          )}
          {rows.map((row) => {
            const option = ctx.free.get(row.key);
            const field = fieldOf(ctx, row.key);
            if (option === undefined || field === undefined) return null;
            const label = option.label ?? option.key;
            return (
              <div
                key={row.id}
                data-sheet-row={row.id}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border-color)" }}
              >
                <ChipEditorHeader
                  label={label}
                  field={field}
                  state={row.state}
                  pinning={pinning.pinningOf(row.key)}
                  onRemove={() => removeSheetRow(row.id)}
                  level={4}
                />
                <FieldEditor
                  option={option}
                  state={row.state}
                  onChange={(next) => editRow(row.id, next)}
                  controlId={controlIds.get(row.id) ?? `filter-${row.id}`}
                  hideLabel
                />
              </div>
            );
          })}
          <section aria-label="Add a filter">
            <h4
              className="mb-2 text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Add a filter
            </h4>
            <AddFilterMenu
              filters={draftFilters}
              pinnedFields={pinning.shownPins.fields}
              onPick={pickField}
              inline
            />
          </section>
        </div>
      </Modal>
      {advanced !== null && (
        <AdvancedFilterView
          isOpen
          onClose={() => setAdvanced(null)}
          kind={kind}
          value={draft}
          onApply={apply}
          permanentChips={permanentChips}
          {...(advanced.focusGroup === undefined
            ? {}
            : { focusGroup: advanced.focusGroup })}
        />
      )}
    </>
  );
};

export default FilterSheet;
