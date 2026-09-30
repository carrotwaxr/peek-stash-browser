import React, { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NormalizedPerformer } from "@peek/shared-types";
import { type LibrarySearchParams } from "../../api";
import { usePerformerList } from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { ColumnConfigPopover, TableView } from "../table/index";
import {
  ErrorMessage,
  LibraryInitializingBanner,
  PageHeader,
  PageLayout,
  PerformerCard,
  SearchControls,
} from "../ui/index";

// View modes available for performers page
const VIEW_MODES: { id: string; label: string }[] = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
];

const Performers = () => {
  usePageTitle("Performers");
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
  } = useTableColumns("performer");

  const [queryParams, setQueryParams] =
    useState<LibrarySearchParams<"performer"> | null>(null);
  const {
    data,
    isLoading: queryLoading,
    error,
    isPlaceholderData,
  } = usePerformerList(queryParams);
  // The library is on its first sync: the notice, not the error page
  const initializing = isLibraryInitializing(error);
  const isLoading = queryParams === null || queryLoading || initializing;

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams<"performer">) => {
      setQueryParams(newQuery);
    },
    []
  );

  const findPerformers = (data as Record<string, unknown>)?.findPerformers as
    | Record<string, unknown>
    | undefined;
  const currentPerformers =
    (findPerformers?.performers as Record<string, unknown>[]) || [];
  const totalCount = (findPerformers?.count as number) || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") ?? "24") || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  if (error && !initializing) {
    return (
      <PageLayout>
        <PageHeader title="Performers" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <PageHeader
          title="Performers"
          subtitle="Browse performers in your library"
        />

        <LibraryInitializingBanner />

        {/* Controls Section */}
        <SearchControls
          artifactType="performer"
          isRefreshing={isPlaceholderData}
          initialSort="o_counter"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          totalPages={totalPages}
          totalCount={totalCount}
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
            }) =>
              isLoading ? (
                viewMode === "table" ? (
                  <TableView
                    items={[]}
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
                    entityType="performer"
                    isLoading={true}
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
                ) : (
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
                )
              ) : viewMode === "table" ? (
                <TableView
                  items={currentPerformers}
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
                  entityType="performer"
                  isLoading={false}
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
              ) : (
                <div className={getGridClasses("standard", gridDensity)}>
                  {currentPerformers.map(
                    (performer: Record<string, unknown>) => (
                      <PerformerCard
                        key={performer.id as string}
                        performer={performer as unknown as NormalizedPerformer}
                        fromPageTitle="Performers"
                      />
                    )
                  )}
                </div>
              )) as unknown as React.ReactNode
          }
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default Performers;
