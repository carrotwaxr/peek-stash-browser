import { useCallback, useRef, useState } from "react";
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

  // TV Navigation zones (for Phase 2 zone management)
  const tvNavigation = useTVNavigation({
    zones: ["mainNav", "search", "topPagination", "grid", "bottomPagination"],
    initialZone: "grid", // Start at grid for now
    enabled: isTVMode,
  });

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

  // Escape handlers for zone navigation (will be implemented in Phase 2)
  const handleEscapeUp = useCallback(() => {
    console.log(
      "🔼 Escape Up: User pressed Up on top row",
      `Current zone: ${tvNavigation.currentZone}`
    );
    // Will call tvNavigation.goToPreviousZone() in Phase 2
  }, [tvNavigation.currentZone]);

  const handleEscapeDown = useCallback(() => {
    console.log(
      "🔽 Escape Down: User pressed Down on bottom row",
      `Current zone: ${tvNavigation.currentZone}`
    );
    // Will call tvNavigation.goToNextZone() in Phase 2
  }, [tvNavigation.currentZone]);

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentPerformers,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (performer) =>
      navigate(`/performer/${performer.id}`, {
        state: { referrerUrl: `${location.pathname}${location.search}` },
      }),
    onPageUp: handlePageUpKey,
    onPageDown: handlePageDownKey,
    onEscapeUp: handleEscapeUp,
    onEscapeDown: handleEscapeDown,
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
