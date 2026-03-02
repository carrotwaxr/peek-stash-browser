import { type ReactNode } from 'react';
import { LayoutRenderer } from './LayoutRenderer';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

interface Props {
  entityType: string;
  density?: "small" | "medium" | "large";
  items: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  loading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  emptyDescription?: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: ((page: number) => void) | null;
  renderSkeleton?: () => ReactNode;
  skeletonCount?: number;
  className?: string;
}

export const SearchResults = ({
  entityType,
  density = "medium",
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
}: Props) => {
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
        density={density}
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
        density={density}
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
