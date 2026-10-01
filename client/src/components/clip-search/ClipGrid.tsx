import { useRef } from "react";
import { getGridClasses } from "../../constants/grids";
import { useRenderedColumns } from "../../hooks/useRenderedColumns";
import { makeCompositeKey } from "../../utils/compositeKey";
import ClipCard, { type Clip } from "../cards/ClipCard";
import { EmptyState, SkeletonSceneCard } from "../ui/index";

/**
 * ClipGrid - Grid display for clip entities
 * Follows SceneGrid patterns for consistency
 */
interface ClipGridProps {
  clips: Clip[] | Record<string, unknown>[];
  density?: string;
  loading?: boolean;
  onClipClick?: (clip: Clip | Record<string, unknown>) => void;
  fromPageTitle?: string;
  emptyMessage?: string;
  emptyDescription?: string;
}

const ClipGrid = ({
  clips,
  density = "medium",
  loading = false,
  onClipClick,
  fromPageTitle,
  emptyMessage = "No clips found",
  emptyDescription = "Try adjusting your search filters",
}: ClipGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useRenderedColumns(gridRef);
  // Use scene grid classes since clips have same 16:9 aspect ratio
  const gridClasses = getGridClasses("scene", density);

  if (loading) {
    return (
      <div className={gridClasses}>
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonSceneCard key={i} entityType="clip" />
        ))}
      </div>
    );
  }

  if (!clips || clips.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  return (
    <div ref={gridRef} className={gridClasses}>
      {clips.map((clip: Clip | Record<string, unknown>) => (
        <ClipCard
          // Two servers can hold the same clip id
          key={makeCompositeKey((clip as Clip).id, (clip as Clip).instanceId)}
          clip={clip as Clip}
          onClick={onClipClick as ((clip: Clip) => void) | undefined}
          fromPageTitle={fromPageTitle}
          tabIndex={0}
          autoplayOnScroll={columns === 1}
        />
      ))}
    </div>
  );
};

export default ClipGrid;
