import { useEffect, useState } from "react";
import axios from "axios";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const PlaybackTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferredQuality, setPreferredQuality] = useState("auto");
  const [preferredPlaybackMode, setPreferredPlaybackMode] = useState("auto");
  const [preferredPreviewQuality, setPreferredPreviewQuality] = useState("sprite");
  const [enableCast, setEnableCast] = useState(true);
  const [minimumPlayPercent, setMinimumPlayPercent] = useState(20);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get("/user/settings");
        const { settings } = response.data;

        setPreferredQuality(settings.preferredQuality || "auto");
        setPreferredPlaybackMode(settings.preferredPlaybackMode || "auto");
        setPreferredPreviewQuality(settings.preferredPreviewQuality || "sprite");
        setEnableCast(settings.enableCast !== false);
        setMinimumPlayPercent(settings.minimumPlayPercent ?? 20);
      } catch {
        showError("Failed to load playback settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);

      await api.put("/user/settings", {
        preferredQuality,
        preferredPlaybackMode,
        preferredPreviewQuality,
        enableCast,
        minimumPlayPercent,
      });

      showSuccess("Playback settings saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save settings");
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

  return (
    <form onSubmit={saveSettings}>
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="space-y-6">
          {/* Preferred Quality */}
          <div>
            <label
              htmlFor="preferredQuality"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Preferred Quality
            </label>
            <select
              id="preferredQuality"
              value={preferredQuality}
              onChange={(e) => setPreferredQuality(e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Default quality for video playback. Auto selects the best quality based on
              your connection.
            </p>
          </div>

          {/* Preferred Preview Quality */}
          <div>
            <label
              htmlFor="preferredPreviewQuality"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Scene Card Preview Quality
            </label>
            <select
              id="preferredPreviewQuality"
              value={preferredPreviewQuality}
              onChange={(e) => setPreferredPreviewQuality(e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="sprite">Low Quality - Sprite (Default)</option>
              <option value="webp">High Quality - WebP Animation</option>
              <option value="mp4">High Quality - MP4 Video</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Quality of preview animations shown when hovering over scene cards. Low
              quality (sprite) uses less bandwidth.
            </p>
          </div>

          {/* Preferred Playback Mode */}
          <div>
            <label
              htmlFor="preferredPlaybackMode"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Preferred Playback Mode
            </label>
            <select
              id="preferredPlaybackMode"
              value={preferredPlaybackMode}
              onChange={(e) => setPreferredPlaybackMode(e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="auto">Auto (Recommended)</option>
              <option value="direct">Direct Play</option>
              <option value="transcode">Force Transcode</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Auto uses direct play when supported, otherwise transcodes. Direct play
              offers best quality but limited codec support.
            </p>
          </div>

          {/* Enable Cast */}
          <div>
            <label
              htmlFor="enableCast"
              className="flex items-center justify-between cursor-pointer"
            >
              <div>
                <span
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Enable Chromecast/AirPlay
                </span>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Allow casting videos to Chromecast devices and AirPlay. Disable if you
                  don't use these features or experience playback issues.
                </p>
              </div>
              <input
                id="enableCast"
                type="checkbox"
                checked={enableCast}
                onChange={(e) => setEnableCast(e.target.checked)}
                className="ml-4 w-5 h-5 cursor-pointer"
                style={{
                  accentColor: "var(--accent-primary)",
                }}
              />
            </label>
          </div>

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
              Percentage of video to watch before counting as "played". This determines
              when the play count increments during watch sessions.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
            <Button type="submit" disabled={saving} variant="primary" loading={saving}>
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
};

export default PlaybackTab;
