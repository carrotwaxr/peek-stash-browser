import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { skipToken, useQuery } from "@tanstack/react-query";
import { type GetClipsOptions, getClips } from "../../api";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { queryKeys } from "../../api/queryKeys";
import { useConfig } from "../../contexts/ConfigContext";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { getScenePathWithTime } from "../../utils/entityLinks";
import { ColumnConfigPopover, TableView } from "../table/index";
import {
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
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
interface ClipSearchProps {
  context?: string;
  initialSort?: string;
  permanentFilters?: Record<string, unknown>;
  permanentFiltersMetadata?: Record<string, unknown>;
  subtitle?: string;
  title?: string;
  fromPageTitle?: string;
  syncToUrl?: boolean;
}

const ClipSearch = ({
  context = "clip",
  initialSort = "stashCreatedAt",
  permanentFilters = {},
  permanentFiltersMetadata = {},
  subtitle,
  title,
  fromPageTitle,
  syncToUrl = true,
}: ClipSearchProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();

  // Clip query params (set when SearchControls calls onQueryChange)
  const [clipQueryParams, setClipQueryParams] =
    useState<GetClipsOptions | null>(null);
  const {
    data,
    isLoading: queryLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.clips.list(
      (clipQueryParams ?? {}) as Record<string, unknown>
    ),
    queryFn:
      clipQueryParams === null ? skipToken : () => getClips(clipQueryParams),
  });
  // The library is on its first sync: the notice, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = clipQueryParams === null || queryLoading || initializing;

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
    parseInt(searchParams.get("per_page") ?? "24")
  );

  const currentClips =
    ((data as Record<string, unknown>)?.clips as unknown[]) || [];
  const totalCount = ((data as Record<string, unknown>)?.total as number) || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  /**
   * Handle query changes from SearchControls: the page's paging, sort and
   * search, and every parameter the panel built (`buildClipFilter`, the
   * modifiers included), as `getClips` sends them
   */
  const handleQueryChange = useCallback(
    (query: Record<string, unknown>) => {
      const filter = query.filter as Record<string, unknown> | undefined;
      // buildClipFilter's parameters (ClipFilterParams, a part of the options)
      const clipFilter = (query.clip_filter ?? {}) as GetClipsOptions;
      const direction = (
        filter?.direction as string | undefined
      )?.toLowerCase();

      const params: GetClipsOptions = {
        ...clipFilter,
        page: (filter?.page as number) || 1,
        perPage: (filter?.per_page as number) || 24,
        sortBy: ((filter?.sort as string) ||
          "stashCreatedAt") as GetClipsOptions["sortBy"],
        sortDir: direction === "asc" ? "asc" : "desc",
        q: (filter?.q as string) || undefined,
      };

      // Merge permanent filters
      if (permanentFilters.sceneId) {
        params.sceneId = permanentFilters.sceneId as string;
      }

      setClipQueryParams(params);
    },
    [permanentFilters]
  );

  const handleClipClick = (clip: Record<string, unknown>) => {
    void navigate(
      getScenePathWithTime(
        {
          id: clip.sceneId as string,
          instanceId: clip.instanceId as string | undefined,
        } as Record<string, unknown>,
        clip.seconds as number,
        hasMultipleInstances
      ),
      {
        state: { fromPageTitle, shouldAutoplay: true },
      }
    );
  };

  if (error && !initializing) {
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

      <LibraryInitializingBanner />

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
        viewModes={
          VIEW_MODES as React.ComponentProps<typeof SearchControls>["viewModes"]
        }
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
        {
          (({
            viewMode,
            zoomLevel,
            gridDensity,
          }: {
            viewMode: string;
            zoomLevel: string;
            gridDensity: string;
          }) =>
            viewMode === "table" ? (
              <TableView
                items={currentClips as Record<string, unknown>[]}
                columns={visibleColumns}
                sort={{ field: "stashCreatedAt", direction: "DESC" }}
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
                items={currentClips as Record<string, unknown>[]}
                entityType="clip"
                zoomLevel={zoomLevel as "small" | "medium" | "large"}
                playbackMode={wallPlayback as "autoplay" | "hover" | "static"}
                onItemClick={handleClipClick}
                loading={isLoading}
                emptyMessage="No clips found"
              />
            ) : (
              <ClipGrid
                clips={currentClips as Record<string, unknown>[]}
                density={gridDensity}
                loading={isLoading}
                onClipClick={
                  handleClipClick as React.ComponentProps<
                    typeof ClipGrid
                  >["onClipClick"]
                }
                fromPageTitle={fromPageTitle}
                emptyMessage="No clips found"
                emptyDescription="Try adjusting your search filters"
              />
            )) as unknown as React.ReactNode
        }
      </SearchControls>
    </PageLayout>
  );
};

export default ClipSearch;
