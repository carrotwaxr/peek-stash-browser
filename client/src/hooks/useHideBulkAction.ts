import { useState } from "react";
import { showError, showSuccess } from "../utils/toast";
import { useHiddenEntities } from "./useHiddenEntities";

/**
 * Hook for bulk hide action with confirmation dialog support
 * @param {Object} options
 * @param {Array} options.selectedScenes - The selected scenes, each with its instance
 * @param {Function} options.onComplete - Called after hide completes (e.g., clear selection)
 * @param {Function} [options.onHideSuccess] - Called per scene after successful hide, with its instance
 * @returns {Object} - { hideDialogOpen, isHiding, handleHideClick, handleHideConfirm, closeHideDialog }
 */
interface UseHideBulkActionOptions {
  /** A scene without an instance is never sent bare: it counts as failed */
  selectedScenes: ReadonlyArray<{ id: string | number; instanceId?: string }>;
  onComplete: () => void;
  onHideSuccess?: (
    id: string | number,
    entityType: string,
    instanceId?: string
  ) => void;
}

export const useHideBulkAction = ({
  selectedScenes,
  onComplete,
  onHideSuccess,
}: UseHideBulkActionOptions) => {
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const { hideEntities, hideConfirmationDisabled } = useHiddenEntities();

  const handleHideClick = () => {
    if (hideConfirmationDisabled) {
      void handleHideConfirm(true);
    } else {
      setHideDialogOpen(true);
    }
  };

  const handleHideConfirm = async (dontAskAgain: boolean) => {
    setIsHiding(true);
    setHideDialogOpen(false);

    // A hide names its instance; the server refuses one without
    const sendable = selectedScenes.flatMap((scene) =>
      scene.instanceId ? [{ id: scene.id, instanceId: scene.instanceId }] : []
    );
    const unsent = selectedScenes.length - sendable.length;

    const result =
      sendable.length > 0
        ? await hideEntities({
            entities: sendable.map((scene) => ({
              entityType: "scene",
              entityId: String(scene.id),
              instanceId: scene.instanceId,
            })),
            skipConfirmation: dontAskAgain,
          })
        : { success: true, successCount: 0, failCount: 0 };

    setIsHiding(false);

    if (result.success) {
      for (const scene of sendable) {
        onHideSuccess?.(scene.id, "scene", scene.instanceId);
      }
      const failCount = result.failCount + unsent;
      if (failCount === 0) {
        showSuccess(
          `${result.successCount} scene${result.successCount !== 1 ? "s" : ""} hidden`
        );
      } else {
        showError(
          `Hidden ${result.successCount} scene${result.successCount !== 1 ? "s" : ""}, ${failCount} failed`
        );
      }
    } else {
      showError("Failed to hide scenes. Please try again.");
    }

    onComplete();
  };

  return {
    hideDialogOpen,
    isHiding,
    handleHideClick,
    handleHideConfirm,
    closeHideDialog: () => setHideDialogOpen(false),
  };
};
