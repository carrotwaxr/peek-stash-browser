import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  LucideArrowDown,
  LucideArrowUp,
  type LucideIcon,
  LucideSlidersHorizontal,
} from "lucide-react";
import type { ColumnConfig } from "../../config/tableColumns";
import { useFilterSurface } from "../../hooks/useFilterSurface";
import { useListFilters } from "../../hooks/useListFilters";
import { useFilterOptions } from "../../hooks/useListOptions";
import type { ListUrlState } from "../../hooks/useListUrlState";
import { useShortcutScope } from "../../hooks/useShortcutScope";
import { useTVMode } from "../../hooks/useTVMode";
import { type PanelState, activeFieldCount } from "../../utils/filterFields";
import { buildListQuery, sortOptionsFor } from "../../utils/listQuery";
import type { ListEntity } from "../../utils/urlParams";
import FilterBar from "../filter-bar/FilterBar";
import FilterSheet, {
  type CountRequestOf,
  type SheetFocus,
} from "../filter-bar/FilterSheet";
import ViewsMenu from "../filter-bar/ViewsMenu";
import { permanentChipsOf } from "../filter-bar/chipText";
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
  /**
   * The filter sheet's count request for a draft: the page's request over
   * it (a detail tab's lock, a list hook's own shape, Recommended's count
   * route). Left out, the list's request built from the list state.
   */
  countRequestOf?: CountRequestOf;
}

const NO_FILTERS: Record<string, unknown> = {};

const NO_SETTINGS: SettingConfig[] = [];

