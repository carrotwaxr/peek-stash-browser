# Unified Settings Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate User Settings and Server Settings into a single unified Settings page with mobile-friendly tabbed navigation accessible to all users.

**Architecture:** Create a new `/settings` page with URL-based section/tab routing. Build reusable layout components (SectionSelector, SettingsLayout) and migrate existing settings UI into organized tabs. Replace admin-only Server Settings navigation button with universal Settings button in all three layout versions (mobile, collapsed sidebar, expanded sidebar).

**Tech Stack:** React, React Router (useSearchParams, useNavigate), Tailwind CSS, existing UI components (Paper, Button, etc.)

---

## Phase 1: Core Infrastructure

### Task 1: Create SectionSelector Component

**Files:**
- Create: `client/src/components/settings/SectionSelector.jsx`

**Step 1: Create the SectionSelector component file**

```jsx
import PropTypes from "prop-types";

/**
 * SectionSelector - Segmented control for switching between User/Server settings
 * Two-button toggle with accent styling for active section
 */
const SectionSelector = ({ activeSection, onSectionChange, isAdmin }) => {
  return (
    <div className="flex justify-center mb-6">
      <div
        className="inline-flex rounded-lg p-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
        }}
        role="radiogroup"
        aria-label="Settings section"
      >
        {/* User Settings Button */}
        <button
          onClick={() => onSectionChange("user")}
          className="px-6 py-2 rounded-md text-sm font-medium transition-all duration-200"
          style={{
            backgroundColor:
              activeSection === "user" ? "var(--accent-primary)" : "transparent",
            color: activeSection === "user" ? "white" : "var(--text-primary)",
          }}
          role="radio"
          aria-checked={activeSection === "user"}
        >
          User Settings
        </button>

        {/* Server Settings Button (admin only) */}
        {isAdmin && (
          <button
            onClick={() => onSectionChange("server")}
            className="px-6 py-2 rounded-md text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor:
                activeSection === "server"
                  ? "var(--accent-primary)"
                  : "transparent",
              color:
                activeSection === "server" ? "white" : "var(--text-primary)",
            }}
            role="radio"
            aria-checked={activeSection === "server"}
          >
            Server Settings
          </button>
        )}
      </div>
    </div>
  );
};

SectionSelector.propTypes = {
  activeSection: PropTypes.oneOf(["user", "server"]).isRequired,
  onSectionChange: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
};

export default SectionSelector;
```

**Step 2: Commit**

```bash
cd peek-stash-browser
git add client/src/components/settings/SectionSelector.jsx
git commit -m "feat: add SectionSelector component for settings sections"
```

---

### Task 2: Create SettingsLayout Component

**Files:**
- Create: `client/src/components/settings/SettingsLayout.jsx`

**Step 1: Create the SettingsLayout component with horizontal tabs**

```jsx
import { useEffect, useRef, useState } from "prop-types";
import PropTypes from "prop-types";

/**
 * SettingsLayout - Reusable layout for settings with horizontal tab navigation
 * Handles mobile scrolling, active tab indication, and tab content rendering
 */
const SettingsLayout = ({ tabs, activeTab, onTabChange, children }) => {
  const tabContainerRef = useRef(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Check scroll position to show/hide fade indicators
  const checkScroll = () => {
    const container = tabContainerRef.current;
    if (!container) return;

    setShowLeftFade(container.scrollLeft > 0);
    setShowRightFade(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    );
  };

  // Scroll active tab into view
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container) return;

    const activeTabElement = container.querySelector(
      `[data-tab-id="${activeTab}"]`
    );
    if (activeTabElement) {
      activeTabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }

    checkScroll();
  }, [activeTab]);

  // Add scroll listener
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    checkScroll();

    return () => {
      container.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <div>
      {/* Tab Navigation */}
      <div className="relative mb-6">
        {/* Left fade indicator */}
        {showLeftFade && (
          <div
            className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10"
            style={{
              background: `linear-gradient(to right, var(--bg-primary), transparent)`,
            }}
          />
        )}

        {/* Tab container */}
        <div
          ref={tabContainerRef}
          className="flex gap-4 overflow-x-auto pb-2"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            scrollBehavior: "smooth",
          }}
          role="tablist"
          aria-label="Settings tabs"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex-shrink-0 px-4 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap"
                style={{
                  color: isActive
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  fontWeight: isActive ? "600" : "500",
                  borderBottom: isActive
                    ? "3px solid var(--accent-primary)"
                    : "3px solid transparent",
                  backgroundColor: !isActive
                    ? "transparent"
                    : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right fade indicator */}
        {showRightFade && (
          <div
            className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10"
            style={{
              background: `linear-gradient(to left, var(--bg-primary), transparent)`,
            }}
          />
        )}

        {/* Hide scrollbar */}
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
      >
        {children}
      </div>
    </div>
  );
};

SettingsLayout.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default SettingsLayout;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/SettingsLayout.jsx
git commit -m "feat: add SettingsLayout component with horizontal tabs"
```

