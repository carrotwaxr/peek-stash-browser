import { useState, useEffect } from "react";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useTheme } from "../../themes/useTheme.js";
import { PageLayout } from "../ui/index.js";
import CarouselSettings from "../settings/CarouselSettings.jsx";
import Button from "../ui/Button.jsx";
import Paper from "../ui/Paper.jsx";
import SuccessMessage from "../ui/SuccessMessage.jsx";
import WarningMessage from "../ui/WarningMessage.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import InfoMessage from "../ui/InfoMessage.jsx";
import { showSuccess, showError } from "../../utils/toast.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const Settings = () => {
  usePageTitle("My Settings");
  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Get rating color based on value
  const getRatingColor = (rating) => {
    if (!rating) return 'var(--text-muted)';
    if (rating >= 80) return 'var(--rating-excellent)';
    if (rating >= 60) return 'var(--rating-good)';
    if (rating >= 40) return 'var(--rating-average)';
    if (rating >= 20) return 'var(--rating-poor)';
    return 'var(--rating-bad)';
  };

  // Settings state
  const [preferredQuality, setPreferredQuality] = useState("auto");
  const [preferredPlaybackMode, setPreferredPlaybackMode] = useState("auto");
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [minimumPlayPercent, setMinimumPlayPercent] = useState(20);

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
      setCarouselPreferences(settings.carouselPreferences || []);
      setMinimumPlayPercent(settings.minimumPlayPercent ?? 20);
    } catch {
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const saveCarouselPreferences = async (newPreferences) => {
    try {
      setError(null);

      await api.put("/user/settings", {
        carouselPreferences: newPreferences,
      });

      setCarouselPreferences(newPreferences);
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save carousel preferences");
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);

      await api.put("/user/settings", {
        preferredQuality,
        preferredPlaybackMode,
        minimumPlayPercent,
      });

      showSuccess("Settings saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      showError("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      showError("Password must be at least 6 characters");
      return;
    }

    try {
      setPasswordChanging(true);
      setError(null);

      await api.post("/user/change-password", {
        currentPassword,
        newPassword,
      });

      showSuccess("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to change password");
    } finally {
      setPasswordChanging(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
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

        {/* Theme */}
        <Paper className="mb-6">
          <Paper.Header title="Theme" />
          <Paper.Body>
            <div className="space-y-2">
              {availableThemes.map((theme) => (
                <Button
                  key={theme.key}
                  type="button"
                  onClick={() => changeTheme(theme.key)}
                  variant={currentTheme === theme.key ? "primary" : "secondary"}
                  fullWidth
                  className="text-left px-4 py-3 text-sm flex items-center justify-between"
                >
                  <span>{theme.name}</span>
                  {currentTheme === theme.key && (
                    <span className="text-sm">✓</span>
                  )}
                </Button>
              ))}
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Choose your preferred color theme (changes apply immediately)
            </p>
            <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--border-color)" }}>
              <h3 className="text-lg font-semibold mb-6" style={{ color: "var(--text-primary)" }}>UI Examples</h3>

              {/* Buttons */}
              <div className="mb-8">
                <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Buttons</h4>
                <div className="flex flex-wrap gap-3">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="tertiary">Tertiary</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
              </div>

              {/* Status Messages */}
              <div className="mb-8">
                <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Status Messages</h4>
                <div className="space-y-3">
                  <SuccessMessage message="Operation completed successfully!" />
                  <InfoMessage message="Here's some helpful information." />
                  <WarningMessage message="Please review this warning." />
                  <ErrorMessage message="An error occurred during processing." />
                </div>
              </div>

              {/* Rating Gradient */}
              <div>
                <h4 className="text-sm font-medium mb-3" style={{ color: "var(--text-secondary)" }}>Rating Colors (0-100)</h4>
                <div className="space-y-2">
                  {[
                    { rating: 0, label: "No rating" },
                    { rating: 10, label: "0-19: Bad" },
                    { rating: 20, label: "20-39: Poor" },
                    { rating: 30, label: "20-39: Poor" },
                    { rating: 40, label: "40-59: Average" },
                    { rating: 50, label: "40-59: Average" },
                    { rating: 60, label: "60-79: Good" },
                    { rating: 70, label: "60-79: Good" },
                    { rating: 80, label: "80-100: Excellent" },
                    { rating: 90, label: "80-100: Excellent" },
                    { rating: 100, label: "80-100: Excellent" },
                  ].map((item) => (
                    <div key={item.rating} className="flex items-center gap-3">
                      <div
                        className="w-16 h-8 rounded flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: getRatingColor(item.rating) }}
                      >
                        {item.rating}
                      </div>
                      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Paper.Body>
        </Paper>

        {/* Playback Settings */}
        <Paper className="mb-6">
          <Paper.Header title="Playback Preferences" />
          <form onSubmit={saveSettings}>
            <Paper.Body>
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
                    Default quality for video playback. Auto selects the best
                    quality based on your connection.
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
                    Auto uses direct play when supported, otherwise transcodes.
                    Direct play offers best quality but limited codec support.
                  </p>
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
                    className="range-slider"
                    style={{
                      background: `linear-gradient(to right, var(--accent-info) 0%, var(--accent-info) ${minimumPlayPercent}%, var(--border-color) ${minimumPlayPercent}%, var(--border-color) 100%)`
                    }}
                  />
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Percentage of video to watch before counting as "played". This
                    determines when the play count increments during watch sessions.
                  </p>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
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
            </Paper.Body>
          </form>
        </Paper>

        {/* Carousel Settings */}
        <Paper className="mb-6">
          <Paper.Body>
            <CarouselSettings
              carouselPreferences={carouselPreferences}
              onSave={saveCarouselPreferences}
            />
          </Paper.Body>
        </Paper>

        {/* Password Change */}
        <Paper>
          <Paper.Header title="Change Password" />
          <form onSubmit={changePassword}>
            <Paper.Body>
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
                  <Button
                    type="submit"
                    disabled={passwordChanging}
                    variant="primary"
                    loading={passwordChanging}
                  >
                    Change Password
                  </Button>
                </div>
              </div>
            </Paper.Body>
          </form>
        </Paper>
      </div>
    </PageLayout>
  );
};

export default Settings;
