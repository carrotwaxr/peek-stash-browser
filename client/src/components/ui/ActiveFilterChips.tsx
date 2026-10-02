import type { ListKind } from "@peek/shared-types";
import { LucideX } from "lucide-react";
import { useRefNames } from "../../api/hooks";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import {
  type ChipParts,
  type FilterOption,
  chipsOf,
} from "../../utils/filterFields";
import Button from "./Button";

interface PermanentFiltersMetadata {
  performers?: Array<{ id: string; name: string }>;
  studios?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  [key: string]: unknown;
}

interface Props {
  kind: ListKind;
  filters: Record<string, unknown>;
  /** The panel's options the page leaves free: a locked field has no chip */
  filterOptions: readonly FilterOption[];
  onRemoveFilter: (key: string) => void;
  onChipClick?: (key: string) => void;
  permanentFilters?: Record<string, unknown>;
  permanentFiltersMetadata?: PermanentFiltersMetadata;
}

/** Names a chip looks up: the rest show as a count */
const NAMES_SHOWN = 3;

/** The chip's text, from its parts and the names its ids resolved to */
function chipText(
  parts: ChipParts,
  resolved: { names: readonly string[]; unavailable: number } | undefined
): string {
  const { label, condition, values, ids, suffix = "" } = parts;
  if (ids !== undefined) {
    // Names not known yet (loading, failed, or no lookup): how many
    if (resolved === undefined) return `${label}: ${ids.length} selected`;
    const listed = [
      ...resolved.names,
      ...(resolved.unavailable > 0
        ? [`${resolved.unavailable} unavailable`]
        : []),
    ].join(", ");
    const more = ids.length - NAMES_SHOWN;
    const body = more > 0 ? `${listed} +${more} more` : listed;
    // A condition on nothing named reads as nonsense
    const named = resolved.names.length > 0 && condition !== undefined;
    return `${label}: ${named ? `${condition} ` : ""}${body}${suffix}`;
  }
  const body = [condition, ...(values ?? [])].filter(Boolean).join(" ");
  return body === "" ? label : `${label}: ${body}${suffix}`;
}

interface ChipProps {
  parts: ChipParts;
  /** The panel option's entity (`tags`), for resolving names */
  entityType: string | undefined;
  onRemove: () => void;
  onOpen: () => void;
}

/** One chip: its body opens the field, its button removes the filter */
const FilterChip = ({ parts, entityType, onRemove, onOpen }: ChipProps) => {
  const lookedUp = parts.ids?.slice(0, NAMES_SHOWN) ?? [];
  const { data } = useRefNames(entityType, lookedUp);
  const text = chipText(parts, data);

  return (
    <div
      className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-sm border transition-colors"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--accent-primary)",
        color: "var(--text-primary)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Edit filter: ${text}`}
        className="text-left cursor-pointer hover:opacity-80 rounded-full"
      >
        {text}
      </button>
      <Button
        onClick={onRemove}
        variant="tertiary"
        className="hover:opacity-70 !p-0 !border-0"
        aria-label={`Remove filter: ${text}`}
        title={`Remove filter: ${text}`}
        icon={<LucideX className="w-3.5 h-3.5" />}
      />
    </div>
  );
};

const ActiveFilterChips = ({
  kind,
  filters,
  filterOptions,
  onRemoveFilter,
  onChipClick,
  permanentFilters = {},
  permanentFiltersMetadata = {},
}: Props) => {
  const { unitPreference } = useUnitPreference();

  // A detail page's own filters: a plain label, no edit and no remove
  const permanentLabels = [
    ...(permanentFiltersMetadata.performers ?? []).map(
      (performer) => `Performer: ${performer.name}`
    ),
    ...(permanentFiltersMetadata.studios ?? []).map(
      (studio) => `Studio: ${studio.name}`
    ),
    ...(permanentFiltersMetadata.tags ?? []).map((tag) => `Tag: ${tag.name}`),
  ];

  const chips = chipsOf(
    kind,
    filters,
    filterOptions.filter(
      (option) => permanentFilters[option.key] === undefined
    ),
    unitPreference
  );

  if (permanentLabels.length === 0 && chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {permanentLabels.map((label, index) => (
        <div
          key={`${index}-${label}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
            opacity: 0.7,
          }}
        >
          <span>{label}</span>
        </div>
      ))}
      {chips.map(({ key, parts }) => (
        <FilterChip
          key={key}
          parts={parts}
          entityType={
            filterOptions.find((option) => option.key === key)?.entityType
          }
          onRemove={() => onRemoveFilter(key)}
          onOpen={() => onChipClick?.(key)}
        />
      ))}
    </div>
  );
};

export default ActiveFilterChips;
