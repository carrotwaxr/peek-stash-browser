import { useState, useRef, forwardRef } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import deepEqual from "fast-deep-equal";
import {
  CardStatusIcons,
  CardCountsIcons,
  PageHeader,
  PageLayout,
  ErrorMessage,
} from "../ui/index.js";
import CacheLoadingBanner from "../ui/CacheLoadingBanner.jsx";
import { truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Tags = () => {
  usePageTitle("Tags");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isTVMode } = useTVMode();
  const columns = useGridColumns("tags");

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
      const result = await getTags(newQuery);
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

  const currentTags = data?.tags || [];
  const totalCount = data?.count || 0;

  // Get current pagination state from URL params for bottom pagination
  const urlPage = parseInt(searchParams.get("page")) || 1;
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24; // Fixed: 'per_page' not 'perPage'

  // Calculate totalPages based on urlPerPage (from URL params), not lastQuery
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentTags,
    columns,
    enabled: !isLoading && isTVMode,
    onSelect: (tag) => navigate(`/tag/${tag.id}`),
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
    !isLoading && currentTags.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Tags" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader title="Tags" subtitle="Browse tags in your library" />

        {initMessage && <CacheLoadingBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
          initialSort="scenes_count"
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
                    height: "18rem",
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
                {currentTags.map((tag, index) => (
                  <TagCard
                    key={tag.id}
                    ref={(el) => setItemRef(index, el)}
                    tag={tag}
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

const TagCard = forwardRef(
  ({ tag, tabIndex, className = "", isTVMode = false, referrerUrl }, ref) => {
    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/tag/${tag.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`tag-card block rounded-lg border overflow-hidden hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Tag: ${tag.name}`}
      >
        <div className="text-center">
          {/* Tag Image */}
          <div className="w-full aspect-video overflow-hidden mb-3">
            {tag.image_path ? (
              <img
                src={tag.image_path}
                alt={tag.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-5xl"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                #
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="px-4 pb-4">
            {/* Name */}
            <h3
              className="font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
              title={tag.name}
            >
              {truncateText(tag.name, 30)}
            </h3>

            {/* Subtags count - Always rendered to maintain alignment */}
            <div
              className="text-xs mb-2"
              style={{
                color: "var(--text-muted)",
                minHeight: "1.25rem"
              }}
            >
              {tag.child_count > 0 ? (
                <span>{tag.child_count} subtag{tag.child_count !== 1 ? "s" : ""}</span>
              ) : (
                <span>&nbsp;</span>
              )}
            </div>

            {/* Entity Counts with Icons */}
            <CardCountsIcons
              className="mb-2 justify-center"
              sceneCount={tag.scene_count}
              imageCount={tag.image_count}
              galleryCount={tag.gallery_count}
              groupCount={tag.group_count}
              studioCount={tag.studio_count}
              performerCount={tag.performer_count}
            />

            {/* Status Icons */}
            <CardStatusIcons
              isReadOnly={true}
              oCount={tag.o_counter}
              playCount={tag.play_count}
            />

            {/* Rating and Favorite */}
            <div
              className="flex items-center justify-center mb-2"
              onClick={(e) => e.preventDefault()}
            >
              <RatingControls
                entityType="tag"
                entityId={tag.id}
                initialRating={tag.rating}
                initialFavorite={tag.favorite || false}
              />
            </div>

            {/* Description (optional) */}
            {tag.description && (
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                {truncateText(tag.description, 80)}
              </p>
            )}
          </div>
        </div>
      </Link>
    );
  }
);

TagCard.displayName = "TagCard";

const getTags = async (query) => {
  const response = await libraryApi.findTags(query);

  // Extract tags and count from server response structure
  const findTags = response?.findTags;
  const result = {
    tags: findTags?.tags || [],
    count: findTags?.count || 0,
  };
  return result;
};

export default Tags;
