import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { NormalizedGallery } from "@peek/shared-types";
import { type LibrarySearchParams } from "../../api";
import { useGalleryList } from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { useConfig } from "../../contexts/ConfigContext";
import { useFolderViewTags } from "../../hooks/useFolderViewTags";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { getEntityPath } from "../../utils/entityLinks";
import { GalleryCard } from "../cards/index";
import { FolderView } from "../folder/index";
import { ColumnConfigPopover, TableView } from "../table/index";
import TimelineView from "../timeline/TimelineView";
import {
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import WallView from "../wall/WallView";

// View modes available for galleries page
const VIEW_MODES: { id: string; label: string }[] = [
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
  const { hasMultipleInstances } = useConfig();
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

  const [queryParams, setQueryParams] =
    useState<LibrarySearchParams<"gallery"> | null>(null);
  const {
    data,
    isLoading: queryLoading,
    error,
    isPlaceholderData,
  } = useGalleryList(queryParams);
  // The library is on its first sync: the notice, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = queryParams === null || queryLoading || initializing;

  // Track current view mode for timeline date filter and folder view
  // Seeded from the URL; SearchControls reports each change, Back included
  const [currentViewMode, setCurrentViewMode] = useState(
    searchParams.get("view") || "grid"
  );

  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder"
  );

  // Track timeline date filter for filtering by selected period
  const [timelineDateFilter, setTimelineDateFilter] = useState<{
    start: string;
    end: string;
  } | null>(null);

  // The open folder's tag as "id:instanceId", for filtering by selected folder
  const [folderTagFilter, setFolderTagFilter] = useState<string | null>(null);

  // Merge timeline/folder filters into permanent filters based on view mode
  const effectivePermanentFilters = useMemo(() => {
    const filters: Record<string, unknown> = {};

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
    (newQuery: LibrarySearchParams<"gallery">) => {
      setQueryParams(newQuery);
    },
    []
  );

  const handleGalleryClick = useCallback(
    (gallery: Record<string, unknown>) => {
      void navigate(getEntityPath("gallery", gallery, hasMultipleInstances), {
        state: { fromPageTitle: "Galleries" },
      });
    },
    [navigate, hasMultipleInstances]
  );

  const findGalleries = (data as Record<string, unknown>)?.findGalleries as
    | Record<string, unknown>
    | undefined;
  const currentGalleries =
    (findGalleries?.galleries as Record<string, unknown>[]) || [];
  const totalCount = (findGalleries?.count as number) || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") ?? "24") || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  if (error && !initializing) {
    return (
      <PageLayout>
        <PageHeader title="Galleries" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <PageHeader
          title="Galleries"
          subtitle="Browse image galleries in your library"
        />

        <LibraryInitializingBanner />

        <SearchControls
          artifactType="gallery"
          isRefreshing={isPlaceholderData}
          initialSort="created_at"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          permanentFilters={effectivePermanentFilters}
          deferInitialQueryUntilFiltersReady={currentViewMode === "timeline"}
          totalPages={totalPages}
          totalCount={totalCount}
          supportsWallView={true}
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
        >
          {
            (({
              viewMode,
              gridDensity,
              zoomLevel,
              sortField,
              sortDirection,
              onSort,
              timelinePeriod,
              setTimelinePeriod,
            }: {
              viewMode: string;
              gridDensity: string;
              zoomLevel: number;
              sortField: string;
              sortDirection: string;
              onSort: (field: string, direction: "ASC" | "DESC") => void;
              timelinePeriod: string;
              setTimelinePeriod: (period: string) => void;
            }) =>
              viewMode === "table" ? (
                <TableView
                  items={currentGalleries}
                  columns={
                    visibleColumns as {
                      id: string;
                      label: string;
                      sortable: boolean;
                      width: string;
                      mandatory: boolean;
                    }[]
                  }
                  sort={{
                    field: sortField,
                    direction: sortDirection as "ASC" | "DESC",
                  }}
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
                  zoomLevel={
                    zoomLevel as unknown as "small" | "medium" | "large"
                  }
                  playbackMode={wallPlayback}
                  onItemClick={handleGalleryClick}
                  loading={isLoading}
                  emptyMessage="No galleries found"
                />
              ) : viewMode === "timeline" ? (
                <TimelineView
                  entityType="gallery"
                  items={currentGalleries}
                  renderItem={(gallery: Record<string, unknown>) => (
                    <GalleryCard
                      key={gallery.id as string}
                      gallery={gallery as unknown as NormalizedGallery}
                      fromPageTitle="Galleries"
                      tabIndex={0}
                    />
                  )}
                  onDateFilterChange={setTimelineDateFilter}
                  onPeriodChange={
                    setTimelinePeriod as (period: string | null) => void
                  }
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
                  renderItem={(gallery: Record<string, unknown>) => (
                    <GalleryCard
                      key={gallery.id as string}
                      gallery={gallery as unknown as NormalizedGallery}
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
                <div className={getGridClasses("standard", gridDensity)}>
                  {currentGalleries.map((gallery: Record<string, unknown>) => (
                    <GalleryCard
                      key={gallery.id as string}
                      gallery={gallery as unknown as NormalizedGallery}
                      fromPageTitle="Galleries"
                    />
                  ))}
                </div>
              )) as unknown as React.ReactNode
          }
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default Galleries;
