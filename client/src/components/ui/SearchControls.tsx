import React, { useCallback, useMemo, useRef } from "react";
import { LucideArrowDown, LucideArrowUp, type LucideIcon } from "lucide-react";
import type { ColumnConfig } from "../../config/tableColumns";
import { useListFilters } from "../../hooks/useListFilters";
import { useFilterOptions } from "../../hooks/useListOptions";
import type { ListUrlState } from "../../hooks/useListUrlState";
import { useShortcutScope } from "../../hooks/useShortcutScope";
import { useTVMode } from "../../hooks/useTVMode";
import { activeFieldCount } from "../../utils/filterFields";
import { sortOptionsFor } from "../../utils/listQuery";
import type { ListEntity } from "../../utils/urlParams";
import FilterBar from "../filter-bar/FilterBar";
import ViewsMenu from "../filter-bar/ViewsMenu";
import {
  Button,
  ContextSettings,
  Pagination,
  SearchInput,
  SortControl,
  StatusMessage,
  ViewModeToggle,
  ZoomSlider,
} from "./index";

interface ViewModeConfig {
  id: string;
  label: string;
  icon?: LucideIcon;
}

type SettingConfig = NonNullable<
  React.ComponentProps<typeof ContextSettings>["settings"]
>[number];

interface SearchControlsProps {
  artifactType?: string;
  context?: string;
  /** The results: the page's grid, table or other view */
  children: React.ReactNode;
  /** The list's state from the page's `useListUrlState` */
  listState: ListUrlState;
  permanentFilters?: Record<string, unknown>;
  permanentFiltersMetadata?: Record<string, unknown>;
  totalPages: number;
  totalCount: number;
  viewModes?: ViewModeConfig[];
  currentTableColumns?: Record<string, unknown> | null;
  tableColumnsPopover?: React.ReactNode;
  /**
   * Shows a View's table columns, or null for the user's own: called each
   * time a View is loaded from the Views menu
   */
  onPresetColumns?: (columns: ColumnConfig | null) => void;
  contextSettings?: SettingConfig[];
  /** The list query is showing the previous results while the next ones load */
  isRefreshing?: boolean;
  /**
   * The current view takes the list's filters (false for the Tags hierarchy):
   * the chip bar and "+ Filter" are hidden, and a note says so while filters
   * are set
   */
  filterable?: boolean;
}

const NO_FILTERS: Record<string, unknown> = {};

const NO_SETTINGS: SettingConfig[] = [];

/**
 * The list's controls: search, sort, Views and the view in row 1, the
 * filter chips with "+ Filter" in row 2, and paging. Every control writes
 * the URL through the list state; nothing here holds a copy of it.
 */
