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
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmButtonStyle = confirmStyle === "danger"
    ? {
        backgroundColor: "var(--accent-error)",
        color: "white",
      }
    : {
        backgroundColor: "var(--accent-primary)",
        color: "white",
      };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-lg max-w-md w-full m-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h3
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg transition-opacity hover:opacity-90"
            style={confirmButtonStyle}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