---

### Task 3: Create SettingsPage Component with URL Routing

**Files:**
- Create: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Create the main SettingsPage component**

```jsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import SectionSelector from "../settings/SectionSelector.jsx";
import SettingsLayout from "../settings/SettingsLayout.jsx";
import { PageHeader, PageLayout } from "../ui/index.js";

// Tab definitions
const USER_TABS = [
  { id: "theme", label: "Theme" },
  { id: "playback", label: "Playback" },
  { id: "customization", label: "Customization" },
  { id: "content", label: "Content" },
  { id: "account", label: "Account" },
];

const SERVER_TABS = [
  { id: "user-management", label: "User Management" },
  { id: "server-config", label: "Server Configuration" },
];

const SettingsPage = () => {
  usePageTitle("Settings");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Parse URL parameters
  const sectionParam = searchParams.get("section") || "user";
  const tabParam = searchParams.get("tab");

  // Determine active section (redirect non-admins from server section)
  const isAdmin = user?.role === "ADMIN";
  const activeSection = sectionParam === "server" && !isAdmin ? "user" : sectionParam;

  // Redirect if non-admin tries to access server section
  useEffect(() => {
    if (sectionParam === "server" && !isAdmin) {
      navigate("/settings?section=user&tab=theme", { replace: true });
    }
  }, [sectionParam, isAdmin, navigate]);

  // Determine active tab (default to first tab of section if invalid)
  const tabs = activeSection === "user" ? USER_TABS : SERVER_TABS;
  const defaultTab = tabs[0].id;
  const activeTab = tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : defaultTab;

  // Sync URL if tab param is missing or invalid
  useEffect(() => {
    if (!tabParam || !tabs.some((t) => t.id === tabParam)) {
      const params = new URLSearchParams();
      params.set("section", activeSection);
      params.set("tab", defaultTab);
      navigate(`/settings?${params.toString()}`, { replace: true });
    }
  }, [tabParam, activeSection, defaultTab, tabs, navigate]);

  // Handle section change
  const handleSectionChange = (newSection) => {
    const newDefaultTab = newSection === "user" ? USER_TABS[0].id : SERVER_TABS[0].id;
    navigate(`/settings?section=${newSection}&tab=${newDefaultTab}`, { replace: true });
  };

  // Handle tab change
  const handleTabChange = (newTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", newTab);
    navigate(`/settings?${params.toString()}`, { replace: true });
  };

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto">
        <PageHeader
          title="Settings"
          subtitle="Manage your preferences and server configuration"
        />

        {/* Section Selector (User/Server) */}
        <SectionSelector
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          isAdmin={isAdmin}
        />

        {/* Tab Navigation and Content */}
        <SettingsLayout
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        >
          {/* Placeholder for tab content */}
          <div
            className="p-6 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              minHeight: "400px",
            }}
          >
            <p style={{ color: "var(--text-primary)" }}>
              {activeSection === "user" ? "User" : "Server"} Settings - {activeTab} tab
            </p>
            <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
              Tab content will be implemented in next phase
            </p>
          </div>
        </SettingsLayout>
      </div>
    </PageLayout>
  );
};

export default SettingsPage;
```

**Step 2: Commit**

```bash
git add client/src/components/pages/SettingsPage.jsx
git commit -m "feat: add SettingsPage with section/tab routing"
```

---

### Task 4: Add Settings Route to App.jsx

**Files:**
- Modify: `client/src/App.jsx`

**Step 1: Import SettingsPage component**

At the top of App.jsx, add the lazy import after the existing lazy imports (around line 42):

```jsx
const SettingsPage = lazy(() => import("./components/pages/SettingsPage.jsx"));
```

**Step 2: Add the /settings route**

In the Routes section, add the new route after the `/server-settings` route (around line 302):

```jsx
<Route
  path="/settings"
  element={
    <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
      <GlobalLayout>
        <SettingsPage />
      </GlobalLayout>
    </ProtectedRoute>
  }
/>
```

**Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add /settings route to App"
```

---

### Task 5: Test Core Infrastructure

**Step 1: Start the development server**

Run: `cd peek-stash-browser/client && npm run dev`

**Step 2: Manually test in browser**

1. Navigate to `http://localhost:5173/settings`
2. Verify page loads with "Settings" header
3. Verify section selector shows "User Settings" and "Server Settings" (if admin)
4. Verify tabs render horizontally
5. Click different tabs and verify URL updates
6. Click section toggle (if admin) and verify URL updates
7. Test back/forward browser navigation
8. Test on mobile viewport (< 768px) - tabs should scroll horizontally

