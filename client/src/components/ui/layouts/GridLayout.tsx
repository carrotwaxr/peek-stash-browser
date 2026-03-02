import { type ReactNode } from 'react';
import { getGridClasses } from '../../../constants/grids';

interface Props {
  entityType: string;
  density?: "small" | "medium" | "large";
  items: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  loading?: boolean;
  renderSkeleton?: () => ReactNode;
  skeletonCount?: number;
  className?: string;
}

export const GridLayout = ({
  entityType,
  density = "medium",
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 12,
  className = "",
}: Props) => {
  // Determine grid type based on entity
  const gridType = entityType === 'scene' ? 'scene' : 'standard';
  const gridClasses = getGridClasses(gridType, density);

  // Default skeleton renderer
  const defaultRenderSkeleton = () => (
    <div
      className="rounded-lg animate-pulse"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        height: entityType === 'scene' ? "20rem" : "24rem",
      }}
    />
  );

  const skeletonRenderer = renderSkeleton || defaultRenderSkeleton;

  // Loading state - render skeletons
  if (loading) {
    return (
      <div className={`${gridClasses} ${className}`}>
        {[...Array(skeletonCount)].map((_, i) => (
          <div key={i}>{skeletonRenderer()}</div>
        ))}
      </div>
    );
  }

  // Render actual items
  return (
    <div className={`${gridClasses} ${className}`}>
      {items.map((item, index) => renderItem(item, index))}
    </div>
  );
};

export default GridLayout;
