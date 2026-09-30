import React, { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NormalizedTag } from "@peek/shared-types";
import type { LibrarySearchParams } from "../../api";
import { useTagList, useTagTree } from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { TagCard } from "../cards/index";
import { ColumnConfigPopover, TableView } from "../table/index";
import { TagHierarchyView } from "../tags/index";
import {
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";

// View modes for Tags page
const VIEW_MODES: { id: string; label: string }[] = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
  { id: "hierarchy", label: "Hierarchy view" },
];

const Tags = () => {
  usePageTitle("Tags");
  const [searchParams] = useSearchParams();

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

  const [queryParams, setQueryParams] =
    useState<LibrarySearchParams<"tag"> | null>(null);
  const {
    data,
    isLoading: queryLoading,
    error,
    isPlaceholderData,
  } = useTagList(queryParams);
  // The library is on its first sync: the notice, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = queryParams === null || queryLoading || initializing;

  // The compact tag tree for the hierarchy view, fetched only there
  const {
    data: hierarchyData,
    isLoading: hierarchyLoading,
    error: hierarchyError,
    refetch: refetchHierarchy,
  } = useTagTree(undefined, activeViewMode === "hierarchy");

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams<"tag">) => {
      setQueryParams(newQuery);
    },
    []
  );

  const findTags = (data as Record<string, unknown>)?.findTags as
    | Record<string, unknown>
    | undefined;
  const currentTags = (findTags?.tags as Record<string, unknown>[]) || [];
  const totalCount = (findTags?.count as number) || 0;
  const hierarchyTags = hierarchyData?.tags ?? [];

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") ?? "24") || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  if (error && !initializing) {
    return (
      <PageLayout>
        <PageHeader title="Tags" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <PageHeader title="Tags" subtitle="Browse tags in your library" />

        <LibraryInitializingBanner />

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
          isRefreshing={isPlaceholderData}
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
        >
          {
            (({
              viewMode,
              gridDensity,
              sortField,
              sortDirection,
              onSort,
            }: {
              viewMode: string;
              gridDensity: string;
              sortField: string;
              sortDirection: string;
              onSort: (field: string, direction: "ASC" | "DESC") => void;
            }) => {
              // Hierarchy view
              if (viewMode === "hierarchy") {
                if (hierarchyError && !isLibraryInitializing(hierarchyError)) {
                  return (
                    <ErrorMessage
                      error={hierarchyError}
                      onRetry={() => void refetchHierarchy()}
                    />
                  );
                }
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
                <div className={getGridClasses("standard", gridDensity)}>
                  {currentTags.map((tag: Record<string, unknown>) => (
                    <TagCard
                      key={tag.id as string}
                      tag={
                        tag as unknown as NormalizedTag & {
                          child_count?: number;
                        }
                      }
                      fromPageTitle="Tags"
                    />
                  ))}
                </div>
              );
            }) as unknown as React.ReactNode
          }
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default Tags;
