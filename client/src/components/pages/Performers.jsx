import { useEffect, useState, useRef, forwardRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage, LoadingSpinner } from "../ui/index.js";
import { formatRating, getInitials, truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";

const Performers = () => {
  usePageTitle("Performers");
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns('performers');

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
        sort: "o_counter",
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
        const result = await getPerformers(query);
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
      const result = await getPerformers(newQuery);
      setData(result);
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const currentPerformers = data?.performers || [];

  const totalCount = data?.count || 0;

  const perPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / perPage);
  const currentPage = lastQuery?.filter?.page || 1;

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentPerformers,
    columns,
    enabled: !isLoading,
    onSelect: (performer) => navigate(`/performer/${performer.id}`),
    onPageUp: () => currentPage > 1 && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage - 1 } }),
    onPageDown: () => currentPage < totalPages && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage + 1 } }),
  });

  // Initial focus
  useInitialFocus(pageRef, '[tabindex="0"]', !isLoading && currentPerformers.length > 0);

  if (error) {
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
          subtitle="Browse and manage performers in your library"
        />

      {/* Controls Section */}
      <SearchControls
        artifactType="performer"
        initialSort="o_counter"
        onQueryChange={handleQueryChange}
        totalPages={totalPages}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div ref={gridRef} className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
            {currentPerformers.map((performer, index) => (
              <PerformerCard
                key={performer.id}
                ref={(el) => setItemRef(index, el)}
                performer={performer}
                tabIndex={isFocused(index) ? 0 : -1}
                className={isFocused(index) ? "keyboard-focus" : ""}
              />
            ))}
          </div>
        </>
      )}
      </div>
    </PageLayout>
  );
};

const PerformerCard = forwardRef(({ performer, tabIndex, className = "" }, ref) => {
  return (
    <Link
      ref={ref}
      to={`/performer/${performer.id}`}
      tabIndex={tabIndex}
      className={`block rounded-lg border p-4 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
      role="button"
      aria-label={`Performer: ${performer.name}`}
    >
      <div className="text-center">
        <div className="w-full aspect-[2/3] rounded mb-3 overflow-hidden">
          {performer.image_path ? (
            <img
              src={performer.image_path}
              alt={performer.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-lg font-semibold"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
              }}
            >
              {getInitials(performer.name)}
            </div>
          )}
        </div>

        <h3
          className="font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
          title={performer.name}
        >
          {truncateText(performer.name, 20)}
        </h3>

        {performer.rating100 && (
          <p className="text-sm mb-1" style={{ color: "var(--text-muted)" }}>
            {formatRating(performer.rating100)}
          </p>
        )}

        {performer.scene_count > 0 && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {performer.scene_count} scene
            {performer.scene_count !== 1 ? "s" : ""}
          </p>
        )}

        {performer.favorite && (
          <div className="mt-2">
            <span className="text-yellow-500 text-sm">★ Favorite</span>
          </div>
        )}
      </div>
    </Link>
  );
});

PerformerCard.displayName = "PerformerCard";

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