Expected: All navigation works, URL updates correctly, no console errors

**Step 3: Commit checkpoint**

```bash
git add -A
git commit -m "chore: phase 1 complete - core infrastructure tested"
```

---

## Phase 2: User Settings Tabs

### Task 6: Create ThemeTab Component

**Files:**
- Create: `client/src/components/settings/tabs/ThemeTab.jsx`
- Reference: `client/src/components/pages/Settings.jsx` (lines 206-937)

**Step 1: Create the ThemeTab component**

```jsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTheme } from "../../../themes/useTheme.js";
import CustomThemeManager from "../CustomThemeManager.jsx";
import { Button } from "../../ui/index.js";

const ThemeTab = () => {
  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const [uiExamplesExpanded, setUiExamplesExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Built-in Themes */}
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
          Built-in Themes
        </h3>
        <div className="space-y-2">
          {availableThemes
            .filter((theme) => !theme.isCustom)
            .map((theme) => (
              <Button
                key={theme.key}
                type="button"
                onClick={() => changeTheme(theme.key)}
                variant={currentTheme === theme.key ? "primary" : "secondary"}
                fullWidth
                className="text-left px-4 py-3 text-sm flex items-center justify-between"
              >
                <span>{theme.name}</span>
                {currentTheme === theme.key && <span className="text-sm">✓</span>}
              </Button>
            ))}
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Choose from our built-in color themes (changes apply immediately)
        </p>

        {/* UI Examples (collapsible) */}
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
                transform: uiExamplesExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>

          {uiExamplesExpanded && (
            <div
              className="p-6 rounded-lg"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <p style={{ color: "var(--text-secondary)" }}>
                UI examples from original Settings page will be added here
                (typography, colors, buttons, etc.)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Themes */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CustomThemeManager />
      </div>
    </div>
  );
};

export default ThemeTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/ThemeTab.jsx
git commit -m "feat: add ThemeTab component"
```

---

### Task 7: Create PlaybackTab Component

**Files:**
- Create: `client/src/components/settings/tabs/PlaybackTab.jsx`
- Reference: `client/src/components/pages/Settings.jsx` (lines 948-1172, excluding units)

**Step 1: Create the PlaybackTab component**

```jsx
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
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/PlaybackTab.jsx
git commit -m "feat: add PlaybackTab component"
```

---

### Task 8: Create CustomizationTab Component

**Files:**
- Create: `client/src/components/settings/tabs/CustomizationTab.jsx`
- Reference: `client/src/components/pages/Settings.jsx` (lines 1176-1192, 1186-1192, 1128-1157)

**Step 1: Create the CustomizationTab component**

```jsx
import { useEffect, useState } from "react";
import axios from "axios";
import { useUnitPreference } from "../../../contexts/UnitPreferenceContext.js";
import { migrateCarouselPreferences } from "../../../constants/carousels.js";
import { migrateNavPreferences } from "../../../constants/navigation.js";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import CarouselSettings from "../CarouselSettings.jsx";
import NavigationSettings from "../NavigationSettings.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CustomizationTab = () => {
  const [loading, setLoading] = useState(true);
  const { unitPreference, setUnitPreference } = useUnitPreference();
  const [carouselPreferences, setCarouselPreferences] = useState([]);
  const [navPreferences, setNavPreferences] = useState([]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get("/user/settings");
        const { settings } = response.data;

        const migratedCarouselPrefs = migrateCarouselPreferences(
          settings.carouselPreferences
        );
        setCarouselPreferences(migratedCarouselPrefs);

        const migratedNavPrefs = migrateNavPreferences(settings.navPreferences);
        setNavPreferences(migratedNavPrefs);
      } catch {
        showError("Failed to load customization settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const saveCarouselPreferences = async (newPreferences) => {
    try {
      await api.put("/user/settings", {
        carouselPreferences: newPreferences,
      });

      setCarouselPreferences(newPreferences);
      showSuccess("Carousel preferences saved successfully!");
    } catch (err) {
      showError(err.response?.data?.error || "Failed to save carousel preferences");
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
      showError(err.response?.data?.error || "Failed to save navigation preferences");
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
      {/* Navigation Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <NavigationSettings
          navPreferences={navPreferences}
          onSave={saveNavPreferences}
        />
      </div>

      {/* Carousel Settings */}
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <CarouselSettings
          carouselPreferences={carouselPreferences}
          onSave={saveCarouselPreferences}
        />
      </div>

      {/* Measurement Units */}
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
          Measurement Units
        </h3>
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
      </div>
    </div>
  );
};

export default CustomizationTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/CustomizationTab.jsx
git commit -m "feat: add CustomizationTab component"
```

---

