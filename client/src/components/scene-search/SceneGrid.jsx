import React, { useRef, useEffect, useState } from "react";
import SceneCard from "../ui/SceneCard.jsx";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Pagination from "../ui/Pagination.jsx";

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
  const sceneRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [columns, setColumns] = useState(4);

  // Calculate grid columns based on screen width
  const getColumns = () => {
    if (typeof window === "undefined") return 4;
    const width = window.innerWidth;
    if (width >= 1536) return 6; // 2xl
    if (width >= 1280) return 5; // xl
    if (width >= 1024) return 4; // lg
    if (width >= 768) return 3; // md
    if (width >= 640) return 2; // sm
    return 1; // xs
  };

  // Update columns on resize
  useEffect(() => {
    const updateColumns = () => {
      setColumns(getColumns());
    };

    updateColumns(); // Initial calculation
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    if (!enableKeyboard || !scenes?.length) return;

    const handleKeyDown = (e) => {
      const totalItems = scenes.length;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(0, prev - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(totalItems - 1, prev + 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(0, prev - columns));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(totalItems - 1, prev + columns));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (scenes[focusedIndex] && onSceneClick) {
            onSceneClick(scenes[focusedIndex]);
          }
          break;
        case "PageUp":
          e.preventDefault();
          if (onPageChange && currentPage > 1) {
            onPageChange(currentPage - 1);
          }
          break;
        case "PageDown":
          e.preventDefault();
          if (onPageChange && currentPage < totalPages) {
            onPageChange(currentPage + 1);
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    enableKeyboard,
    scenes,
    focusedIndex,
    onSceneClick,
    onPageChange,
    currentPage,
    totalPages,
    columns,
  ]);

  useEffect(() => {
    sceneRefs.current = sceneRefs.current.slice(0, scenes?.length || 0);
  }, [scenes]);

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
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {scenes.map((scene, index) => (
          <SceneCard
            key={scene.id}
            ref={(el) => {
              sceneRefs.current[index] = el;
            }}
            scene={scene}
            onClick={onSceneClick}
            tabIndex={enableKeyboard ? (focusedIndex === index ? 0 : -1) : -1}
            className={
              enableKeyboard && focusedIndex === index
                ? "ring-2 ring-blue-500"
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
