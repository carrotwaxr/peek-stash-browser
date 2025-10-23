import SearchableSelect from "./SearchableSelect.jsx";
import Button from "./Button.jsx";

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
    <div className="flex">
      <label
        className="text-sm font-medium mr-2 self-center"
        style={{ color: "var(--text-primary)" }}
      >
        {label}:
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
  entityType, // for searchable-select
  multi, // for searchable-select
}) => {
  const baseInputStyle = {
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
    color: "var(--text-primary)",
  };

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
      case "searchable-select":
        return (
          <SearchableSelect
            entityType={entityType}
            value={value}
            onChange={onChange}
            multi={multi}
            placeholder={placeholder || `Select ${label}...`}
          />
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
                className="px-3 py-2 border rounded-md text-sm w-full"
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
                className="px-3 py-2 border rounded-md text-sm w-full"
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
 * Collapsible Filter Panel Component with manual submit
 */
export const FilterPanel = ({
  children,
  onClear,
  hasActiveFilters,
  isOpen,
  onToggle,
  onSubmit,
}) => {
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