### Task 9: Create ContentTab Component

**Files:**
- Create: `client/src/components/settings/tabs/ContentTab.jsx`
- Reference: `client/src/components/pages/Settings.jsx` (lines 1196-1234)

**Step 1: Create the ContentTab component**

```jsx
import { Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../../hooks/useHiddenEntities.js";
import { Button } from "../../ui/index.js";

const ContentTab = () => {
  const { hideConfirmationDisabled, updateHideConfirmation } = useHiddenEntities();

  return (
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
        Hidden Items
      </h3>

      <div className="space-y-4">
        <p style={{ color: "var(--text-secondary)" }}>
          Manage items you've hidden from your library. Hidden items will not appear in
          any views or searches.
        </p>

        {/* Link to Hidden Items page */}
        <Link to="/hidden-items">
          <Button variant="primary" icon={<Eye size={18} />}>
            View Hidden Items
          </Button>
        </Link>

        {/* Hide confirmation toggle */}
        <div
          className="pt-4 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
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
              <div
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Skip the confirmation dialog when hiding entities
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default ContentTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/ContentTab.jsx
git commit -m "feat: add ContentTab component"
```

---

### Task 10: Create AccountTab Component

**Files:**
- Create: `client/src/components/settings/tabs/AccountTab.jsx`
- Reference: `client/src/components/pages/Settings.jsx` (lines 1237-1326)

**Step 1: Create the AccountTab component**

```jsx
import { useState } from "react";
import axios from "axios";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const AccountTab = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);

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

  return (
    <form onSubmit={changePassword}>
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
          Change Password
        </h3>

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

          <div className="flex justify-end pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
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
      </div>
    </form>
  );
};

export default AccountTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/AccountTab.jsx
git commit -m "feat: add AccountTab component"
```

---

### Task 11: Integrate User Settings Tabs into SettingsPage

**Files:**
- Modify: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Add imports for tab components**

Add these imports at the top of the file:

```jsx
import ThemeTab from "../settings/tabs/ThemeTab.jsx";
import PlaybackTab from "../settings/tabs/PlaybackTab.jsx";
import CustomizationTab from "../settings/tabs/CustomizationTab.jsx";
import ContentTab from "../settings/tabs/ContentTab.jsx";
import AccountTab from "../settings/tabs/AccountTab.jsx";
```

**Step 2: Replace placeholder content with actual tab components**

Replace the placeholder div (around line 88-99) with:

```jsx
{/* Render active tab content */}
{activeSection === "user" && (
  <>
    {activeTab === "theme" && <ThemeTab />}
    {activeTab === "playback" && <PlaybackTab />}
    {activeTab === "customization" && <CustomizationTab />}
    {activeTab === "content" && <ContentTab />}
    {activeTab === "account" && <AccountTab />}
  </>
)}

{activeSection === "server" && (
  <div
    className="p-6 rounded-lg border"
    style={{
      backgroundColor: "var(--bg-card)",
      borderColor: "var(--border-color)",
      minHeight: "400px",
    }}
  >
    <p style={{ color: "var(--text-primary)" }}>
      Server Settings - {activeTab} tab
    </p>
    <p style={{ color: "var(--text-muted)", marginTop: "1rem" }}>
      Server tabs will be implemented in Phase 3
    </p>
  </div>
)}
```

**Step 3: Commit**

```bash
git add client/src/components/pages/SettingsPage.jsx
git commit -m "feat: integrate user settings tabs into SettingsPage"
```

---

### Task 12: Test User Settings Tabs

**Step 1: Test in browser**

1. Navigate to `http://localhost:5173/settings`
2. Test Theme tab:
   - Switch themes and verify changes apply immediately
   - Test custom theme manager
3. Test Playback tab:
   - Change settings and save
   - Verify toast notification
   - Refresh and verify settings persisted
4. Test Customization tab:
   - Reorder navigation items and save
   - Reorder carousels and save
   - Change measurement units
5. Test Content tab:
   - Click "View Hidden Items" button
   - Toggle confirmation checkbox
6. Test Account tab:
   - Enter invalid passwords and verify validation
   - Change password successfully

Expected: All tabs work, data saves correctly, toasts show

**Step 2: Commit checkpoint**

```bash
git add -A
git commit -m "chore: phase 2 complete - user settings tabs tested"
```

---

## Phase 3: Server Settings Tabs

### Task 13: Create UserManagementTab Component

**Files:**
- Create: `client/src/components/settings/tabs/UserManagementTab.jsx`
- Reference: `client/src/components/pages/ServerSettings.jsx`

**Step 1: Create the UserManagementTab component**

