import { useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import {
  type ContainerId,
  type FilterOption,
  type PanelState,
  rowKeysOf,
} from "../../utils/filterFields";
import { FieldEditor, Popover } from "../ui/index";
import { rowControlIds, waitingSelectId } from "./controlIds";

/** One field the field select offers */
export interface FieldChoice {
  readonly key: string;
  readonly label: string;
}

/** A run of one section's fields: an `<optgroup>` of the field select */
export interface FieldSection {
  readonly label: string;
  readonly fields: readonly FieldChoice[];
}

/** A container a row may move to */
export interface MoveTarget {
  readonly id: ContainerId;
  /** "top level", "group 1" */
  readonly label: string;
}

/** A row that holds a field */
export interface FilterRowValue {
  readonly id: string;
  /** The row's panel key */
  readonly key: string;
  /** The key's option as the list draws it; undefined for a key no option draws */
  readonly option: FilterOption | undefined;
  /** The row's own keys, unprefixed */
  readonly state: PanelState;
}

export interface FilterRowProps {
  /** What the field select offers, by section */
  readonly sections: readonly FieldSection[];
  /** The row; absent for the row waiting at the end of its container */
  readonly row?: FilterRowValue;
  /** The row's container */
  readonly containerId?: ContainerId;
  /** The container's name ("top level", "Group 1"): the waiting row's label */
  readonly containerLabel: string;
  /** A carousel's picks list everything the user sees, not only what the list holds */
  readonly pickFromAll?: boolean;
  /** A field chosen in the field select */
  readonly onFieldChange: (key: string) => void;
  /** The row's next state, whole */
  readonly onChange?: (next: PanelState) => void;
  /** The containers the row may move to (not its own) */
  readonly moveTargets?: readonly MoveTarget[];
  readonly onMove?: (to: ContainerId) => void;
  readonly onRemove?: () => void;
}

const SELECT_CLASS = "w-full px-3 py-2 rounded-lg border text-sm";
const SELECT_STYLE = {
  backgroundColor: "var(--bg-primary)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
} as const;
const LABEL_STYLE = { color: "var(--text-muted)" } as const;

/**
 * The option the value cell draws: the row keeps its own condition and
 * sub-items controls, and a carousel's picks are not narrowed to what the
 * library holds
 */
const valueOption = (option: FilterOption, pickFromAll: boolean) => {
  const {
    modifierOptions: _conditions,
    supportsHierarchy: _subItems,
    countFilterContext,
    ...rest
  } = option;
  return pickFromAll || countFilterContext === undefined
    ? rest
    : { ...rest, countFilterContext };
};

/** The field select's sections as `<optgroup>`s */
const FieldOptions = ({ sections }: { sections: readonly FieldSection[] }) => (
  <>
    {sections.map((section, at) => (
      <optgroup key={`${section.label}-${at}`} label={section.label}>
        {section.fields.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </optgroup>
    ))}
  </>
);

interface ActionsProps {
  rowId: string;
  label: string;
  moveTargets: readonly MoveTarget[];
  onMove: ((to: ContainerId) => void) | undefined;
  onRemove: (() => void) | undefined;
}

/**
 * The row's actions menu: Move to each other container, and Remove. The
 * menu moves focus among its items itself (TV focus leaves the items of a
 * `role="menu"` to it); Escape closes it and focus returns to the button.
 */
const RowActions = ({
  rowId,
  label,
  moveTargets,
  onMove,
  onRemove,
}: ActionsProps) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onMenuKeyDown = useRovingFocus(menuRef, {
    itemSelector: '[role="menuitem"]',
  });
  const act = (run: (() => void) | undefined) => {
    setOpen(false);
    run?.();
  };
  const itemClass =
    "w-full text-left px-3 py-1.5 rounded text-sm transition-colors hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)]";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        id={rowControlIds(rowId).actions}
        type="button"
        aria-label={`Row actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="p-2 rounded-lg border transition-colors"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>
      <Popover
        anchorRef={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
        label={`Row actions for ${label}`}
        placement="bottom-end"
      >
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Row actions for ${label}`}
          tabIndex={-1}
          data-popover-focus=""
          onKeyDown={onMenuKeyDown}
          className="p-1 flex flex-col gap-0.5 min-w-[11rem] focus:outline-none"
        >
          {moveTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              role="menuitem"
              className={itemClass}
              style={{ color: "var(--text-primary)" }}
              onClick={() => act(() => onMove?.(target.id))}
            >
              {`Move to ${target.label}`}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            style={{ color: "var(--text-primary)" }}
            onClick={() => act(onRemove)}
          >
            Remove
          </button>
        </div>
      </Popover>
    </div>
  );
};

/**
 * One row of the row editor: its field select, its condition, the value
 * editor (A1's `FieldEditor`), the sub-items box and a Row actions menu
 * (Move to, Remove). Without a row it is the waiting row: only a field
 * select reading "Add a filter…". One line on a wide screen, wrapping;
 * stacked full width below `sm`.
 */
const FilterRow = ({
  sections,
  row,
  containerId = "root",
  containerLabel,
  pickFromAll = false,
  onFieldChange,
  onChange,
  moveTargets = [],
  onMove,
  onRemove,
}: FilterRowProps) => {
  if (row === undefined) {
    const id = waitingSelectId(containerId);
    return (
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start gap-3">
        <div className="w-full sm:w-auto sm:min-w-[12rem]">
          <label htmlFor={id} className="sr-only">
            {`Add a filter to ${containerLabel}`}
          </label>
          <select
            id={id}
            value=""
            onChange={(event) => {
              if (event.target.value !== "") onFieldChange(event.target.value);
            }}
            className={SELECT_CLASS}
            style={{ ...SELECT_STYLE, color: "var(--text-secondary)" }}
          >
            <option value="">Add a filter…</option>
            <FieldOptions sections={sections} />
          </select>
        </div>
      </div>
    );
  }

  const { option, state } = row;
  const ids = rowControlIds(row.id);
  const label = option?.label ?? row.key;
  const modifierKey = option?.modifierKey;
  const modifier = modifierKey === undefined ? undefined : state[modifierKey];
  const modifierValue =
    (typeof modifier === "string" ? modifier : undefined) ??
    option?.defaultModifier;
  // "Not set" and "Set" on a range, "Has none" and "Has any" on a picker,
  // a select of values or a text field, take no value
  const takesPresence =
    option?.type === "range" ||
    option?.type === "searchable-select" ||
    option?.type === "select" ||
    option?.type === "text";
  const presence =
    takesPresence &&
    (modifierValue === "IS_NULL" || modifierValue === "NOT_NULL");
  const hierarchyKey = option?.hierarchyKey;
  const depth = hierarchyKey === undefined ? undefined : state[hierarchyKey];

  /** The row's state with these keys replaced; a cleared companion leaves it */
  const change = (partial: PanelState) => {
    if (option === undefined) return;
    const owned = new Set(rowKeysOf(option));
    onChange?.(
      Object.fromEntries(
        Object.entries({ ...state, ...partial }).filter(
          ([key, each]) => owned.has(key) && each !== undefined
        )
      )
    );
  };

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start gap-3">
      {/* Field */}
      <div className="w-full sm:w-auto sm:min-w-[10rem] space-y-1">
        <label
          htmlFor={ids.field}
          className="block text-xs"
          style={LABEL_STYLE}
        >
          Filter
        </label>
        <select
          id={ids.field}
          value={row.key}
          onChange={(event) => onFieldChange(event.target.value)}
          className={SELECT_CLASS}
          style={SELECT_STYLE}
        >
          <FieldOptions sections={sections} />
        </select>
      </div>

      {/* Condition */}
      {option?.modifierOptions !== undefined &&
        option.modifierOptions.length > 0 &&
        modifierKey !== undefined && (
          <div className="w-full sm:w-auto sm:min-w-[8rem] space-y-1">
            <label
              htmlFor={ids.condition}
              className="block text-xs"
              style={LABEL_STYLE}
            >
              Condition
            </label>
            <select
              id={ids.condition}
              value={modifierValue}
              onChange={(event) =>
                change({ [modifierKey]: event.target.value })
              }
              className={SELECT_CLASS}
              style={SELECT_STYLE}
            >
              {option.modifierOptions.map((each) => (
                <option key={each.value} value={each.value}>
                  {each.label}
                </option>
              ))}
            </select>
          </div>
        )}

      {/* Value; a presence choice takes none */}
      {!presence && (
        <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[12rem] space-y-1">
          <span
            className="block text-xs"
            style={LABEL_STYLE}
            aria-hidden="true"
          >
            Value
          </span>
          {option === undefined ? (
            <span style={{ color: "var(--text-secondary)" }}>
              Unknown filter
            </span>
          ) : (
            <FieldEditor
              option={valueOption(option, pickFromAll)}
              state={state}
              onChange={(next) => onChange?.(next)}
              controlId={ids.value}
              hideLabel
            />
          )}
        </div>
      )}

      {/* Sub-items */}
      {option?.supportsHierarchy === true &&
        hierarchyKey !== undefined &&
        !presence && (
          <div className="space-y-1">
            <span
              className="block text-xs"
              style={LABEL_STYLE}
              aria-hidden="true"
            >
              Sub-items
            </span>
            <label className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                checked={depth === -1}
                onChange={(event) =>
                  change({
                    [hierarchyKey]: event.target.checked ? -1 : undefined,
                  })
                }
                className="rounded border"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {option.hierarchyLabel ?? "Include all"}
              </span>
            </label>
          </div>
        )}

      {/* Row actions */}
      <div className="space-y-1 self-end sm:self-start">
        <span className="block text-xs invisible" aria-hidden="true">
          Actions
        </span>
        <RowActions
          rowId={row.id}
          label={label}
          moveTargets={moveTargets}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
};

export default FilterRow;
