import React, { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { NormalizedPerformer } from "@peek/shared-types";
import { type LibrarySearchParams } from "../../api";
import { usePerformerList } from "../../api/hooks";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { getGridClasses } from "../../constants/grids";
import { useConfig } from "../../contexts/ConfigContext";
import { useInitialFocus } from "../../hooks/useFocusTrap";
import { useGridColumns } from "../../hooks/useGridColumns";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useTableColumns } from "../../hooks/useTableColumns";
import { getEntityPath } from "../../utils/entityLinks";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns("performers");

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

  // TV Navigation - use shared hook for all grid pages
  const { isTVMode, tvNavigation, searchControlsProps, gridItemProps } =
    useGridPageTVNavigation({
      items: currentPerformers,
      columns,
      totalPages,
      onItemSelect: (performer) =>
        void navigate(
          getEntityPath("performer", performer, hasMultipleInstances),
          {
            state: { fromPageTitle: "Performers" },
          }
        ),
    });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentPerformers.length > 0 && isTVMode
  );

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
      {/* TV Mode Zone Indicator (temporary for testing) */}
      {isTVMode && (
        <div
          style={{
            position: "fixed",
            top: "10px",
            right: "10px",
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "8px 12px",
            borderRadius: "4px",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          Zone: <strong>{tvNavigation.currentZone}</strong>
        </div>
      )}

      <div ref={pageRef}>
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
          {...searchControlsProps}
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
                <div
                  ref={gridRef}
                  className={getGridClasses("standard", gridDensity)}
                >
                  {currentPerformers.map(
                    (performer: Record<string, unknown>, index: number) => {
                      const itemProps = gridItemProps(index);
                      return (
                        <PerformerCard
                          key={performer.id as string}
                          performer={
                            performer as unknown as NormalizedPerformer
                          }
                          isTVMode={isTVMode}
                          fromPageTitle="Performers"
                          {...itemProps}
                        />
                      );
                    }
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
