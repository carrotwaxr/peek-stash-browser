import { useCallback, useEffect, useState } from "react";
import type {
  ApplyDeletionsRequest,
  SyncEntityState,
  SyncEntityType,
  SyncInstanceStatus,
  SyncStatusResponse,
} from "@peek/shared-types";
import { Square } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import { useVisibleInterval } from "../../hooks/useVisibleInterval";
import { showError, showSuccess } from "../../utils/toast";
import { Button, ConfirmDialog, Paper } from "../ui/index";

const INTERVAL_OPTIONS = [
  { value: 60, label: "Every Hour (Default)" },
  { value: 120, label: "Every 2 Hours" },
  { value: 240, label: "Every 4 Hours" },
  { value: 480, label: "Every 8 Hours" },
  { value: 720, label: "Every 12 Hours" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

/** Each synced type and how the status table names it, in sync order */
const ENTITY_TYPES: ReadonlyArray<{
  type: SyncEntityType;
  label: string;
  plural: string;
}> = [
  { type: "tag", label: "Tags", plural: "tags" },
  { type: "studio", label: "Studios", plural: "studios" },
  { type: "performer", label: "Performers", plural: "performers" },
  { type: "group", label: "Collections", plural: "collections" },
  { type: "gallery", label: "Galleries", plural: "galleries" },
  { type: "scene", label: "Scenes", plural: "scenes" },
  { type: "clip", label: "Clips", plural: "clips" },
  { type: "image", label: "Images", plural: "images" },
];

const entityTypeOf = (entityType: string) =>
  ENTITY_TYPES.find((known) => known.type === entityType);

/**
 * How the server's `lastError` starts when a cleanup held back a mass
 * deletion, which "Apply deletions" applies
 */
const REFUSED = "Cleanup refused: ";

/** How often the status refreshes while a sync or a removal runs */
const POLL_MS = 10_000;

/** A refused cleanup's counts: "Stash no longer lists 80 of 120 scenes (...)" */
const refusalSummary = (lastError: string) =>
  lastError.slice(REFUSED.length).split("; ")[0];

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "Never";

/** The newer of a type's two Stash timestamps: where its next sync starts */
function lastChangeSynced(state: SyncEntityState): string | null {
  const times = [
    state.lastFullSyncTimestamp,
    state.lastIncrementalSyncTimestamp,
  ].filter((time): time is string => time !== null);
  if (times.length === 0) return null;
  return times.reduce((newest, time) =>
    new Date(time).getTime() > new Date(newest).getTime() ? time : newest
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

const lastRun = (state: SyncEntityState) =>
  state.lastSyncDurationMs === null
    ? state.lastSyncCount.toLocaleString()
    : `${state.lastSyncCount.toLocaleString()} in ${formatDuration(state.lastSyncDurationMs)}`;

/** A held-back or skipped cleanup warns; anything else is an error */
const problemColor = (lastError: string) =>
  lastError.startsWith("Cleanup refused:") ||
  lastError.startsWith("Cleanup skipped:")
    ? "var(--status-warning)"
    : "var(--status-error)";

interface Props {
  /**
   * Bumped when a sync starts elsewhere on the page (Full Sync, or one the
   * server statistics saw begin): the status reloads.
   */
  syncStarts?: number;
}

const SyncSettingsSection = ({ syncStarts = 0 }: Props) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [syncInterval, setSyncInterval] = useState(60);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [aborting, setAborting] = useState(false);
  const [applying, setApplying] = useState<{
    instance: SyncInstanceStatus;
    entityType: SyncEntityType;
    lastError: string;
  } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiGet<SyncStatusResponse>("/sync/status");
      setStatus(data);
      return data;
    } catch (err) {
      console.error("Failed to load sync status:", err);
      return null;
    }
  }, []);

  // The first load also sets the interval
  useEffect(() => {
    if (!isAdmin) return;
    const loadSettings = async () => {
      const data = await loadStatus();
      if (data) setSyncInterval(data.settings.syncIntervalMinutes);
      setLoading(false);
    };
    void loadSettings();
  }, [isAdmin, loadStatus]);

  useEffect(() => {
    if (isAdmin && syncStarts > 0) void loadStatus();
  }, [isAdmin, syncStarts, loadStatus]);

  const activeJob = status?.activeJob ?? null;
  useVisibleInterval(() => void loadStatus(), POLL_MS, activeJob !== null);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(e.target.value);
    const previous = syncInterval;
    setSyncInterval(value);

    try {
      await apiPut("/sync/settings", { syncIntervalMinutes: value });
      showSuccess("Sync interval updated");
    } catch (err) {
      setSyncInterval(previous);
      showError((err as Error).message || "Failed to update sync interval");
    }
  };

  const abortSync = async () => {
    setAborting(true);
    try {
      await apiPost("/sync/abort");
      showSuccess("Abort requested: the sync stops at its next step");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to abort the sync"
      );
    } finally {
      setAborting(false);
      void loadStatus();
    }
  };

  const applyDeletions = async () => {
    if (!applying) return;
    const { instance, entityType } = applying;
    setApplying(null);
    const body: ApplyDeletionsRequest = {
      instanceId: instance.instanceId,
      entityType,
    };
    try {
      await apiPost("/sync/cleanup", body);
      showSuccess(
        `Applying the deletions of ${entityTypeOf(entityType)?.plural ?? entityType} on "${instance.name}"`
      );
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to apply the deletions"
      );
    } finally {
      void loadStatus();
    }
  };

  if (!isAdmin) return null;

  const jobText =
    activeJob === "sync"
      ? "A sync is running. This status refreshes every 10 seconds until it ends."
      : activeJob === "instance-delete"
        ? "Removing a deleted instance's cached library. Syncs wait until it has finished."
        : status
          ? "No sync is running."
          : "The sync status could not be loaded.";

  return (
    <Paper className="mb-6">
      <Paper.Header
        title="Sync Settings"
        subtitle="Configure how often Peek syncs with your Stash instances"
      />
      <Paper.Body>
        <div>
          <label
            htmlFor="syncInterval"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Sync Interval
          </label>
          <select
            id="syncInterval"
            value={syncInterval}
            onChange={(e) => void handleChange(e)}
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            How frequently Peek automatically syncs library data from Stash.
            Changes take effect immediately.
          </p>
        </div>

        <hr className="my-6" style={{ borderColor: "var(--border-color)" }} />

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3
                className="text-sm font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                Sync status
              </h3>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {jobText}
              </p>
            </div>
            {status?.inProgress && (
              <Button
                onClick={() => void abortSync()}
                disabled={aborting}
                variant="destructive"
                size="sm"
                icon={<Square className="w-4 h-4" />}
              >
                Abort sync
              </Button>
            )}
          </div>

          {status && status.instances.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No Stash instance is configured.
            </p>
          )}
          <div className="space-y-6">
            {status?.instances.map((instance) => (
              <InstanceStatusTable
                key={instance.instanceId}
                instance={instance}
                busy={activeJob !== null}
                onApply={(entityType, lastError) =>
                  setApplying({ instance, entityType, lastError })
                }
              />
            ))}
          </div>
        </div>
      </Paper.Body>

      <ConfirmDialog
        isOpen={applying !== null}
        title="Apply deletions?"
        message={
          applying && (
            <div className="space-y-3">
              <p>
                {refusalSummary(applying.lastError)} on &quot;
                {applying.instance.name}&quot;.
              </p>
              <p>
                Peek held these deletions back in case Stash&apos;s list was
                incomplete. If they were deleted in Stash on purpose, apply
                them: Peek asks Stash for the list again and removes from its
                library only what Stash still does not list. It stops again if
                the list comes back incomplete.
              </p>
            </div>
          )
        }
        confirmText="Apply deletions"
        confirmStyle="danger"
        onConfirm={() => void applyDeletions()}
        onClose={() => setApplying(null)}
      />
    </Paper>
  );
};

