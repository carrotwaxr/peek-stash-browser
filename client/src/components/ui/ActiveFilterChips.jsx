import { LucideX } from "lucide-react";

/**
 * Display active filters as removable chips/badges
 *
 * @param {Object} props
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.filterOptions - Filter configuration from filterConfig.js
 * @param {Function} props.onRemoveFilter - Callback when a filter is removed
 * @param {Object} props.permanentFilters - Filters that can't be removed
 */
const ActiveFilterChips = ({ filters, filterOptions, onRemoveFilter, permanentFilters = {} }) => {
  const getFilterLabel = (filterKey, filterValue, filterConfig) => {
    const { label, type, options } = filterConfig;

    // Don't show permanent filters as removable chips
    if (permanentFilters[filterKey] !== undefined) {
      return null;
    }

    // Skip undefined or empty values
    if (filterValue === undefined || filterValue === "" || filterValue === false) {
      return null;
    }

    switch (type) {
      case "checkbox":
        return filterValue === true ? label : null;

      case "select":
        const selectedOption = options?.find(opt => opt.value === filterValue);
        return selectedOption ? `${label}: ${selectedOption.label}` : `${label}: ${filterValue}`;

      case "text":
        return `${label}: "${filterValue}"`;

      case "range":
        if (!filterValue.min && !filterValue.max) return null;
        if (filterValue.min && filterValue.max) {
          return `${label}: ${filterValue.min} - ${filterValue.max}`;
        }
        if (filterValue.min) {
          return `${label}: ≥ ${filterValue.min}`;
        }
        return `${label}: ≤ ${filterValue.max}`;

      case "date-range":
        if (!filterValue.start && !filterValue.end) return null;
        if (filterValue.start && filterValue.end) {
          return `${label}: ${filterValue.start} to ${filterValue.end}`;
        }
        if (filterValue.start) {
          return `${label}: After ${filterValue.start}`;
        }
        return `${label}: Before ${filterValue.end}`;

      default:
        return null;
    }
  };

  // Build array of active filter chips
  const activeChips = [];

  filterOptions.forEach(filterConfig => {
    const filterValue = filters[filterConfig.key];
    const chipLabel = getFilterLabel(filterConfig.key, filterValue, filterConfig);

    if (chipLabel) {
      activeChips.push({
        key: filterConfig.key,
        label: chipLabel,
      });
    }
  });

  if (activeChips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {activeChips.map(chip => (
        <div
          key={chip.key}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--accent-primary)",
            color: "var(--text-primary)",
          }}
        >
          <span>{chip.label}</span>
          <button
            onClick={() => onRemoveFilter(chip.key)}
            className="hover:opacity-70 transition-opacity focus:outline-none"
            aria-label={`Remove filter: ${chip.label}`}
            title={`Remove filter: ${chip.label}`}
          >
            <LucideX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ActiveFilterChips;
