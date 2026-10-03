import { forwardRef } from "react";
import type { NumberDisplay } from "../../utils/filterFields";
import CheckboxGroup from "./CheckboxGroup";
import {
  ImperialHeightRange,
  ImperialLengthRange,
  ImperialWeightRange,
  ShownRange,
} from "./MeasureInputs";
import SearchableSelect from "./SearchableSelect";

interface SortOption {
  value: string;
  label: string;
}

interface SortControlProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

/**
 * Reusable Sort Control Component
 */
export const SortControl = ({
  options,
  value,
  onChange,
  label,
}: SortControlProps) => {
  // Standardized styles (same as FilterControl)
  const baseInputStyle = {
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
    color: "var(--text-primary)",
  };
  const inputClasses = "px-3 py-2 border rounded-md text-sm";

  return (
    <div className="flex items-center">
      {label && (
        <label
          className="text-sm font-medium mr-2"
          style={{ color: "var(--text-primary)" }}
        >
          {label}:
        </label>
      )}
      <select
        aria-label="Sort by"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
        style={baseInputStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Reusable Filter Control Component
 */
interface RangeValue {
  min?: string | number;
  max?: string | number;
  start?: string;
  end?: string;
}

export interface FilterControlProps {
  type?:
    | "select"
    | "searchable-select"
    | "checkbox"
    | "number"
    | "text"
    | "date"
    | "range"
    | "imperial-height-range"
    | "date-range"
    | "time-range";
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  options?: SortOption[];
  placeholder?: string;
  /** A text input's most characters (its contract field's limit) */
  maxLength?: number;
  min?: number;
  max?: number;
  /**
   * An imperial viewer's body measure: shown in feet and inches, lbs or
   * inches, held in metric (a `range` draws the weight or length editor)
   */
  measure?: "height" | "weight" | "length";
  /**
   * A range shown and typed in another scale than it is stored (a
   * rating100 as 0 to 10)
   */
  display?: NumberDisplay | undefined;
  entityType?: string;
  /** A picker takes several; a select of values draws a box for each */
  multi?: boolean;
  /** A select that always holds one of its choices: no blank option */
  noBlank?: boolean;
  countFilterContext?: string | null;
  modifierOptions?: SortOption[];
  modifierValue?: string;
  onModifierChange?: (value: string) => void;
  supportsHierarchy?: boolean;
  hierarchyLabel?: string;
  hierarchyValue?: number | undefined;
  onHierarchyChange?: (value: number | undefined) => void;
  /** The id of the field's first control, where a chip moves focus */
  controlId?: string;
  /** The label stays for assistive technology only (a surface that names the field elsewhere) */
  hideLabel?: boolean;
  /** A picker's excluded values (its field's exclude companion) */
  excluded?: readonly string[] | undefined;
  /**
   * Given (a picker whose field takes exclusions), each picked value
   * includes or excludes under Has ANY and Has ALL; under Has NONE every
   * value already excludes, so no toggle shows
   */
  onSelectionChange?:
    | ((included: string[], excluded: string[]) => void)
    | undefined;
  /** A picker opens its list once drawn (a filter chip's editor) */
  openPicker?: boolean;
}

export const FilterControl = forwardRef<HTMLDivElement, FilterControlProps>(
  (
    {
      type = "select",
      label,
      value,
      onChange,
      options = [],
      placeholder = "",
      maxLength,
      min,
      max,
      measure,
      display,
      entityType,
      multi,
      noBlank = false,
      countFilterContext,
      modifierOptions,
      modifierValue,
      onModifierChange,
      supportsHierarchy = false,
      hierarchyLabel = "Include children",
      hierarchyValue,
      onHierarchyChange,
      controlId,
      hideLabel = false,
      excluded,
      onSelectionChange,
      openPicker = false,
    },
    ref
  ) => {
    // Standardized styles for all inputs in the filter panel
    const baseInputStyle = {
      backgroundColor: "var(--bg-card)",
      borderColor: "var(--border-color)",
      color: "var(--text-primary)",
    };

    // Standardized classes for all inputs (text, number, date, select)
    const inputClasses = "px-3 py-2 border rounded-md text-sm w-full";

    const renderInput = () => {
      switch (type) {
        case "checkbox":
          return (
            <label className="flex items-center cursor-pointer">
              <input
                id={controlId}
                type="checkbox"
                checked={value === true || value === "TRUE"}
                onChange={(e) => onChange(e.target.checked)}
                className="w-4 h-4 rounded border cursor-pointer"
                style={{
                  accentColor: "var(--accent-primary)",
                }}
              />
              <span
                className="ml-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {placeholder || "Enable"}
              </span>
            </label>
          );
        case "select": {
          // "Has none" and "Has any" take no value: the choices are not drawn
          const presence =
            modifierValue === "IS_NULL" || modifierValue === "NOT_NULL";
          const hasCondition =
            modifierOptions !== undefined && modifierOptions.length > 0;
          const picked = Array.isArray(value)
            ? value.map(String)
            : typeof value === "string" && value !== ""
              ? [value]
              : [];
          return (
            <div className="space-y-2">
              {/* Modifier dropdown (if provided) */}
              {hasCondition && (
                <select
                  id={controlId}
                  aria-label={`${label} condition`}
                  value={modifierValue}
                  onChange={(e) => onModifierChange?.(e.target.value)}
                  className={inputClasses}
                  style={baseInputStyle}
                >
                  {modifierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {/* Main select, or a box per value for a multi one */}
              {presence ? null : multi ? (
                <CheckboxGroup
                  id={hasCondition ? undefined : controlId}
                  label={label}
                  options={options}
                  value={picked}
                  onChange={(next) => onChange(next)}
                />
              ) : (
                <select
                  id={hasCondition ? undefined : controlId}
                  aria-label={hasCondition ? label : undefined}
                  value={
                    typeof value === "boolean"
                      ? String(value)
                      : (value as string)
                  }
                  onChange={(e) => onChange(e.target.value)}
                  className={inputClasses}
                  style={baseInputStyle}
                >
                  {noBlank ? null : (
                    <option value="">{placeholder || `All ${label}`}</option>
                  )}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        }
        case "searchable-select": {
          // "Has none" and "Has any" take no picks: the picker and its
          // sub-items box are not drawn
          const presence =
            modifierValue === "IS_NULL" || modifierValue === "NOT_NULL";
          // Under Has NONE every value excludes: no toggle, the excluded
          // values shown as picks
          const toggleable = modifierValue !== "EXCLUDES";
          return (
            <div className="space-y-2">
              {/* Modifier dropdown (if provided) */}
              {modifierOptions && modifierOptions.length > 0 && (
                <select
                  id={controlId}
                  aria-label={`${label} condition`}
                  value={modifierValue}
                  onChange={(e) => onModifierChange?.(e.target.value)}
                  className={inputClasses}
                  style={baseInputStyle}
                >
                  {modifierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              {/* Main select */}
              {!presence && (
                <SearchableSelect
                  id={modifierOptions?.length ? undefined : controlId}
                  label={label}
                  entityType={
                    entityType as
                      | "scenes"
                      | "performers"
                      | "studios"
                      | "tags"
                      | "galleries"
                      | "groups"
                      | "playlists"
                  }
                  value={value as string | string[]}
                  onChange={onChange as (value: string | string[]) => void}
                  multi={multi}
                  placeholder={placeholder || `Select ${label}...`}
                  countFilterContext={
                    countFilterContext as
                      | "performers"
                      | "scenes"
                      | "galleries"
                      | "groups"
                      | "images"
                      | null
                      | undefined
                  }
                  excluded={excluded}
                  onSelectionChange={onSelectionChange}
                  openOnMount={openPicker}
                  excludeToggle={toggleable}
                />
              )}
              {/* Hierarchy checkbox (for tags/studios) */}
              {!presence && supportsHierarchy && onHierarchyChange && (
                <label className="flex items-center cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={hierarchyValue === -1}
                    onChange={(e) =>
                      onHierarchyChange(e.target.checked ? -1 : undefined)
                    }
                    className="w-4 h-4 rounded border cursor-pointer"
                    style={{
                      accentColor: "var(--accent-primary)",
                    }}
                  />
                  <span
                    className="ml-2 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {hierarchyLabel}
                  </span>
                </label>
              )}
            </div>
          );
        }
        case "number":
          return (
            <input
              id={controlId}
              type="number"
              value={value as string | number | undefined}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              min={min}
              max={max}
              className={inputClasses}
              style={baseInputStyle}
            />
          );
        case "text": {
          // A field with a condition select (Path's Starts with): the select
          // first, named "<label> condition"; "Has none" and "Has any" take
          // no text, so the box is not drawn
          const hasCondition =
            modifierOptions !== undefined && modifierOptions.length > 0;
          const presence =
            modifierValue === "IS_NULL" || modifierValue === "NOT_NULL";
          const box = (
            <input
              id={hasCondition ? undefined : controlId}
              type="text"
              aria-label={hasCondition ? label : undefined}
              value={value as string | undefined}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              maxLength={maxLength}
              className={inputClasses}
              style={baseInputStyle}
            />
          );
          if (!hasCondition) return box;
          return (
            <div className="space-y-2">
              <select
                id={controlId}
                aria-label={`${label} condition`}
                value={modifierValue}
                onChange={(e) => onModifierChange?.(e.target.value)}
                className={inputClasses}
                style={baseInputStyle}
              >
                {modifierOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {presence ? null : box}
            </div>
          );
        }
        case "date":
          return (
            <input
              id={controlId}
              type="date"
              value={value as string | undefined}
              onChange={(e) => onChange(e.target.value)}
              className={inputClasses}
              style={baseInputStyle}
            />
          );
        case "range":
        case "imperial-height-range": {
          // A field that takes IS_NULL: a condition select first; while
          // "Not set" or "Set" is chosen the bounds are not drawn
          const hasCondition =
            modifierOptions !== undefined && modifierOptions.length > 0;
          const boundsId = hasCondition ? undefined : controlId;
          const presence =
            modifierValue === "IS_NULL" || modifierValue === "NOT_NULL";
          const rangeVal = (value || {}) as RangeValue;
          const bounds =
            type === "imperial-height-range" ? (
              <ImperialHeightRange
                id={boundsId}
                value={value}
                onChange={onChange}
                inputClasses={inputClasses}
                inputStyle={baseInputStyle}
              />
            ) : measure === "weight" ? (
              <ImperialWeightRange
                id={boundsId}
                value={value}
                onChange={onChange}
                label={label}
                inputClasses={inputClasses}
                inputStyle={baseInputStyle}
              />
            ) : measure === "length" ? (
              <ImperialLengthRange
                id={boundsId}
                value={value}
                onChange={onChange}
                label={label}
                inputClasses={inputClasses}
                inputStyle={baseInputStyle}
              />
            ) : display !== undefined ? (
              <ShownRange
                id={boundsId}
                value={value}
                onChange={onChange}
                label={label}
                display={display}
                max={max}
                inputClasses={inputClasses}
                inputStyle={baseInputStyle}
              />
            ) : (
              <div className="flex space-x-2">
                <input
                  id={boundsId}
                  type="number"
                  aria-label={`Minimum ${label}`}
                  value={rangeVal.min ?? ""}
                  onChange={(e) =>
                    onChange({ ...rangeVal, min: e.target.value })
                  }
                  placeholder="Min"
                  min={min}
                  max={max}
                  className={inputClasses}
                  style={baseInputStyle}
                />
                <input
                  type="number"
                  aria-label={`Maximum ${label}`}
                  value={rangeVal.max ?? ""}
                  onChange={(e) =>
                    onChange({ ...rangeVal, max: e.target.value })
                  }
                  placeholder="Max"
                  min={min}
                  max={max}
                  className={inputClasses}
                  style={baseInputStyle}
                />
              </div>
            );
          if (!hasCondition) return bounds;
          return (
            <div className="space-y-2">
              <select
                id={controlId}
                aria-label={`${label} condition`}
                value={modifierValue}
                onChange={(e) => onModifierChange?.(e.target.value)}
                className={inputClasses}
                style={baseInputStyle}
              >
                {modifierOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {presence ? null : bounds}
            </div>
          );
        }
        case "date-range": {
          const dateRangeVal = (value || {}) as RangeValue;
          return (
            <div className="flex flex-col space-y-2">
              <div>
                <div
                  className="text-xs mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  From:
                </div>
                <input
                  id={controlId}
                  type="date"
                  aria-label={`${label} from`}
                  value={dateRangeVal.start || ""}
                  onChange={(e) =>
                    onChange({ ...dateRangeVal, start: e.target.value })
                  }
                  className={inputClasses}
                  style={baseInputStyle}
                />
              </div>
              <div>
                <div
                  className="text-xs mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  To:
                </div>
                <input
                  type="date"
                  aria-label={`${label} to`}
                  value={dateRangeVal.end || ""}
                  onChange={(e) =>
                    onChange({ ...dateRangeVal, end: e.target.value })
                  }
                  className={inputClasses}
                  style={baseInputStyle}
                />
              </div>
            </div>
          );
        }
        case "time-range": {
          const timeRangeVal = (value || {}) as RangeValue;
          return (
            <div className="flex space-x-2">
              <input
                id={controlId}
                type="time"
                aria-label={`${label} start`}
                value={timeRangeVal.start || ""}
                onChange={(e) =>
                  onChange({ ...timeRangeVal, start: e.target.value })
                }
                placeholder="Start"
                className="px-3 py-2 border rounded-md text-sm w-full"
                style={baseInputStyle}
              />
              <input
                type="time"
                aria-label={`${label} end`}
                value={timeRangeVal.end || ""}
                onChange={(e) =>
                  onChange({ ...timeRangeVal, end: e.target.value })
                }
                placeholder="End"
                className="px-3 py-2 border rounded-md text-sm w-full"
                style={baseInputStyle}
              />
            </div>
          );
        }
        default:
          return null;
      }
    };

    return (
      <div ref={ref} className="flex flex-col">
        <label
          htmlFor={controlId}
          className={hideLabel ? "sr-only" : "text-sm font-medium mb-2"}
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </label>
        {renderInput()}
      </div>
    );
  }
);

FilterControl.displayName = "FilterControl";
