import React, { useRef, useEffect, useState } from "react";
import { LucideCheckSquare, LucideSquare } from "lucide-react";
import SceneCard from "../ui/SceneCard.jsx";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import EmptyState from "../ui/EmptyState.jsx";
import Pagination from "../ui/Pagination.jsx";
import BulkActionBar from "../ui/BulkActionBar.jsx";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import Button from "../ui/Button.jsx";

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
  const { isTVMode } = useTVMode();

  // Selection state (always enabled, no mode toggle)
  const [selectedScenes, setSelectedScenes] = useState([]);

  // Selection handlers
  const handleToggleSelect = (scene) => {
    setSelectedScenes(prev => {
      const isSelected = prev.some(s => s.id === scene.id);
      if (isSelected) {
        return prev.filter(s => s.id !== scene.id);
      } else {
        return [...prev, scene];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedScenes(scenes || []);
  };

  const handleDeselectAll = () => {
    setSelectedScenes([]);
  };

  const handleClearSelection = () => {
    setSelectedScenes([]);
  };

  // Handle selection with keyboard (Enter/Space)
  const handleKeyboardSelect = (scene) => {
    if (selectedScenes.length > 0) {
      handleToggleSelect(scene);
    } else {
      onSceneClick?.(scene);
    }
  };

  // Spatial navigation hook
  const { focusedIndex, setItemRef, isFocused } = useSpatialNavigation({
    items: scenes,
    columns,
    enabled: isTVMode && enableKeyboard,
    onSelect: handleKeyboardSelect,
    onPageUp: () => onPageChange && currentPage > 1 && onPageChange(currentPage - 1),
    onPageDown: () => onPageChange && currentPage < totalPages && onPageChange(currentPage + 1),
  });

  // Set initial focus when grid loads (only in TV mode)
  useEffect(() => {
    if (isTVMode && enableKeyboard && scenes?.length > 0 && gridRef.current) {
      // Focus the grid container to enable keyboard navigation
      const firstFocusable = gridRef.current.querySelector('[tabindex="0"]');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, [isTVMode, enableKeyboard, scenes]);

  // Clear selections when page changes
  useEffect(() => {
    setSelectedScenes([]);
  }, [currentPage]);

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
      {/* Selection Controls - Only shown when items are selected */}
      {selectedScenes.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <Button
            onClick={handleSelectAll}
            variant="secondary"
            size="sm"
            className="font-medium"
          >
            Select All ({scenes?.length || 0})
          </Button>
          <Button
            onClick={handleDeselectAll}
            variant="secondary"
            size="sm"
            className="font-medium"
          >
            Deselect All
          </Button>
        </div>
      )}

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
            tabIndex={isFocused(index) ? 0 : -1}
            className={
              isFocused(index)
                ? "keyboard-focus"
                : ""
            }
            isSelected={selectedScenes.some(s => s.id === scene.id)}
            onToggleSelect={handleToggleSelect}
            selectionMode={selectedScenes.length > 0}
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

      {/* Bulk Action Bar */}
      {selectedScenes.length > 0 && (
        <BulkActionBar
          selectedScenes={selectedScenes}
          onClearSelection={handleClearSelection}
        />
      )}
    </div>
  );
};

export default SceneGrid;
