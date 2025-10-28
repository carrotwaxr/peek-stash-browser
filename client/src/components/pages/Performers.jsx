import { useState, useRef, forwardRef } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage } from "../ui/index.js";
import { getInitials, truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import OCounterButton from "../ui/OCounterButton.jsx";
import { LucideVenus, LucideMars, LucideUser } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";

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

  // Note: We don't fetch initial data here anymore.
  // SearchControls will trigger the initial query via onQueryChange based on URL params.

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
          subtitle="Browse performers in your library"
        />

        {/* Controls Section */}
        <SearchControls
          artifactType="performer"
          initialSort="o_counter"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
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
              <div
                ref={gridRef}
                className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
              >
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

const PerformerGenderIcon = ({ gender, size = 16 }) => {
  if (gender === "FEMALE") {
    return <LucideVenus size={size} color="#ff0080" />;
  } else if (gender === "MALE") {
    return <LucideMars size={size} color="#0561fa" />;
  } else {
    return <LucideUser size={size} color="#6c757d" />;
  }
};

const PerformerCard = forwardRef(
  (
    { performer, tabIndex, className = "", isTVMode = false, referrerUrl },
    ref
  ) => {
    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/performer/${performer.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`performer-card block rounded-lg border p-4 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Performer: ${performer.name}`}
      >
        <div className="text-center">
          {/* Image */}
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

          {/* Name with Gender Icon */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <h3
              className="font-semibold"
              style={{ color: "var(--text-primary)" }}
              title={performer.name}
            >
              {truncateText(performer.name, 20)}
            </h3>
            <PerformerGenderIcon gender={performer.gender} size={16} />
          </div>

          {/* Scene Count */}
          <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            {performer.scene_count || 0} scene
            {performer.scene_count !== 1 ? "s" : ""}
          </div>

          {/* Status Icons */}
          <div
            className="flex flex-wrap items-center justify-center gap-2 text-xs mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              <span style={{ color: "var(--status-success)" }}>▶</span>{" "}
              {performer.play_count || 0}
            </span>
            <OCounterButton
              initialCount={performer.o_counter || 0}
              readOnly={true}
              className="text-xs"
            />
          </div>

          {/* Rating and Favorite */}
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.preventDefault()}
          >
            <RatingControls
              entityType="performer"
              entityId={performer.id}
              initialRating={performer.rating}
              initialFavorite={performer.favorite || false}
              size={16}
            />
          </div>
        </div>
      </Link>
    );
  }
);

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
