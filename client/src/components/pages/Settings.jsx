import { useEffect, useState } from "react";
import axios from "axios";
import { ChevronDown, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { migrateCarouselPreferences } from "../../constants/carousels.js";
import { migrateNavPreferences } from "../../constants/navigation.js";
import { useHiddenEntities } from "../../hooks/useHiddenEntities.js";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useTheme } from "../../themes/useTheme.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import CarouselSettings from "../settings/CarouselSettings.jsx";
import CustomThemeManager from "../settings/CustomThemeManager.jsx";
import NavigationSettings from "../settings/NavigationSettings.jsx";
import {
  Button,
  ErrorMessage,
  InfoMessage,
  PageHeader,
  PageLayout,
  Paper,
  SuccessMessage,
  WarningMessage,
} from "../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const Settings = () => {
  usePageTitle("My Settings");
  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const { hideConfirmationDisabled, updateHideConfirmation } = useHiddenEntities();
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [preferredQuality, setPreferredQuality] = useState("auto");
  const [preferredPlaybackMode, setPreferredPlaybackMode] = useState("auto");
  const [preferredPreviewQuality, setPreferredPreviewQuality] =
    useState("sprite");
  const [enableCast, setEnableCast] = useState(true);
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [navPreferences, setNavPreferences] = useState([]);
  const [minimumPlayPercent, setMinimumPlayPercent] = useState(20);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);

  // UI state
  const [uiExamplesExpanded, setUiExamplesExpanded] = useState(false);

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
      setPreferredPreviewQuality(settings.preferredPreviewQuality || "sprite");
      setEnableCast(settings.enableCast !== false); // Default to true

      // Migrate carousel preferences to include any new carousels
      const migratedCarouselPrefs = migrateCarouselPreferences(
        settings.carouselPreferences
      );
      setCarouselPreferences(migratedCarouselPrefs);

      // Migrate navigation preferences to include any new nav items
      const migratedNavPrefs = migrateNavPreferences(settings.navPreferences);
      setNavPreferences(migratedNavPrefs);

      setMinimumPlayPercent(settings.minimumPlayPercent ?? 20);
    } catch {
      // Error handling could be added here if needed
    } finally {
      setLoading(false);
    }
  };

  const saveCarouselPreferences = async (newPreferences) => {
    try {
      await api.put("/user/settings", {
        carouselPreferences: newPreferences,
      });

      setCarouselPreferences(newPreferences);
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(
        err.response?.data?.error || "Failed to save carousel preferences"
      );
    }
  };

  const saveNavPreferences = async (newPreferences) => {
    try {
      await api.put("/user/settings", {
        navPreferences: newPreferences,
      });

      setNavPreferences(newPreferences);
      showSuccess("Navigation preferences saved successfully!");

      // Reload the page to apply nav changes immediately
      window.location.reload();
    } catch (err) {
      showError(
        err.response?.data?.error || "Failed to save navigation preferences"
      );
    }
  };

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
      <style>{`
        .scene-card-demo:hover {
          transform: scale(1.03);
          z-index: 10;
          outline: 2px solid var(--selection-color);
          outline-offset: 2px;
        }
      `}</style>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <PageHeader
          title="My Settings"
          subtitle="Manage your personal preferences and account settings"
        />

        {/* Theme */}
        <Paper className="mb-6">
          <Paper.Header title="Built-in Themes" />
          <Paper.Body>
            <div className="space-y-2">
              {availableThemes
                .filter((theme) => !theme.isCustom)
                .map((theme) => (
                  <Button
                    key={theme.key}
                    type="button"
                    onClick={() => changeTheme(theme.key)}
                    variant={
                      currentTheme === theme.key ? "primary" : "secondary"
                    }
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
              Choose from our built-in color themes (changes apply immediately)
            </p>
            <div
              className="mt-8 pt-6 border-t"
              style={{ borderColor: "var(--border-color)" }}
            >
              <button
                onClick={() => setUiExamplesExpanded(!uiExamplesExpanded)}
                className="w-full flex items-center justify-between text-left mb-6 hover:opacity-70 transition-opacity"
              >
                <h3
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  UI Examples
                </h3>
                <ChevronDown
                  size={20}
                  style={{
                    color: "var(--text-secondary)",
                    transform: uiExamplesExpanded
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </button>

              {uiExamplesExpanded && (
                <div
                  className="p-6 rounded-lg space-y-8"
                  style={{ backgroundColor: "var(--bg-primary)" }}
                >
                  {/* Typography */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Typography
                    </h4>
                    <div
                      className="space-y-4 p-4 rounded-lg"
                      style={{ backgroundColor: "var(--bg-secondary)" }}
                    >
                      <div>
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Brand Font (--font-brand)
                        </div>
                        <div
                          className="text-2xl"
                          style={{
                            fontFamily: "var(--font-brand)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Peek Stash Browser
                        </div>
                      </div>
                      <div>
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Heading Font (--font-heading)
                        </div>
                        <h1
                          className="text-3xl font-bold mb-1"
                          style={{
                            fontFamily: "var(--font-heading)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Heading Level 1
                        </h1>
                        <h2
                          className="text-2xl font-semibold mb-1"
                          style={{
                            fontFamily: "var(--font-heading)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Heading Level 2
                        </h2>
                        <h3
                          className="text-xl font-medium"
                          style={{
                            fontFamily: "var(--font-heading)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Heading Level 3
                        </h3>
                      </div>
                      <div>
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Body Font (--font-body)
                        </div>
                        <p
                          className="text-base mb-2"
                          style={{
                            fontFamily: "var(--font-body)",
                            color: "var(--text-primary)",
                          }}
                        >
                          Primary text: The quick brown fox jumps over the lazy
                          dog
                        </p>
                        <p
                          className="text-sm mb-2"
                          style={{
                            fontFamily: "var(--font-body)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Secondary text: The quick brown fox jumps over the
                          lazy dog
                        </p>
                        <p
                          className="text-sm"
                          style={{
                            fontFamily: "var(--font-body)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Muted text: The quick brown fox jumps over the lazy
                          dog
                        </p>
                      </div>
                      <div>
                        <div
                          className="text-xs mb-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Monospace Font (--font-mono)
                        </div>
                        <code
                          className="text-sm px-2 py-1 rounded"
                          style={{
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-primary)",
                            backgroundColor: "var(--bg-tertiary)",
                          }}
                        >
                          const variable = "monospace";
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Colors - Accents */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Accent Colors
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--accent-primary)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Primary</div>
                        <div className="text-xs opacity-80">
                          --accent-primary
                        </div>
                      </div>
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--accent-secondary)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Secondary</div>
                        <div className="text-xs opacity-80">
                          --accent-secondary
                        </div>
                      </div>
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--status-success)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Success</div>
                        <div className="text-xs opacity-80">
                          --status-success
                        </div>
                      </div>
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--status-info)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Info</div>
                        <div className="text-xs opacity-80">--status-info</div>
                      </div>
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--status-warning)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Warning</div>
                        <div className="text-xs opacity-80">
                          --status-warning
                        </div>
                      </div>
                      <div
                        className="p-4 rounded-lg text-center"
                        style={{
                          backgroundColor: "var(--status-error)",
                          color: "white",
                        }}
                      >
                        <div className="font-medium">Error</div>
                        <div className="text-xs opacity-80">--status-error</div>
                      </div>
                    </div>
                  </div>

                  {/* Backgrounds */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Background Colors
                    </h4>
                    <div className="space-y-2">
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        Primary Background (--bg-primary)
                      </div>
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        Secondary Background (--bg-secondary)
                      </div>
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        Tertiary Background (--bg-tertiary)
                        <br />
                        <span className="text-xs opacity-70">
                          Auto-generated for skeleton placeholders
                        </span>
                      </div>
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        Card Background (--bg-card)
                      </div>
                    </div>
                  </div>

                  {/* Role Badges */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Role Badges
                    </h4>
                    <div className="flex gap-3">
                      <span
                        className="px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: "var(--accent-primary)",
                          color: "white",
                        }}
                      >
                        Admin
                      </span>
                      <span
                        className="px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        User
                      </span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Buttons
                    </h4>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="primary">Primary</Button>
                      <Button variant="secondary">Secondary</Button>
                      <Button variant="tertiary">Tertiary</Button>
                      <Button variant="destructive">Destructive</Button>
                    </div>
                  </div>

                  {/* Status Messages */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Status Messages
                    </h4>
                    <div className="space-y-3">
                      <SuccessMessage message="Operation completed successfully!" />
                      <InfoMessage message="Here's some helpful information." />
                      <WarningMessage message="Please review this warning." />
                      <ErrorMessage message="An error occurred during processing." />
                    </div>
                  </div>

                  {/* Borders & Shadows */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Borders & Shadows
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className="p-4 rounded-lg border"
                        style={{
                          borderColor: "var(--border-color)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div className="font-medium mb-1">Border</div>
                        <div
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Standard border color
                        </div>
                      </div>
                      <div
                        className="p-4 rounded-lg"
                        style={{
                          boxShadow: "var(--shadow-md)",
                          backgroundColor: "var(--bg-card)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <div className="font-medium mb-1">Shadow</div>
                        <div
                          className="text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Medium shadow effect
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toast Notifications */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Toast Notifications
                    </h4>
                    <div className="space-y-3">
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Click the buttons below to see how toast notifications
                        appear in this theme:
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            showSuccess("This is a success toast notification!")
                          }
                        >
                          Show Success Toast
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            showError("This is an error toast notification!")
                          }
                        >
                          Show Error Toast
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div
                          className="p-3 rounded-lg border"
                          style={{
                            backgroundColor: "var(--toast-info-bg)",
                            borderColor: "var(--toast-info-border)",
                            boxShadow: `0 4px 12px var(--toast-info-shadow)`,
                            color: "white",
                          }}
                        >
                          <div className="font-medium mb-1">
                            Info Toast Style
                          </div>
                          <div className="text-xs opacity-90">
                            --toast-info-bg/border/shadow
                          </div>
                        </div>
                        <div
                          className="p-3 rounded-lg border"
                          style={{
                            backgroundColor: "var(--toast-error-bg)",
                            borderColor: "var(--toast-error-border)",
                            boxShadow: `0 4px 12px var(--toast-error-shadow)`,
                            color: "white",
                          }}
                        >
                          <div className="font-medium mb-1">
                            Error Toast Style
                          </div>
                          <div className="text-xs opacity-90">
                            --toast-error-bg/border/shadow
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scene Card Example */}
                  <div>
                    <h4
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Scene Card
                    </h4>
                    <p
                      className="text-sm mb-4"
                      style={{ color: "var(--text-muted)" }}
                    >
                      The most important UI element - hover to see interaction
                      styling:
                    </p>
                    <div className="max-w-xs mx-auto">
                      <div
                        className="scene-card-demo rounded-lg border overflow-hidden transition-all duration-300 cursor-pointer"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                          borderWidth: "1px",
                        }}
                      >
                        {/* Thumbnail */}
                        <div
                          className="relative aspect-video overflow-hidden"
                          style={{ backgroundColor: "var(--bg-secondary)" }}
                        >
                          {/* Placeholder */}
                          <div className="w-full h-full flex items-center justify-center">
                            <svg
                              className="w-12 h-12"
                              style={{ color: "var(--text-muted)" }}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>

                          {/* Overlay gradient */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none"></div>

                          {/* Duration badge */}
                          <div className="absolute bottom-2 right-2 pointer-events-none">
                            <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                              45m
                            </span>
                          </div>

                          {/* Progress bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
                            <div
                              className="h-full"
                              style={{
                                width: "35%",
                                backgroundColor: "var(--status-success)",
                              }}
                            />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="pt-4 px-4 pb-2">
                          {/* Title and Date - Fixed height */}
                          <div
                            className="flex flex-col"
                            style={{ minHeight: "4rem", maxHeight: "4rem" }}
                          >
                            <h3
                              className="font-semibold mb-1 leading-tight line-clamp-2"
                              style={{ color: "var(--text-primary)" }}
                            >
                              Example Scene Title Goes Here
                            </h3>
                            <p
                              className="text-xs mt-1"
                              style={{ color: "var(--text-muted)" }}
                            >
                              2024-01-15
                            </p>
                          </div>

                          {/* Stats - Fixed height row */}
                          <div
                            style={{
                              minHeight: "1.5rem",
                              maxHeight: "1.5rem",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              className="flex items-center justify-center gap-4 text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <span>💦 12</span>
                              <span>
                                <span
                                  style={{ color: "var(--status-success)" }}
                                >
                                  ▶
                                </span>{" "}
                                5
                              </span>
                            </div>
                          </div>

                          {/* Description - Fixed height */}
                          <div
                            style={{
                              minHeight: "3.75rem",
                              maxHeight: "3.75rem",
                              overflow: "hidden",
                            }}
                          >
                            <p
                              className="text-sm line-clamp-3"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              This is a sample scene description that
                              demonstrates how text appears in the card layout
                              with multiple lines.
                            </p>
                          </div>

                          {/* Metadata Chips - Fixed height */}
                          <div
                            className="py-2"
                            style={{ minHeight: "3.5rem", maxHeight: "3.5rem" }}
                          >
                            <div className="flex items-center justify-center gap-3">
                              <div
                                className="flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: "var(--selection-bg)",
                                  border:
                                    "1px solid color-mix(in srgb, var(--status-info) 70%, transparent)",
                                }}
                              >
                                <span className="text-xl leading-none">👥</span>
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color:
                                      "color-mix(in srgb, var(--status-info) 70%, transparent)",
                                  }}
                                >
                                  2
                                </span>
                              </div>
                              <div
                                className="flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: "var(--selection-bg)",
                                  border:
                                    "1px solid color-mix(in srgb, var(--status-info) 70%, transparent)",
                                }}
                              >
                                <span className="text-xl leading-none">🎬</span>
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color:
                                      "color-mix(in srgb, var(--status-info) 70%, transparent)",
                                  }}
                                >
                                  1
                                </span>
                              </div>
                              <div
                                className="flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-colors"
                                style={{
                                  backgroundColor: "var(--selection-bg)",
                                  border:
                                    "1px solid color-mix(in srgb, var(--accent-secondary) 70%, transparent)",
                                }}
                              >
                                <span className="text-xl leading-none">🏷️</span>
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color:
                                      "color-mix(in srgb, var(--accent-secondary) 70%, transparent)",
                                  }}
                                >
                                  5
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Rating Controls */}
                          <div className="py-2 flex justify-center">
                            <div className="flex items-center gap-2">
                              <span
                                style={{
                                  color: "var(--accent-warning)",
                                  fontSize: "18px",
                                }}
                              >
                                ★★★★★
                              </span>
                              <span
                                style={{
                                  color: "var(--accent-secondary)",
                                  fontSize: "18px",
                                  marginLeft: "0.5rem",
                                }}
                              >
                                ♥
                              </span>
                            </div>
                          </div>

                          {/* Resolution and File Size - Bottom row */}
                          <div
                            className="flex items-center justify-between text-xs"
                            style={{
                              color: "var(--text-muted)",
                              minHeight: "1rem",
                            }}
                          >
                            <span>1920×1080</span>
                            <span>2.4 GB</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Paper.Body>
        </Paper>

        {/* Custom Themes */}
        <Paper className="mb-6">
          <Paper.Body>
            <CustomThemeManager />
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
                    <option value="sprite">
                      Low Quality - Sprite (Default)
                    </option>
                    <option value="webp">High Quality - WebP Animation</option>
                    <option value="mp4">High Quality - MP4 Video</option>
                  </select>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Quality of preview animations shown when hovering over scene
                    cards. Low quality (sprite) uses less bandwidth. High
                    quality options (WebP/MP4) provide better previews but may
                    not be available for all scenes (fallback to sprite).
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
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Allow casting videos to Chromecast devices and AirPlay.
                        Disable if you don't use these features or experience
                        playback issues.
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
                    onChange={(e) =>
                      setMinimumPlayPercent(parseInt(e.target.value))
                    }
                    className="range-slider"
                    style={{
                      background: `linear-gradient(to right, var(--status-info) 0%, var(--status-info) ${minimumPlayPercent}%, var(--border-color) ${minimumPlayPercent}%, var(--border-color) 100%)`,
                    }}
                  />
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Percentage of video to watch before counting as "played".
                    This determines when the play count increments during watch
                    sessions.
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
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Display performer height, weight, and measurements in your
                    preferred unit system.
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

        {/* Navigation Settings */}
        <Paper className="mb-6">
          <Paper.Body>
            <NavigationSettings
              navPreferences={navPreferences}
              onSave={saveNavPreferences}
            />
          </Paper.Body>
        </Paper>

        {/* Hidden Items */}
        <Paper className="mb-6">
          <Paper.Header title="Hidden Items" />
          <Paper.Body>
            <div className="space-y-4">
              <p style={{ color: "var(--text-secondary)" }}>
                Manage items you've hidden from your library. Hidden items will
                not appear in any views or searches.
              </p>

              {/* Link to Hidden Items page */}
              <Link to="/hidden-items">
                <Button variant="primary" icon={<Eye size={18} />}>
                  View Hidden Items
                </Button>
              </Link>

              {/* Hide confirmation toggle */}
              <div className="pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideConfirmationDisabled}
                    onChange={(e) => updateHideConfirmation(e.target.checked)}
                    className="w-5 h-5 cursor-pointer"
                    style={{ accentColor: "var(--accent-color)" }}
                  />
                  <div>
                    <div style={{ color: "var(--text-primary)" }}>
                      Don't ask for confirmation when hiding items
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Skip the confirmation dialog when hiding entities
                    </div>
                  </div>
                </label>
              </div>
            </div>
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
