import { useEffect, useState } from "react";
import { apiGet, apiPut, getErrorMessage } from "../../../api";
import { showError, showSuccess } from "../../../utils/toast";
import { Button, ErrorMessage } from "../../ui/index";

const PlaybackTab = () => {
  const [loading, setLoading] = useState(true);
  // After a failed load the form would show defaults, and Save would write
  // them over the stored settings: show Retry instead
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [minimumPlayPercent, setMinimumPlayPercent] = useState(20);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const data = await apiGet<{ settings: Record<string, unknown> }>(
          "/user/settings"
        );
        const { settings } = data;

        setMinimumPlayPercent((settings.minimumPlayPercent as number) ?? 20);
      } catch (err) {
        setLoadError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [loadAttempt]);

  const saveSettings = async (e: React.SubmitEvent) => {
    e.preventDefault();
    try {
      setSaving(true);

      await apiPut("/user/settings", {
        minimumPlayPercent,
      });

      showSuccess("Playback settings saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorMessage
        title="Failed to load playback settings"
        error={loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
      />
    );
  }

  return (
    <form onSubmit={(e) => void saveSettings(e)}>
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="space-y-6">
          {/* Minimum Play Percent */}
          <div>
            <label
              htmlFor="minimumPlayPercent"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Minimum Play Percent: {minimumPlayPercent}%
            </label>
            <input
              id="minimumPlayPercent"
              type="range"
              min="0"
              max="100"
              step="5"
              value={minimumPlayPercent}
              onChange={(e) => setMinimumPlayPercent(parseInt(e.target.value))}
              className="range-slider w-full"
              style={{
                background: `linear-gradient(to right, var(--status-info) 0%, var(--status-info) ${minimumPlayPercent}%, var(--border-color) ${minimumPlayPercent}%, var(--border-color) 100%)`,
              }}
            />
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Percentage of video to watch before counting as "played". This
              determines when the play count increments during watch sessions.
            </p>
          </div>

          {/* Save Button */}
          <div
            className="flex justify-end pt-4 border-t"
            style={{ borderColor: "var(--border-color)" }}
          >
            <Button
              type="submit"
              disabled={saving}
              variant="primary"
              loading={saving}
            >
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default PlaybackTab;