const SearchControls = ({
  artifactType = "scene",
  context,
  children,
  listState,
  permanentFilters = NO_FILTERS,
  permanentFiltersMetadata = NO_FILTERS,
  totalPages,
  totalCount,
  viewModes,
  currentTableColumns = null,
  tableColumnsPopover = null,
  onPresetColumns,
  contextSettings = NO_SETTINGS,
  isRefreshing = false,
  filterable = true,
}: SearchControlsProps) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const topPaginationRef = useRef<HTMLDivElement>(null); // Ref for top pagination element

  const { isTVMode } = useTVMode();
  // The chip bar offers every field the view leaves free: a field the page
  // fixes is offered, its rows AND-ed with the page's criterion
  // (FILTERS-12), but not the timeline's date or the open folder's tags
  const allFilterOptions = useFilterOptions(artifactType);
  const listFilters = useListFilters(
    artifactType as ListEntity,
    listState,
    allFilterOptions
  );
  const filterOptions = listFilters.options;

  const {
    filters,
    sort,
    page: currentPage,
    perPage,
    q: searchText,
    viewMode,
    zoomLevel,
    gridDensity,
    setSort,
    setPage,
    setPerPage,
    setQuery,
    setViewMode,
    setZoomLevel,
    setGridDensity,
  } = listState;
  const sortField = sort.field;
  const sortDirection = sort.direction;

  const handlePageChange = useCallback(
    (page: number) => {
      setPage(page);

      // Scroll to top pagination if it's not in view
      setTimeout(() => {
        if (topPaginationRef.current) {
          const rect = topPaginationRef.current.getBoundingClientRect();
          const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;

          // Only scroll if not already in view
          if (!isInView) {
            topPaginationRef.current.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }
        }
      }, 50);
    },
    [setPage]
  );

  // TV mode: PageUp and PageDown change the page (a desktop PageDown scrolls)
  useShortcutScope({
    layer: "page",
    enabled: isTVMode,
    keys: {
      pageup: () => {
        if (currentPage <= 1) return false;
        handlePageChange(currentPage - 1);
        return true;
      },
      pagedown: () => {
        if (currentPage >= totalPages) return false;
        handlePageChange(currentPage + 1);
        return true;
      },
    },
  });

  // A sort chosen in the menu, or a table header's field and direction
  const handleSortChange = useCallback(
    (field: string, direction?: "ASC" | "DESC") => setSort(field, direction),
    [setSort]
  );

  // Whether any filter is set: the hierarchy view says they don't apply
  const hasActiveFilters = useMemo(
    () =>
      activeFieldCount(artifactType as ListEntity, filters, filterOptions) > 0,
    [artifactType, filters, filterOptions]
  );

  // The sorts this list offers: Scene Number only beside a collection filter
  // that includes, the page's permanent one or the panel's
  const sortOptions = useMemo(
    () => [
      ...sortOptionsFor(artifactType, { ...filters, ...permanentFilters }),
    ],
    [artifactType, filters, permanentFilters]
  );

  return (
    <div>
      <div
        className="rounded-lg mb-4 p-3"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Row 1: search, sort, Views, then how to show the list */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div
            data-tv-search-item="search-input"
            className="w-full sm:w-auto sm:flex-1 sm:min-w-[180px] sm:max-w-sm"
          >
            <SearchInput
              placeholder="Search..."
              value={searchText}
              onSearch={setQuery}
              className="w-full"
            />
          </div>

          {/* Sort: the field, then its direction */}
          <div className="flex items-center gap-1">
            <div data-tv-search-item="sort-control">
              <SortControl
                options={sortOptions}
                value={sortField}
                onChange={handleSortChange}
              />
            </div>
            <div data-tv-search-item="sort-direction">
              <Button
                onClick={() => handleSortChange(sortField)}
                aria-label={`Sort direction: ${sortDirection === "ASC" ? "ascending" : "descending"}`}
                variant="secondary"
                size="sm"
                className="py-1"
                icon={
                  sortDirection === "ASC" ? (
                    <LucideArrowUp size={22} />
                  ) : (
                    <LucideArrowDown size={22} />
                  )
                }
              />
            </div>
          </div>

          {/* Views: only loading one from the menu shows its table columns;
              a default View applied on a visit leaves the user's saved
              columns alone */}
          <ViewsMenu
            listState={listState}
            context={effectiveContext}
            permanentFilters={permanentFilters}
            currentTableColumns={currentTableColumns}
            {...(onPresetColumns ? { onViewColumns: onPresetColumns } : {})}
          />

          {/* View Mode Toggle - Show if the page has views */}
          {viewModes && (
            <div data-tv-search-item="view-mode">
              <ViewModeToggle
                modes={viewModes}
                value={viewMode}
                onChange={setViewMode}
              />
            </div>
          )}

          {/* Table Columns Popover - Only shown in table mode */}
          {viewMode === "table" && tableColumnsPopover && (
            <div>{tableColumnsPopover}</div>
          )}

          {/* Zoom Slider - Only shown in wall mode */}
          {viewModes?.some((m) => m.id === "wall") && viewMode === "wall" && (
            <div data-tv-search-item="zoom-level">
              <ZoomSlider value={zoomLevel} onChange={setZoomLevel} />
            </div>
          )}

          {/* Grid Density Slider - Shown in grid, folder, and timeline modes */}
          {(viewMode === "grid" ||
            viewMode === "folder" ||
            viewMode === "timeline") && (
            <div data-tv-search-item="grid-density">
              <ZoomSlider value={gridDensity} onChange={setGridDensity} />
            </div>
          )}

          {/* Context Settings Cog */}
          <div data-tv-search-item="context-settings">
            <ContextSettings
              entityType={artifactType}
              settings={contextSettings}
            />
          </div>
        </div>

        {/* Row 2: the filter chips, + Filter and Clear all */}
        {filterable ? (
          <div className="mt-3">
            <FilterBar
              filters={listFilters}
              permanentFilters={permanentFilters}
              permanentFiltersMetadata={permanentFiltersMetadata}
            />
          </div>
        ) : (
          hasActiveFilters && (
            <div className="mt-3">
              <StatusMessage
                variant="info"
                title={null}
                message="Filters don't apply to the hierarchy view. Switch to Grid or Table to use them."
              />
            </div>
          )
        )}
      </div>

      {/* Top Pagination */}
      {totalPages >= 1 && (
        <div ref={topPaginationRef} className="mt-4 mb-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={handlePageChange}
            perPage={perPage}
            onPerPageChange={setPerPage}
            totalCount={totalCount}
            showInfo={true}
            totalPages={totalPages}
          />
        </div>
      )}

      {/* The results. Stale results stay clickable but dim while the next
          ones load. The important flag lets reduced motion override the
          inline transition. */}
      <div
        data-testid="search-results"
        aria-busy={isRefreshing || undefined}
        className="motion-reduce:!transition-none"
        style={{
          opacity: isRefreshing ? 0.6 : 1,
          transition: "opacity 0.2s ease",
        }}
      >
        {children}
      </div>
      {/* Bottom Pagination */}
      {totalPages >= 1 && (
        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={handlePageChange}
            perPage={perPage}
            onPerPageChange={setPerPage}
            totalCount={totalCount}
            showInfo={true}
            totalPages={totalPages}
          />
        </div>
      )}
    </div>
  );
};

export default SearchControls;
