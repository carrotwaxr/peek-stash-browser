import { forwardRef, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { useAuth } from "../../hooks/useAuth.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { libraryApi } from "../../services/api.js";
import {
  CacheLoadingBanner,
  ErrorMessage,
  GridCard,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

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

  const gridClassNames =
    "card-grid-responsive grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

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
            <div className={gridClassNames}>
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
              <div ref={gridRef} className={gridClassNames}>
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
  ({ tag, tabIndex, isTVMode = false, referrerUrl, ...others }, ref) => {
    const subtitle =
      tag.child_count > 0
        ? `${tag.child_count} subtag${tag.child_count !== 1 ? "s" : ""}`
        : null;

    return (
      <GridCard
        description={tag.description}
        entityType="tag"
        imagePath={tag.image_path}
        indicators={[
          { type: "PLAY_COUNT", count: tag.play_count },
          { type: "SCENES", count: tag.scene_count },
          { type: "IMAGES", count: tag.image_count },
          { type: "GALLERIES", count: tag.gallery_count },
          { type: "GROUPS", count: tag.group_count },
          { type: "STUDIOS", count: tag.studio_count },
          { type: "PERFORMERS", count: tag.performer_count },
        ]}
        linkTo={`/tag/${tag.id}`}
        ratingControlsProps={{
          entityId: tag.id,
          initialRating: tag.rating,
          initialFavorite: tag.favorite || false,
          initialOCounter: tag.o_counter,
        }}
        ref={ref}
        referrerUrl={referrerUrl}
        subtitle={subtitle}
        tabIndex={isTVMode ? tabIndex : -1}
        title={tag.name}
        {...others}
      />
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
