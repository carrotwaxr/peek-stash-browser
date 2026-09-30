import { type ReactNode } from "react";
import EmptyState from "./EmptyState";
import ErrorMessage from "./ErrorMessage";
import { LayoutRenderer } from "./LayoutRenderer";

interface Props {
  entityType: string;
  density?: "small" | "medium" | "large";
  items: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  loading?: boolean;
  error?: Error | null;
  /** Shown as the error's Retry button */
  onRetry?: () => void;
  emptyMessage?: string;
  emptyDescription?: string;
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
  onRetry,
  emptyMessage = "No items found",
  emptyDescription,
  renderSkeleton,
  skeletonCount = 12,
  className = "",
}: Props) => {
  // TODO: Get user's layout preference for this entity type
  // const { preferences } = useEntityDisplayPreferences(entityType);
  // const layoutType = preferences.layoutType || 'grid';

  // For now, always use grid layout
  const layoutType = "grid";

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
      <ErrorMessage
        title="Error loading items"
        error={error}
        {...(onRetry ? { onRetry } : {})}
      />
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  // Results; the list's controls page it
  return (
    <LayoutRenderer
      layoutType={layoutType}
      entityType={entityType}
      density={density}
      items={items}
      renderItem={renderItem}
      loading={false}
      className={className}
    />
  );
};

export default SearchResults;
