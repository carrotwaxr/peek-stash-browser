import React, { useRef, useState } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import {
  LucideCheckSquare,
  LucideEyeOff,
  LucidePlus,
  LucideSquare,
} from "lucide-react";
import { getGridClasses } from "../../constants/grids";
import { useGridColumns } from "../../hooks/useGridColumns";
import { useHideBulkAction } from "../../hooks/useHideBulkAction";
import { makeCompositeKey } from "../../utils/compositeKey";
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
} from "../ui/index";

interface Props {
  scenes: NormalizedScene[];
  density?: string;
  loading?: boolean;
  error?: string | Error | null;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onSceneClick?: (scene: NormalizedScene) => void;
  onHideSuccess?: (
    entityId: string,
    entityType: string,
    instanceId?: string
  ) => void;
  fromPageTitle?: string;
  emptyMessage?: string;
  emptyDescription?: string;
  enableKeyboard?: boolean;
}

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
  enableKeyboard = true, // eslint-disable-line @typescript-eslint/no-unused-vars
}: Props) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns("scenes");
  const gridClasses = getGridClasses("scene", density);

  // Selection state (always enabled, no mode toggle)
  const [selectedScenes, setSelectedScenes] = useState<NormalizedScene[]>([]);

  // Selection handlers
  const handleToggleSelect = (scene: NormalizedScene) => {
    // Two servers can hold the same scene id: a scene is its id on its server
    const isThis = (s: NormalizedScene) =>
      s.id === scene.id && s.instanceId === scene.instanceId;
    setSelectedScenes((prev) => {
      const isSelected = prev.some(isThis);
      if (isSelected) {
        return prev.filter((s) => !isThis(s));
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
  const {
    hideDialogOpen,
    isHiding,
    handleHideClick,
    handleHideConfirm,
    closeHideDialog,
  } = useHideBulkAction({
    selectedScenes,
    onComplete: handleClearSelection,
    onHideSuccess: onHideSuccess as
      | ((id: string | number, entityType: string) => void)
      | undefined,
  });

  // Clear selections when page changes - wrapped in handler instead of effect
  const handlePageChange = (page: number) => {
    setSelectedScenes([]);
    onPageChange?.(page);
  };

  if (loading) {
    return (
      <div className={gridClasses}>
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonSceneCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return <ErrorMessage error={error} />;
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
        {scenes.map((scene: NormalizedScene) => (
          <SceneCard
            key={makeCompositeKey(scene.id, scene.instanceId)}
            scene={scene}
            onClick={
              selectedScenes.length === 0 && onSceneClick
                ? () => onSceneClick(scene)
                : undefined
            }
            onHideSuccess={onHideSuccess}
            fromPageTitle={fromPageTitle}
            isSelected={selectedScenes.some(
              (s) => s.id === scene.id && s.instanceId === scene.instanceId
            )}
            onToggleSelect={handleToggleSelect}
            selectionMode={selectedScenes.length > 0}
            autoplayOnScroll={columns === 1}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
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
                  scenes={selectedScenes}
                  buttonText={`Add ${selectedScenes.length} to Playlist`}
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
            onConfirm={(dontAskAgain) => void handleHideConfirm(dontAskAgain)}
            entityType="scene"
            entityName={`${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""}`}
          />
        </>
      )}
    </div>
  );
};

export default SceneGrid;
