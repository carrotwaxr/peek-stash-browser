import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import { useWallPlayback } from "../../hooks/useWallPlayback.js";
import { libraryApi } from "../../services/api.js";
import {
  SceneCard,
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";
import SceneGrid from "./SceneGrid.jsx";
import WallView from "../wall/WallView.jsx";
import TimelineView from "../timeline/TimelineView.jsx";
import { FolderView } from "../folder/index.js";
import { useFolderViewTags } from "../../hooks/useFolderViewTags.js";

// View modes available for scene search
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];

// Context settings for wall view preview behavior
const WALL_VIEW_SETTINGS = [
  {
    key: "wallPlayback",
    label: "Preview Behavior",
    type: "select",
    options: [
      { value: "autoplay", label: "Autoplay All" },
      { value: "hover", label: "Play on Hover" },
      { value: "static", label: "Static Thumbnails" },
    ],
  },
];

/**
 * SceneSearch is one of the more core Components of the app. It appears on most pages, and utilizes the
 * search functionality of the Stash API to provide a consistent search experience across the app.
 *
 * It displays a search input, sorting & filtering options, and pagination controls. It also handles the logic for
 * performing searches and pagination. Consumers can optionally provide a title/header, permanent filters (for use on
 * a Performer, Studio, or Tag page for instance), and default sorting options.
 */
