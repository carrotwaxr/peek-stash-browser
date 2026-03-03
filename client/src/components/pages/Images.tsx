import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getGridClasses } from "../../constants/grids";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { useGridColumns } from "../../hooks/useGridColumns";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation";
import { usePaginatedLightbox } from "../../hooks/usePaginatedLightbox";
import { useWallPlayback } from "../../hooks/useWallPlayback";
import { useTableColumns } from "../../hooks/useTableColumns";
import { type LibrarySearchParams } from "../../api";
import { useImageList } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ImageCard } from "../cards/index";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import Lightbox from "../ui/Lightbox";
import WallView from "../wall/WallView";
import TimelineView from "../timeline/TimelineView";
import { TableView, ColumnConfigPopover } from "../table/index";
import { FolderView } from "../folder/index";
import { useFolderViewTags } from "../../hooks/useFolderViewTags";

// View modes available for images page
const VIEW_MODES: { id: string; label: string }[] = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];

const Images = () => {
  usePageTitle("Images");
  const [searchParams] = useSearchParams();
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns("images");
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
  } = useTableColumns("image");

  // Track current view mode for timeline date filter and folder view
  // Initialize from URL to stay in sync with useFilterState on back navigation
  const [currentViewMode, setCurrentViewMode] = useState(
    searchParams.get("view") || "grid"
  );

  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder"
  );

  // Track timeline date filter for filtering by selected period
  const [timelineDateFilter, setTimelineDateFilter] = useState<{ start: string; end: string } | null>(null);

  // Track folder tag filter for filtering by selected folder
  const [folderTagFilter, setFolderTagFilter] = useState<string | null>(null);

  // Merge timeline/folder filters into permanent filters based on view mode
  const effectivePermanentFilters = useMemo(() => {
    let filters: Record<string, unknown> = {};

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

  // Extract URL pagination params early (needed for hooks)
  const urlPerPage = parseInt(searchParams.get("per_page") ?? "24") || 24;
  const urlPage = parseInt(searchParams.get("page") ?? "1") || 1;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(urlPerPage);

  // Ref to expose SearchControls pagination handler for external use
  const paginationHandlerRef = useRef<((page: number) => void) | null>(null);

  // Ref to store the lightbox consumePendingLightboxIndex function
  const consumePendingLightboxIndexRef = useRef<(() => void) | null>(null);

  // TanStack Query for images
  const [queryParams, setQueryParams] = useState<LibrarySearchParams | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading: queryLoading, error } = useImageList(queryParams);
  const initMessage =
    error instanceof ApiError && error.isInitializing
      ? "Server is syncing library, please wait..."
      : null;
  const isLoading = queryParams === null || queryLoading;

  // Consume pending lightbox index when new data arrives
  const prevDataRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (data !== undefined && data !== prevDataRef.current) {
      prevDataRef.current = data;
      consumePendingLightboxIndexRef.current?.();
    }
  }, [data]);

  const findImages = (data as Record<string, unknown>)?.findImages as Record<string, unknown> | undefined;
  const currentImages = useMemo(() => (findImages?.images as Record<string, unknown>[]) || [], [findImages?.images]);
  const totalCount = (findImages?.count as number) || 0;
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;
  const pageOffset = (urlPage - 1) * urlPerPage;

  // Paginated lightbox with external pagination (synced to URL)
  const lightbox = usePaginatedLightbox({
    perPage: urlPerPage,
    totalCount,
    externalPage: urlPage,
    onExternalPageChange: (newPage) => {
      // Delegate to SearchControls pagination handler
      if (paginationHandlerRef.current) {
        paginationHandlerRef.current(newPage);
      }
    },
  });

  // Destructure for stable references in callbacks
  const { openLightbox } = lightbox;

  // Store the consume function in ref for the onDataChange callback
  consumePendingLightboxIndexRef.current = lightbox.consumePendingLightboxIndex;

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams) => {
      setQueryParams(newQuery);
    },
    []
  );

  // Handle image click - open lightbox
  const handleImageClick = useCallback(
    (image: Record<string, unknown>) => {
      const index = currentImages.findIndex((img: Record<string, unknown>) => img.id === image.id);
      openLightbox(index >= 0 ? index : 0);
    },
    [currentImages, openLightbox]
  );

  // Helper to optimistically update image data in the query cache
  const updateImageInCache = useCallback(
    (imageId: string, updates: Record<string, unknown>) => {
      if (!queryParams) return;
      const qk = queryKeys.images.list(undefined, (queryParams ?? {}) as Record<string, unknown>);
      queryClient.setQueryData(qk, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldData = old as Record<string, unknown>;
        const fi = oldData.findImages as Record<string, unknown> | undefined;
        if (!fi?.images) return old;
        return {
          ...oldData,
          findImages: {
            ...fi,
            images: (fi.images as unknown[]).map((img: unknown) => {
              const i = img as Record<string, unknown>;
              return i.id === imageId ? { ...i, ...updates } : i;
            }),
          },
        };
      });
    },
    [queryClient, queryParams]
  );

  // Handle O counter change from card - update local state
  const handleOCounterChange = useCallback((imageId: string, newCount: number) => {
    updateImageInCache(imageId, { oCounter: newCount });
  }, [updateImageInCache]);

  // Handle rating change from card - update local state
  const handleRatingChange = useCallback((imageId: string, newRating: number | null) => {
    updateImageInCache(imageId, { rating100: newRating });
  }, [updateImageInCache]);

  // Handle favorite change from card - update local state
  const handleFavoriteChange = useCallback((imageId: string, newFavorite: boolean) => {
    updateImageInCache(imageId, { favorite: newFavorite });
  }, [updateImageInCache]);

  // TV Navigation - use shared hook for all grid pages
  // Note: We use our own paginationHandlerRef for lightbox cross-page navigation
  const {
    isTVMode,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentImages,
    columns,
    totalPages,
    onItemSelect: handleImageClick,
  });

  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentImages.length > 0 && isTVMode
  );

  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Images" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Images"
          subtitle="Browse all images in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        <SearchControls
          artifactType="image"
          initialSort="created_at"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          permanentFilters={effectivePermanentFilters}
          deferInitialQueryUntilFiltersReady={currentViewMode === "timeline"}
          totalPages={totalPages}
          totalCount={totalCount}
          supportsWallView={true}
          wallPlayback={wallPlayback}
           
          viewModes={VIEW_MODES as any}
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
          paginationHandlerRef={paginationHandlerRef}
        >
          {(({ viewMode, gridDensity, zoomLevel, sortField, sortDirection, onSort, timelinePeriod, setTimelinePeriod }: { viewMode: string; gridDensity: string; zoomLevel: number; sortField: string; sortDirection: string; onSort: (field: string, direction: "ASC" | "DESC") => void; timelinePeriod: string; setTimelinePeriod: (period: string) => void }) =>
            viewMode === "table" ? (
              <TableView
                items={currentImages as Record<string, unknown>[]}
                columns={visibleColumns as { id: string; label: string; sortable: boolean; width: string; mandatory: boolean }[]}
                sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
                onSort={onSort}
                onHideColumn={hideColumn}
                entityType="image"
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
                items={currentImages as Record<string, unknown>[]}
                entityType="image"
                zoomLevel={zoomLevel as unknown as "small" | "medium" | "large"}
                playbackMode={wallPlayback as "static" | "autoplay" | "hover"}
                onItemClick={handleImageClick}
                loading={isLoading}
                emptyMessage="No images found"
              />
            ) : viewMode === "timeline" ? (
              <TimelineView
                entityType="image"
                items={currentImages as Record<string, unknown>[]}
                renderItem={(image: Record<string, unknown>, index: number, { onItemClick }: { onItemClick?: (item: Record<string, unknown>) => void }) => (
                  <ImageCard
                    key={image.id as string}
                    image={image as unknown as import("@peek/shared-types").NormalizedImage}
                    onClick={() => onItemClick?.(image)}
                    fromPageTitle="Images"
                    tabIndex={0}
                    onOCounterChange={handleOCounterChange}
                    onRatingChange={handleRatingChange}
                    onFavoriteChange={handleFavoriteChange}
                  />
                )}
                onItemClick={handleImageClick}
                onDateFilterChange={setTimelineDateFilter}
                onPeriodChange={setTimelinePeriod as (period: string | null) => void}
                initialPeriod={timelinePeriod}
                loading={isLoading}
                emptyMessage="No images found for this time period"
                gridDensity={gridDensity}
              />
            ) : viewMode === "folder" ? (
              <FolderView
                items={currentImages as Record<string, unknown>[]}
                tags={folderTags}
                gridDensity={gridDensity}
                loading={isLoading || tagsLoading}
                emptyMessage="No images found"
                onFolderPathChange={setFolderTagFilter}
                renderItem={(image: Record<string, unknown>) => (
                  <ImageCard
                    key={image.id as string}
                    image={image as unknown as import("@peek/shared-types").NormalizedImage}
                    onClick={() => handleImageClick(image)}
                    fromPageTitle="Images"
                    tabIndex={0}
                    onOCounterChange={handleOCounterChange}
                    onRatingChange={handleRatingChange}
                    onFavoriteChange={handleFavoriteChange}
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
                      height: "16rem",
                    }}
                  />
                ))}
              </div>
            ) : (
              <div ref={gridRef} className={getGridClasses("standard", gridDensity)}>
                {currentImages.map((image: Record<string, unknown>, index: number) => {
                  const { tabIndex: _tabIndex, ...restItemProps } = gridItemProps(index);
                  return (
                    <ImageCard
                      key={image.id as string}
                      image={image as unknown as import("@peek/shared-types").NormalizedImage}
                      onClick={() => handleImageClick(image as Record<string, unknown>)}
                      fromPageTitle="Images"
                      tabIndex={isTVMode ? _tabIndex : -1}
                      onOCounterChange={handleOCounterChange}
                      onRatingChange={handleRatingChange}
                      onFavoriteChange={handleFavoriteChange}
                      {...restItemProps}
                    />
                  );
                })}
              </div>
            )
          ) as unknown as React.ReactNode}
        </SearchControls>

        {/* Lightbox for viewing images */}
        {currentImages.length > 0 && (
          <Lightbox
            isOpen={lightbox.lightboxOpen}
            images={currentImages.map((img: Record<string, unknown>) => {
              const paths = img.paths as Record<string, string> | undefined;
              return {
                ...(img as Record<string, unknown>),
                paths: {
                  image: paths?.image || `/api/proxy/image/${img.id as string}/image`,
                  preview: paths?.preview || paths?.thumbnail,
                  thumbnail: paths?.thumbnail || `/api/proxy/image/${img.id as string}/thumbnail`,
                },
                oCounter: (img.oCounter as number) ?? 0,
              };
            }) as unknown as import("@peek/shared-types").NormalizedImage[]}
            initialIndex={lightbox.lightboxIndex}
            onClose={lightbox.closeLightbox}
            onImagesUpdate={(updatedImages) => {
              // Sync updated images back to cache
              if (!queryParams) return;
              const qk = queryKeys.images.list(undefined, (queryParams ?? {}) as Record<string, unknown>);
              queryClient.setQueryData(qk, (old: unknown) => {
                if (!old || typeof old !== "object") return old;
                const oldData = old as Record<string, unknown>;
                const fi = oldData.findImages as Record<string, unknown> | undefined;
                if (!fi?.images) return old;
                return {
                  ...oldData,
                  findImages: {
                    ...fi,
                    images: (fi.images as unknown[]).map((img: unknown) => {
                      const i = img as Record<string, unknown>;
                      const updated = updatedImages.find((u) => u.id === i.id);
                      return updated ? { ...i, ...updated } : i;
                    }),
                  },
                };
              });
            }}
            // Cross-page navigation support
            onPageBoundary={lightbox.onPageBoundary}
            totalCount={totalCount}
            pageOffset={pageOffset}
            onIndexChange={lightbox.onIndexChange}
            isPageTransitioning={lightbox.isPageTransitioning}
            transitionKey={lightbox.transitionKey}
          />
        )}
      </div>
    </PageLayout>
  );
};

export default Images;
