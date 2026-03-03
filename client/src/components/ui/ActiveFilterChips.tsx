import { LucideX } from "lucide-react";
import Button from "./Button";

interface FilterOption {
  key: string;
  label: string;
  type: string;
  options?: Array<{ value: string; label: string }>;
}

interface PermanentFiltersMetadata {
  performers?: Array<{ id: string; name: string }>;
  studios?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
}

interface Props {
  filters: Record<string, unknown>;
  filterOptions: FilterOption[];
  onRemoveFilter: (key: string) => void;
  onChipClick?: (key: string) => void;
  permanentFilters?: Record<string, unknown>;
  permanentFiltersMetadata?: PermanentFiltersMetadata;
}

const ActiveFilterChips = ({
  filters,
  filterOptions,
  onRemoveFilter,
  onChipClick,
  permanentFilters = {},
  permanentFiltersMetadata = {},
}: Props) => {
  const getFilterLabel = (_filterKey: string, filterValue: unknown, filterConfig: FilterOption) => {
    const { label, type, options } = filterConfig;

    // Skip undefined or empty values
    if (
      filterValue === undefined ||
      filterValue === "" ||
      filterValue === false
    ) {
      return null;
    }

    switch (type) {
      case "checkbox":
        return filterValue === true ? label : null;

      case "select": {
        const selectedOption = options?.find(
          (opt: { value: string; label: string }) => opt.value === filterValue
        );
        return selectedOption
          ? `${label}: ${selectedOption.label}`
          : `${label}: ${filterValue}`;
      }

      case "text":
        return `${label}: "${filterValue}"`;

      case "searchable-select": {
        // For multi-select, show count if array
        if (Array.isArray(filterValue)) {
          if (filterValue.length === 0) return null;
          return filterValue.length === 1
            ? `${label}: 1 selected`
            : `${label}: ${filterValue.length} selected`;
        }
        // For single select, just show that it's set
        return filterValue ? `${label}: selected` : null;
      }

      case "range": {
        const range = filterValue as { min?: string | number; max?: string | number } | null;
        if (!range?.min && !range?.max) return null;
        if (range.min && range.max) {
          return `${label}: ${range.min} - ${range.max}`;
        }
        if (range.min) {
          return `${label}: ≥ ${range.min}`;
        }
        return `${label}: ≤ ${range.max}`;
      }

      case "date-range": {
        const dateRange = filterValue as { start?: string; end?: string } | null;
        if (!dateRange?.start && !dateRange?.end) return null;
        if (dateRange.start && dateRange.end) {
          return `${label}: ${dateRange.start} to ${dateRange.end}`;
        }
        if (dateRange.start) {
          return `${label}: After ${dateRange.start}`;
        }
        return `${label}: Before ${dateRange.end}`;
      }

      default:
        return null;
    }
  };

  // Build array of permanent filter chips
  const permanentChips: Array<{ key: string; label: string; isPermanent: boolean }> = [];

  // Check for performer permanent filters
  if ((permanentFiltersMetadata.performers?.length ?? 0) > 0) {
    permanentFiltersMetadata.performers!.forEach((performer) => {
      permanentChips.push({
        key: `permanent-performer-${performer.id}`,
        label: `Performer: ${performer.name}`,
        isPermanent: true,
      });
    });
  }

  // Check for studio permanent filters
  if ((permanentFiltersMetadata.studios?.length ?? 0) > 0) {
    permanentFiltersMetadata.studios!.forEach((studio) => {
      permanentChips.push({
        key: `permanent-studio-${studio.id}`,
        label: `Studio: ${studio.name}`,
        isPermanent: true,
      });
    });
  }

  // Check for tag permanent filters
  if ((permanentFiltersMetadata.tags?.length ?? 0) > 0) {
    permanentFiltersMetadata.tags!.forEach((tag) => {
      permanentChips.push({
        key: `permanent-tag-${tag.id}`,
        label: `Tag: ${tag.name}`,
        isPermanent: true,
      });
    });
  }

  // Build array of regular active filter chips (exclude permanent filters)
  const activeChips: Array<{ key: string; label: string; isPermanent: boolean }> = [];

  filterOptions.forEach((filterConfig) => {
    // Skip if this is a permanent filter
    if (permanentFilters[filterConfig.key] !== undefined) {
      return;
    }

    const filterValue = filters[filterConfig.key];
    const chipLabel = getFilterLabel(
      filterConfig.key,
      filterValue,
      filterConfig
    );

    if (chipLabel) {
      activeChips.push({
        key: filterConfig.key,
        label: chipLabel,
        isPermanent: false,
      });
    }
  });

  // Combine permanent and active chips
  const allChips = [...permanentChips, ...activeChips];

  if (allChips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {allChips.map((chip) => (
        <div
          key={chip.key}
          onClick={() => !chip.isPermanent && onChipClick?.(chip.key)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-colors ${
            !chip.isPermanent ? "cursor-pointer hover:opacity-80" : ""
          }`}
          style={{
            backgroundColor: chip.isPermanent
              ? "var(--bg-tertiary)"
              : "var(--bg-secondary)",
            borderColor: chip.isPermanent
              ? "var(--border-color)"
              : "var(--accent-primary)",
            color: chip.isPermanent
              ? "var(--text-secondary)"
              : "var(--text-primary)",
            opacity: chip.isPermanent ? 0.7 : 1,
          }}
        >
          <span>{chip.label}</span>
          {!chip.isPermanent && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFilter(chip.key);
              }}
              variant="tertiary"
              className="hover:opacity-70 !p-0 !border-0"
              aria-label={`Remove filter: ${chip.label}`}
              title={`Remove filter: ${chip.label}`}
              icon={<LucideX className="w-3.5 h-3.5" />}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ActiveFilterChips;
