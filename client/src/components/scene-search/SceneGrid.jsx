import React, { useRef, useEffect } from "react";
import SceneCard from "../ui/SceneCard.jsx";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Pagination from "../ui/Pagination.jsx";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";

const SceneGrid = ({
  scenes,
  loading = false,
  error = null,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onSceneClick,
  emptyMessage = "No scenes found",
  emptyDescription = "Check your media library configuration",
  enableKeyboard = true,
}) => {
  const gridRef = useRef();
  const columns = useGridColumns('scenes');

  // Spatial navigation hook
  const { focusedIndex, setItemRef, isFocused } = useSpatialNavigation({
    items: scenes,
    columns,
    enabled: enableKeyboard,
    onSelect: onSceneClick,
    onPageUp: () => onPageChange && currentPage > 1 && onPageChange(currentPage - 1),
    onPageDown: () => onPageChange && currentPage < totalPages && onPageChange(currentPage + 1),
  });

  // Set initial focus when grid loads
  useEffect(() => {
    if (enableKeyboard && scenes?.length > 0 && gridRef.current) {
      // Focus the grid container to enable keyboard navigation
      const firstFocusable = gridRef.current.querySelector('[tabindex="0"]');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, [enableKeyboard, scenes]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!scenes || scenes.length === 0) {
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
    <div className="space-y-6">
      {/* Grid */}
      <div
        ref={gridRef}
        className="grid gap-6 scene-grid-responsive"
      >
        {scenes.map((scene, index) => (
          <SceneCard
            key={scene.id}
            ref={(el) => setItemRef(index, el)}
            scene={scene}
            onClick={onSceneClick}
            tabIndex={enableKeyboard ? (isFocused(index) ? 0 : -1) : -1}
            className={
              isFocused(index)
                ? "keyboard-focus"
                : ""
            }
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
};

export default SceneGrid;
