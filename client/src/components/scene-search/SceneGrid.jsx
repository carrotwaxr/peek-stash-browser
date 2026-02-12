import React, { useEffect, useRef, useState } from "react";
import { LucideCheckSquare, LucideSquare, LucideEyeOff, LucidePlus } from "lucide-react";
import { getGridClasses } from "../../constants/grids.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useHideBulkAction } from "../../hooks/useHideBulkAction.js";
import {
  AddToPlaylistButton,
  BulkActionBar,
  Button,
  EmptyState,
  ErrorMessage,
  HideConfirmationDialog,
  LoadingSpinner,
  Pagination,
  SceneCard,
  SkeletonSceneCard,
} from "../ui/index.js";

const SceneGrid = ({
  scenes,
  density = "medium",
  loading = false,
  error = null,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  onSceneClick,
  onHideSuccess,
  fromPageTitle,
  emptyMessage = "No scenes found",
  emptyDescription = "Check your media library configuration",
  enableKeyboard = true, // eslint-disable-line no-unused-vars
  isTVMode = false, // eslint-disable-line no-unused-vars
  tvGridZoneActive = false,
  gridNavigation = null, // eslint-disable-line no-unused-vars
  gridItemProps = null,
}) => {
  const gridRef = useRef();
  const columns = useGridColumns("scenes");
  const gridClasses = getGridClasses("scene", density);

  // Selection state (always enabled, no mode toggle)
  const [selectedScenes, setSelectedScenes] = useState([]);

  // Selection handlers
  const handleToggleSelect = (scene) => {
    setSelectedScenes((prev) => {
      const isSelected = prev.some((s) => s.id === scene.id);
      if (isSelected) {
        return prev.filter((s) => s.id !== scene.id);
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

  // Bulk hide action
  const { hideDialogOpen, isHiding, handleHideClick, handleHideConfirm, closeHideDialog } = useHideBulkAction({
    selectedScenes,
    onComplete: handleClearSelection,
    onHideSuccess,
  });

  // Set initial focus when grid loads and zone is active (only in TV mode)
  useEffect(() => {
    if (tvGridZoneActive && scenes?.length > 0 && gridRef.current) {
      // Focus the grid container to enable keyboard navigation
      const firstFocusable = gridRef.current.querySelector('[tabindex="0"]');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, [tvGridZoneActive, scenes]);

  // Clear selections when page changes
  useEffect(() => {
    setSelectedScenes([]);
  }, [currentPage]);

  if (loading) {
    return (
      <div className={gridClasses}>
        {[...Array(12)].map((_, i) => (
          <SkeletonSceneCard key={i} />
        ))}
      </div>
    );
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
            variant="primary"
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
      <div ref={gridRef} className={gridClasses}>
        {scenes.map((scene, index) => {
          // Use gridItemProps if provided (TV mode with zone navigation), otherwise use defaults
          const itemProps = gridItemProps ? gridItemProps(index) : {};
          return (
            <SceneCard
              key={scene.id}
              scene={scene}
              onClick={selectedScenes.length === 0 && onSceneClick ? () => onSceneClick(scene) : undefined}
              onHideSuccess={onHideSuccess}
              fromPageTitle={fromPageTitle}
              isSelected={selectedScenes.some((s) => s.id === scene.id)}
              onToggleSelect={handleToggleSelect}
              selectionMode={selectedScenes.length > 0}
              autoplayOnScroll={columns === 1}
              {...itemProps}
            />
          );
        })}
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
        <>
          <BulkActionBar
            selectedScenes={selectedScenes}
            onClearSelection={handleClearSelection}
            actions={
              <>
                <Button
                  onClick={handleHideClick}
                  variant="secondary"
                  size="sm"
                  disabled={isHiding}
                  className="flex items-center gap-1.5"
                >
                  <LucideEyeOff className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {isHiding ? "Hiding..." : "Hide"}
                  </span>
                </Button>
                <AddToPlaylistButton
                  sceneIds={selectedScenes.map((s) => s.id)}
                  buttonText={
                    <span>
                      <span className="hidden sm:inline">
                        Add {selectedScenes.length} to Playlist
                      </span>
                      <span className="sm:hidden">Add to Playlist</span>
                    </span>
                  }
                  icon={<LucidePlus className="w-4 h-4" />}
                  dropdownPosition="above"
                  onSuccess={handleClearSelection}
                />
              </>
            }
          />
          <HideConfirmationDialog
            isOpen={hideDialogOpen}
            onClose={closeHideDialog}
            onConfirm={handleHideConfirm}
            entityType="scene"
            entityName={`${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""}`}
          />
        </>
      )}
    </div>
  );
};

export default SceneGrid;