```jsx
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../../../hooks/useAuth.js";
import UserManagementSection from "../UserManagementSection.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const UserManagementTab = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/user/all");
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const showError = (err) => {
    setError(err);
    setTimeout(() => setError(null), 5000);
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
    <div>
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

      {/* User Management Section */}
      <UserManagementSection
        users={users}
        currentUser={currentUser}
        onUsersChanged={loadUsers}
        onMessage={showMessage}
        onError={showError}
        api={api}
      />
    </div>
  );
};

export default UserManagementTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/UserManagementTab.jsx
git commit -m "feat: add UserManagementTab component"
```

---

### Task 14: Create ServerConfigTab Component

**Files:**
- Create: `client/src/components/settings/tabs/ServerConfigTab.jsx`
- Reference: `client/src/components/pages/ServerSettings.jsx`

**Step 1: Create the ServerConfigTab component**

```jsx
import axios from "axios";
import packageJson from "../../../../package.json";
import ServerStatsSection from "../ServerStatsSection.jsx";
import StashInstanceSection from "../StashInstanceSection.jsx";
import VersionInfoSection from "../VersionInfoSection.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const ServerConfigTab = () => {
  const CLIENT_VERSION = packageJson.version;

  return (
    <div className="space-y-6">
      {/* Stash Instance Section */}
      <StashInstanceSection api={api} />

      {/* Server Statistics Section */}
      <ServerStatsSection />

      {/* Version Information Section */}
      <VersionInfoSection clientVersion={CLIENT_VERSION} api={api} />
    </div>
  );
};

export default ServerConfigTab;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/tabs/ServerConfigTab.jsx
git commit -m "feat: add ServerConfigTab component"
```

---

### Task 15: Integrate Server Settings Tabs into SettingsPage

**Files:**
- Modify: `client/src/components/pages/SettingsPage.jsx`

**Step 1: Add imports for server tab components**

Add these imports:

```jsx
import UserManagementTab from "../settings/tabs/UserManagementTab.jsx";
import ServerConfigTab from "../settings/tabs/ServerConfigTab.jsx";
```

**Step 2: Replace server section placeholder**

Replace the server section placeholder with:

```jsx
{activeSection === "server" && (
  <>
    {activeTab === "user-management" && <UserManagementTab />}
    {activeTab === "server-config" && <ServerConfigTab />}
  </>
)}
```

**Step 3: Commit**

```bash
git add client/src/components/pages/SettingsPage.jsx
git commit -m "feat: integrate server settings tabs into SettingsPage"
```

---

### Task 16: Test Server Settings Tabs (Admin Only)

**Step 1: Test as admin user**

1. Log in as admin user
2. Navigate to `/settings`
3. Click "Server Settings" section
4. Test User Management tab:
   - View user list
   - Create new user
   - Edit user
   - Delete user
5. Test Server Configuration tab:
   - View Stash instance config
   - View server stats
   - View version info

Expected: All server settings work correctly

**Step 2: Test as non-admin user**

1. Log in as non-admin user
2. Navigate to `/settings`
3. Verify "Server Settings" section is NOT visible
4. Navigate to `/settings?section=server&tab=user-management` directly
5. Verify redirect to `/settings?section=user&tab=theme`

Expected: Non-admin cannot access server settings

**Step 3: Commit checkpoint**

```bash
git add -A
git commit -m "chore: phase 3 complete - server settings tabs tested"
```

---

## Phase 4: Navigation Updates

### Task 17: Update Sidebar.jsx - Replace Server Settings with Universal Settings

**Files:**
- Modify: `client/src/components/ui/Sidebar.jsx`

**Step 1: Update Server Settings button for all users (collapsed view)**

Find the Server Settings section around line 280-309 and replace it with:

```jsx
{/* Settings button (all users) */}
{(() => {
  const itemIndex = navItems.length + 1;
  const isFocused = isTVMode && isMainNavActive && focusedIndex === itemIndex;
  return (
    <>
      <div className="xl:hidden">
        <Tooltip content="Settings" position="right">
          <Link
            ref={(el) => (itemRefs.current[itemIndex] = el)}
            to="/settings"
            className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
            aria-label="Settings"
            tabIndex={isFocused ? 0 : -1}
          >
            <ThemedIcon name="settings" size={20} />
          </Link>
        </Tooltip>
      </div>
      <Link
        ref={(el) => (itemRefs.current[itemIndex] = el)}
        to="/settings"
        className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
        tabIndex={isFocused ? 0 : -1}
      >
        <ThemedIcon name="settings" size={20} />
        <span className="text-sm font-medium">Settings</span>
      </Link>
    </>
  );
})()}
```

**Step 2: Update allNavItems to include Settings instead of Server Settings**

Find the `allNavItems` construction around line 49-71 and update:

