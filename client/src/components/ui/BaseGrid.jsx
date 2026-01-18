import { getGridClasses } from "../../constants/grids.js";
import EmptyState from "./EmptyState.jsx";
import Pagination from "./Pagination.jsx";

/**
 * BaseGrid - Base grid component for layout, responsive columns, pagination, and loading/empty states
 *
 * @param {Object} props
 * @param {any[]} props.items - Array of items to render
 * @param {Function} props.renderItem - Function to render each item (item, index) => ReactNode
 * @param {'scene'|'standard'} props.gridType - Grid type for responsive columns
 * @param {'small'|'medium'|'large'} [props.density] - Grid density for spacing/sizing
 * @param {boolean} [props.loading] - Show loading skeleton
 * @param {Error} [props.error] - Error to display
 * @param {string} [props.emptyMessage] - Message when no items
 * @param {string} [props.emptyDescription] - Description for empty state
 * @param {number} [props.currentPage] - Current page number
 * @param {number} [props.totalPages] - Total number of pages
 * @param {Function} [props.onPageChange] - Page change handler (page: number) => void
 * @param {number} [props.skeletonCount] - Number of skeleton cards to show while loading
 * @param {Function} [props.renderSkeleton] - Custom skeleton renderer
 * @param {string} [props.className] - Additional CSS classes
 */
export const BaseGrid = ({
  items,
  renderItem,
  gridType = "standard",
  density = "medium",
  loading = false,
  error,
  emptyMessage = "No items found",
  emptyDescription,
  currentPage,
  totalPages,
  onPageChange,
  skeletonCount = 12,
  renderSkeleton,
  className = "",
}) => {
  const gridClasses = getGridClasses(gridType, density);

  // Default skeleton renderer
  const defaultRenderSkeleton = () => (
    <div
      className="rounded-lg animate-pulse"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        height: gridType === "scene" ? "20rem" : "24rem",
      }}
    />
  );

  const skeletonRenderer = renderSkeleton || defaultRenderSkeleton;

  // Loading state
  if (loading) {
    return (
      <div className={`${gridClasses} ${className}`}>
        {[...Array(skeletonCount)].map((_, i) => (
          <div key={i}>{skeletonRenderer()}</div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <EmptyState
        title="Error loading items"
        description={error.message || "An error occurred"}
      />
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  return (
    <>
      <div className={`${gridClasses} ${className}`}>
        {items.map((item, index) => renderItem(item, index))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <nav role="navigation" aria-label="Pagination" className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </nav>
      )}
    </>
  );
};

export default BaseGrid;
