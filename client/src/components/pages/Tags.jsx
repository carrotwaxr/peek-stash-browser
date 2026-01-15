// client/src/components/pages/Tags.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import { libraryApi } from "../../services/api.js";
import { TagCard } from "../cards/index.js";
import { TagHierarchyView } from "../tags/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";

// View modes for Tags page
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
  { id: "hierarchy", label: "Hierarchy view" },
];

const Tags = () => {
  usePageTitle("Tags");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = useGridColumns("tags");

  // Table columns hook for table view
  const {
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
  } = useTableColumns("tag");

  // Track active view mode - synced from SearchControls via callback
  const [activeViewMode, setActiveViewMode] = useState(
    searchParams.get("view_mode") || "grid"
  );

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  // Separate query for hierarchy view (fetches all tags, starts not loading)
  const {
    data: hierarchyData,
    isLoading: hierarchyLoading,
    execute: executeHierarchy,
  } = useCancellableQuery({ initialLoading: false });

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getTags(newQuery, signal));
    },
    [execute]
  );

  // Fetch all tags when switching to hierarchy view
  useEffect(() => {
    if (activeViewMode === "hierarchy" && !hierarchyData) {
      executeHierarchy((signal) => getAllTags(signal));
    }
  }, [activeViewMode, executeHierarchy, hierarchyData]);

  const currentTags = data?.tags || [];
  const totalCount = data?.count || 0;
  const hierarchyTags = hierarchyData?.tags || [];

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

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
    onItemSelect: (tag) =>
      navigate(`/tag/${tag.id}`, {
        state: { fromPageTitle: "Tags" },
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

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
          initialSort="scenes_count"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          onViewModeChange={setActiveViewMode}
          totalPages={activeViewMode === "hierarchy" ? 0 : totalPages}
          totalCount={activeViewMode === "hierarchy" ? 0 : totalCount}
          viewModes={VIEW_MODES}
          currentTableColumns={getColumnConfig()}
          tableColumnsPopover={
            <ColumnConfigPopover
              allColumns={allColumns}
              visibleColumnIds={visibleColumnIds}
              columnOrder={columnOrder}
              onToggleColumn={toggleColumn}
              onMoveColumn={moveColumn}
            />
          }
          {...searchControlsProps}
        >
          {({ viewMode, sortField, sortDirection, onSort }) => {
            // Hierarchy view
            if (viewMode === "hierarchy") {
              // Show loading if we don't have hierarchy data yet
              const showLoading = hierarchyLoading || !hierarchyData;
              return (
                <TagHierarchyView
                  tags={hierarchyTags}
                  isLoading={showLoading}
                  searchQuery={searchParams.get("q") || ""}
                  sortField={sortField}
                  sortDirection={sortDirection}
                />
              );
            }

            // Table view
            if (viewMode === "table") {
              return (
                <TableView
                  items={currentTags}
                  columns={visibleColumns}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={onSort}
                  onHideColumn={hideColumn}
                  entityType="tag"
                  isLoading={isLoading}
                  columnsPopover={
                    <ColumnConfigPopover
                      allColumns={allColumns}
                      visibleColumnIds={visibleColumnIds}
                      columnOrder={columnOrder}
                      onToggleColumn={toggleColumn}
                      onMoveColumn={moveColumn}
                    />
                  }
                />
              );
            }

            // Grid view (default)
            if (isLoading) {
              return (
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
              );
            }

            return (
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentTags.map((tag, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <TagCard
                      key={tag.id}
                      tag={tag}
                      fromPageTitle="Tags"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            );
          }}
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

// Fetch all tags for hierarchy view (no pagination)
const getAllTags = async (signal) => {
  const query = {
    filter: {
      per_page: -1, // Fetch all
      sort: "name",
      direction: "ASC",
    },
  };
  const response = await libraryApi.findTags(query, signal);
  const findTags = response?.findTags;
  return {
    tags: findTags?.tags || [],
    count: findTags?.count || 0,
  };
};

export default Tags;
