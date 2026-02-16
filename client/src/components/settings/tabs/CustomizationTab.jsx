import { useEffect, useState } from "react";
import axios from "axios";
import { useUnitPreference } from "../../../contexts/UnitPreferenceContext.js";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import CardDisplaySettings from "../CardDisplaySettings.jsx";
import TableColumnSettings from "../TableColumnSettings.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CustomizationTab = () => {
  const [loading, setLoading] = useState(true);
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const [preferredPreviewQuality, setPreferredPreviewQuality] = useState("sprite");
  const [wallPlayback, setWallPlayback] = useState("autoplay");
  const [lightboxDoubleTapAction, setLightboxDoubleTapAction] = useState("favorite");
  const [tableColumnDefaults, setTableColumnDefaults] = useState({});

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get("/user/settings");
        const { settings } = response.data;

        setPreferredPreviewQuality(settings.preferredPreviewQuality || "sprite");
        setWallPlayback(settings.wallPlayback || "autoplay");
        setLightboxDoubleTapAction(settings.lightboxDoubleTapAction || "favorite");
        setTableColumnDefaults(settings.tableColumnDefaults || {});
      } catch {
        showError("Failed to load customization settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const saveViewPreference = async (key, value) => {
    try {
      await api.put("/user/settings", {
        [key]: value,
      });

      if (key === "preferredPreviewQuality") {
        setPreferredPreviewQuality(value);
      } else if (key === "wallPlayback") {
        setWallPlayback(value);
      } else if (key === "lightboxDoubleTapAction") {
        setLightboxDoubleTapAction(value);
      }
      showSuccess("View preference saved!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save view preference");
    }
  };

  const saveTableColumnDefaults = async (newDefaults) => {
    try {
      await api.put("/user/settings", {
        tableColumnDefaults: newDefaults,
      });
      setTableColumnDefaults(newDefaults);
      showSuccess("Table column defaults saved!");
    } catch (err) {
      showError(
        err.response?.data?.error || "Failed to save table column defaults"
      );
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
    <div className="space-y-6">
      {/* View Preferences */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          View Preferences
        </h3>
        <div className="space-y-4">
          {/* Scene Card Preview Quality */}
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
              onChange={(e) => saveViewPreference("preferredPreviewQuality", e.target.value)}
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

          {/* Wall View Preview Behavior */}
          <div>
            <label
              htmlFor="wallPlayback"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Wall View Preview Behavior
            </label>
            <select
              id="wallPlayback"
              value={wallPlayback}
              onChange={(e) => saveViewPreference("wallPlayback", e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="autoplay">Autoplay All (Default)</option>
              <option value="hover">Play on Hover Only</option>
              <option value="static">Static Thumbnails</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Controls how scene previews behave in Wall view. Autoplay plays all visible
              previews simultaneously. Hover only plays when you mouse over. Static shows
              thumbnails only.
            </p>
          </div>

          {/* Measurement Units */}
          <div>
            <label
              htmlFor="unitPreference"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Measurement Units
            </label>
            <select
              id="unitPreference"
              value={unitPreference}
              onChange={(e) => setUnitPreference(e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="metric">Metric (cm, kg)</option>
              <option value="imperial">Imperial (ft/in, lbs)</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Display performer height, weight, and measurements in your preferred unit
              system.
            </p>
          </div>

          {/* Image Lightbox Double-Tap Action */}
          <div>
            <label
              htmlFor="lightboxDoubleTapAction"
              className="block text-sm font-medium mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Image Lightbox Double-Tap Action
            </label>
            <select
              id="lightboxDoubleTapAction"
              value={lightboxDoubleTapAction}
              onChange={(e) => saveViewPreference("lightboxDoubleTapAction", e.target.value)}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              <option value="favorite">Toggle Favorite (Default)</option>
              <option value="o_counter">Increment O Counter</option>
              <option value="fullscreen">Toggle Fullscreen</option>
            </select>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Action performed when double-tapping (mobile) or double-clicking (desktop) an
              image in the lightbox.
            </p>
          </div>
        </div>
      </div>

      {/* Card Display Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CardDisplaySettings />
      </div>

      {/* Table Column Defaults */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <TableColumnSettings
          tableColumnDefaults={tableColumnDefaults}
          onSave={saveTableColumnDefaults}
        />
      </div>
    </div>
  );
};

export default CustomizationTab;
