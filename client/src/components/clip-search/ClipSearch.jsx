import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { useWallPlayback } from "../../hooks/useWallPlayback.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import { getClips } from "../../services/api.js";
import {
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";
import WallView from "../wall/WallView.jsx";
import ClipGrid from "./ClipGrid.jsx";

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

  const { data, isLoading, error, execute } = useCancellableQuery();

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

  const currentClips = data?.clips || [];
  const totalCount = data?.total || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  /**
   * Handle query changes from SearchControls
   * Converts the GraphQL-style query to Peek REST API params
   */
  const handleQueryChange = useCallback(
    (query) => {
      execute(async () => {
        // Extract filter values from the clip_filter
        const clipFilter = query.clip_filter || {};

        // Build API params
        const params = {
          page: query.filter?.page || 1,
          perPage: query.filter?.per_page || 24,
          sortBy: query.filter?.sort || "stashCreatedAt",
          sortDir: query.filter?.direction?.toLowerCase() || "desc",
          q: query.filter?.q || undefined,
        };

        // Handle isGenerated filter
        if (clipFilter.isGenerated !== undefined) {
          params.isGenerated = clipFilter.isGenerated;
        }

        // Handle tag IDs filter
        if (clipFilter.tagIds && clipFilter.tagIds.length > 0) {
          params.tagIds = clipFilter.tagIds;
        }

        // Handle scene tag IDs filter
        if (clipFilter.sceneTagIds && clipFilter.sceneTagIds.length > 0) {
          params.sceneTagIds = clipFilter.sceneTagIds;
        }

        // Handle performer IDs filter
        if (clipFilter.performerIds && clipFilter.performerIds.length > 0) {
          params.performerIds = clipFilter.performerIds;
        }

        // Handle studio ID filter
        if (clipFilter.studioId) {
          params.studioId = clipFilter.studioId;
        }

        // Merge permanent filters
        if (permanentFilters.sceneId) {
          params.sceneId = permanentFilters.sceneId;
        }

        const result = await getClips(params);
        return result;
      });
    },
    [execute, permanentFilters]
  );

  const handleClipClick = (clip) => {
    navigate(`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`, {
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
