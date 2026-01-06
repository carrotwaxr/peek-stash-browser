import { SCENE_GRID_CONTAINER_CLASSNAMES, STANDARD_GRID_CONTAINER_CLASSNAMES } from '../../../constants/grids.js';

/**
 * GridLayout - Responsive grid layout
 *
 * Pure layout component - only knows about:
 * - Grid classes (responsive columns)
 * - Skeleton rendering while loading
 *
 * Doesn't know about:
 * - Entities
 * - Data fetching
 * - Pagination (handled by SearchResults)
 *
 * @param {Object} props
 * @param {string} props.entityType - Entity type for grid selection ('scene' vs 'standard')
 * @param {Array} props.items - Items to render
 * @param {Function} props.renderItem - Function to render each item (item, index) => ReactNode
 * @param {boolean} [props.loading] - Loading state
 * @param {Function} [props.renderSkeleton] - Custom skeleton renderer
 * @param {number} [props.skeletonCount] - Number of skeleton items
 * @param {string} [props.className] - Additional CSS classes
 */
export const GridLayout = ({
  entityType,
  items,
  renderItem,
  loading = false,
  renderSkeleton,
  skeletonCount = 12,
  className = "",
}) => {
  // Determine grid type based on entity
  const gridClasses = entityType === 'scene'
    ? SCENE_GRID_CONTAINER_CLASSNAMES
    : STANDARD_GRID_CONTAINER_CLASSNAMES;

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
