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
import { useGroupList } from "../../api/hooks";
import { ApiError } from "../../api/client";
import { GroupCard } from "../cards/index";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index";
import { TableView, ColumnConfigPopover } from "../table/index";

// View modes available for groups page
const VIEW_MODES: { id: string; label: string }[] = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
];

const Groups = () => {
  usePageTitle("Collections");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();
  const pageRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useGridColumns("groups");

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
  } = useTableColumns("group");

  const [queryParams, setQueryParams] = useState<LibrarySearchParams | null>(null);
  const { data, isLoading: queryLoading, error } = useGroupList(queryParams);
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

  const findGroups = (data as Record<string, unknown>)?.findGroups as Record<string, unknown> | undefined;
  const currentGroups = (findGroups?.groups as Record<string, unknown>[]) || [];
  const totalCount = (findGroups?.count as number) || 0;

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
    items: currentGroups,
    columns,
    totalPages,
    onItemSelect: (group) =>
      navigate(getEntityPath('group', group, hasMultipleInstances), {
        state: { fromPageTitle: "Collections" },
      }),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentGroups.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Collections" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Collections"
          subtitle="Browse collections and movies in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="group"
          initialSort="name"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          totalPages={totalPages}
          totalCount={totalCount}
           
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
                  entityType="group"
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
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="rounded-lg animate-pulse"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        height: "8rem",
                      }}
                    />
                  ))}
                </div>
              )
            ) : viewMode === "table" ? (
              <TableView
                items={currentGroups as Record<string, unknown>[]}
                columns={visibleColumns as { id: string; label: string; sortable: boolean; width: string; mandatory: boolean }[]}
                sort={{ field: sortField, direction: sortDirection as "ASC" | "DESC" }}
                onSort={onSort}
                onHideColumn={hideColumn}
                entityType="group"
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
                {currentGroups.map((group: Record<string, unknown>, index: number) => {
                  const { tabIndex: _tabIndex, ...restItemProps } = gridItemProps(index);
                  return (
                    <GroupCard
                      key={group.id as string}
                      group={group as unknown as import("@peek/shared-types").NormalizedGroup & { sub_group_count?: number; description?: string | null }}
                      fromPageTitle="Collections"
                      tabIndex={isTVMode ? _tabIndex : -1}
                      {...restItemProps}
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

export default Groups;
