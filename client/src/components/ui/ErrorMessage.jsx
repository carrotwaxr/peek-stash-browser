/**
 * Reusable error display component
 */
const ErrorMessage = ({
  error,
  onRetry,
  className = "",
  showRetry = true,
  title = "Error",
}) => {
  if (!error) return null;

  return (
    <div
      className={`bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded ${className}`}
      role="alert"
    >
      <div className="flex items-center justify-between">
        <div>
          <strong className="font-bold">{title}: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="ml-4 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
