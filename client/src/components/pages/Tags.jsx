import { useCallback, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { libraryApi } from "../../services/api.js";
import { TagCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
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
  const columns = useGridColumns("tags");

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getTags(newQuery, signal));
    },
    [execute]
  );

  const currentTags = data?.tags || [];
  const totalCount = data?.count || 0;

  // Calculate totalPages based on URL params
  const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
  const totalPages = Math.ceil(totalCount / urlPerPage);

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentTags,
    columns,
    totalPages,
    onItemSelect: (tag) => navigate(`/tag/${tag.id}`),
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

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
          initialSort="scenes_count"
          onQueryChange={handleQueryChange}
          totalPages={totalPages}
          totalCount={totalCount}
          {...searchControlsProps}
        >
          {isLoading ? (
            <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
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
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentTags.map((tag, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <TagCard
                      key={tag.id}
                      tag={tag}
                      referrerUrl={`${location.pathname}${location.search}`}
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            </>
          )}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const getTags = async (query, signal) => {
  const response = await libraryApi.findTags(query, signal);

  // Extract tags and count from server response structure
  const findTags = response?.findTags;
  const result = {
    tags: findTags?.tags || [],
    count: findTags?.count || 0,
  };
  return result;
};

export default Tags;
