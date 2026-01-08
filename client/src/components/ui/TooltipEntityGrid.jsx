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
  const getMaxWidth = () => {
    const count = entities.length;
    if (count === 1) return "max-w-[180px]"; // Single item: very narrow
    if (count === 2) return "max-w-[380px]"; // Two items: narrower
    if (count === 3) return "max-w-[580px]"; // Three items: medium
    return "max-w-[780px]"; // 4+ items: full responsive width
  };

  return (
    <div className={getMaxWidth()}>
      {/* Title */}
      <div
        className="font-semibold mb-2 text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </div>

      {/* Responsive grid: columns adapt to entity count */}
      <div
        className={`grid ${getGridColumns()} gap-2 max-h-[60vh] overflow-y-auto pr-2`}
      >
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
                  alt={getDisplayName(entity)}
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
