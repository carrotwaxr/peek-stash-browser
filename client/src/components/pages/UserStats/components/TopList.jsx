// client/src/components/pages/UserStats/components/TopList.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";
import {
  formatDurationHumanReadable,
  getFilenameFromPath,
} from "../../../../utils/format.js";

/**
 * Get fallback icon for entity type
 */
const getFallbackIcon = (entityType) => {
  const icons = {
    performer: "P",
    studio: "S",
    tag: "T",
    scene: "V",
  };
  return icons[entityType] || "?";
};

/**
 * Get display name for item
 */
const getDisplayName = (item) => {
  if (item.name) return item.name;
  if (item.title) return item.title;
  if (item.filePath) return getFilenameFromPath(item.filePath);
  return "Unknown";
};

/**
 * Sort options with labels
 */
const SORT_OPTIONS = [
  { value: "engagement", label: "Engagement" },
  { value: "oCount", label: "O-Count" },
  { value: "playCount", label: "Play Count" },
];

/**
 * Ranked list of top items
 * All items use consistent row height - landscape images pillarboxed to match portrait height
 * @param {string} entityType - Type of entity for aspect ratio (performer, studio, tag, scene)
 * @param {string} sortBy - Current sort mode: "engagement", "oCount", or "playCount"
 * @param {function} onSortChange - Callback when sort mode changes
 */
// Fixed height for 5 visible items (each row ~72px with padding)
const LIST_HEIGHT = "360px";

const TopList = ({
  title,
  items,
  linkPrefix,
  entityType = "performer",
  showImage = true,
  sortBy = "engagement",
  onSortChange,
}) => {
  if (!items || items.length === 0) {
    return null;
  }

  const fallbackIcon = getFallbackIcon(entityType);
  const isPortrait = ["performer", "gallery", "group"].includes(entityType);

  /**
   * Get all stats for display, with sort-relevant stat first
   */
  const getStats = (item) => {
    const duration =
      item.playDuration > 0
        ? formatDurationHumanReadable(item.playDuration, {
            includeDays: false,
          })
        : null;

    const playCount = `${item.playCount ?? 0} plays`;
    const oCount = item.oCount > 0 ? `${item.oCount} Os` : null;
    const engagement = `Top ${Math.round(item.score ?? 0)}%`;

    // Build parts with sort-relevant stat first
    const parts = [];

    if (sortBy === "playCount") {
      parts.push(playCount);
      if (duration) parts.push(duration);
      if (oCount) parts.push(oCount);
    } else if (sortBy === "oCount") {
      if (oCount) parts.push(oCount);
      if (duration) parts.push(duration);
      parts.push(playCount);
    } else {
      // engagement sort
      parts.push(engagement);
      if (duration) parts.push(duration);
      parts.push(playCount);
      if (oCount) parts.push(oCount);
    }

    return parts.join(" \u2022 ");
  };

  return (
    <Paper padding="none">
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="font-semibold text-base"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        {onSortChange && (
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="text-sm px-2 py-1 rounded border cursor-pointer"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div
        className="divide-y overflow-y-auto"
        style={{
          borderColor: "var(--border-color)",
          maxHeight: LIST_HEIGHT,
        }}
      >
        {items.map((item, index) => {
          const displayName = getDisplayName(item);

          return (
            <Link
              key={item.id}
              to={`${linkPrefix}/${item.id}`}
              className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: "var(--text-primary)" }}
            >
              <span
                className="w-8 text-center text-lg font-bold flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                {index + 1}
              </span>
              {showImage && (
                <div
                  className="rounded overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    // All items use same height (16), width varies by aspect ratio
                    width: isPortrait ? "2.75rem" : "4.5rem",
                    height: "4rem",
                  }}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={displayName}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-xl" style={{ color: "var(--text-muted)" }}>
                      {fallbackIcon}
                    </span>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div
                  className="text-base font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayName}
                </div>
                <div className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {getStats(item)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Paper>
  );
};

export default TopList;
