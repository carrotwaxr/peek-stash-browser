import { useState, useRef, forwardRef } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage } from "../ui/index.js";
import { truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import EntityImage from "../ui/EntityImage.jsx";
import StarRating from "../ui/StarRating.jsx";
import FavoriteButton from "../ui/FavoriteButton.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Studios = () => {
  usePageTitle("Studios");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const columns = 3;

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

  // Get current pagination state from URL params for bottom pagination
  const urlPage = parseInt(searchParams.get("page")) || 1;
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24; // Fixed: 'per_page' not 'perPage'

  // Calculate totalPages based on urlPerPage (from URL params), not lastQuery
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentStudios,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (studio) => navigate(`/studio/${studio.id}`),
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
    !isLoading && currentStudios.length > 0 && isTVMode
  );

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
          subtitle="Browse studios and production companies in your library"
        />

        {/* Controls Section */}
        <SearchControls
          artifactType="studio"
          initialSort="scenes_count"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg animate-pulse"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    height: "8rem",
                  }}
                />
              ))}
            </div>
          ) : (
            <>
              <div
                ref={gridRef}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {currentStudios.map((studio, index) => (
                  <StudioCard
                    key={studio.id}
                    ref={(el) => setItemRef(index, el)}
                    studio={studio}
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

const StudioCard = forwardRef(
  (
    { studio, tabIndex, className = "", isTVMode = false, referrerUrl },
    ref
  ) => {
    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/studio/${studio.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`studio-card block rounded-lg border p-6 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Studio: ${studio.name}`}
      >
        <div className="flex items-start space-x-4">
          <EntityImage
            imagePath={studio.image_path}
            name={studio.name}
            fallbackIcon="🏢"
          />

          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
              title={studio.name}
            >
              {truncateText(studio.name, 30)}
            </h3>

            {/* Rating and Favorite */}
            <div className="flex items-center gap-2 mb-2" onClick={(e) => e.preventDefault()}>
              <StarRating
                rating={studio.rating}
                readonly={true}
                size={16}
              />
              <FavoriteButton
                isFavorite={studio.favorite || false}
                size={16}
                disabled={true}
              />
            </div>

            {studio.scene_count > 0 && (
              <p
                className="text-sm mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                {studio.scene_count} scene{studio.scene_count !== 1 ? "s" : ""}
              </p>
            )}

            {studio.url && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {truncateText(studio.url, 40)}
              </p>
            )}

            {studio.details && (
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                {truncateText(studio.details, 80)}
              </p>
            )}
          </div>
        </div>
      </Link>
    );
  }
);

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
