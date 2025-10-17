/**
 * Reusable info display component
 * Supports both inline and toast display modes
 */
const InfoMessage = ({
  message,
  className = "",
  title = "Info",
  mode = "inline", // "inline" or "toast"
  onClose,
}) => {
  if (!message) return null;

  const baseClasses = mode === "inline"
    ? "px-4 py-3 rounded-lg border"
    : "px-4 py-3 rounded-lg";

  const containerStyle = mode === "toast"
    ? {
        backgroundColor: "#1d4ed8",
        border: "2px solid #60a5fa",
        color: "white",
        boxShadow: "0 10px 25px -5px rgba(29, 78, 216, 0.4), 0 8px 10px -6px rgba(29, 78, 216, 0.3)",
      }
    : {
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--accent-info)",
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
          {/* Info Icon */}
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: mode === "toast" ? "white" : "var(--accent-info)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            {mode === "inline" && (
              <strong className="font-semibold" style={{ color: "var(--accent-info)" }}>
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

export default InfoMessage;
