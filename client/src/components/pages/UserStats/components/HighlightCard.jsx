// client/src/components/pages/UserStats/components/HighlightCard.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";
import { getFilenameFromPath } from "../../../../utils/format.js";

/**
 * Get display name for highlight item
 * For scenes/images: title -> filePath basename -> "Unknown"
 * For performers: name -> "Unknown"
 */
const getDisplayName = (item) => {
  // Performers have name
  if (item.name) return item.name;
  // Scenes/images have title
  if (item.title) return item.title;
  // Fallback to file path basename for scenes/images
  if (item.filePath) return getFilenameFromPath(item.filePath);
  return "Unknown";
};

/**
 * Get fallback icon for entity type
 */
const getFallbackIcon = (entityType) => {
  const icons = {
    scene: "🎬",
    image: "🖼️",
    performer: "👤",
  };
  return icons[entityType] || "📁";
};

/**
 * Feature card for highlight stats (most watched, etc.)
 * All cards use consistent 16/9 container height - portrait images are pillarboxed
 * @param {string} entityType - Type of entity for fallback icon (scene, image, performer)
 */
const HighlightCard = ({ title, item, linkPrefix, statLabel, statValue, entityType = "scene" }) => {
  if (!item) {
    return null;
  }

  const displayName = getDisplayName(item);
  const fallbackIcon = getFallbackIcon(entityType);

  return (
    <Paper padding="none" className="overflow-hidden">
      <div
        className="px-4 py-2 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </h3>
      </div>
      <Link
        to={`${linkPrefix}/${item.id}`}
        className="block transition-colors hover:bg-[var(--bg-secondary)]"
      >
        {/* Consistent 16/9 container for all cards - portrait images pillarboxed */}
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{
            aspectRatio: "16/9",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={displayName}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ color: "var(--text-muted)" }}
            >
              <span className="text-3xl">{fallbackIcon}</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div
            className="font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {statValue.toLocaleString()} {statLabel}
          </div>
        </div>
      </Link>
    </Paper>
  );
};

export default HighlightCard;
