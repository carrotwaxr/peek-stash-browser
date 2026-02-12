import { useEffect, useState } from "react";
import { migrateNavPreferences } from "../../constants/navigation.js";
import { useGlobalNavigation } from "../../hooks/useGlobalNavigation.js";
import useScrollRestoration from "../../hooks/useScrollRestoration.js";
import { apiGet } from "../../services/api.js";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";

/**
 * GlobalLayout - Top-level layout with sidebar navigation
 *
 * Layout structure:
 * - Sidebar (hidden on mobile, visible lg+)
 * - TopBar (logo, help, settings, user menu)
 * - Main content area with responsive spacing
 */
const GlobalLayout = ({ children }) => {
  const [navPreferences, setNavPreferences] = useState([]);

  useEffect(() => {
    const loadNavPreferences = async () => {
      try {
        const response = await apiGet("/user/settings");
        const { settings } = response;
        const migratedPrefs = migrateNavPreferences(settings.navPreferences);
        setNavPreferences(migratedPrefs);
      } catch (error) {
        console.error("Failed to load navigation preferences:", error);
        // Use defaults on error
        setNavPreferences(migrateNavPreferences([]));
      }
    };

    loadNavPreferences();
  }, []);

  useGlobalNavigation();
  useScrollRestoration();

  return (
    <div className="layout-container min-h-screen">
      {/* Sidebar navigation - hidden on mobile, visible lg+ */}
      <Sidebar navPreferences={navPreferences} />

      {/* Top bar - mobile only (logo, hamburger menu) */}
      <TopBar navPreferences={navPreferences} />

      {/* Main content area - full width after sidebar, Plex-style */}
      <main className="lg:ml-16 xl:ml-60 pt-16 lg:pt-0">{children}</main>
    </div>
  );
};

export default GlobalLayout;
