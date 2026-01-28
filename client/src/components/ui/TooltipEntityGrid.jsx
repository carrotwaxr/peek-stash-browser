import { Link } from "react-router-dom";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";

/**
 * Responsive grid item for entity tooltips
 * Uses proper aspect ratios and object-contain like cards
 * Image above text layout, responsive columns (1→2→3)
 *
 * @param {string} entityType - Type of entity (performer, tag, studio, group, gallery)
 * @param {Array} entities - Array of entities to display
 * @param {string} title - Grid title (e.g., "Performers", "Tags")
 * @param {string} parentInstanceId - Instance ID from parent entity (fallback when entities don't have their own)
 */
export const TooltipEntityGrid = ({ entityType, entities, title, parentInstanceId }) => {
  const { hasMultipleInstances } = useConfig();

  if (!entities || entities.length === 0) return null;

  // Determine aspect ratio based on entity type (match useEntityImageAspectRatio hook)
  const getAspectRatio = () => {
    switch (entityType) {
      case "performer":
      case "gallery":
      case "group":
        return "2/3"; // Portrait
      case "tag":
      case "studio":
      case "scene":
      default:
        return "16/9"; // Landscape
    }
  };

  // All images use consistent rounded corners like cards (no circular)
  const getImageRadius = () => {
    return "rounded";
  };

  // Get link path for entity using centralized utility
  // If entity doesn't have instanceId, use parentInstanceId as fallback
  const getLinkPath = (entity) => {
    const entityWithInstance = entity.instanceId
      ? entity
      : { ...entity, instanceId: parentInstanceId };
    return getEntityPath(entityType, entityWithInstance, hasMultipleInstances);
  };

  // Get image path for entity
  const getImagePath = (entity) => {
    if (entityType === "group") {
      return entity.front_image_path || entity.back_image_path;
    }
    if (entityType === "gallery") {
      return entity.cover;
    }
    return entity.image_path;
  };

  // Get display name for entity (galleries use title, others use name)
  const getDisplayName = (entity) => {
    return entity.name || entity.title || `${entityType} ${entity.id}`;
  };

  // Get fallback emoji for entity type
  const getFallbackEmoji = () => {
    const emojiMap = {
      performer: "👤",
      tag: "🏷️",
      studio: "🎬",
      group: "🎬",
      gallery: "🖼️",
    };
    return emojiMap[entityType] || "📁";
  };

  const aspectRatio = getAspectRatio();
  const imageRadius = getImageRadius();
  const fallbackEmoji = getFallbackEmoji();

  // Determine grid columns based on entity count (fit to content)
  const getGridColumns = () => {
    const count = entities.length;
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-2 md:grid-cols-3";
    // 4+ items: responsive 2→3→4
    return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  };

  // Calculate max width based on entity count to prevent excessive whitespace
  // Reduced sizes for more compact tooltips at all densities
  const getMaxWidth = () => {
    const count = entities.length;
    if (count === 1) return "max-w-[120px]"; // Single item: compact
    if (count === 2) return "max-w-[260px]"; // Two items: compact
    if (count === 3) return "max-w-[400px]"; // Three items: compact
    return "max-w-[540px]"; // 4+ items: still responsive
  };

  // Calculate item width for consistent sizing
  const getItemWidth = () => {
    return "w-[100px]"; // Fixed compact width for all items
  };

  return (
    <div className={getMaxWidth()}>
      {/* Title */}
      <div
        className="font-medium mb-1.5 text-xs"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </div>

      {/* Responsive grid: columns adapt to entity count, compact sizing */}
      <div
        className={`grid ${getGridColumns()} gap-1.5 max-h-[50vh] overflow-y-auto pr-1`}
      >
        {entities.map((entity) => (
          <Link
            key={entity.id}
            to={getLinkPath(entity)}
            className={`flex flex-col items-center p-1 rounded hover:bg-white/10 transition-colors ${getItemWidth()}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image container with aspect ratio - compact sizing */}
            <div
              className={`w-full mb-1 ${imageRadius} overflow-hidden`}
              style={{
                aspectRatio,
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              {getImagePath(entity) ? (
                <img
                  src={getImagePath(entity)}
                  alt={getDisplayName(entity)}
                  className={`w-full h-full object-contain ${imageRadius}`}
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-lg">{fallbackEmoji}</span>
                </div>
              )}
            </div>

            {/* Name below image - smaller text */}
            <span
              className="text-[10px] text-center line-clamp-2 w-full leading-tight"
              style={{ color: "var(--text-primary)" }}
              title={getDisplayName(entity)}
            >
              {getDisplayName(entity)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};