/**
 * The list's controls: search, sort, Views and the view in row 1, the
 * filter chips with "+ Filter" and "Advanced" in row 2, and paging. Every
 * control writes the URL through the list state; nothing here holds a copy
 * of it.
 *
 * On a phone (`useFilterSurface`), row 1 is search and "Filters (n)", row 2
 * the sort, Views and view controls (wrapping), and row 3 the chips,
 * scrolling sideways; "Filters", a chip and "+ Filter" open the filter sheet
 * (`FilterSheet`), which applies with "Show N results". In TV mode row 1 is
 * search, sort and the view controls, and row 2 the chip row, which leads
 * with the pins (so Down from the search box lands on the first) and ends
 * with "Filters (n)" and Views (a dialog there) before "+ Filter".
 *
 * Page keys: `/` focuses the search box and `f` opens "+ Filter" (the sheet
 * at its "+ Filter" on a phone or a TV), neither from inside a popover, a
 * dialog or the player; in TV mode PageUp and PageDown change the page.
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
  countRequestOf,
}: SearchControlsProps) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const topPaginationRef = useRef<HTMLDivElement>(null); // Ref for top pagination element
  const searchRef = useRef<HTMLDivElement>(null);
  const addFilterRef = useRef<HTMLButtonElement>(null);

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
  const surface = useFilterSurface();
  const [sheet, setSheet] = useState<{ focus?: SheetFocus } | null>(null);
  const openSheet = useCallback(
    (focus?: SheetFocus) => setSheet(focus === undefined ? {} : { focus }),
    []
  );
  const permanentChips = useMemo(
    () => permanentChipsOf(permanentFiltersMetadata),
    [permanentFiltersMetadata]
  );

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

  // Whether any filter is set, a group being one: the hierarchy view says
  // they don't apply
  const groupCount = listFilters.tree.groups.length;
  const hasActiveFilters = useMemo(
    () =>
      groupCount > 0 ||
      activeFieldCount(artifactType as ListEntity, filters, filterOptions) > 0,
    [artifactType, filters, filterOptions, groupCount]
  );

  // The sorts this list offers: Scene Number only beside a collection filter
  // that includes, the page's permanent one or the panel's
  const sortOptions = useMemo(
    () => [
      ...sortOptionsFor(artifactType, { ...filters, ...permanentFilters }),
    ],
    [artifactType, filters, permanentFilters]
  );

  // The sheet's count: the page's request over the draft, else the list's
  // own request built from the list state
  const { ready } = listState;
  const listCountRequestOf = useCallback<CountRequestOf>(
    (draft: PanelState) => {
      const query = buildListQuery(
        artifactType as ListEntity,
        {
          ready,
          filters: draft,
          sort,
          page: currentPage,
          perPage,
          q: searchText,
        },
        permanentFilters
      );
      return query === null ? null : { body: { ...query } };
    },
    [
      artifactType,
      ready,
      sort,
      currentPage,
      perPage,
      searchText,
      permanentFilters,
    ]
  );

  // "Filters (n)": the rows the bar draws a chip for, a group as one
  const freeKeys = useMemo(
    () =>
      new Set(
        filterOptions
          .filter((option) => permanentFilters[option.key] === undefined)
          .map((option) => option.key)
      ),
    [filterOptions, permanentFilters]
  );
  const filterCount =
    listFilters.tree.rows.filter((row) => freeKeys.has(row.field.key)).length +
    groupCount;
  const usesSheet = surface === "sheet" && filterable;
  // TV mode: the pins lead the chip row, under search, and "Filters" and
  // Views follow the chips
  const tvRow = usesSheet && isTVMode;
  // A phone turned wide, or a view without filters, closes the sheet for
  // good (its draft discarded), so it does not come back on its own
  if (!usesSheet && sheet !== null) setSheet(null);

  // The list's own keys, enabled in every mode. Not from inside a popover
  // or a dialog (a Modal's overlay scope stops them anyway) or the player
  const listKey =
    (run: (event: KeyboardEvent) => boolean) =>
    (event: KeyboardEvent): boolean => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[role="dialog"], .video-js') !== null
      ) {
        return false;
      }
      return run(event);
    };

  useShortcutScope({
    layer: "page",
    keys: {
      "/": listKey(() => {
        const input = searchRef.current?.querySelector("input");
        if (!input) return false;
        input.focus();
        return true;
      }),
      // Shift+F is left free
      f: listKey((event) => {
        if (event.shiftKey || !filterable) return false;
        if (usesSheet) {
          openSheet("add");
          return true;
        }
        const add = addFilterRef.current;
        if (!add || add.getAttribute("aria-expanded") === "true") return false;
        add.click();
        return true;
      }),
    },
  });

  const searchBox = (
    <div
      ref={searchRef}
      data-tv-search-item="search-input"
      className={
        usesSheet && !tvRow
          ? "min-w-0 flex-1"
          : "w-full sm:w-auto sm:flex-1 sm:min-w-[180px] sm:max-w-sm"
      }
    >
      <SearchInput
        placeholder="Search..."
        value={searchText}
        onSearch={setQuery}
        className="w-full"
      />
    </div>
  );

  const filtersButton = (
    <div data-tv-search-item="filters">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => openSheet()}
        aria-haspopup="dialog"
        aria-expanded={sheet !== null}
        className="whitespace-nowrap"
        icon={
          <LucideSlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        }
      >
        {filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
      </Button>
    </div>
  );

  // Views: only loading one from the menu shows its table columns; a default
  // View applied on a visit leaves the user's saved columns alone
  const viewsMenu = (
    <ViewsMenu
      listState={listState}
      context={effectiveContext}
      permanentFilters={permanentFilters}
      currentTableColumns={currentTableColumns}
      {...(onPresetColumns ? { onViewColumns: onPresetColumns } : {})}
    />
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
        {/* Row 1: search, sort, Views, then how to show the list; on a
            phone, search and "Filters (n)", the rest in row 2; in TV mode
            Views and "Filters (n)" go to the chip row */}
        {usesSheet && !tvRow && (
          <div className="flex items-center gap-2 mb-2">
            {searchBox}
            {filtersButton}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {(!usesSheet || tvRow) && searchBox}

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

          {!tvRow && viewsMenu}

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

        {/* Row 2: the filter chips (groups too), + Filter, Advanced and Clear
            all; in TV mode "Filters (n)" and Views after the groups */}
        {filterable ? (
          <div className="mt-3">
            <FilterBar
              filters={listFilters}
              permanentFilters={permanentFilters}
              permanentFiltersMetadata={permanentFiltersMetadata}
              addFilterRef={addFilterRef}
              {...(usesSheet ? { onOpenSheet: openSheet } : {})}
              {...(tvRow
                ? {
                    trailing: (
                      <>
                        {filtersButton}
                        {viewsMenu}
                      </>
                    ),
                  }
                : {})}
            />
            <FilterSheet
              filters={listFilters}
              open={usesSheet && sheet !== null}
              focusKey={sheet?.focus}
              onClose={() => setSheet(null)}
              countRequestOf={countRequestOf ?? listCountRequestOf}
              permanentFilters={permanentFilters}
              permanentChips={permanentChips}
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