const SceneSearch = ({
  context, // Optional context for filter preset defaults (scene_performer, scene_tag, etc.)
  initialSort = "o_counter",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  fromPageTitle,
  syncToUrl = true, // Whether to sync pagination/filters to URL
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const columns = useGridColumns("scenes");
  const { wallPlayback, updateWallPlayback } = useWallPlayback();

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
  } = useTableColumns("scene");

  const { data, isLoading, error, initMessage, execute, setData } = useCancellableQuery();

  // Track current view mode for context settings
  const [currentViewMode, setCurrentViewMode] = useState("grid");

  // Extract filter IDs for timeline/folder views
  const viewFilters = useMemo(() => {
    const filters = {};

    // Extract performer ID
    if (permanentFilters.performers?.value?.length > 0) {
      filters.performerId = String(permanentFilters.performers.value[0]);
    }

    // Extract tag ID
    if (permanentFilters.tags?.value?.length > 0) {
      filters.tagId = String(permanentFilters.tags.value[0]);
    }

    // Extract studio ID
    if (permanentFilters.studios?.value?.length > 0) {
      filters.studioId = String(permanentFilters.studios.value[0]);
    }

    // Extract group ID
    if (permanentFilters.groups?.value?.length > 0) {
      filters.groupId = String(permanentFilters.groups.value[0]);
    }

    return Object.keys(filters).length > 0 ? filters : null;
  }, [permanentFilters]);

  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder",
    viewFilters
  );

  // Track timeline date filter for filtering by selected period
  const [timelineDateFilter, setTimelineDateFilter] = useState(null);

  // Track folder tag filter for filtering by selected folder
  const [folderTagFilter, setFolderTagFilter] = useState(null);

  // Merge timeline/folder filters into permanent filters based on view mode
  const effectivePermanentFilters = useMemo(() => {
    let filters = { ...permanentFilters };

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
  }, [permanentFilters, currentViewMode, timelineDateFilter, folderTagFilter]);

  // Context settings only shown in wall view
  const contextSettings = useMemo(() => {
    return currentViewMode === "wall" ? WALL_VIEW_SETTINGS : [];
  }, [currentViewMode]);

  // Handle successful hide - remove scene from state
  const handleHideSuccess = (sceneId) => {
    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        scenes: prevData.scenes.filter((s) => s.id !== sceneId),
        count: Math.max(0, prevData.count - 1),
      };
    });
  };

  const handleSceneClick = (scene) => {
    // Navigate to video player page with scene data and virtual playlist context
    const currentScenes = data?.scenes || [];
    const currentIndex = currentScenes.findIndex((s) => s.id === scene.id);

    // Build navigation state
    const navigationState = {
      scene,
      playlist: {
        id: "virtual-grid",
        name: title || "Scene Grid",
        shuffle: false,
        repeat: "none",
        scenes: currentScenes.map((s, idx) => ({
          sceneId: s.id,
          scene: s,
          position: idx,
        })),
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
      },
    };

    // Only capture fromPageTitle if provided
    if (fromPageTitle) {
      navigationState.fromPageTitle = fromPageTitle;
    }

    navigate(`/scene/${scene.id}`, { state: navigationState });
    return true; // Prevent fallback navigation in SceneCard
  };

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getScenes(newQuery, signal));
    },
    [execute]
  );

  const currentScenes = data?.scenes || [];

  const totalCount = data?.count || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    tvNavigation,
    gridNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentScenes,
    columns,
    totalPages,
    onItemSelect: handleSceneClick,
  });

  if (error) {
    return (
      <PageLayout>
        <PageHeader title={title} subtitle={subtitle} />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={title} subtitle={subtitle} />

      {initMessage && <SyncProgressBanner message={initMessage} />}

      <SearchControls
        artifactType="scene"
        context={context}
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        onPerPageStateChange={setEffectivePerPage}
        permanentFilters={effectivePermanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        deferInitialQueryUntilFiltersReady={currentViewMode === "timeline"}
        totalPages={totalPages}
        totalCount={totalCount}
        syncToUrl={syncToUrl}
        supportsWallView={true}
        wallPlayback={wallPlayback}
        onWallPlaybackChange={updateWallPlayback}
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
        contextSettings={contextSettings}
        onViewModeChange={setCurrentViewMode}
        {...searchControlsProps}
      >
        {({ viewMode, zoomLevel, gridDensity, sortField, sortDirection, onSort, timelinePeriod, setTimelinePeriod }) =>
          viewMode === "table" ? (
            <TableView
              items={currentScenes}
              columns={visibleColumns}
              sort={{ field: sortField, direction: sortDirection }}
              onSort={onSort}
              onHideColumn={hideColumn}
              entityType="scene"
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
              items={currentScenes}
              entityType="scene"
              zoomLevel={zoomLevel}
              playbackMode={wallPlayback}
              onItemClick={handleSceneClick}
              loading={isLoading}
              emptyMessage="No scenes found"
            />
          ) : viewMode === "timeline" ? (
            <TimelineView
              entityType="scene"
              items={currentScenes}
              renderItem={(scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onHideSuccess={handleHideSuccess}
                  fromPageTitle={fromPageTitle}
                  tabIndex={0}
                />
              )}
              onItemClick={handleSceneClick}
              onDateFilterChange={setTimelineDateFilter}
              onPeriodChange={setTimelinePeriod}
              initialPeriod={timelinePeriod}
              loading={isLoading}
              emptyMessage="No scenes found for this time period"
              gridDensity={gridDensity}
              filters={viewFilters}
            />
          ) : viewMode === "folder" ? (
            <FolderView
              items={currentScenes}
              tags={folderTags}
              gridDensity={gridDensity}
              loading={isLoading || tagsLoading}
              emptyMessage="No scenes found"
              onFolderPathChange={setFolderTagFilter}
              filters={viewFilters}
              renderItem={(scene) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  onHideSuccess={handleHideSuccess}
                  fromPageTitle={fromPageTitle}
                  tabIndex={0}
                />
              )}
            />
          ) : (
            <SceneGrid
              scenes={currentScenes || []}
              density={gridDensity}
              loading={isLoading}
              error={error}
              onSceneClick={handleSceneClick}
              onHideSuccess={handleHideSuccess}
              fromPageTitle={fromPageTitle}
              emptyMessage="No scenes found"
              emptyDescription="Try adjusting your search filters"
              enableKeyboard={true}
              isTVMode={isTVMode}
              tvGridZoneActive={isTVMode && tvNavigation.isZoneActive("grid")}
              gridNavigation={gridNavigation}
              gridItemProps={gridItemProps}
            />
          )
        }
      </SearchControls>
    </PageLayout>
  );
};

const getScenes = async (query, signal) => {
  const response = await libraryApi.findScenes(query, signal);

  // Extract scenes and count from server response structure
  const findScenes = response?.findScenes;
  const result = {
    scenes: findScenes?.scenes || [],
    count: findScenes?.count || 0,
  };
  return result;
};

export default SceneSearch;
