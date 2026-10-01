import { type ReactNode, Suspense, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useUserSettings } from "../../api/hooks/useUserSettings";
import { migrateNavPreferences } from "../../constants/navigation";
import { useGlobalNavigation } from "../../hooks/useGlobalNavigation";
import useScrollRestoration from "../../hooks/useScrollRestoration";
import { useTVMode } from "../../hooks/useTVMode";
import { RouteErrorBoundary } from "./ErrorBoundary";
import PageLoader from "./PageLoader";
import Sidebar from "./Sidebar";
import TVNavigator from "./TVNavigator";
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
 * - Main content area with responsive spacing, holding an error boundary and
 *   a Suspense so a failed or loading page keeps the sidebar
 * - In TV mode, `TVNavigator`: arrows move focus by position on every page
 */
const GlobalLayout = ({ children }: Props) => {
  const location = useLocation();
  const { isTVMode } = useTVMode();

  // The sidebar's order and visibility come from the settings query, so a
  // save in Settings reaches it at once. Until the settings answer the
  // sidebar is empty; after a failed load it shows the defaults.
  const { data, isError } = useUserSettings();
  const navPreferences = useMemo<NavPreference[]>(() => {
    if (data) {
      return migrateNavPreferences(
        data.settings.navPreferences as NavPreference[]
      );
    }
    return isError ? migrateNavPreferences([]) : [];
  }, [data, isError]);

  useGlobalNavigation();
  useScrollRestoration();

  return (
    <div className="layout-container min-h-screen">
      {isTVMode && <TVNavigator />}

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
      <main className="lg:ml-16 xl:ml-60 pt-16 lg:pt-0">
        <RouteErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </RouteErrorBoundary>
      </main>
    </div>
  );
};

export default GlobalLayout;
