import type { ReactNode } from "react";
import { getGridClasses } from "../../constants/grids";
import EmptyState from "./EmptyState";
import Pagination from "./Pagination";

export interface BaseGridProps {
  items: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  gridType?: "scene" | "standard";
  density?: "small" | "medium" | "large";
  loading?: boolean;
  error?: Error | null;
  emptyMessage?: string;
  emptyDescription?: string;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  skeletonCount?: number;
  renderSkeleton?: () => ReactNode;
  className?: string;
}

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
}: BaseGridProps) => {
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
