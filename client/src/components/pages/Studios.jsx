import { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import { libraryApi } from "../../services/api.js";
import { StudioCard } from "../cards/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";

// View modes available for studios page
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "table", label: "Table view" },
];

const Studios = () => {
  usePageTitle("Studios");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = 3;

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
  } = useTableColumns("studio");

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getStudios(newQuery, signal));
    },
    [execute]
  );

  const currentStudios = data?.studios || [];
  const totalCount = data?.count || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentStudios,
    columns,
    totalPages,
    onItemSelect: (studio) =>
      navigate(`/studio/${studio.id}`, {
        state: { fromPageTitle: "Studios" },
      }),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentStudios.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Studios" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Studios"
          subtitle="Browse studios and production companies in your library"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="studio"
          initialSort="scenes_count"
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
          {({ viewMode, sortField, sortDirection, onSort }) =>
            isLoading ? (
              viewMode === "table" ? (
                <TableView
                  items={[]}
                  columns={visibleColumns}
                  sort={{ field: sortField, direction: sortDirection }}
                  onSort={onSort}
                  onHideColumn={hideColumn}
                  entityType="studio"
                  isLoading={true}
                />
              ) : (
                <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
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
              )
            ) : viewMode === "table" ? (
              <TableView
                items={currentStudios}
                columns={visibleColumns}
                sort={{ field: sortField, direction: sortDirection }}
                onSort={onSort}
                onHideColumn={hideColumn}
                entityType="studio"
                isLoading={false}
              />
            ) : (
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentStudios.map((studio, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <StudioCard
                      key={studio.id}
                      studio={studio}
                      fromPageTitle="Studios"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            )
          }
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const getStudios = async (query, signal) => {
  const response = await libraryApi.findStudios(query, signal);

  // Extract studios and count from server response structure
  const findStudios = response?.findStudios;
  const result = {
    studios: findStudios?.studios || [],
    count: findStudios?.count || 0,
  };
  return result;
};

export default Studios;
