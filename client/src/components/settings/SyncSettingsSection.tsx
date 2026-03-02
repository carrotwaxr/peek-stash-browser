import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../../api";
import { Paper } from "../ui/index";
import { useAuth } from "../../hooks/useAuth";
import { showSuccess, showError } from "../../utils/toast";

const INTERVAL_OPTIONS = [
  { value: 60, label: "Every Hour (Default)" },
  { value: 120, label: "Every 2 Hours" },
  { value: 240, label: "Every 4 Hours" },
  { value: 480, label: "Every 8 Hours" },
  { value: 720, label: "Every 12 Hours" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

const SyncSettingsSection = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [syncInterval, setSyncInterval] = useState(60);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await apiGet("/sync/status");
        const minutes = data?.settings?.syncIntervalMinutes;
        if (minutes) setSyncInterval(minutes);
      } catch (err) {
        console.error("Failed to load sync settings:", err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

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

  if (!isAdmin) return null;

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
            onChange={handleChange}
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
            How frequently Peek automatically syncs library data from Stash. Changes take
            effect immediately.
          </p>
        </div>
      </Paper.Body>
    </Paper>
  );
};

export default SyncSettingsSection;
