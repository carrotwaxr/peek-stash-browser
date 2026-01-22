import { getGridClasses } from "../../constants/grids.js";
import ClipCard from "../cards/ClipCard.jsx";
import { SkeletonSceneCard } from "../ui/index.js";

/**
 * ClipGrid - Grid display for clip entities
 * Follows SceneGrid patterns for consistency
 */
const ClipGrid = ({
  clips,
  density = "medium",
  loading = false,
  onClipClick,
  fromPageTitle,
  emptyMessage = "No clips found",
  emptyDescription = "Try adjusting your search filters",
}) => {
  // Use scene grid classes since clips have same 16:9 aspect ratio
  const gridClasses = getGridClasses("scene", density);

  if (loading) {
    return (
      <div className={gridClasses}>
        {[...Array(12)].map((_, i) => (
          <SkeletonSceneCard key={i} entityType="clip" />
        ))}
      </div>
    );
  }

  if (!clips || clips.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
            🎬
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {emptyMessage}
          </h3>
          <p style={{ color: "var(--text-secondary)" }}>{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={gridClasses}>
      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          onClick={onClipClick}
          fromPageTitle={fromPageTitle}
          tabIndex={0}
        />
      ))}
    </div>
  );
};

export default ClipGrid;
