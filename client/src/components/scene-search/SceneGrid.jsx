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

  // Multiselect state
  const [isMultiselectMode, setIsMultiselectMode] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState([]);

  // Multiselect handlers
  const handleToggleMultiselect = () => {
    setIsMultiselectMode(!isMultiselectMode);
    setSelectedScenes([]);
  };

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

  const handleClearSelection = () => {
    setSelectedScenes([]);
  };

  const handleExitMultiselect = () => {
    setIsMultiselectMode(false);
    setSelectedScenes([]);
  };

  // Handle selection with keyboard (Enter/Space)
  const handleKeyboardSelect = (scene) => {
    if (isMultiselectMode) {
      handleToggleSelect(scene);
    } else {
      onSceneClick?.(scene);
    }
  };

  // Spatial navigation hook
  const { focusedIndex, setItemRef, isFocused } = useSpatialNavigation({
    items: scenes,
    columns,
    enabled: enableKeyboard,
    onSelect: handleKeyboardSelect,
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
      {/* Multiselect Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleToggleMultiselect}
          className="px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-2"
          style={{
            backgroundColor: isMultiselectMode ? "var(--accent-primary)" : "var(--bg-card)",
            borderColor: "var(--border-color)",
            border: "1px solid",
            color: isMultiselectMode ? "white" : "var(--text-primary)",
          }}
        >
          {isMultiselectMode ? (
            <>
              <LucideCheckSquare className="w-4 h-4" />
              <span>Exit Multiselect</span>
            </>
          ) : (
            <>
              <LucideSquare className="w-4 h-4" />
              <span>Select Multiple</span>
            </>
          )}
        </button>

        {isMultiselectMode && (
          <button
            onClick={handleSelectAll}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            Select All ({scenes?.length || 0})
          </button>
        )}
      </div>

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
            isMultiselectMode={isMultiselectMode}
            isSelected={selectedScenes.some(s => s.id === scene.id)}
            onToggleSelect={handleToggleSelect}
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
      {isMultiselectMode && selectedScenes.length > 0 && (
        <BulkActionBar
          selectedScenes={selectedScenes}
          onClearSelection={handleClearSelection}
          onExitMultiselect={handleExitMultiselect}
        />
      )}
    </div>
  );
};

export default SceneGrid;
