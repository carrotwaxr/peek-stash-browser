import LoadingSpinner from "./LoadingSpinner.jsx";

/**
 * Reusable banner component for library sync state
 * Shows a prominent info banner with spinner when library is syncing
 */
const SyncProgressBanner = ({ message, className = "" }) => {
  return (
    <div
      className={`mb-6 px-6 py-4 rounded-lg border-l-4 ${className}`}
      style={{
        backgroundColor: "var(--status-info-bg)",
        borderLeftColor: "var(--status-info)",
        border: "1px solid var(--status-info-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <LoadingSpinner size="md" />
        <div>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {message || "Syncing library, please wait..."}
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            This may take a minute on first sync. Checking every 5 seconds...
          </p>
        </div>
      </div>
    </div>
  );
};

export default SyncProgressBanner;
