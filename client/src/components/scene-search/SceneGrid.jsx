import React, { useRef, useEffect, useState } from "react";
import SceneCard from "../ui/SceneCard.jsx";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Pagination from "../ui/Pagination.jsx";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";

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
  const [columns, setColumns] = useState(4);

  // Calculate grid columns based on screen width
  // Must match CSS breakpoints in base.css (.scene-grid-responsive)
  const getColumns = () => {
    if (typeof window === "undefined") return 4;
    const width = window.innerWidth;
    // CSS breakpoints (these use !important so they override inline styles)
    if (width >= 3840) return 12; // 4K
    if (width >= 2560) return 10; // 2K
    if (width >= 1920) return 8;  // 1080p
    if (width >= 1600) return 7;  // Large desktop
    // Below 1600px, inline styles work (CSS doesn't override)
    if (width >= 1280) return 6;  // xl
    if (width >= 1024) return 5;  // lg
    if (width >= 768) return 4;   // md
    if (width >= 640) return 3;   // sm
    return 2; // xs
  };

  // Spatial navigation hook
  const { focusedIndex, setItemRef, isFocused } = useSpatialNavigation({
    items: scenes,
    columns,
    enabled: enableKeyboard,
    onSelect: onSceneClick,
    onPageUp: () => onPageChange && currentPage > 1 && onPageChange(currentPage - 1),
    onPageDown: () => onPageChange && currentPage < totalPages && onPageChange(currentPage + 1),
  });

  // Update columns on resize
  useEffect(() => {
    const updateColumns = () => {
      setColumns(getColumns());
    };

    updateColumns(); // Initial calculation
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

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
