import React, { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getGridClasses } from "../../constants/grids";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { useGridColumns } from "../../hooks/useGridColumns";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation";
import { useTableColumns } from "../../hooks/useTableColumns";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { libraryApi, type LibrarySearchParams } from "../../api";
import { useTagList } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../api/queryKeys";
import { TagCard } from "../cards/index";
import { TagHierarchyView } from "../tags/index";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import { TableView, ColumnConfigPopover } from "../table/index";

// View modes for Tags page
const VIEW_MODES: { id: string; label: string }[] = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
  { id: "hierarchy", label: "Hierarchy view" },
];

const Tags = () => {
  usePageTitle("Tags");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
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

  const [queryParams, setQueryParams] = useState<LibrarySearchParams | null>(null);
  const { data, isLoading: queryLoading, error } = useTagList(queryParams);
  const initMessage =
    error instanceof ApiError && error.isInitializing
      ? "Server is syncing library, please wait..."
      : null;
  const isLoading = queryParams === null || queryLoading;

  // Separate query for hierarchy view (fetches all tags)
  const allTagsParams: LibrarySearchParams = {
    filter: { per_page: -1, sort: "name", direction: "ASC" },
  };
  const { data: hierarchyRaw, isLoading: hierarchyLoading } = useQuery({
    queryKey: queryKeys.tags.list(undefined, allTagsParams as Record<string, unknown>),
    queryFn: ({ signal }) => libraryApi.findTags(allTagsParams, signal),
    enabled: activeViewMode === "hierarchy",
  });

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams) => {
      setQueryParams(newQuery);
    },
    []
  );

  const findTags = (data as Record<string, unknown>)?.findTags as Record<string, unknown> | undefined;
  const currentTags = (findTags?.tags as Record<string, unknown>[]) || [];
  const totalCount = (findTags?.count as number) || 0;
  const hierarchyFindTags = (hierarchyRaw as Record<string, unknown>)?.findTags as Record<string, unknown> | undefined;
  const hierarchyTags = (hierarchyFindTags?.tags as unknown[]) || [];

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") ?? "24") || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentTags,
    columns,
    totalPages,
    onItemSelect: (tag) =>
      navigate(getEntityPath('tag', tag, hasMultipleInstances), {
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
           
          viewModes={VIEW_MODES as any}
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
          {(({ viewMode, gridDensity, sortField, sortDirection, onSort }: { viewMode: string; gridDensity: string; sortField: string; sortDirection: string; onSort: (field: string, direction: "ASC" | "DESC") => void }) => {
            // Hierarchy view
            if (viewMode === "hierarchy") {
              // Show loading if we don't have hierarchy data yet
              const showLoading = hierarchyLoading || !hierarchyRaw;
              return (
                <TagHierarchyView
                   
                  tags={hierarchyTags as any}
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
                  items={currentTags as Record<string, unknown>[]}
                  columns={visibleColumns as { id: string; label: string; sortable: boolean; width: string; mandatory: boolean }[]}
                  sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
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
                <div className={getGridClasses("standard", gridDensity)}>
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
              <div ref={gridRef} className={getGridClasses("standard", gridDensity)}>
                {currentTags.map((tag: Record<string, unknown>, index: number) => {
                  const { tabIndex: _tabIndex, ...restItemProps } = gridItemProps(index);
                  return (
                    <TagCard
                      key={tag.id as string}
                      tag={tag as unknown as import("@peek/shared-types").NormalizedTag & { child_count?: number }}
                      fromPageTitle="Tags"
                      tabIndex={isTVMode ? _tabIndex : -1}
                      {...restItemProps}
                    />
                  );
                })}
              </div>
            );
          }) as unknown as React.ReactNode}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default Tags;
