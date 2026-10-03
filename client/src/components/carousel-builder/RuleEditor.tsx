import { useId } from "react";
import deepEqual from "fast-deep-equal";
import { Trash2 } from "lucide-react";
import {
  CAROUSEL_FILTER_DEFINITIONS,
  type FilterOption,
} from "../../utils/filterConfig";
import { type PanelState, valuesOf } from "../../utils/filterFields";
import { Button, FieldEditor } from "../ui/index";

interface CarouselRule {
  id: string;
  filterKey: string;
  value: unknown;
  /** A picker's excluded ids, where its field takes them */
  excludes?: string[] | undefined;
  modifier?: string | undefined;
  depth?: number | undefined;
}

interface Props {
  rule: CarouselRule;
  usedFilterKeys: Set<string>;
  onChange: (updates: Partial<CarouselRule>) => void;
  onRemove: () => void;
}

/** The row's state from a rule: its value, condition, depth and excluded picks */
const rowStateOf = (def: FilterOption, rule: CarouselRule): PanelState => {
  const entries: Array<[string | undefined, unknown]> = [
    [def.key, rule.value],
    [def.modifierKey, rule.modifier],
    [def.hierarchyKey, rule.depth],
    [def.excludeKey, rule.excludes],
  ];
  return Object.fromEntries(
    entries.filter(
      (entry): entry is [string, unknown] =>
        entry[0] !== undefined && entry[1] !== undefined
    )
  );
};

/**
 * The option the value cell draws: this editor keeps its own condition and
 * sub-items controls, and a carousel's picks are not narrowed to what the
 * library holds
 */
const valueOption = (def: FilterOption): FilterOption => {
  const {
    modifierOptions: _conditions,
    supportsHierarchy: _subItems,
    countFilterContext: _counted,
    ...rest
  } = def;
  return rest;
};

/** What a row's next state changes on its rule */
const updatesOf = (
  def: FilterOption,
  before: PanelState,
  after: PanelState
): Partial<CarouselRule> => {
  const changed = (key: string | undefined): key is string =>
    key !== undefined && !deepEqual(before[key], after[key]);
  const { modifierKey, hierarchyKey, excludeKey } = def;
  const modifier = modifierKey === undefined ? undefined : after[modifierKey];
  const depth = hierarchyKey === undefined ? undefined : after[hierarchyKey];
  return {
    ...(changed(def.key) ? { value: after[def.key] ?? "" } : {}),
    ...(changed(modifierKey)
      ? { modifier: typeof modifier === "string" ? modifier : undefined }
      : {}),
    ...(changed(hierarchyKey)
      ? { depth: typeof depth === "number" ? depth : undefined }
      : {}),
    ...(changed(excludeKey)
      ? {
          excludes:
            after[excludeKey] === undefined
              ? undefined
              : valuesOf(after[excludeKey]),
        }
      : {}),
  };
};

/**
 * RuleEditor Component
 * Edits a single filter rule for the carousel builder.
 * Renders appropriate input based on filter type.
 */
const RuleEditor = ({ rule, usedFilterKeys, onChange, onRemove }: Props) => {
  const filterSelectId = useId();
  const filterDef = CAROUSEL_FILTER_DEFINITIONS.find(
    (f) => f.key === rule.filterKey
  );

  // Get available filters (current + unused)
  const availableFilters = CAROUSEL_FILTER_DEFINITIONS.filter(
    (f) => f.key === rule.filterKey || !usedFilterKeys.has(f.key)
  );

  // "Not set" and "Set" on a range, "Has none" and "Has any" on a picker,
  // a select of values or a text field, take no value
  const takesPresence =
    filterDef?.type === "range" ||
    filterDef?.type === "searchable-select" ||
    filterDef?.type === "select" ||
    filterDef?.type === "text";
  const presence =
    takesPresence &&
    (rule.modifier === "IS_NULL" || rule.modifier === "NOT_NULL");

  const rowState = filterDef ? rowStateOf(filterDef, rule) : {};

  const handleFilterChange = (newFilterKey: string) => {
    const newDef = CAROUSEL_FILTER_DEFINITIONS.find(
      (f) => f.key === newFilterKey
    );
    if (!newDef) return;

    // Reset value when changing filter type
    onChange({
      filterKey: newFilterKey,
      value: newDef.type === "checkbox" ? true : newDef.multi ? [] : "",
      excludes: undefined,
      modifier: newDef.defaultModifier,
    });
  };

  return (
    <div
      className="flex flex-wrap items-start gap-3 p-3 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Filter Selector */}
      <div className="space-y-1 min-w-[150px]">
        <label
          htmlFor={filterSelectId}
          className="block text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Filter
        </label>
        <select
          id={filterSelectId}
          value={rule.filterKey}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          {availableFilters.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Modifier (if applicable) */}
      {filterDef?.modifierOptions && (
        <div className="space-y-1 min-w-[120px]">
          <label
            className="block text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Condition
          </label>
          <select
            aria-label="Condition"
            value={rule.modifier ?? filterDef.defaultModifier}
            onChange={(e) => onChange({ modifier: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {filterDef.modifierOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Value Input; a presence choice takes no value */}
      {!presence && (
        <div className="flex-1 min-w-[200px] space-y-1">
          <label
            className="block text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Value
          </label>
          {filterDef ? (
            <FieldEditor
              option={valueOption(filterDef)}
              state={rowState}
              onChange={(next) =>
                onChange(updatesOf(filterDef, rowState, next))
              }
              hideLabel
            />
          ) : (
            <span style={{ color: "var(--text-secondary)" }}>
              Unknown filter
            </span>
          )}
        </div>
      )}

      {/* Hierarchy Toggle */}
      {filterDef?.supportsHierarchy && !presence && (
        <div className="space-y-1">
          <label
            className="block text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Sub-items
          </label>
          <label className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              checked={rule.depth === -1}
              onChange={(e) =>
                onChange({ depth: e.target.checked ? -1 : undefined })
              }
              className="rounded border"
              style={{ accentColor: "var(--accent-primary)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Include all
            </span>
          </label>
        </div>
      )}

      {/* Remove Button */}
      <div className="space-y-1">
        <label className="block text-xs invisible">Action</label>
        <Button
          variant="secondary"
          onClick={onRemove}
          className="p-2"
          icon={<Trash2 className="w-4 h-4" />}
          title="Remove rule"
        />
      </div>
    </div>
  );
};

export default RuleEditor;
