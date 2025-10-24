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
import RatingControls from "../ui/RatingControls.jsx";
import OCounterButton from "../ui/OCounterButton.jsx";
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
      const result = await getTags(newQuery);
      setData(result);
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
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

  if (error) {
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

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
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
        className={`tag-card block rounded-lg border p-6 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Tag: ${tag.name}`}
      >
        <div className="flex items-start space-x-4">
          <EntityImage
            imagePath={tag.image_path}
            name={tag.name}
            fallbackIcon="#"
          />

          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3
              className="font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
              title={tag.name}
            >
              {truncateText(tag.name, 30)}
            </h3>

            {/* Scene Count */}
            <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              {tag.scene_count || 0} scene{tag.scene_count !== 1 ? "s" : ""}
            </div>

            {/* Status Icons */}
            <div className="flex flex-wrap items-center gap-2 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              <span>
                <span style={{ color: "var(--icon-play-count)" }}>▶</span> {tag.play_count || 0}
              </span>
              <OCounterButton
                initialCount={tag.o_counter || 0}
                readOnly={true}
                className="text-xs"
              />
            </div>

            {/* Rating and Favorite */}
            <div className="flex items-center mb-2" onClick={(e) => e.preventDefault()}>
              <RatingControls
                entityType="tag"
                entityId={tag.id}
                initialRating={tag.rating}
                initialFavorite={tag.favorite || false}
                size={16}
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