```jsx
const allNavItems = useMemo(() => {
  const bottomItems = [
    { name: "Help", path: null, isButton: true, icon: "questionCircle" },
  ];

  // Settings button for all users (was Server Settings for admin only)
  bottomItems.push({ name: "Settings", path: "/settings", icon: "settings" });

  // User menu parent item
  bottomItems.push({
    name: "User Menu",
    path: null,
    isUserMenu: true,
    icon: "circle-user-round",
  });

  // If user menu is expanded, add sub-items to navigation list
  if (isUserMenuExpanded) {
    bottomItems.push(...userMenuSubItems);
  }

  return [...navItems, ...bottomItems];
}, [navItems, isUserMenuExpanded, userMenuSubItems]);
```

**Step 3: Commit**

```bash
git add client/src/components/ui/Sidebar.jsx
git commit -m "feat: replace Server Settings with universal Settings in Sidebar"
```

---

### Task 18: Update TopBar.jsx - Replace Server Settings in Mobile Menu

**Files:**
- Modify: `client/src/components/ui/TopBar.jsx`

**Step 1: Replace Server Settings with Settings in hamburger menu**

Find the Server Settings section around line 159-180 and replace it with:

```jsx
{/* Settings (all users) - with divider */}
<>
  <div
    className="my-2 border-t"
    style={{ borderColor: "var(--border-color)" }}
  />
  <ul className="flex flex-col space-y-2">
    <li>
      <Link
        to="/settings"
        className="nav-link block text-base font-medium transition-colors duration-200 px-3 py-2 rounded"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <div className="flex items-center gap-2">
          <ThemedIcon name="settings" size={18} />
          Settings
        </div>
      </Link>
    </li>
  </ul>
</>
```

**Step 2: Commit**

```bash
git add client/src/components/ui/TopBar.jsx
git commit -m "feat: replace Server Settings with universal Settings in TopBar"
```

---

### Task 19: Update UserMenu.jsx - Remove My Settings Link

**Files:**
- Modify: `client/src/components/ui/UserMenu.jsx`

**Step 1: Remove "My Settings" link from UserMenu**

Find and delete the "My Settings" Link block around lines 122-138:

```jsx
// DELETE THIS BLOCK:
<Link
  to="/my-settings"
  onClick={() => setIsOpen(false)}
  className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200"
  style={{
    color: "var(--text-primary)",
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.backgroundColor = "transparent";
  }}
>
  <ThemedIcon name="settings" size={16} />
  <span>My Settings</span>
</Link>
```

**Step 2: Remove unused margin from Watch History link**

Update the Watch History link to remove `mb-1` class since it's now the first item:

```jsx
<Link
  to="/watch-history"
  onClick={() => setIsOpen(false)}
  className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200"
  // ... rest of the link
```

**Step 3: Commit**

```bash
git add client/src/components/ui/UserMenu.jsx
git commit -m "feat: remove My Settings link from UserMenu"
```

---

### Task 20: Update Sidebar.jsx User Menu Flyout - Remove My Settings

**Files:**
- Modify: `client/src/components/ui/Sidebar.jsx`

**Step 1: Remove My Settings from collapsed sidebar flyout**

Find the Tooltip content in the collapsed view (around line 324-360) and remove the My Settings link:

```jsx
// DELETE THIS BLOCK (around line 335-341):
<Link
  to="/my-settings"
  className="flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 nav-link"
>
  <ThemedIcon name="settings" size={16} />
  <span>My Settings</span>
</Link>
```

**Step 2: Update userMenuSubItems definition**

Find the `userMenuSubItems` definition around line 39-44 and remove My Settings:

```jsx
const userMenuSubItems = useMemo(() => [
  { name: "Watch History", path: "/watch-history", icon: "history", isSubItem: true },
  // REMOVE: { name: "My Settings", path: "/my-settings", icon: "settings", isSubItem: true },
  { name: "TV Mode", path: null, isToggle: true, icon: "tv", isSubItem: true },
  { name: "Sign Out", path: null, isButton: true, icon: "logout", isSubItem: true },
], []);
```

**Step 3: Commit**

```bash
git add client/src/components/ui/Sidebar.jsx
git commit -m "feat: remove My Settings from Sidebar user menu"
```

---

### Task 21: Test Navigation Updates in All Three Layouts

**Step 1: Test collapsed sidebar (lg-xl viewport)**

1. Resize browser to 1024px - 1280px width
2. Verify Settings icon appears in bottom section
3. Hover over Settings icon and verify tooltip says "Settings"
4. Click Settings icon and verify navigation to `/settings`
5. Verify Settings icon is visible for non-admin users too

Expected: Settings button works in collapsed sidebar

**Step 2: Test expanded sidebar (xl+ viewport)**

1. Resize browser to 1280px+ width
2. Verify Settings button with icon + text appears
3. Verify text says "Settings" not "Server Settings"
4. Click Settings and verify navigation
5. Verify button visible for all users

