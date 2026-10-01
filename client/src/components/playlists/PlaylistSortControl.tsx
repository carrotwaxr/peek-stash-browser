import { ArrowDown, ArrowUp } from "lucide-react";
import { SCENE_SORT_OPTIONS_BASE } from "../../utils/filterConfig";
import Button from "../ui/Button";

type Direction = "ASC" | "DESC";

/**
 * The orders a playlist page offers: its own order, when each item was added,
 * then every scene sort (no Scene Number: a playlist has no group)
 */
const SORT_OPTIONS = [
  { value: "position", label: "Playlist order" },
  { value: "added_at", label: "Date added to playlist" },
  ...SCENE_SORT_OPTIONS_BASE,
];

/** The route answers at most 100 items a page */
const PER_PAGE_OPTIONS = [25, 50, 100];

const selectStyle = {
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
};

interface Props {
  /** The sort field (`random` for any random order) */
  field: string;
  direction: Direction;
  perPage: number;
  onFieldChange: (field: string) => void;
  onDirectionChange: (direction: Direction) => void;
  onPerPageChange: (perPage: number) => void;
}

/** How a playlist page is sorted and how many items a page holds */
const PlaylistSortControl = ({
  field,
  direction,
  perPage,
  onFieldChange,
  onDirectionChange,
  onPerPageChange,
}: Props) => {
  const ascending = direction === "ASC";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <select
          aria-label="Sort playlist by"
          value={field}
          onChange={(e) => onFieldChange(e.target.value)}
          className="px-3 py-1.5 rounded-lg border text-sm min-w-[150px]"
          style={selectStyle}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Button
          onClick={() => onDirectionChange(ascending ? "DESC" : "ASC")}
          variant="secondary"
          size="sm"
          className="py-1"
          aria-label={ascending ? "Ascending" : "Descending"}
          title={ascending ? "Ascending" : "Descending"}
          icon={ascending ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
        />
      </div>
      <div
        className="flex items-center gap-2 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="hidden sm:inline" aria-hidden="true">
          Per page
        </span>
        <select
          aria-label="Per page"
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          className="px-2 py-1.5 rounded-lg border text-sm"
          style={selectStyle}
        >
          {PER_PAGE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default PlaylistSortControl;
