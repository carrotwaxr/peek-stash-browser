import { useState } from "react";
import { LucideEyeOff, LucidePlus } from "lucide-react";
import { useHiddenEntities } from "../../hooks/useHiddenEntities.js";
import { showSuccess, showError } from "../../utils/toast.jsx";
import AddToPlaylistButton from "./AddToPlaylistButton.jsx";
import Button from "./Button.jsx";
import HideConfirmationDialog from "./HideConfirmationDialog.jsx";

/**
 * Bulk Action Bar for multiselect
 * Shows selected count and available actions
 *
 * @param {Object} props
 * @param {Array} props.selectedScenes - Array of selected scene objects
 * @param {Function} props.onClearSelection - Callback to clear selection
 * @param {Function} props.onHideSuccess - Callback when scenes are hidden (for parent to update state)
 */
const BulkActionBar = ({ selectedScenes, onClearSelection, onHideSuccess }) => {
  const selectedCount = selectedScenes.length;
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const { hideEntities, hideConfirmationDisabled } = useHiddenEntities();

  const handleHideClick = () => {
    if (hideConfirmationDisabled) {
      handleHideConfirm(true);
    } else {
      setHideDialogOpen(true);
    }
  };

  const handleHideConfirm = async (dontAskAgain) => {
    setIsHiding(true);
    setHideDialogOpen(false);

    // Build entities array for bulk hide
    const entities = selectedScenes.map((scene) => ({
      entityType: "scene",
      entityId: scene.id,
    }));

    const result = await hideEntities({
      entities,
      skipConfirmation: dontAskAgain,
    });

    setIsHiding(false);

    if (result.success) {
      // Notify parent to update state for all hidden scenes
      for (const scene of selectedScenes) {
        onHideSuccess?.(scene.id, "scene");
      }

      if (result.failCount === 0) {
        showSuccess(`${result.successCount} scene${result.successCount !== 1 ? "s" : ""} hidden`);
      } else {
        showError(`Hidden ${result.successCount} scene${result.successCount !== 1 ? "s" : ""}, ${result.failCount} failed`);
      }
    } else {
      showError("Failed to hide scenes. Please try again.");
    }

    onClearSelection();
  };

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="max-w-7xl mx-auto px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left side - Selection count */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div style={{ color: "var(--text-primary)" }}>
                <span className="font-semibold text-base sm:text-lg">
                  {selectedCount}
                </span>
                <span className="ml-1 sm:ml-2 text-sm sm:text-base">
                  {selectedCount === 1 ? "scene" : "scenes"}
                </span>
              </div>

              {selectedCount > 0 && (
                <Button
                  onClick={onClearSelection}
                  variant="tertiary"
                  size="sm"
                  className="text-xs sm:text-sm underline hover:no-underline !p-0 !border-0 whitespace-nowrap"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
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
                          Add {selectedCount} to Playlist
                        </span>
                        <span className="sm:hidden">Add to Playlist</span>
                      </span>
                    }
                    icon={<LucidePlus className="w-4 h-4" />}
                    dropdownPosition="above"
                    onSuccess={onClearSelection}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <HideConfirmationDialog
        isOpen={hideDialogOpen}
        onClose={() => setHideDialogOpen(false)}
        onConfirm={handleHideConfirm}
        entityType="scene"
        entityName={`${selectedCount} scene${selectedCount !== 1 ? "s" : ""}`}
      />
    </>
  );
};

export default BulkActionBar;
