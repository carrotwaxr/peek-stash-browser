import { useState, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage } from "../ui/index.js";
import CacheLoadingBanner from "../ui/CacheLoadingBanner.jsx";
import SearchControls from "../ui/SearchControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import PerformerCard from "../ui/PerformerCard.jsx";

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

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentPerformers,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (performer) => navigate(`/performer/${performer.id}`),
    onPageUp: () =>
      urlPage > 1 &&
      handleQueryChange({
        ...lastQuery,
        filter: { ...lastQuery.filter, page: urlPage - 1 },
      }),
    onPageDown: () =>
      urlPage < totalPages &&
      handleQueryChange({
        ...lastQuery,
        filter: { ...lastQuery.filter, page: urlPage + 1 },
      }),
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

  const gridClassNames =
    "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

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
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className={gridClassNames}>
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
              <div ref={gridRef} className={gridClassNames}>
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
