// client/src/components/settings/tabs/BackupTab.tsx
import { useCallback, useEffect, useState } from "react";
import type {
  DatabaseBackup,
  ListDatabaseBackupsResponse,
} from "@peek/shared-types";
import { Trash2 } from "lucide-react";
import { ApiError, apiDelete, apiGet, apiPost } from "../../../api";
import { showError, showSuccess } from "../../../utils/toast";
import { Button } from "../../ui/index";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  // A terabyte or more is shown in GB
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i] ?? ""}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** What made a backup, as its row says it. */
const kindLabel = (backup: DatabaseBackup): string => {
  switch (backup.kind) {
    case "manual":
      return "Created in Peek";
    case "preMigration":
      return `Before upgrading to ${backup.version ?? "a new version"}`;
    case "legacy":
      return "Before an upgrade (older Peek)";
  }
};

/**
 * The server's reason for a failure, as "Failed to create backup: <why>";
 * `fallback` when the request never got an answer.
 */
const serverError = (err: unknown, fallback: string): string => {
  if (!(err instanceof ApiError)) return fallback;
  const detail = err.data.message;
  return typeof detail === "string" && detail !== ""
    ? `${err.message}: ${detail}`
    : err.message;
};

const BackupTab = () => {
  // null until the first answer; later refreshes keep the rows shown
  const [listing, setListing] = useState<ListDatabaseBackupsResponse | null>(
    null
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await apiGet<ListDatabaseBackupsResponse>(
        "/admin/database/backups"
      );
      setListing(data);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      showError(serverError(err, "Failed to load backups"));
    }
  }, []);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      await apiPost("/admin/database/backup");
      showSuccess("Backup created");
      await fetchBackups();
    } catch (err) {
      showError(serverError(err, "Failed to create backup"));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (
      !confirm(
        `Are you sure you want to delete this backup?\n\n${filename}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    try {
      setDeleting(filename);
      await apiDelete(
        `/admin/database/backups/${encodeURIComponent(filename)}`
      );
      showSuccess("Backup deleted");
      await fetchBackups();
    } catch (err) {
      showError(serverError(err, "Failed to delete backup"));
    } finally {
      setDeleting(null);
    }
  };

  if (listing === null) {
    return (
      <div className="p-6">
        {loadFailed ? "Could not load backups." : "Loading backups..."}
      </div>
    );
  }

  const { backups, directory } = listing;

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Database Backup
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Create and manage database backups
            </p>
          </div>
          <Button
            onClick={() => void handleCreateBackup()}
            disabled={creating}
            variant="primary"
          >
            {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

        <div
          className="text-sm mb-4 space-y-1"
          style={{ color: "var(--text-secondary)" }}
        >
          <p>
            Backups are files on the server&apos;s data volume, in{" "}
            <span className="font-mono break-all">{directory}</span>. To keep
            one elsewhere, copy its file from that folder: a finished backup,
            including the automatic ones taken before an upgrade, is safe to
            copy while Peek runs. To copy the live database instead, stop the
            container first.
          </p>
          <p>
            There is no download here: a backup holds every user&apos;s password
            hash and history, and your Stash API keys.
          </p>
        </div>

        {backups.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No backups yet. Create your first backup to protect your data.
          </p>
        ) : (
          <div>
            <p
              className="text-sm mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {backups.length} backup{backups.length !== 1 ? "s" : ""} available
            </p>

            <ul className="space-y-2">
              {backups.map((backup) => (
                <li
                  key={backup.filename}
                  className="flex justify-between items-center gap-3 p-3 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatDate(backup.createdAt)}
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span>{kindLabel(backup)}</span> ·{" "}
                      {formatBytes(backup.size)}
                    </p>
                    <p
                      className="text-xs font-mono break-all"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {backup.path}
                    </p>
                  </div>
                  <Button
                    onClick={() => void handleDeleteBackup(backup.filename)}
                    disabled={deleting === backup.filename}
                    variant="destructive"
                    size="sm"
                    aria-label={`Delete backup ${backup.filename}`}
                  >
                    {deleting === backup.filename ? (
                      "Deleting..."
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupTab;
