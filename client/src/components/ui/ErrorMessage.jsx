import Button from "./Button.jsx";

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

  // Extract error message from error object or use string directly
  const errorMessage =
    typeof error === "string"
      ? error
      : error?.message || error?.toString() || "An error occurred";

  const baseClasses =
    mode === "inline" ? "px-4 py-3 rounded-lg border" : "px-4 py-3 rounded-lg";

  const containerStyle =
    mode === "toast"
      ? {
          backgroundColor: "var(--toast-error-bg)",
          border: "2px solid var(--toast-error-border)",
          color: "white",
          boxShadow: `0 10px 25px -5px var(--toast-error-shadow), 0 8px 10px -6px var(--toast-error-shadow)`,
        }
      : {
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--status-error)",
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
            style={{
              color: mode === "toast" ? "white" : "var(--status-error)",
            }}
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
              <strong
                className="font-semibold"
                style={{ color: "var(--status-error)" }}
              >
                {title}:{" "}
              </strong>
            )}
            <span className="block sm:inline">{errorMessage}</span>
          </div>
        </div>
        {showRetry && onRetry && (
          <Button
            onClick={onRetry}
            variant="destructive"
            size="sm"
            className="ml-2 flex-shrink-0"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