Expected: Settings button works in expanded sidebar

**Step 3: Test mobile TopBar (< lg viewport)**

1. Resize browser to < 1024px width
2. Click hamburger menu
3. Verify "Settings" appears in menu below divider
4. Click Settings and verify navigation
5. Verify Settings visible for all users

Expected: Settings works in mobile menu

**Step 4: Test UserMenu**

1. Click user menu button
2. Verify "My Settings" link is GONE
3. Verify Watch History, TV Mode, Sign Out remain
4. Test on both desktop sidebar and mobile TopBar

Expected: My Settings removed, other items remain

**Step 5: Test TV mode keyboard navigation (if applicable)**

1. Enable TV mode
2. Use arrow keys to navigate
3. Verify Settings button is focusable
4. Press Enter on Settings
5. Verify navigation works

Expected: Keyboard navigation works

**Step 6: Commit checkpoint**

```bash
git add -A
git commit -m "chore: phase 4 complete - navigation updates tested"
```

---

## Phase 5: Redirects & Cleanup

### Task 22: Add Redirects for Legacy Routes

**Files:**
- Modify: `client/src/App.jsx`

**Step 1: Add redirect routes**

After the `/settings` route (around line 310), add redirect routes:

```jsx
{/* Redirects from legacy routes */}
<Route
  path="/my-settings"
  element={<Navigate to="/settings?section=user&tab=theme" replace />}
/>
<Route
  path="/server-settings"
  element={<Navigate to="/settings?section=server&tab=user-management" replace />}
/>
```

**Step 2: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: add redirects for legacy settings routes"
```

---

### Task 23: Test Redirects

**Step 1: Test /my-settings redirect**

1. Navigate to `http://localhost:5173/my-settings`
2. Verify redirect to `/settings?section=user&tab=theme`
3. Verify URL in address bar shows new route
4. Press back button
5. Verify browser history works correctly

Expected: Redirect works, maintains history

**Step 2: Test /server-settings redirect (as admin)**

1. Log in as admin
2. Navigate to `http://localhost:5173/server-settings`
3. Verify redirect to `/settings?section=server&tab=user-management`
4. Verify server section loads
5. Press back button and verify history

Expected: Redirect works for admin

**Step 3: Test /server-settings redirect (as non-admin)**

1. Log in as non-admin user
2. Navigate to `http://localhost:5173/server-settings`
3. Verify double redirect:
   - First to `/settings?section=server&tab=user-management`
   - Then to `/settings?section=user&tab=theme` (permission check)

Expected: Non-admin ends up at user settings

**Step 4: Test bookmarks**

1. Create browser bookmark for `/my-settings`
2. Click bookmark
3. Verify redirect works from bookmark
4. Create bookmark for `/server-settings`
5. Test same way

Expected: Bookmarks redirect correctly

**Step 5: Commit checkpoint**

```bash
git commit -m "chore: redirects tested and working"
```

---

### Task 24: Remove Old Settings Components (Optional Cleanup)

**Files:**
- Delete: `client/src/components/pages/Settings.jsx`
- Delete: `client/src/components/pages/ServerSettings.jsx`

**Note:** Only perform this step after thorough testing confirms all functionality has been migrated.

**Step 1: Remove old Settings page**

```bash
git rm client/src/components/pages/Settings.jsx
```

**Step 2: Remove old ServerSettings page**

```bash
git rm client/src/components/pages/ServerSettings.jsx
```

**Step 3: Remove old route imports from App.jsx**

In App.jsx, remove the lazy imports:

```jsx
// DELETE THESE LINES:
const Settings = lazy(() => import("./components/pages/Settings.jsx"));
const ServerSettings = lazy(() => import("./components/pages/ServerSettings.jsx"));
```

**Step 4: Remove old routes from App.jsx**

Delete the old `/my-settings` and `/server-settings` route definitions (keep only the redirect routes):

```jsx
// DELETE THIS BLOCK (around line 263-272):
<Route
  path="/my-settings"
  element={
    <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
      <GlobalLayout>
        <Settings />
      </GlobalLayout>
    </ProtectedRoute>
  }
/>

// DELETE THIS BLOCK (around line 294-303):
<Route
  path="/server-settings"
  element={
    <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
      <GlobalLayout>
        <ServerSettings />
      </GlobalLayout>
    </ProtectedRoute>
  }
/>
```

**Step 5: Verify no broken imports**

Run: `cd client && npm run build`

Expected: Build succeeds with no errors

