import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useGridColumns } from "../../hooks/useGridColumns";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { type LibrarySearchParams } from "../../api";
import { useSceneList } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import {
  SceneCard,
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import { TableView, ColumnConfigPopover } from "../table/index";
import SceneGrid from "./SceneGrid";
import WallView from "../wall/WallView";
import TimelineView from "../timeline/TimelineView";
import { FolderView } from "../folder/index";
import { useFolderViewTags } from "../../hooks/useFolderViewTags";

// View modes available for scene search
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
] as const;

// Context settings for wall view preview behavior
const WALL_VIEW_SETTINGS = [
  {
    key: "wallPlayback",
    label: "Preview Behavior",
    type: "select" as const,
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
interface SceneSearchProps {
  context?: string;
  initialSort?: string;
  permanentFilters?: Record<string, Record<string, unknown>>;
  permanentFiltersMetadata?: Record<string, unknown>;
  subtitle?: string;
  title?: string;
  fromPageTitle?: string;
  syncToUrl?: boolean;
}

const SceneSearch = ({
  context, // Optional context for filter preset defaults (scene_performer, scene_tag, etc.)
  initialSort = "o_counter",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  fromPageTitle,
  syncToUrl = true, // Whether to sync pagination/filters to URL
}: SceneSearchProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();

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

  const [queryParams, setQueryParams] = useState<LibrarySearchParams | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading: queryLoading, error } = useSceneList(queryParams);
  const initMessage =
    error instanceof ApiError && error.isInitializing
      ? "Server is syncing library, please wait..."
      : null;
  const isLoading = queryParams === null || queryLoading;

  // Track current view mode for context settings
  // Initialize from URL to stay in sync with useFilterState on back navigation
  const [currentViewMode, setCurrentViewMode] = useState(
    searchParams.get("view") || "grid"
  );

  // Extract filter IDs for timeline/folder views
  const viewFilters = useMemo(() => {
    const filters: Record<string, string> = {};

    // Extract performer ID
    if ((permanentFilters.performers?.value as unknown[] | undefined)?.length) {
      filters.performerId = String((permanentFilters.performers.value as unknown[])[0]);
    }

    // Extract tag ID
    if ((permanentFilters.tags?.value as unknown[] | undefined)?.length) {
      filters.tagId = String((permanentFilters.tags.value as unknown[])[0]);
    }

    // Extract studio ID
    if ((permanentFilters.studios?.value as unknown[] | undefined)?.length) {
      filters.studioId = String((permanentFilters.studios.value as unknown[])[0]);
    }

    // Extract group ID
    if ((permanentFilters.groups?.value as unknown[] | undefined)?.length) {
      filters.groupId = String((permanentFilters.groups.value as unknown[])[0]);
    }

    return Object.keys(filters).length > 0 ? filters : null;
  }, [permanentFilters]);

  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder",
    viewFilters
  );

  // Track timeline date filter for filtering by selected period
  const [timelineDateFilter, setTimelineDateFilter] = useState<Record<string, unknown> | null>(null);

  // Track folder tag filter for filtering by selected folder
  const [folderTagFilter, setFolderTagFilter] = useState<string | null>(null);

  // Merge timeline/folder filters into permanent filters based on view mode
  const effectivePermanentFilters = useMemo(() => {
    const filters: Record<string, unknown> = { ...permanentFilters };

    // Add timeline date filter when in timeline view
    if (currentViewMode === "timeline" && timelineDateFilter) {
      filters.date = timelineDateFilter;
    }

    // Add folder tag filter when in folder view
    // Use depth: 0 to get only scenes directly tagged with this folder (not children)
    // Child folders are shown from tag hierarchy, scenes paginate separately
    if (currentViewMode === "folder" && folderTagFilter) {
      filters.tags = {
        value: [folderTagFilter],
        modifier: "INCLUDES",
        depth: 0, // Exact tag match only - don't include child tags
      };
    }

    return filters;
  }, [permanentFilters, currentViewMode, timelineDateFilter, folderTagFilter]);

  // Context settings only shown in wall view
  const contextSettings = useMemo(() => {
    return currentViewMode === "wall" ? WALL_VIEW_SETTINGS : [];
  }, [currentViewMode]);

  // Handle successful hide - remove scene from cache
  const handleHideSuccess = (sceneId: string) => {
    if (!queryParams) return;
    const qk = queryKeys.scenes.list(undefined, (queryParams ?? {}) as Record<string, unknown>);
    queryClient.setQueryData(qk, (old: unknown) => {
      if (!old || typeof old !== "object") return old;
      const oldData = old as Record<string, unknown>;
      const fs = oldData.findScenes as Record<string, unknown> | undefined;
      if (!fs?.scenes) return old;
      return {
        ...oldData,
        findScenes: {
          ...fs,
          scenes: (fs.scenes as unknown[]).filter((s: unknown) => (s as Record<string, unknown>).id !== sceneId),
          count: Math.max(0, ((fs.count as number) || 0) - 1),
        },
      };
    });
  };

  const handleSceneClick = (scene: Record<string, unknown>) => {
    // Navigate to video player page with scene data and virtual playlist context
    const findScenes = (data as Record<string, unknown>)?.findScenes as Record<string, unknown> | undefined;
    const currentScenes = (findScenes?.scenes as Record<string, unknown>[]) || [];
    const currentIndex = currentScenes.findIndex((s: Record<string, unknown>) => s.id === scene.id);

    // Build navigation state
    const navigationState: Record<string, unknown> = {
      scene,
      playlist: {
        id: "virtual-grid",
        name: title || "Scene Grid",
        shuffle: false,
        repeat: "none",
        scenes: currentScenes.map((s: Record<string, unknown>, idx: number) => ({
          sceneId: s.id,
          instanceId: s.instanceId,
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

    navigate(getEntityPath('scene', scene, hasMultipleInstances), { state: navigationState });
    return true; // Prevent fallback navigation in SceneCard
  };

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams) => {
      setQueryParams(newQuery);
    },
    []
  );

  const findScenesData = (data as Record<string, unknown>)?.findScenes as Record<string, unknown> | undefined;
  const currentScenes = (findScenesData?.scenes as Record<string, unknown>[]) || [];

  const totalCount = (findScenesData?.count as number) || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") || "24")
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
        <PageHeader title={title ?? ""} subtitle={subtitle} />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={title ?? ""} subtitle={subtitle} />

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
        viewModes={VIEW_MODES as unknown as React.ComponentProps<typeof SearchControls>["viewModes"]}
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
        contextSettings={contextSettings as React.ComponentProps<typeof SearchControls>["contextSettings"]}
        onViewModeChange={setCurrentViewMode}
        {...searchControlsProps}
      >
        {(({ viewMode, zoomLevel, gridDensity, sortField, sortDirection, onSort, timelinePeriod, setTimelinePeriod }: { viewMode: string; zoomLevel: string; gridDensity: string; sortField: string; sortDirection: string; onSort: (field: string, direction: string) => void; timelinePeriod: string | null; setTimelinePeriod: (period: string | null) => void }) =>
          viewMode === "table" ? (
            <TableView
              items={currentScenes as React.ComponentProps<typeof TableView>["items"]}
              columns={visibleColumns as React.ComponentProps<typeof TableView>["columns"]}
              sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
              onSort={onSort as React.ComponentProps<typeof TableView>["onSort"]}
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
              zoomLevel={zoomLevel as "small" | "medium" | "large"}
              playbackMode={wallPlayback as "autoplay" | "hover" | "static"}
              onItemClick={handleSceneClick}
              loading={isLoading}
              emptyMessage="No scenes found"
            />
          ) : viewMode === "timeline" ? (
            <TimelineView
              entityType="scene"
              items={currentScenes}
              renderItem={(scene: Record<string, unknown>) => (
                <SceneCard
                  key={scene.id as string}
                  scene={scene as unknown as React.ComponentProps<typeof SceneCard>["scene"]}
                  onHideSuccess={handleHideSuccess}
                  fromPageTitle={fromPageTitle}
                  tabIndex={0}
                />
              )}
              onItemClick={handleSceneClick}
              onDateFilterChange={setTimelineDateFilter as unknown as React.ComponentProps<typeof TimelineView>["onDateFilterChange"]}
              onPeriodChange={setTimelinePeriod}
              initialPeriod={timelinePeriod as React.ComponentProps<typeof TimelineView>["initialPeriod"]}
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
              renderItem={(scene: Record<string, unknown>) => (
                <SceneCard
                  key={scene.id as string}
                  scene={scene as unknown as React.ComponentProps<typeof SceneCard>["scene"]}
                  onHideSuccess={handleHideSuccess}
                  fromPageTitle={fromPageTitle}
                  tabIndex={0}
                />
              )}
            />
          ) : (
            <SceneGrid
              scenes={currentScenes as unknown as React.ComponentProps<typeof SceneGrid>["scenes"]}
              density={gridDensity}
              loading={isLoading}
              error={error}
              onSceneClick={handleSceneClick as unknown as React.ComponentProps<typeof SceneGrid>["onSceneClick"]}
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
        ) as unknown as React.ReactNode}
      </SearchControls>
    </PageLayout>
  );
};

export default SceneSearch;
