// client/src/components/settings/tabs/BackupTab.jsx
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const formatBytes = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const BackupTab = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/admin/database/backups");
      setBackups(response.data.backups);
    } catch {
      showError("Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      await api.post("/admin/database/backup");
      showSuccess("Backup created successfully");
      fetchBackups();
    } catch {
      showError("Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!confirm(`Are you sure you want to delete this backup?\n\n${filename}\n\nThis cannot be undone.`)) {
      return;
    }
    try {
      setDeleting(filename);
      await api.delete(`/admin/database/backups/${encodeURIComponent(filename)}`);
      showSuccess("Backup deleted");
      fetchBackups();
    } catch {
      showError("Failed to delete backup");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading backups...</div>;
  }

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
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Database Backup
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Create and manage database backups
            </p>
          </div>
          <Button
            onClick={handleCreateBackup}
            disabled={creating}
            variant="primary"
          >
            {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

        {backups.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No backups yet. Create your first backup to protect your data.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              {backups.length} backup{backups.length !== 1 ? "s" : ""} available
            </p>

            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex justify-between items-center p-3 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div>
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {formatDate(backup.createdAt)}
                  </p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {formatBytes(backup.size)}
                  </p>
                </div>
                <Button
                  onClick={() => handleDeleteBackup(backup.filename)}
                  disabled={deleting === backup.filename}
                  variant="danger"
                  size="sm"
                >
                  {deleting === backup.filename ? (
                    "Deleting..."
                  ) : (
                    <Trash2 size={16} />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupTab;
