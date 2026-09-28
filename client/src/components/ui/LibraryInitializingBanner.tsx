import { useLibraryReady } from "../../api/hooks/useLibraryReady";
import LoadingSpinner from "./LoadingSpinner";

interface Props {
  className?: string;
}

/**
 * The notice every library page shows while the server's first sync runs
 * (the library routes answer 503 `ready: false`). useLibraryReady re-checks
 * every 5 seconds, and the page loads as soon as the library is ready.
 */
const LibraryInitializingBanner = ({ className = "" }: Props) => {
  const { ready } = useLibraryReady();
  if (ready) return null;

  return (
    <div
      role="status"
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
            Server is syncing library, please wait...
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            This may take a few minutes on the first sync. Checking again every
            5 seconds; the page loads as soon as it is ready.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LibraryInitializingBanner;
