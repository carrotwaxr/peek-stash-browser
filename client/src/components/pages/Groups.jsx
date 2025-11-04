import { useState, useRef, forwardRef } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import deepEqual from "fast-deep-equal";
import {
  PageHeader,
  PageLayout,
  ErrorMessage,
  CardCountsIcons,
} from "../ui/index.js";
import CacheLoadingBanner from "../ui/CacheLoadingBanner.jsx";
import SearchControls from "../ui/SearchControls.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Groups = () => {
  usePageTitle("Collections");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const columns = useGridColumns("groups");

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
      const result = await getGroups(newQuery);
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err.isInitializing && retryCount < 60) {
        setInitMessage("Server is loading cache, please wait...");
        setTimeout(() => {
          handleQueryChange(newQuery, retryCount + 1);
        }, 5000);
        return;
      }
      setError(err.message || "An error occurred");
      setIsLoading(false);
    }
  };

  const currentGroups = data?.groups || [];
  const totalCount = data?.count || 0;

  // Get current pagination state from URL params for bottom pagination
  const urlPage = parseInt(searchParams.get("page")) || 1;
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;

  // Calculate totalPages based on urlPerPage (from URL params), not lastQuery
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentGroups,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (group) => navigate(`/collection/${group.id}`),
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
    !isLoading && currentGroups.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Collections" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Collections"
          subtitle="Browse collections and movies in your library"
        />

        {initMessage && <CacheLoadingBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="group"
          initialSort="name"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
        >
          {isLoading ? (
            <div className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
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
                className="grid xs:grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6"
              >
                {currentGroups.map((group, index) => (
                  <GroupCard
                    key={group.id}
                    ref={(el) => setItemRef(index, el)}
                    group={group}
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

const GroupCard = forwardRef(
  ({ group, tabIndex, className = "", isTVMode = false, referrerUrl }, ref) => {
    const imagePath = group.front_image_path || group.back_image_path;

    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/collection/${group.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`group-card block rounded-lg border overflow-hidden hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Collection: ${group.name}`}
      >
        <div className="text-center">
          {/* DVD Cover Image - Portrait Orientation */}
          <div className="w-full aspect-[2/3] p-2">
            {imagePath ? (
              <img
                src={imagePath}
                alt={group.name}
                className="w-full h-full object-contain rounded-md"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                🎬
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="p-3">
            {/* Name */}
            <h3
              className="font-semibold mb-2 line-clamp-2"
              style={{ color: "var(--text-primary)" }}
              title={group.name}
            >
              {group.name}
            </h3>

            {/* Studio and Date - Always rendered to maintain alignment */}
            <div
              className="text-xs mb-2"
              style={{
                color: "var(--text-muted)",
                minHeight: "1.25rem" // Maintains space even when empty
              }}
            >
              {group.studio && <span>{group.studio.name}</span>}
              {group.studio && group.date && <span> • </span>}
              {group.date && <span>{group.date}</span>}
              {!group.studio && !group.date && <span>&nbsp;</span>}
            </div>

            {/* Entity Counts */}
            <CardCountsIcons
              className="mb-2 justify-center"
              sceneCount={group.scene_count}
              groupCount={group.sub_group_count}
            />

            {/* Rating and Favorite */}
            <div
              className="flex items-center justify-center"
              onClick={(e) => e.preventDefault()}
            >
              <RatingControls
                entityType="group"
                entityId={group.id}
                initialRating={group.rating}
                initialFavorite={group.favorite || false}
              />
            </div>
          </div>
        </div>
      </Link>
    );
  }
);

GroupCard.displayName = "GroupCard";

const getGroups = async (query) => {
  const response = await libraryApi.findGroups(query);

  // Extract groups and count from server response structure
  const findGroups = response?.findGroups;
  const result = {
    groups: findGroups?.groups || [],
    count: findGroups?.count || 0,
  };
  return result;
};

export default Groups;
