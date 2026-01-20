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
    performer: "👤",
    studio: "🎬",
    tag: "🏷️",
    scene: "🎬",
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
 * Ranked list of top items
 * All items use consistent row height - landscape images pillarboxed to match portrait height
 * @param {string} entityType - Type of entity for aspect ratio (performer, studio, tag, scene)
 */
// Fixed height for 5 visible items (each row ~72px with padding)
const LIST_HEIGHT = "360px";

const TopList = ({ title, items, linkPrefix, entityType = "performer", showImage = true }) => {
  if (!items || items.length === 0) {
    return null;
  }

  const fallbackIcon = getFallbackIcon(entityType);
  const isPortrait = ["performer", "gallery", "group"].includes(entityType);

  return (
    <Paper padding="none">
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="font-semibold text-base"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      </div>
      <div
        className="divide-y overflow-y-auto"
        style={{
          borderColor: "var(--border-color)",
          maxHeight: LIST_HEIGHT,
        }}
      >
        {items.map((item, index) => {
          const duration =
            item.playDuration > 0
              ? formatDurationHumanReadable(item.playDuration, {
                  includeDays: false,
                })
              : null;
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
                  {duration && <span>{duration} • </span>}
                  {item.playCount} plays
                  {item.oCount > 0 && ` • ${item.oCount} Os`}
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
