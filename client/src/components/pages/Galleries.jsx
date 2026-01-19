import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getGridClasses } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import { useWallPlayback } from "../../hooks/useWallPlayback.js";
import { libraryApi } from "../../services/api.js";
import { GalleryCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";
import WallView from "../wall/WallView.jsx";
import TimelineView from "../timeline/TimelineView.jsx";
import { FolderView } from "../folder/index.js";
import { useFolderViewTags } from "../../hooks/useFolderViewTags.js";

// View modes available for galleries page
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];

const Galleries = () => {
  usePageTitle("Galleries");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = useGridColumns("galleries");
  const { wallPlayback } = useWallPlayback();

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
  } = useTableColumns("gallery");

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  // Track current view mode for timeline date filter and folder view
  const [currentViewMode, setCurrentViewMode] = useState("grid");

  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder"
  );

  // Track timeline date filter for filtering by selected period
  const [timelineDateFilter, setTimelineDateFilter] = useState(null);

  // Track folder tag filter for filtering by selected folder
  const [folderTagFilter, setFolderTagFilter] = useState(null);

  // Merge timeline/folder filters into permanent filters based on view mode
  const effectivePermanentFilters = useMemo(() => {
    let filters = {};

    // Add timeline date filter when in timeline view
    if (currentViewMode === "timeline" && timelineDateFilter) {
      filters.date = timelineDateFilter;
    }

    // Add folder tag filter when in folder view
    if (currentViewMode === "folder" && folderTagFilter) {
      filters.tags = {
        value: [folderTagFilter],
        modifier: "INCLUDES",
        depth: -1, // Include child tags (hierarchical)
      };
    }

    return filters;
  }, [currentViewMode, timelineDateFilter, folderTagFilter]);

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getGalleries(newQuery, signal));
    },
    [execute]
  );

  const handleGalleryClick = useCallback(
    (gallery) => {
      navigate(`/gallery/${gallery.id}`, {
        state: { fromPageTitle: "Galleries" },
      });
    },
    [navigate]
  );

  const currentGalleries = data?.galleries || [];
  const totalCount = data?.count || 0;

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
    items: currentGalleries,
    columns,
    totalPages,
    onItemSelect: handleGalleryClick,
  });

  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentGalleries.length > 0 && isTVMode
  );

  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Galleries" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Galleries"
          subtitle="Browse image galleries in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        <SearchControls
          artifactType="gallery"
          initialSort="created_at"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          permanentFilters={effectivePermanentFilters}
          deferInitialQueryUntilFiltersReady={currentViewMode === "timeline"}
          totalPages={totalPages}
          totalCount={totalCount}
          supportsWallView={true}
          wallPlayback={wallPlayback}
          viewModes={VIEW_MODES}
          onViewModeChange={setCurrentViewMode}
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
          {({ viewMode, gridDensity, zoomLevel, sortField, sortDirection, onSort, timelinePeriod, setTimelinePeriod }) =>
            viewMode === "table" ? (
              <TableView
                items={currentGalleries}
                columns={visibleColumns}
                sort={{ field: sortField, direction: sortDirection }}
                onSort={onSort}
                onHideColumn={hideColumn}
                entityType="gallery"
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
            ) : viewMode === "wall" ? (
              <WallView
                items={currentGalleries}
                entityType="gallery"
                zoomLevel={zoomLevel}
                playbackMode={wallPlayback}
                onItemClick={handleGalleryClick}
                loading={isLoading}
                emptyMessage="No galleries found"
              />
            ) : viewMode === "timeline" ? (
              <TimelineView
                entityType="gallery"
                items={currentGalleries}
                renderItem={(gallery) => (
                  <GalleryCard
                    key={gallery.id}
                    gallery={gallery}
                    fromPageTitle="Galleries"
                    tabIndex={0}
                  />
                )}
                onDateFilterChange={setTimelineDateFilter}
                onPeriodChange={setTimelinePeriod}
                initialPeriod={timelinePeriod}
                loading={isLoading}
                emptyMessage="No galleries found for this time period"
                gridDensity={gridDensity}
              />
            ) : viewMode === "folder" ? (
              <FolderView
                items={currentGalleries}
                tags={folderTags}
                gridDensity={gridDensity}
                loading={isLoading || tagsLoading}
                emptyMessage="No galleries found"
                onFolderPathChange={setFolderTagFilter}
                renderItem={(gallery) => (
                  <GalleryCard
                    key={gallery.id}
                    gallery={gallery}
                    fromPageTitle="Galleries"
                    tabIndex={0}
                  />
                )}
              />
            ) : isLoading ? (
              <div className={getGridClasses("standard", gridDensity)}>
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
              <div ref={gridRef} className={getGridClasses("standard", gridDensity)}>
                {currentGalleries.map((gallery, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <GalleryCard
                      key={gallery.id}
                      gallery={gallery}
                      fromPageTitle="Galleries"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            )
          }
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const getGalleries = async (query, signal) => {
  const response = await libraryApi.findGalleries(query, signal);

  const findGalleries = response?.findGalleries;
  const result = {
    galleries: findGalleries?.galleries || [],
    count: findGalleries?.count || 0,
  };

  return result;
};

export default Galleries;
