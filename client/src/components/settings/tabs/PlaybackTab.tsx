import { useState } from "react";
import { getErrorMessage } from "../../../api";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../../../api/hooks/useUserSettings";
import { showError, showSuccess } from "../../../utils/toast";
import { Button, StatusMessage } from "../../ui/index";

/** The form, mounted once the stored value is known */
const PlaybackForm = ({ storedPercent }: { storedPercent: number }) => {
  const save = useUpdateUserSettings();
  const [minimumPlayPercent, setMinimumPlayPercent] = useState(storedPercent);
  const saving = save.isPending;

  const saveSettings = async (e: React.SubmitEvent) => {
    e.preventDefault();
    try {
      // The player reads the settings query, so the next play uses it
      await save.mutateAsync({ minimumPlayPercent });
      showSuccess("Playback settings saved successfully!");
    } catch (err) {
      showError(getErrorMessage(err, "Failed to save settings"));
    }
  };

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

          {/* Casting: no setting, only what it needs */}
          <p
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
            data-testid="casting-help"
          >
            Chromecast needs Peek on HTTPS: on a plain http address the Cast
            button does not show. Cast from Chrome or Edge; in Safari, use
            AirPlay.
          </p>

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

/**
 * The playback settings. After a failed load the form would show defaults,
 * and Save would write them over the stored settings: show Retry instead.
 */
const PlaybackTab = () => {
  const { data, isPending, error, refetch } = useUserSettings();

  if (isPending) {
    return (
      <div
        className="flex items-center justify-center p-12"
        style={{ backgroundColor: "var(--bg-card)" }}
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <StatusMessage
        variant="error"
        title="Failed to load playback settings"
        message={getErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <PlaybackForm storedPercent={data.settings.minimumPlayPercent ?? 20} />
  );
};

export default PlaybackTab;
