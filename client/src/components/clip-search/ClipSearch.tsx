import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useConfig } from "../../contexts/ConfigContext";
import { getScenePathWithTime } from "../../utils/entityLinks";
import { getClips, type GetClipsOptions } from "../../api";
import { queryKeys } from "../../api/queryKeys";
import {
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import { TableView, ColumnConfigPopover } from "../table/index";
import WallView from "../wall/WallView";
import ClipGrid from "./ClipGrid";

// View modes available for clip search
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
];

/**
 * ClipSearch - Search component for clips
 * Uses SearchControls for consistent UI with other entity search pages
 */
const ClipSearch = ({
  context = "clip",
  initialSort = "stashCreatedAt",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  fromPageTitle,
  syncToUrl = true,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();

  // Clip query params (set when SearchControls calls onQueryChange)
  const [clipQueryParams, setClipQueryParams] = useState<GetClipsOptions | null>(null);
  const { data, isLoading: queryLoading, error } = useQuery({
    queryKey: queryKeys.clips.list((clipQueryParams ?? {}) as Record<string, unknown>),
    queryFn: () => getClips(clipQueryParams!),
    enabled: clipQueryParams !== null,
  });
  const isLoading = clipQueryParams === null || queryLoading;

  // Wall playback preference
  const { wallPlayback, updateWallPlayback } = useWallPlayback();

  // Table columns for table view
  const {
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
  } = useTableColumns("clip");

  // Track effective perPage from SearchControls state
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );

  const currentClips = (data as Record<string, unknown>)?.clips as unknown[] || [];
  const totalCount = (data as Record<string, unknown>)?.total as number || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  /**
   * Handle query changes from SearchControls
   * Converts the GraphQL-style query to Peek REST API params
   */
  const handleQueryChange = useCallback(
    (query: Record<string, unknown>) => {
      const filter = query.filter as Record<string, unknown> | undefined;
      const clipFilter = (query.clip_filter || {}) as Record<string, unknown>;

      // Build API params
      const params: GetClipsOptions = {
        page: (filter?.page as number) || 1,
        perPage: (filter?.per_page as number) || 24,
        sortBy: (filter?.sort as string) || "stashCreatedAt",
        sortDir: (filter?.direction as string)?.toLowerCase() || "desc",
        q: (filter?.q as string) || undefined,
      };

      // Handle isGenerated filter
      if (clipFilter.isGenerated !== undefined) {
        params.isGenerated = clipFilter.isGenerated as boolean;
      }

      // Handle tag IDs filter
      if (clipFilter.tagIds && (clipFilter.tagIds as string[]).length > 0) {
        params.tagIds = clipFilter.tagIds as string[];
      }

      // Handle scene tag IDs filter
      if (clipFilter.sceneTagIds && (clipFilter.sceneTagIds as string[]).length > 0) {
        params.sceneTagIds = clipFilter.sceneTagIds as string[];
      }

      // Handle performer IDs filter
      if (clipFilter.performerIds && (clipFilter.performerIds as string[]).length > 0) {
        params.performerIds = clipFilter.performerIds as string[];
      }

      // Handle studio ID filter
      if (clipFilter.studioId) {
        params.studioId = clipFilter.studioId as string;
      }

      // Merge permanent filters
      if ((permanentFilters as Record<string, unknown>).sceneId) {
        params.sceneId = (permanentFilters as Record<string, unknown>).sceneId as string;
      }

      setClipQueryParams(params);
    },
    [permanentFilters]
  );

  const handleClipClick = (clip) => {
    navigate(getScenePathWithTime({ id: clip.sceneId, instanceId: clip.instanceId }, clip.seconds, hasMultipleInstances), {
      state: { fromPageTitle, shouldAutoplay: true },
    });
  };

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

      <SearchControls
        artifactType="clip"
        context={context}
        initialSort={initialSort}
        onQueryChange={handleQueryChange}
        onPerPageStateChange={setEffectivePerPage}
        permanentFilters={permanentFilters}
        permanentFiltersMetadata={permanentFiltersMetadata}
        totalPages={totalPages}
        totalCount={totalCount}
        syncToUrl={syncToUrl}
        supportsWallView={true}
        viewModes={VIEW_MODES}
        wallPlayback={wallPlayback}
        onWallPlaybackChange={updateWallPlayback}
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
        {({ viewMode, zoomLevel, gridDensity }) =>
          viewMode === "table" ? (
            <TableView
              items={currentClips}
              columns={visibleColumns}
              sort={{ field: "stashCreatedAt", direction: "desc" }}
              onHideColumn={hideColumn}
              entityType="clip"
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
              items={currentClips}
              entityType="clip"
              zoomLevel={zoomLevel}
              playbackMode={wallPlayback}
              onItemClick={handleClipClick}
              loading={isLoading}
              emptyMessage="No clips found"
            />
          ) : (
            <ClipGrid
              clips={currentClips}
              density={gridDensity}
              loading={isLoading}
              onClipClick={handleClipClick}
              fromPageTitle={fromPageTitle}
              emptyMessage="No clips found"
              emptyDescription="Try adjusting your search filters"
            />
          )
        }
      </SearchControls>
    </PageLayout>
  );
};

export default ClipSearch;
