import { useState, useEffect } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Settings state
  const [preferredQuality, setPreferredQuality] = useState("auto");
  const [preferredPlaybackMode, setPreferredPlaybackMode] = useState("auto");
  const [theme, setTheme] = useState("dark");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);

  // Load user settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get("/user/settings");
      const { settings } = response.data;

      setPreferredQuality(settings.preferredQuality || "auto");
      setPreferredPlaybackMode(settings.preferredPlaybackMode || "auto");
      setTheme(settings.theme || "dark");
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      setError(null);

      await api.put("/user/settings", {
        preferredQuality,
        preferredPlaybackMode,
        theme,
      });

      setMessage("Settings saved successfully!");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setPasswordChanging(true);
      setMessage(null);
      setError(null);

      await api.post("/user/change-password", {
        currentPassword,
        newPassword,
      });

      setMessage("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error("Failed to change password:", err);
      setError(err.response?.data?.error || "Failed to change password");
    } finally {
      setPasswordChanging(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              My Settings
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
              Manage your personal preferences and account settings
            </p>
          </div>

          {/* Messages */}
          {message && (
            <div
              className="mb-6 p-4 rounded-lg"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                color: "rgb(34, 197, 94)",
              }}
            >
              {message}
            </div>
          )}

          {error && (
            <div
              className="mb-6 p-4 rounded-lg"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "rgb(239, 68, 68)",
              }}
            >
              {error}
            </div>
          )}

          {/* Playback Settings */}
          <div
            className="card mb-6"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div className="card-header">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Playback Preferences
              </h2>
            </div>
            <form onSubmit={saveSettings} className="card-body">
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
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Default quality for video playback. Auto selects the best quality based on your connection.
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
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Auto uses direct play when supported, otherwise transcodes. Direct play offers best quality but limited codec support.
                  </p>
                </div>

                {/* Theme */}
                <div>
                  <label
                    htmlFor="theme"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Theme
                  </label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="purple">Purple</option>
                  </select>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Choose your preferred color theme
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "white",
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Password Change */}
          <div
            className="card"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <div className="card-header">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Change Password
              </h2>
            </div>
            <form onSubmit={changePassword} className="card-body">
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="currentPassword"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    required
                    minLength={6}
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={passwordChanging}
                    className="px-6 py-2 rounded-lg font-medium"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "white",
                      opacity: passwordChanging ? 0.6 : 1,
                    }}
                  >
                    {passwordChanging ? "Changing..." : "Change Password"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default Settings;