**Step 6: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove old Settings and ServerSettings components"
```

---

### Task 25: Final End-to-End Testing

**Step 1: Full user flow test (non-admin)**

1. Log in as regular user
2. Navigate to Settings via:
   - Collapsed sidebar button (icon only)
   - Expanded sidebar button (icon + text)
   - Mobile hamburger menu
3. Test all 5 user settings tabs:
   - Theme: Switch themes, manage custom themes
   - Playback: Change settings and save
   - Customization: Reorder nav/carousels, change units
   - Content: View hidden items, toggle confirmation
   - Account: Change password
4. Test URL navigation:
   - Copy URL and open in new tab
   - Verify correct tab loads
5. Test browser navigation:
   - Use back/forward buttons
   - Refresh page

Expected: Everything works for non-admin

**Step 2: Full admin flow test**

1. Log in as admin user
2. Repeat step 1 for user settings
3. Switch to Server Settings section
4. Test User Management tab:
   - Create user
   - Edit user
   - Delete user
5. Test Server Configuration tab:
   - View all subsections
6. Test URL navigation and browser buttons

Expected: Everything works for admin

**Step 3: Accessibility test**

1. Tab through all interactive elements
2. Verify focus indicators visible
3. Use Enter/Space to activate tabs
4. Use arrow keys to navigate tabs (if implemented)
5. Test with screen reader (optional but recommended)

Expected: Keyboard navigation works

**Step 4: Mobile responsiveness test**

1. Test on actual mobile device or Chrome DevTools device mode
2. Verify tabs scroll horizontally on small screens
3. Verify touch scrolling works smoothly
4. Verify fade indicators appear
5. Test form inputs on mobile

Expected: Mobile experience is good

**Step 5: Performance test**

1. Open Chrome DevTools Performance tab
2. Record while switching tabs
3. Verify no excessive re-renders
4. Check Network tab for unnecessary API calls
5. Verify large user lists render efficiently

Expected: No performance issues

**Step 6: Commit final checkpoint**

```bash
git add -A
git commit -m "chore: phase 5 complete - all testing passed"
```

---

## Final Steps

### Task 26: Update Documentation (Optional)

**Files:**
- Create or modify: `docs/features/settings-page.md` (if docs exist)

**Step 1: Document new settings structure**

Create user-facing documentation about the new unified settings page, URL structure, and how to navigate it.

**Step 2: Commit documentation**

```bash
git add docs/
git commit -m "docs: add settings page documentation"
```

---

### Task 27: Merge Feature Branch

**Step 1: Ensure all changes committed**

Run: `git status`

Expected: "nothing to commit, working tree clean"

**Step 2: Run final checks**

```bash
cd client
npm run lint
npm run build
```

Expected: No errors

**Step 3: Push feature branch**

```bash
git push origin feature/unified-settings-navigation
```

**Step 4: Create pull request or merge to main**

Follow your project's merge workflow (create PR on GitHub, or merge directly to main if solo developer)

**Step 5: Celebrate!**

The unified settings navigation feature is complete!

---

## Troubleshooting Guide

### Issue: Tabs not scrolling on mobile

**Solution:**
- Check that `overflow-x: auto` is applied to tab container
- Verify `-webkit-overflow-scrolling: touch` is set
- Ensure tabs have `flex-shrink-0` to prevent compression

### Issue: URL parameters not updating

**Solution:**
- Verify `useSearchParams` hook is used correctly
- Check that `navigate()` is called with `{ replace: true }`
- Ensure params are set with `URLSearchParams.set()`

### Issue: Non-admin can access server settings via URL

**Solution:**
- Verify `useEffect` redirect is in place in SettingsPage
- Check that `user.role === "ADMIN"` check is correct
- Ensure redirect happens before rendering server content

### Issue: Old settings components still being used

**Solution:**
- Verify old routes are removed from App.jsx
- Check that redirect routes are in place
- Clear browser cache and restart dev server

### Issue: Theme changes not applying immediately

**Solution:**
- Verify `useTheme` hook is being called correctly
- Check that `changeTheme()` is called on button click
- Ensure theme context is wrapping the app

---

## Success Criteria

- [ ] `/settings` route works for all users
- [ ] Section selector shows User/Server (admin only)
- [ ] All 5 user settings tabs functional
- [ ] All 2 server settings tabs functional (admin)
- [ ] Settings button appears in all 3 navigation layouts
- [ ] Settings button works for all users (not just admin)
- [ ] UserMenu no longer has My Settings
- [ ] URL parameters control section/tab
- [ ] Browser back/forward navigation works
- [ ] Redirects from `/my-settings` and `/server-settings` work
- [ ] Non-admin cannot access server settings
- [ ] Mobile tab scrolling works smoothly
- [ ] All form submissions work correctly
- [ ] Toast notifications appear on success/error
- [ ] No console errors or warnings
- [ ] Keyboard navigation accessible
- [ ] Passes linting and builds successfully

---

**End of Implementation Plan**