interface InstanceStatusTableProps {
  instance: SyncInstanceStatus;
  /** A job holds the lock: Apply deletions would be refused */
  busy: boolean;
  onApply: (entityType: SyncEntityType, lastError: string) => void;
}

const HEADERS = [
  "Type",
  "Last full sync",
  "Last change synced",
  "Last run",
  "Problem",
];

/** One instance's entity types: when each synced, and its stored problem */
const InstanceStatusTable = ({
  instance,
  busy,
  onApply,
}: InstanceStatusTableProps) => (
  <div className="overflow-x-auto">
    <table
      className="w-full text-sm"
      aria-label={instance.name}
      style={{ opacity: instance.enabled ? 1 : 0.6 }}
    >
      <caption
        className="text-left font-medium mb-2"
        style={{ color: "var(--text-primary)" }}
      >
        {instance.name}
        {!instance.enabled && (
          <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Disabled: not synced
          </span>
        )}
      </caption>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
          {HEADERS.map((header) => (
            <th
              key={header}
              scope="col"
              className="text-left py-2 px-3 font-medium whitespace-nowrap"
              style={{ color: "var(--text-secondary)" }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {instance.states.length === 0 && (
          <tr>
            <td
              colSpan={HEADERS.length}
              className="py-2 px-3"
              style={{ color: "var(--text-muted)" }}
            >
              Not synced yet
            </td>
          </tr>
        )}
        {instance.states.map((state) => {
          const known = entityTypeOf(state.entityType);
          const { lastError } = state;
          const canApply =
            known !== undefined &&
            instance.enabled &&
            lastError?.startsWith(REFUSED) === true;
          return (
            <tr
              key={state.entityType}
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              <td
                className="py-2 px-3 whitespace-nowrap"
                style={{ color: "var(--text-primary)" }}
              >
                {known?.label ?? state.entityType}
              </td>
              <td
                className="py-2 px-3 whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                {formatTime(state.lastFullSyncActual)}
              </td>
              <td
                className="py-2 px-3 whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                {formatTime(lastChangeSynced(state))}
              </td>
              <td
                className="py-2 px-3 whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                {lastRun(state)}
              </td>
              <td className="py-2 px-3 min-w-[16rem]">
                {lastError !== null && (
                  <p
                    className="break-words"
                    style={{ color: problemColor(lastError) }}
                  >
                    {lastError}
                  </p>
                )}
                {canApply && (
                  <Button
                    className="mt-2"
                    onClick={() => onApply(known.type, lastError)}
                    disabled={busy}
                    variant="secondary"
                    size="sm"
                  >
                    Apply deletions
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default SyncSettingsSection;
