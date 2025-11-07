import { useState, useEffect } from "react";
import Navigation from "./Navigation.jsx";
import { apiGet } from "../../services/api.js";
import { migrateNavPreferences } from "../../constants/navigation.js";

/**
 * GlobalLayout - Top-level layout with navigation
 * Wraps the entire application to provide consistent navigation structure
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

  return (
    <div className="layout-container">
      <Navigation navPreferences={navPreferences} />
      {/* Spacer to prevent content from going under fixed navbar */}
      <div style={{ height: "60px" }} />
      <main className="w-full 2xl:w-5/6 m-auto">{children}</main>
    </div>
  );
};

export default GlobalLayout;
