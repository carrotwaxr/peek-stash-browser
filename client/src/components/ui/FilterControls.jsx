import React from "react";

/**
 * Reusable Sort Control Component
 */
export const SortControl = ({
  options,
  value,
  onChange,
  label = "Sort by",
}) => {
  return (
    <div className="flex flex-col">
      <label
        className="text-sm font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 border rounded-md text-sm"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
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
export const FilterControl = ({
  type = "select",
  label,
  value,
  onChange,
  options = [],
  placeholder = "",
  min,
  max,
}) => {
  const baseInputStyle = {
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
    color: "var(--text-primary)",
  };

  const renderInput = () => {
    switch (type) {
      case "select":
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm w-full"
            style={baseInputStyle}
          >
            <option value="">{placeholder || `All ${label}`}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "number":
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            className="px-3 py-2 border rounded-md text-sm w-full"
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
            className="px-3 py-2 border rounded-md text-sm w-full"
            style={baseInputStyle}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm w-full"
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
              className="px-3 py-2 border rounded-md text-sm w-full"
              style={baseInputStyle}
            />
            <input
              type="number"
              value={value?.max || ""}
              onChange={(e) => onChange({ ...value, max: e.target.value })}
              placeholder="Max"
              min={min}
              max={max}
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
    <div className="flex flex-col">
      <label
        className="text-sm font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </label>
      {renderInput()}
    </div>
  );
};

/**
 * Filter Panel Component
 */
export const FilterPanel = ({
  children,
  isOpen,
  onToggle,
  onClear,
  hasActiveFilters,
}) => {
  return (
    <div className="mb-6">
      {/* Filter Toggle Button */}
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 px-4 py-2 border rounded-md text-sm font-medium mb-4"
        style={{
          backgroundColor: hasActiveFilters
            ? "var(--accent-color)"
            : "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: hasActiveFilters ? "white" : "var(--text-primary)",
        }}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
            clipRule="evenodd"
          />
        </svg>
        <span>Filters</span>
        {hasActiveFilters && <span className="text-xs">(Active)</span>}
        <svg
          className={`w-4 h-4 transform transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div
          className="p-4 border rounded-md"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {children}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div
              className="mt-4 pt-4 border-t"
              style={{ borderColor: "var(--border-color)" }}
            >
              <button
                onClick={onClear}
                className="px-4 py-2 border rounded-md text-sm"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
