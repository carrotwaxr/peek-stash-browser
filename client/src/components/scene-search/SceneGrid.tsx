import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NormalizedScene } from "@peek/shared-types";
import {
  LucideCheckSquare,
  LucideEyeOff,
  LucidePlus,
  LucideSquare,
} from "lucide-react";
import { getGridClasses } from "../../constants/grids";
import { useHideBulkAction } from "../../hooks/useHideBulkAction";
import { useRenderedColumns } from "../../hooks/useRenderedColumns";
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
  /**
   * What the selection belongs to: the list's query, page included. The
   * selection clears when it changes (a filter, a sort, a page), so a bulk
   * action never reaches scenes the user no longer sees. Without one, only a
   * page change through `onPageChange` clears it.
   */
  selectionScope?: string;
}

const keyOf = (scene: NormalizedScene) =>
  makeCompositeKey(scene.id, scene.instanceId);

/** The selected scenes, and the one a Shift+click range starts from */
interface Selection {
  scenes: NormalizedScene[];
  anchor: string | null;
}

const NO_SELECTION: Selection = { scenes: [], anchor: null };

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
  selectionScope,
}: Props) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useRenderedColumns(gridRef);
  const gridClasses = getGridClasses("scene", density);

  // Selection state (always enabled, no mode toggle)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const selectedScenes = selection.scenes;

  // A new scope is a new list: the selection starts over (adjusted while
  // rendering, not in an effect, so no frame shows the old selection)
  const [scope, setScope] = useState(selectionScope);
  if (scope !== selectionScope) {
    setScope(selectionScope);
    setSelection(NO_SELECTION);
  }

  // A range reads the page's current scenes without changing the toggle
  const scenesRef = useRef(scenes);
  useLayoutEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  // One toggle for every card, so memoised cards keep. A scene is its id on
  // its server: two servers can hold the same id.
  const handleToggleSelect = useCallback(
    (scene: NormalizedScene, options?: { range: boolean }) => {
      const key = keyOf(scene);
      setSelection((prev) => {
        if (options?.range && prev.anchor !== null) {
          // Shift+click: every scene on the page between the last click and this
          const page = scenesRef.current;
          const keys = page.map(keyOf);
          const from = keys.indexOf(prev.anchor);
          const to = keys.indexOf(key);
          if (from >= 0 && to >= 0) {
            const have = new Set(prev.scenes.map(keyOf));
            const added = page
              .slice(Math.min(from, to), Math.max(from, to) + 1)
              .filter((s) => !have.has(keyOf(s)));
            return { scenes: [...prev.scenes, ...added], anchor: key };
          }
        }
        const isSelected = prev.scenes.some((s) => keyOf(s) === key);
        return {
          scenes: isSelected
            ? prev.scenes.filter((s) => keyOf(s) !== key)
            : [...prev.scenes, scene],
          anchor: key,
        };
      });
    },
    []
  );

  const selectedKeys = useMemo(
    () => new Set(selectedScenes.map(keyOf)),
    [selectedScenes]
  );

  // Select All is the page on screen
  const handleSelectAll = () => {
    setSelection((prev) => ({ scenes: scenes || [], anchor: prev.anchor }));
  };

  const handleDeselectAll = () => {
    setSelection(NO_SELECTION);
  };

  const handleClearSelection = () => {
    setSelection(NO_SELECTION);
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
    setSelection(NO_SELECTION);
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
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
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
            // The page's one handler: the card calls it with its scene
            onClick={selectedScenes.length === 0 ? onSceneClick : undefined}
            onHideSuccess={onHideSuccess}
            fromPageTitle={fromPageTitle}
            isSelected={selectedKeys.has(keyOf(scene))}
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
