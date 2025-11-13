import { Link } from "react-router-dom";

/**
 * Responsive grid item for entity tooltips
 * Uses proper aspect ratios and object-contain like cards
 * Image above text layout, responsive columns (1→2→3)
 *
 * @param {string} entityType - Type of entity (performer, tag, studio, group, gallery)
 * @param {Array} entities - Array of entities to display
 * @param {string} title - Grid title (e.g., "Performers", "Tags")
 */
export const TooltipEntityGrid = ({ entityType, entities, title }) => {
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

  // Get link path for entity
  const getLinkPath = (entity) => {
    const pathMap = {
      performer: `/performer/${entity.id}`,
      tag: `/tag/${entity.id}`,
      studio: `/studio/${entity.id}`,
      group: `/collection/${entity.id}`,
      gallery: `/gallery/${entity.id}`,
    };
    return pathMap[entityType] || "#";
  };

  // Get image path for entity
  const getImagePath = (entity) => {
    if (entityType === "group") {
      return entity.front_image_path || entity.back_image_path;
    }
    return entity.image_path;
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

  return (
    <div>
      {/* Title */}
      <div className="font-semibold mb-2 text-sm" style={{ color: "var(--text-primary)" }}>
        {title}
      </div>

      {/* Responsive grid: 2 cols mobile, 3 cols tablet, 4 cols desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-2">
        {entities.map((entity) => (
          <Link
            key={entity.id}
            to={getLinkPath(entity)}
            className="flex flex-col items-center p-1.5 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image container with aspect ratio */}
            <div
              className={`w-full mb-1.5 ${imageRadius} overflow-hidden`}
              style={{
                aspectRatio,
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              {getImagePath(entity) ? (
                <img
                  src={getImagePath(entity)}
                  alt={entity.name}
                  className={`w-full h-full object-contain ${imageRadius}`}
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl">{fallbackEmoji}</span>
                </div>
              )}
            </div>

            {/* Name below image */}
            <span
              className="text-xs text-center line-clamp-2 w-full px-0.5"
              style={{ color: "var(--text-primary)" }}
              title={entity.name}
            >
              {entity.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default TooltipEntityGrid;
