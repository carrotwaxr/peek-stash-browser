/**
 * Reusable error display component
 * Supports both inline and toast display modes
 */
const ErrorMessage = ({
  error,
  onRetry,
  className = "",
  showRetry = true,
  title = "Error",
  mode = "inline", // "inline" or "toast"
}) => {
  if (!error) return null;

  const baseClasses = mode === "inline"
    ? "px-4 py-3 rounded-lg border"
    : "px-4 py-3 rounded-lg";

  const containerStyle = mode === "toast"
    ? {
        backgroundColor: "#dc2626",
        border: "2px solid #f87171",
        color: "white",
        boxShadow: "0 10px 25px -5px rgba(220, 38, 38, 0.4), 0 8px 10px -6px rgba(220, 38, 38, 0.3)",
      }
    : {
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--accent-error)",
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
          {/* Error Icon */}
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: mode === "toast" ? "white" : "var(--accent-error)" }}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            {mode === "inline" && (
              <strong className="font-semibold" style={{ color: "var(--accent-error)" }}>
                {title}:{" "}
              </strong>
            )}
            <span className="block sm:inline">{error}</span>
          </div>
        </div>
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="ml-2 px-3 py-1 text-sm rounded hover:opacity-80 focus:outline-none focus:ring-2 transition-opacity flex-shrink-0"
            style={{
              backgroundColor: "var(--accent-error)",
              color: "white",
              borderColor: "var(--accent-error)",
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
