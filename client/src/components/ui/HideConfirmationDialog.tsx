import { useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
  entityType: string;
  entityName: string;
}

/**
 * HideConfirmationDialog - Confirms hiding an entity with "don't ask again" option
 */
const HideConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityName,
}: Props) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  // Opens on the checkbox, a safe first stop for a TV remote's OK button
  const checkboxRef = useRef<HTMLInputElement>(null);

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
              ref={checkboxRef}
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
      initialFocusRef={checkboxRef}
    />
  );
};

export default HideConfirmationDialog;
