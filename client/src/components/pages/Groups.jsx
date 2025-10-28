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
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Groups = () => {
  usePageTitle("Groups");
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
      const result = await getGroups(newQuery);
      setData(result);
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
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
    onSelect: (group) => navigate(`/group/${group.id}`),
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

  if (error) {
    return (
      <PageLayout>
        <PageHeader title="Groups" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader title="Groups" subtitle="Browse groups and movies in your library" />

        {/* Controls Section */}
        <SearchControls
          artifactType="group"
          initialSort="name"
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
    return (
      <Link
        ref={ref}
        state={{ referrerUrl }}
        to={`/group/${group.id}`}
        tabIndex={isTVMode ? tabIndex : -1}
        className={`group-card block rounded-lg border p-6 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        role="button"
        aria-label={`Group: ${group.name}`}
      >
        <div className="flex items-start space-x-4">
          <EntityImage
            imagePath={group.front_image_path || group.back_image_path}
            name={group.name}
            fallbackIcon="🎬"
          />

          <div className="flex-1 min-w-0">
            {/* Name */}
            <h3
              className="font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
              title={group.name}
            >
              {truncateText(group.name, 30)}
            </h3>

            {/* Studio and Date */}
            {(group.studio || group.date) && (
              <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                {group.studio && <span>{group.studio.name}</span>}
                {group.studio && group.date && <span> • </span>}
                {group.date && <span>{group.date}</span>}
              </div>
            )}

            {/* Scene Count */}
            <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
              {group.scene_count > 0
                ? `${group.scene_count} Scene${group.scene_count !== 1 ? "s" : ""}`
                : "No scenes"}
            </div>

            {/* Rating and Favorite */}
            <div className="flex items-center mb-2" onClick={(e) => e.preventDefault()}>
              <RatingControls
                entityType="group"
                entityId={group.id}
                initialRating={group.rating}
                initialFavorite={group.favorite || false}
                size={16}
              />
            </div>

            {/* Synopsis (optional) */}
            {group.synopsis && (
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                {truncateText(group.synopsis, 80)}
              </p>
            )}
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
