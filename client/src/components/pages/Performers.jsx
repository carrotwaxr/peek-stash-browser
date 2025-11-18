import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { useTVNavigation } from "../../hooks/useTVNavigation.js";
import { libraryApi } from "../../services/api.js";
import {
  CacheLoadingBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  PerformerCard,
  SearchControls,
} from "../ui/index.js";

const Performers = () => {
  usePageTitle("Performers");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const columns = useGridColumns("performers");

  // TV Navigation zones
  // mainNav (sidebar) is separate - accessed via left/right arrows
  // Content zones are vertical stack: search -> topPagination -> grid -> bottomPagination
  const tvNavigation = useTVNavigation({
    zones: ["search", "topPagination", "grid", "bottomPagination", "mainNav"],
    initialZone: "grid", // Start at grid for now
    enabled: isTVMode,
  });

  // Dispatch zone change events for global listeners (e.g., Sidebar)
  useEffect(() => {
    if (isTVMode) {
      window.dispatchEvent(
        new CustomEvent("tvZoneChange", {
          detail: { zone: tvNavigation.currentZone },
        })
      );
    }
  }, [isTVMode, tvNavigation.currentZone]);

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initMessage, setInitMessage] = useState(null);

  // Note: We don't fetch initial data here anymore.
  // SearchControls will trigger the initial query via onQueryChange based on URL params.

  const handleQueryChange = async (newQuery, retryCount = 0) => {
    // Don't make API calls if not authenticated or still checking auth
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    // Avoid duplicate queries
    if (lastQuery && deepEqual(newQuery, lastQuery)) {
      return;
    }

    try {
      setIsLoading(true);
      setLastQuery(newQuery);
      setError(null);
      setInitMessage(null);
      const result = await getPerformers(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      // If server is initializing, show a message and retry after delay
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is loading cache, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000); // Retry every 5 seconds
        return; // Don't set loading to false, keep the loading state
      }

      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentPerformers = data?.performers || [];

  const totalCount = data?.count || 0;

  // Get current pagination state from URL params for bottom pagination
  const urlPage = parseInt(searchParams.get("page")) || 1;
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24; // Fixed: 'per_page' not 'perPage'

  // Calculate totalPages based on urlPerPage (from URL params), not lastQuery
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // Ref to receive handlePageChange from SearchControls
  const paginationHandlerRef = useRef(null);

  // Handlers for PageUp/PageDown navigation (use the exposed handler from SearchControls)
  const handlePageUpKey = useCallback(() => {
    if (urlPage > 1 && paginationHandlerRef.current) {
      paginationHandlerRef.current(urlPage - 1);
    }
  }, [urlPage]);

  const handlePageDownKey = useCallback(() => {
    if (urlPage < totalPages && paginationHandlerRef.current) {
      paginationHandlerRef.current(urlPage + 1);
    }
  }, [urlPage, totalPages]);

  // Escape handlers for zone navigation (from grid boundaries)
  const handleEscapeUp = useCallback(() => {
    const moved = tvNavigation.goToPreviousZone();
    console.log(
      moved
        ? `🔼 Moved to previous zone: ${tvNavigation.currentZone}`
        : "🔼 Already at first zone"
    );
  }, [tvNavigation]);

  const handleEscapeDown = useCallback(() => {
    const moved = tvNavigation.goToNextZone();
    console.log(
      moved
        ? `🔽 Moved to next zone: ${tvNavigation.currentZone}`
        : "🔽 Already at last zone"
    );
  }, [tvNavigation]);

  const handleEscapeLeft = useCallback(() => {
    const moved = tvNavigation.goToZone("mainNav");
    console.log(
      moved
        ? `⬅️ Moved to sidebar: ${tvNavigation.currentZone}`
        : "⬅️ Could not move to mainNav"
    );
  }, [tvNavigation]);

  // Global keyboard handler for non-grid zones
  useEffect(() => {
    if (!isTVMode || tvNavigation.isZoneActive("grid")) return;

    const handleGlobalKeyDown = (e) => {
      const currentZone = tvNavigation.currentZone;

      // Sidebar (mainNav) navigation
      if (currentZone === "mainNav") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          tvNavigation.goToZone("grid");
          console.log("➡️ Moved from sidebar to grid");
        }
        // Up/Down navigation handled by Sidebar component itself
        return;
      }

      // Content zones (search, topPagination, bottomPagination)
      // These zones form a vertical stack, separate from mainNav
      if (e.key === "ArrowUp") {
        e.preventDefault();
        // Don't go up from search (it's the first content zone)
        if (currentZone === "search") {
          console.log("🔼 Already at first content zone");
          return;
        }
        const moved = tvNavigation.goToPreviousZone();
        console.log(
          moved
            ? `🔼 Moved to zone: ${tvNavigation.currentZone}`
            : "🔼 Could not move up"
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        // Don't go down from bottomPagination (it's the last content zone)
        if (currentZone === "bottomPagination") {
          console.log("🔽 Already at last content zone");
          return;
        }
        const moved = tvNavigation.goToNextZone();
        console.log(
          moved
            ? `🔽 Moved to zone: ${tvNavigation.currentZone}`
            : "🔽 Could not move down"
        );
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        tvNavigation.goToZone("mainNav");
        console.log("⬅️ Moved to sidebar from content zone");
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        // TODO: Left/Right within content zones to navigate through controls
        // (search input, sort dropdown, filters, pagination buttons, etc.)
        // Will use useHorizontalNavigation hook
        console.log(`${ e.key === "ArrowLeft" ? "⬅️" : "➡️"} Navigation within ${currentZone} zone (not yet implemented)`);
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isTVMode, tvNavigation]);

  // Spatial navigation - only enabled when in grid zone
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentPerformers,
    columns,
    enabled: !isLoading && isTVMode && tvNavigation.isZoneActive("grid"),
    onSelect: (performer) =>
      navigate(`/performer/${performer.id}`, {
        state: { referrerUrl: `${location.pathname}${location.search}` },
      }),
    onPageUp: handlePageUpKey,
    onPageDown: handlePageDownKey,
    onEscapeUp: handleEscapeUp,
    onEscapeDown: handleEscapeDown,
    onEscapeLeft: handleEscapeLeft,
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentPerformers.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Performers" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* TV Mode Zone Indicator (temporary for testing) */}
      {isTVMode && (
        <div
          style={{
            position: "fixed",
            top: "10px",
            right: "10px",
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          Zone: <strong>{tvNavigation.currentZone}</strong>
        </div>
      )}

      <div ref={pageRef}>
        <PageHeader
          title="Performers"
          subtitle="Browse performers in your library"
        />

        {initMessage && <CacheLoadingBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="performer"
          initialSort="o_counter"
          onQueryChange={handleQueryChange}
          paginationHandlerRef={paginationHandlerRef}
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "20rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentPerformers.map((performer, index) => (
                  <PerformerCard
                    key={performer.id}
                    ref={(el) => setItemRef(index, el)}
                    performer={performer}
                    tabIndex={isFocused(index) ? 0 : -1}
                    className={isFocused(index) ? "keyboard-focus" : ""}
                    isTVMode={isTVMode}
                    referrerUrl={`${location.pathname}${location.search}`}
                  />
                ))}
              </div>
            </>
          )}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const getPerformers = async (query) => {
  const response = await libraryApi.findPerformers(query);

  // Extract performers and count from server response structure
  const findPerformers = response?.findPerformers;
  const result = {
    performers: findPerformers?.performers || [],
    count: findPerformers?.count || 0,
  };

  return result;
};

export default Performers;
