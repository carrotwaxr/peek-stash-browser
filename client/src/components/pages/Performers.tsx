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
import { type LibrarySearchParams } from "../../api";
import { usePerformerList } from "../../api/hooks";
import { ApiError } from "../../api/client";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  PerformerCard,
  SearchControls,
} from "../ui/index";
import { TableView, ColumnConfigPopover } from "../table/index";

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

  const [queryParams, setQueryParams] = useState<LibrarySearchParams | null>(null);
  const { data, isLoading: queryLoading, error } = usePerformerList(queryParams);
  const initMessage =
    error instanceof ApiError && error.isInitializing
      ? "Server is syncing library, please wait..."
      : null;
  const isLoading = queryParams === null || queryLoading;

  const handleQueryChange = useCallback(
    (newQuery: LibrarySearchParams) => {
      setQueryParams(newQuery);
    },
    []
  );

  const findPerformers = (data as Record<string, unknown>)?.findPerformers as Record<string, unknown> | undefined;
  const currentPerformers = (findPerformers?.performers as Record<string, unknown>[]) || [];
  const totalCount = (findPerformers?.count as number) || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page") ?? "24") || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentPerformers,
    columns,
    totalPages,
    onItemSelect: (performer) =>
      navigate(getEntityPath('performer', performer, hasMultipleInstances), {
        state: { fromPageTitle: "Performers" },
      }),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentPerformers.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
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

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="performer"
          initialSort="o_counter"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          totalPages={totalPages}
          totalCount={totalCount}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          {(({ viewMode, gridDensity, sortField, sortDirection, onSort }: { viewMode: string; gridDensity: string; sortField: string; sortDirection: string; onSort: (field: string, direction: "ASC" | "DESC") => void }) =>
            isLoading ? (
              viewMode === "table" ? (
                <TableView
                  items={[]}
                  columns={visibleColumns as { id: string; label: string; sortable: boolean; width: string; mandatory: boolean }[]}
                  sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
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
                items={currentPerformers as Record<string, unknown>[]}
                columns={visibleColumns as { id: string; label: string; sortable: boolean; width: string; mandatory: boolean }[]}
                sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
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
              <div ref={gridRef} className={getGridClasses("standard", gridDensity)}>
                {currentPerformers.map((performer: Record<string, unknown>, index: number) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <PerformerCard
                      key={performer.id as string}
                      performer={performer as unknown as import("@peek/shared-types").NormalizedPerformer}
                      isTVMode={isTVMode}
                      fromPageTitle="Performers"
                      {...itemProps}
                    />
                  );
                })}
              </div>
            )
          ) as unknown as React.ReactNode}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

export default Performers;
