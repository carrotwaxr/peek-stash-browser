import { forwardRef, useEffect } from "react";
import Button from "./Button.jsx";
import SearchableSelect from "./SearchableSelect.jsx";

/**
 * Reusable Sort Control Component
 */
export const SortControl = ({
  options,
  value,
  onChange,
  label,
}) => {
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
export const FilterControl = forwardRef(({
  type = "select",
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  min,
  max,
  entityType, // for searchable-select
  multi, // for searchable-select
  countFilterContext, // for searchable-select - filter to entities with content in this context
  modifierOptions, // for multi-criterion modifiers
  modifierValue, // current modifier value
  onModifierChange, // modifier change handler
  // Hierarchy support for tags/studios
  supportsHierarchy = false,
  hierarchyLabel = "Include children",
  hierarchyValue, // current depth value (undefined/0 = off, -1 = all)
  onHierarchyChange, // hierarchy change handler
  isHighlighted = false, // for highlight animation when chip is clicked
}, ref) => {
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
      case "select":
        return (
          <div className="space-y-2">
            {/* Modifier dropdown (if provided) */}
            {modifierOptions && modifierOptions.length > 0 && (
              <select
                value={modifierValue}
                onChange={(e) => onModifierChange(e.target.value)}
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
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClasses}
              style={baseInputStyle}
            >
              <option value="">{placeholder || `All ${label}`}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      case "searchable-select": {
        // When hierarchy is enabled, force modifier to INCLUDES
        const isHierarchyEnabled = hierarchyValue === -1;
        const effectiveModifierValue = isHierarchyEnabled ? "INCLUDES" : modifierValue;

        return (
          <div className="space-y-2">
            {/* Modifier dropdown (if provided) */}
            {modifierOptions && modifierOptions.length > 0 && (
              <select
                value={effectiveModifierValue}
                onChange={(e) => onModifierChange(e.target.value)}
                className={inputClasses}
                style={{
                  ...baseInputStyle,
                  ...(isHierarchyEnabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                }}
                disabled={isHierarchyEnabled}
                title={isHierarchyEnabled ? "Locked to 'Has ANY' when hierarchy is enabled" : undefined}
              >
                {modifierOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {/* Main select */}
            <SearchableSelect
              entityType={entityType}
              value={value}
              onChange={onChange}
              multi={multi}
              placeholder={placeholder || `Select ${label}...`}
              countFilterContext={countFilterContext}
            />
            {/* Hierarchy checkbox (for tags/studios) */}
            {supportsHierarchy && onHierarchyChange && (
              <label className="flex items-center cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={hierarchyValue === -1}
                  onChange={(e) => {
                    const newHierarchyValue = e.target.checked ? -1 : undefined;
                    onHierarchyChange(newHierarchyValue);
                    // When enabling hierarchy, force modifier to INCLUDES
                    if (e.target.checked && onModifierChange) {
                      onModifierChange("INCLUDES");
                    }
                  }}
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
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            className={inputClasses}
            style={baseInputStyle}
          />
        );
      case "text":
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={inputClasses}
            style={baseInputStyle}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputClasses}
            style={baseInputStyle}
          />
        );
      case "range":
        return (
          <div className="flex space-x-2">
            <input
              type="number"
              value={value?.min || ""}
              onChange={(e) => onChange({ ...value, min: e.target.value })}
              placeholder="Min"
              min={min}
              max={max}
              className={inputClasses}
              style={baseInputStyle}
            />
            <input
              type="number"
              value={value?.max || ""}
              onChange={(e) => onChange({ ...value, max: e.target.value })}
              placeholder="Max"
              min={min}
              max={max}
              className={inputClasses}
              style={baseInputStyle}
            />
          </div>
        );
      case "imperial-height-range":
        // Imperial height input with feet and inches fields
        return (
          <div className="space-y-2">
            <fieldset>
              <legend
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Min Height:
              </legend>
              <div className="flex space-x-2 mt-1">
                <div className="flex-1">
                  <label htmlFor="height-feet-min" className="sr-only">
                    Minimum height feet
                  </label>
                  <input
                    id="height-feet-min"
                    type="number"
                    value={value?.feetMin || ""}
                    onChange={(e) => onChange({ ...value, feetMin: e.target.value })}
                    placeholder="Feet"
                    min={0}
                    max={8}
                    aria-label="Minimum height in feet"
                    className={inputClasses}
                    style={baseInputStyle}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="height-inches-min" className="sr-only">
                    Minimum height inches
                  </label>
                  <input
                    id="height-inches-min"
                    type="number"
                    value={value?.inchesMin || ""}
                    onChange={(e) => onChange({ ...value, inchesMin: e.target.value })}
                    placeholder="Inches"
                    min={0}
                    max={11}
                    aria-label="Minimum height in inches"
                    className={inputClasses}
                    style={baseInputStyle}
                  />
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Max Height:
              </legend>
              <div className="flex space-x-2 mt-1">
                <div className="flex-1">
                  <label htmlFor="height-feet-max" className="sr-only">
                    Maximum height feet
                  </label>
                  <input
                    id="height-feet-max"
                    type="number"
                    value={value?.feetMax || ""}
                    onChange={(e) => onChange({ ...value, feetMax: e.target.value })}
                    placeholder="Feet"
                    min={0}
                    max={8}
                    aria-label="Maximum height in feet"
                    className={inputClasses}
                    style={baseInputStyle}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="height-inches-max" className="sr-only">
                    Maximum height inches
                  </label>
                  <input
                    id="height-inches-max"
                    type="number"
                    value={value?.inchesMax || ""}
                    onChange={(e) => onChange({ ...value, inchesMax: e.target.value })}
                    placeholder="Inches"
                    min={0}
                    max={11}
                    aria-label="Maximum height in inches"
                    className={inputClasses}
                    style={baseInputStyle}
                  />
                </div>
              </div>
            </fieldset>
          </div>
        );
      case "date-range":
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
                type="date"
                value={value?.start || ""}
                onChange={(e) => onChange({ ...value, start: e.target.value })}
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
                value={value?.end || ""}
                onChange={(e) => onChange({ ...value, end: e.target.value })}
                className={inputClasses}
                style={baseInputStyle}
              />
            </div>
          </div>
        );
      case "time-range":
        return (
          <div className="flex space-x-2">
            <input
              type="time"
              value={value?.start || ""}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
              placeholder="Start"
              className="px-3 py-2 border rounded-md text-sm w-full"
              style={baseInputStyle}
            />
            <input
              type="time"
              value={value?.end || ""}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
              placeholder="End"
              className="px-3 py-2 border rounded-md text-sm w-full"
              style={baseInputStyle}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={ref}
      className={`flex flex-col ${isHighlighted ? "filter-highlight" : ""}`}
    >
      <label
        className="text-sm font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </label>
      {renderInput()}
    </div>
  );
});

FilterControl.displayName = "FilterControl";

/**
 * Collapsible Filter Panel Component with manual submit
 */
export const FilterPanel = ({
  children,
  onClear,
  hasActiveFilters,
  isOpen,
  onToggle,
  onSubmit,
  highlightedFilterKey,
  filterRefs,
}) => {
  // Scroll to highlighted filter when it changes
  useEffect(() => {
    if (highlightedFilterKey && filterRefs?.current?.[highlightedFilterKey]) {
      const element = filterRefs.current[highlightedFilterKey];

      // Small delay to ensure panel is rendered
      setTimeout(() => {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [highlightedFilterKey, filterRefs]);

  if (!isOpen) {
    return null; // Don't render when closed
  }

  return (
    <div className="mb-6">
      {/* Filter Panel - Collapsible */}
      <div
        className="p-4 border rounded-md"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                clipRule="evenodd"
              />
            </svg>
            <span
              className="font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Filters
            </span>
            {hasActiveFilters && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
              >
                Active
              </span>
            )}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              onClick={onClear}
              variant="secondary"
              size="sm"
              className="px-3 py-1 text-sm"
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
          {children}
        </div>

        {/* Action Buttons */}
        <div
          className="flex items-center justify-end space-x-3 pt-4 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <Button onClick={onToggle} variant="secondary" size="sm">
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            variant="primary"
            size="sm"
            className="px-6"
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
};
