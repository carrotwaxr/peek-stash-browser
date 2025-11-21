import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";

/**
 * HideConfirmationDialog - Confirms hiding an entity with "don't ask again" option
 */
const HideConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityName,
}) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    onConfirm?.(dontAskAgain);
    setDontAskAgain(false); // Reset for next time
  };

  const handleClose = () => {
    setDontAskAgain(false);
    onClose?.();
  };

  // Capitalize first letter of entity type
  const capitalizedType =
    entityType?.charAt(0).toUpperCase() + entityType?.slice(1) || "Item";

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={`Hide ${capitalizedType}`}
      message={
        <div className="space-y-4">
          <p>
            Are you sure you want to hide <strong>{entityName}</strong>?
          </p>
          <p className="text-sm opacity-80">
            This {entityType} will be hidden from all views. You can restore it
            later from the Hidden Items page.
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
              style={{ accentColor: "var(--accent-color)" }}
            />
            <span className="text-sm">Don't ask me again</span>
          </label>
        </div>
      }
      confirmText="Hide"
      cancelText="Cancel"
      variant="warning"
    />
  );
};

export default HideConfirmationDialog;
