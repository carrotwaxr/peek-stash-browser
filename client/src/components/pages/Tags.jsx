import { useEffect, useState, useRef, forwardRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import deepEqual from "fast-deep-equal";
import { PageHeader, PageLayout, ErrorMessage, LoadingSpinner } from "../ui/index.js";
import { truncateText } from "../../utils/format.js";
import SearchControls from "../ui/SearchControls.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { libraryApi } from "../../services/api.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useSpatialNavigation } from "../../hooks/useSpatialNavigation.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";

const Tags = () => {
  usePageTitle("Tags");
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const columns = useGridColumns('tags');

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
        const result = await getTags(query);
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
  const perPage = lastQuery?.filter?.per_page || 24;
  const totalPages = Math.ceil(totalCount / perPage);
  const currentPage = lastQuery?.filter?.page || 1;

  // Spatial navigation
  const { setItemRef, isFocused } = useSpatialNavigation({
    items: currentTags,
    columns,
    enabled: !isLoading,
    onSelect: (tag) => navigate(`/tag/${tag.id}`),
    onPageUp: () => currentPage > 1 && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage - 1 } }),
    onPageDown: () => currentPage < totalPages && handleQueryChange({ ...lastQuery, filter: { ...lastQuery.filter, page: currentPage + 1 } }),
  });

  // Initial focus
  useInitialFocus(pageRef, '[tabindex="0"]', !isLoading && currentTags.length > 0);

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
        <PageHeader
          title="Tags"
          subtitle="Browse and manage tags in your library"
        />

      {/* Controls Section */}
      <SearchControls
        artifactType="tag"
        initialSort="scenes_count"
        onQueryChange={handleQueryChange}
        totalPages={totalPages}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentTags.map((tag, index) => (
              <TagCard
                key={tag.id}
                ref={(el) => setItemRef(index, el)}
                tag={tag}
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

const TagCard = forwardRef(({ tag, tabIndex, className = "" }, ref) => {
  const getTagColor = (name) => {
    // Generate a consistent color based on the tag name
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-red-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
    ];

    const hash = name.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);

    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <Link
      ref={ref}
      to={`/tag/${tag.id}`}
      tabIndex={tabIndex}
      className={`block rounded-lg border p-6 hover:shadow-lg transition-shadow cursor-pointer focus:outline-none ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
      role="button"
      aria-label={`Tag: ${tag.name}`}
    >
      <div className="flex items-start space-x-4">
        {tag.image_path ? (
          <img
            src={tag.image_path}
            alt={tag.name}
            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${getTagColor(
              tag.name
            )} text-white text-2xl font-bold`}
          >
            #
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
            title={tag.name}
          >
            {truncateText(tag.name, 30)}
          </h3>

          {tag.scene_count > 0 && (
            <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
              {tag.scene_count} scene{tag.scene_count !== 1 ? "s" : ""}
            </p>
          )}

          {tag.description && (
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              {truncateText(tag.description, 80)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
});

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
