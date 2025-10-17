/**
 * Reusable success display component
 * Supports both inline and toast display modes
 */
const SuccessMessage = ({
  message,
  className = "",
  title = "Success",
  mode = "inline", // "inline" or "toast"
  onClose,
}) => {
  if (!message) return null;

  const baseClasses = mode === "inline"
    ? "px-4 py-3 rounded-lg border"
    : "px-4 py-3 rounded-lg";

  const containerStyle = mode === "toast"
    ? {
        backgroundColor: "#047857",
        border: "2px solid #10b981",
        color: "white",
        boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.4), 0 8px 10px -6px rgba(16, 185, 129, 0.3)",
      }
    : {
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--accent-success)",
        color: "var(--text-primary)",
      };

  return (
    <div
      className={`${baseClasses} ${className}`}
      style={containerStyle}
      role="alert"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2 flex-1">
          {/* Success Icon */}
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: mode === "toast" ? "white" : "var(--accent-success)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            {mode === "inline" && (
              <strong className="font-semibold" style={{ color: "var(--accent-success)" }}>
                {title}:{" "}
              </strong>
            )}
            <span className="block sm:inline">{message}</span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 hover:opacity-70 focus:outline-none transition-opacity flex-shrink-0"
            style={{ color: mode === "toast" ? "rgba(255, 255, 255, 0.8)" : "var(--text-muted)" }}
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default SuccessMessage;
