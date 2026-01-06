import { LayoutRenderer } from './LayoutRenderer.jsx';
import EmptyState from './EmptyState.jsx';
import Pagination from './Pagination.jsx';

/**
 * SearchResults - Layout-agnostic results renderer
 *
 * Responsibilities:
 * - Handle loading/empty/error states
 * - Delegate actual rendering to LayoutRenderer
 * - Manage pagination UI
 *
 * Future: Will read user's layout preference via useEntityDisplayPreferences hook.
 * For now, defaults to 'grid' layout.
 *
 * @param {Object} props
 * @param {string} props.entityType - Entity type for layout selection
 * @param {Array} props.items - Items to render
 * @param {Function} props.renderItem - Function to render each item
 * @param {boolean} [props.loading] - Loading state
 * @param {Error} [props.error] - Error object
 * @param {string} [props.emptyMessage] - Empty state message
 * @param {string} [props.emptyDescription] - Empty state description
 * @param {number} [props.currentPage] - Current page
 * @param {number} [props.totalPages] - Total pages
 * @param {Function} [props.onPageChange] - Page change handler
 * @param {Function} [props.renderSkeleton] - Custom skeleton renderer
 * @param {number} [props.skeletonCount] - Skeleton count while loading
 * @param {string} [props.className] - Additional CSS classes
 */
export const SearchResults = ({
  entityType,
  items,
  renderItem,
  loading = false,
  error,
  emptyMessage = "No items found",
  emptyDescription,
  currentPage,
  totalPages,
  onPageChange,
  renderSkeleton,
  skeletonCount = 12,
  className = "",
}) => {
  // TODO: Get user's layout preference for this entity type
  // const { preferences } = useEntityDisplayPreferences(entityType);
  // const layoutType = preferences.layoutType || 'grid';

  // For now, always use grid layout
  const layoutType = 'grid';

  // Loading state - LayoutRenderer handles skeleton rendering
  if (loading) {
    return (
      <LayoutRenderer
        layoutType={layoutType}
        entityType={entityType}
        items={[]} // empty, will render skeletons
        renderItem={renderItem}
        renderSkeleton={renderSkeleton}
        skeletonCount={skeletonCount}
        loading={true}
        className={className}
      />
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

  // Results
  return (
    <>
      <LayoutRenderer
        layoutType={layoutType}
        entityType={entityType}
        items={items}
        renderItem={renderItem}
        loading={false}
        className={className}
      />

      {/* Pagination - common across all layouts */}
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

export default SearchResults;
