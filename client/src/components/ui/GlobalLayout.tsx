import { type ReactNode } from "react";
import { useEffect, useState } from "react";
import { apiGet } from "../../api";
import { migrateNavPreferences } from "../../constants/navigation";
import { useGlobalNavigation } from "../../hooks/useGlobalNavigation";
import useScrollRestoration from "../../hooks/useScrollRestoration";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

interface Props {
  children: ReactNode;
}

type NavPreference = ReturnType<typeof migrateNavPreferences>[number];

/**
 * GlobalLayout - Top-level layout with sidebar navigation
 *
 * Layout structure:
 * - Sidebar (hidden on mobile, visible lg+)
 * - TopBar (logo, help, settings, user menu)
 * - Main content area with responsive spacing
 */
const GlobalLayout = ({ children }: Props) => {
  const [navPreferences, setNavPreferences] = useState<NavPreference[]>([]);

  useEffect(() => {
    const loadNavPreferences = async () => {
      try {
        const response = await apiGet<{
          settings: Record<string, unknown>;
        }>("/user/settings");
        const { settings } = response;
        const migratedPrefs = migrateNavPreferences(
          settings.navPreferences as NavPreference[]
        );
        setNavPreferences(migratedPrefs);
      } catch (error) {
        console.error("Failed to load navigation preferences:", error);
        // Use defaults on error
        setNavPreferences(migrateNavPreferences([]));
      }
    };

    void loadNavPreferences();
  }, []);

  useGlobalNavigation();
  useScrollRestoration();

  return (
    <div className="layout-container min-h-screen">
      {/* Sidebar navigation - hidden on mobile, visible lg+ */}
      <Sidebar
        navPreferences={
          navPreferences as unknown as Parameters<
            typeof Sidebar
          >[0]["navPreferences"]
        }
      />

      {/* Top bar - mobile only (logo, hamburger menu) */}
      <TopBar navPreferences={navPreferences} />

      {/* Main content area - full width after sidebar, Plex-style */}
      <main className="lg:ml-16 xl:ml-60 pt-16 lg:pt-0">{children}</main>
    </div>
  );
};

export default GlobalLayout;
