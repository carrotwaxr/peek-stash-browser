import { useState } from "react";
import { useHiddenEntities } from "./useHiddenEntities.js";
import { showSuccess, showError } from "../utils/toast.jsx";

/**
 * Hook for bulk hide action with confirmation dialog support
 * @param {Object} options
 * @param {Array} options.selectedScenes - Array of selected scene objects
 * @param {Function} options.onComplete - Called after hide completes (e.g., clear selection)
 * @param {Function} [options.onHideSuccess] - Called per scene after successful hide
 * @returns {Object} - { hideDialogOpen, isHiding, handleHideClick, handleHideConfirm, closeHideDialog }
 */
export const useHideBulkAction = ({ selectedScenes, onComplete, onHideSuccess }) => {
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
