import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import Button from "./Button.jsx";

/**
 * Reusable confirmation dialog component
 * HTML-based modal, no browser native dialogs
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmStyle = "danger", // "danger" or "primary"
}) => {
  // Focus trap to keep keyboard navigation within modal
  const dialogRef = useFocusTrap(isOpen, onClose);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmVariant = confirmStyle === "danger" ? "destructive" : "primary";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="rounded-lg shadow-lg max-w-md w-full m-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h3
            id="dialog-title"
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p style={{ color: "var(--text-secondary)" }}>{message}</p>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex justify-end gap-3"
          style={{ borderColor: "var(--border-color)" }}
        >
          <Button onClick={onClose} variant="secondary">
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} variant={confirmVariant}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
