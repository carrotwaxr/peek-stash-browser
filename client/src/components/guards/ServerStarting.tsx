import { useEffect, useState } from "react";

/** After this long the page adds a hint to look at the server */
export const STILL_WAITING_AFTER_MS = 60_000;

interface Props {
  /** The last failed answer's HTTP status; none for a network error */
  httpStatus?: number | undefined;
}

/**
 * Shown while GET /setup/status fails: the server is starting or running its
 * upgrade's migrations. The setup-status query keeps retrying on its own.
 */
const ServerStarting = ({ httpStatus }: Props) => {
  const [stillWaiting, setStillWaiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setStillWaiting(true),
      STILL_WAITING_AFTER_MS
    );
    return () => clearTimeout(timer);
  }, []);

  const waiting =
    httpStatus === undefined
      ? "Peek is starting. Waiting for the server..."
      : `Peek is starting. Waiting for the server (HTTP ${httpStatus})...`;

  return (
    <div
      role="status"
      className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <div className="text-xl">{waiting}</div>
      {stillWaiting && (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Still waiting. If this lasts, check the server&apos;s log.
        </div>
      )}
    </div>
  );
};

export default ServerStarting;
