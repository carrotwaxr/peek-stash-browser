import { useEffect, useState, useRef, forwardRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage, LoadingSpinner } from "../ui/index.js";
import { truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import Pagination from "../ui/Pagination.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Studios = () => {
  usePageTitle("Studios");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const [columns, setColumns] = useState(3);

  const [lastQuery, setLastQuery] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    // Initial fetch with default parameters
    const query = {
      filter: {
        direction: "DESC",
        page: 1,
        per_page: 24,
        q: "",
        sort: "scenes_count",
      },
    };

    const fetchInitialData = async () => {
      // Don't make API calls if not authenticated or still checking auth
      if (isAuthLoading || !isAuthenticated) {
        return;
      }

      try {
        setIsLoading(true);
        setLastQuery(query);
        setError(null);
        const result = await getStudios(query);
        setData(result);
      } catch (err) {
        setError(err.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [isAuthLoading, isAuthenticated]);

  const handleQueryChange = async (newQuery) => {
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
      const result = await getStudios(newQuery);
      setData(result);
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const currentStudios = data?.studios || [];
  const totalCount = data?.count || 0;
  const perPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / perPage);
  const currentPage = lastQuery?.filter?.page || 1;

  // Get current pagination state from URL params for bottom pagination
  const urlPage = parseInt(searchParams.get('page')) || 1;
  const urlPerPage = parseInt(searchParams.get('perPage')) || 24;

  // Pagination handlers that update URL params (SearchControls will react to these changes)
  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params, { replace: true });
  };

  const handlePerPageChange = (newPerPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('perPage', newPerPage.toString());
    params.set('page', '1'); // Reset to first page when changing perPage
    setSearchParams(params, { replace: true });
  };

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentStudios,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (studio) => navigate(`/studio/${studio.id}`),
    onPageUp: () => currentPage > 1 && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage - 1 } }),
    onPageDown: () => currentPage < totalPages && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage + 1 } }),
  });

  // Initial focus
  useInitialFocus(pageRef, '[tabindex="0"]', !isLoading && currentStudios.length > 0 && isTVMode);

  if (error) {
    return (
      <PageLayout>
        <PageHeader title="Studios" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Studios"
          subtitle="Browse studios and production companies"
        />

      {/* Controls Section */}
      <SearchControls
        artifactType="studio"
        initialSort="scenes_count"
        onQueryChange={handleQueryChange}
        totalPages={totalPages}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentStudios.map((studio, index) => (
              <StudioCard
                key={studio.id}
                ref={(el) => setItemRef(index, el)}
                studio={studio}
                tabIndex={isFocused(index) ? 0 : -1}
                className={isFocused(index) ? "keyboard-focus" : ""}
                isTVMode={isTVMode}
              />
            ))}
          </div>

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={urlPage}
              onPageChange={handlePageChange}
              perPage={urlPerPage}
              onPerPageChange={handlePerPageChange}
              showInfo={false}
              showPerPageSelector={false}
              totalPages={totalPages}
            />
          )}
        </>
      )}
      </div>
    </PageLayout>
  );
};

const StudioCard = forwardRef(({ studio, tabIndex, className = "", isTVMode = false }, ref) => {
  return (
    <Link
      ref={ref}
      to={`/studio/${studio.id}`}
      tabIndex={isTVMode ? tabIndex : -1}
      className={`block rounded-lg border p-6 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
      role="button"
      aria-label={`Studio: ${studio.name}`}
    >
      <div className="flex items-start space-x-4">
        {studio.image_path ? (
          <img
            src={studio.image_path}
            alt={studio.name}
            className="w-16 h-16 rounded object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
            }}
          >
            🏢
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={studio.name}
          >
            {truncateText(studio.name, 30)}
          </h3>

          {studio.scene_count > 0 && (
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {studio.scene_count} scene{studio.scene_count !== 1 ? "s" : ""}
            </p>
          )}

          {studio.url && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.url, 40)}
            </p>
          )}

          {studio.details && (
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              {truncateText(studio.details, 80)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
});

StudioCard.displayName = "StudioCard";

const getStudios = async (query) => {
  const response = await libraryApi.findStudios(query);

  // Extract studios and count from server response structure
  const findStudios = response?.findStudios;
  const result = {
    studios: findStudios?.studios || [],
    count: findStudios?.count || 0,
  };
  return result;
};

export default Studios;
