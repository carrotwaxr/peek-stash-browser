import { Trash2 } from "lucide-react";
import { Button } from "../ui/index.js";
import { CAROUSEL_FILTER_DEFINITIONS } from "../../utils/filterConfig.js";
import SearchableSelect from "../ui/SearchableSelect.jsx";

/**
 * RuleEditor Component
 * Edits a single filter rule for the carousel builder.
 * Renders appropriate input based on filter type.
 *
 * @param {Object} rule - The rule being edited
 * @param {Set} usedFilterKeys - Keys already used by other rules
 * @param {function} onChange - Callback when rule changes
 * @param {function} onRemove - Callback to remove this rule
 */
const RuleEditor = ({ rule, usedFilterKeys, onChange, onRemove }) => {
  const filterDef = CAROUSEL_FILTER_DEFINITIONS.find((f) => f.key === rule.filterKey);

  // Get available filters (current + unused)
  const availableFilters = CAROUSEL_FILTER_DEFINITIONS.filter(
    (f) => f.key === rule.filterKey || !usedFilterKeys.has(f.key)
  );

  const handleFilterChange = (newFilterKey) => {
    const newDef = CAROUSEL_FILTER_DEFINITIONS.find((f) => f.key === newFilterKey);
    if (!newDef) return;

    // Reset value when changing filter type
    onChange({
      filterKey: newFilterKey,
      value: newDef.type === "checkbox" ? true : newDef.multi ? [] : "",
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
        <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
          Filter
        </label>
        <select
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
          <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
            Condition
          </label>
          <select
            value={rule.modifier || filterDef.defaultModifier}
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

      {/* Value Input */}
      <div className="flex-1 min-w-[200px] space-y-1">
        <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
          Value
        </label>
        <RuleValueInput filterDef={filterDef} rule={rule} onChange={onChange} />
      </div>

      {/* Hierarchy Toggle */}
      {filterDef?.supportsHierarchy && (
        <div className="space-y-1">
          <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
            Sub-items
          </label>
          <label className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              checked={rule.depth === -1}
              onChange={(e) => onChange({ depth: e.target.checked ? -1 : undefined })}
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

/**
 * RuleValueInput Component
 * Renders the appropriate input for the filter type.
 */
const RuleValueInput = ({ filterDef, rule, onChange }) => {
  if (!filterDef) {
    return <span style={{ color: "var(--text-secondary)" }}>Unknown filter</span>;
  }

  switch (filterDef.type) {
    case "searchable-select":
      return (
        <SearchableSelect
          entityType={filterDef.entityType}
          value={rule.value}
          onChange={(val) => onChange({ value: val })}
          multi={filterDef.multi}
          placeholder={`Select ${filterDef.label.toLowerCase()}...`}
        />
      );

    case "range":
      return <RangeInput filterDef={filterDef} value={rule.value} onChange={(val) => onChange({ value: val })} />;

    case "checkbox":
      return (
        <div className="py-2">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Enabled
          </span>
        </div>
      );

    case "select":
      return (
        <select
          value={rule.value || ""}
          onChange={(e) => onChange({ value: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <option value="">Select...</option>
          {filterDef.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case "text":
      return (
        <input
          type="text"
          value={rule.value || ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={filterDef.placeholder || "Enter value..."}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        />
      );

    case "date-range":
      return <DateRangeInput value={rule.value} onChange={(val) => onChange({ value: val })} />;

    default:
      return <span style={{ color: "var(--text-secondary)" }}>Unsupported type: {filterDef.type}</span>;
  }
};

/**
 * RangeInput Component
 * Min/max input for numeric range filters.
 */
const RangeInput = ({ filterDef, value, onChange }) => {
  const handleMinChange = (e) => {
    const min = e.target.value === "" ? undefined : parseInt(e.target.value);
    onChange({ ...value, min });
  };

  const handleMaxChange = (e) => {
    const max = e.target.value === "" ? undefined : parseInt(e.target.value);
    onChange({ ...value, max });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value?.min ?? ""}
        onChange={handleMinChange}
        placeholder="Min"
        min={filterDef.min}
        max={filterDef.max}
        className="w-24 px-3 py-2 rounded-lg border text-sm"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />
      <span style={{ color: "var(--text-secondary)" }}>to</span>
      <input
        type="number"
        value={value?.max ?? ""}
        onChange={handleMaxChange}
        placeholder="Max"
        min={filterDef.min}
        max={filterDef.max}
        className="w-24 px-3 py-2 rounded-lg border text-sm"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />
      {filterDef.valueUnit && (
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {filterDef.valueUnit}
        </span>
      )}
    </div>
  );
};

/**
 * DateRangeInput Component
 * Date pickers for date range filters.
 */
const DateRangeInput = ({ value, onChange }) => {
  const handleFromChange = (e) => {
    const min = e.target.value || undefined;
    onChange({ ...value, min });
  };

  const handleToChange = (e) => {
    const max = e.target.value || undefined;
    onChange({ ...value, max });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={value?.min || ""}
        onChange={handleFromChange}
        className="px-3 py-2 rounded-lg border text-sm"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />
      <span style={{ color: "var(--text-secondary)" }}>to</span>
      <input
        type="date"
        value={value?.max || ""}
        onChange={handleToChange}
        className="px-3 py-2 rounded-lg border text-sm"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />
    </div>
  );
};

export default RuleEditor;
