import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import deepEqual from "fast-deep-equal";
import { LucideArrowDown, LucideArrowUp, type LucideIcon } from "lucide-react";
import { type ColumnConfig, presetColumnsOf } from "../../config/tableColumns";
import { useFilterOptions, useLockedFields } from "../../hooks/useListOptions";
import type { ListUrlState, PresetToLoad } from "../../hooks/useListUrlState";
import { useShortcutScope } from "../../hooks/useShortcutScope";
import { useTVMode } from "../../hooks/useTVMode";
import {
  type FilterOption,
  type PanelState,
  activeFieldCount,
  rowKeysOf,
} from "../../utils/filterFields";
import { sortOptionsFor, withoutLockedOptions } from "../../utils/listQuery";
import type { ListEntity } from "../../utils/urlParams";
import {
  ActiveFilterChips,
  Button,
  ContextSettings,
  FieldEditor,
  FilterPanel,
  FilterPresets,
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
   * Shows a preset's table columns, or null for the user's own: called on
   * each Load Preset and when the default preset resolves or changes
   */
  onPresetColumns?: (columns: ColumnConfig | null) => void;
  contextSettings?: SettingConfig[];
  /** The list query is showing the previous results while the next ones load */
  isRefreshing?: boolean;
  /**
   * The current view takes the list's filters (false for the Tags hierarchy):
   * the Filters button, the panel and the chips are hidden, and a note says so
   * while filters are set
   */
  filterable?: boolean;
}

const NO_FILTERS: Record<string, unknown> = {};

const NO_SETTINGS: SettingConfig[] = [];

/**
 * The list's controls: search, sort, filters, presets, view and paging. Every
 * control writes the URL through the list state; nothing here holds a copy
 * of it (the filter panel keeps only the draft being edited).
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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [highlightedFilterKey, setHighlightedFilterKey] = useState<
    string | null
  >(null);
  // The field a chip opened: its first control takes focus once drawn
  const [focusRequest, setFocusRequest] = useState<{ key: string } | null>(
    null
  );
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const topPaginationRef = useRef<HTMLDivElement>(null); // Ref for top pagination element
  const filtersButtonRef = useRef<HTMLDivElement>(null); // The Filters button's wrapper
  const filterRefs = useRef<Record<string, HTMLElement | null>>({}); // Refs for filter controls (for scroll-to-highlight)

  const { isTVMode } = useTVMode();
  const lockedFields = useLockedFields(artifactType, permanentFilters);
  // The panel and the chips offer only what the page leaves free
  const allFilterOptions = useFilterOptions(artifactType);
  const filterOptions = useMemo(
    () =>
      withoutLockedOptions(
        artifactType as ListEntity,
        allFilterOptions,
        lockedFields
      ),
    [artifactType, allFilterOptions, lockedFields]
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
    applyFilters,
    removeFilter,
    clearFilters,
    setSort,
    setPage,
    setPerPage,
    setQuery,
    setViewMode,
    setZoomLevel,
    setGridDensity,
    loadPreset,
  } = listState;
  const sortField = sort.field;
  const sortDirection = sort.direction;

  // Track collapsed state for each filter section
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >(() => {
    const initial: Record<string, boolean> = {};
    filterOptions.forEach((opt) => {
      if (opt.type === "section-header" && opt.collapsible) {
        initial[opt.key] = !opt.defaultOpen;
      }
    });
    return initial;
  });

  // The panel's draft: edits not yet applied, over the filters they started
  // from. Once the list's filters change (Back, a chip, a preset) the draft
  // is dropped and the panel shows the list's filters again.
  const [draft, setDraft] = useState<{
    base: Record<string, unknown>;
    values: Record<string, unknown>;
  } | null>(null);
  const draftIsCurrent = draft !== null && deepEqual(draft.base, filters);
  const panelFilters = draft && draftIsCurrent ? draft.values : filters;

  // The controls each collapsible section holds: its toggle's aria-controls
  const sectionControlIds = useMemo(() => {
    const ids: Record<string, string> = {};
    let current: string | null = null;
    for (const opt of filterOptions) {
      if (opt.type === "section-header") {
        current = opt.key;
        ids[current] = "";
      } else if (current) {
        ids[current] = `${ids[current]} filter-${opt.key}`.trim();
      }
    }
    return ids;
  }, [filterOptions]);

  // A row edited in the panel (before submit): the row's keys are replaced
  // by its next state, the rest of the draft stays
  const handleRowChange = useCallback(
    (option: FilterOption, next: PanelState) => {
      const owned = new Set(rowKeysOf(option));
      setDraft((prev) => ({
        base: filters,
        values: {
          ...Object.fromEntries(
            Object.entries(
              prev && deepEqual(prev.base, filters) ? prev.values : filters
            ).filter(([key]) => !owned.has(key))
          ),
          ...next,
        },
      }));
    },
    [filters]
  );

  // Closing the panel unmounts the button that had focus: it goes back to the
  // Filters button that opened the panel
  const focusFiltersButton = useCallback(() => {
    filtersButtonRef.current?.querySelector("button")?.focus();
  }, []);

  // Apply the draft and close the panel
  const handleFilterSubmit = useCallback(() => {
    applyFilters(panelFilters);
    setDraft(null);
    setIsFilterPanelOpen(false);
    focusFiltersButton();
  }, [applyFilters, panelFilters, focusFiltersButton]);

  // Clear All drops every filter and closes the panel
  const handleClearFilters = useCallback(() => {
    clearFilters();
    setDraft(null);
    setIsFilterPanelOpen(false);
    focusFiltersButton();
  }, [clearFilters, focusFiltersButton]);

  // Cancel drops the draft and closes the panel
  const handleFilterCancel = useCallback(() => {
    setDraft(null);
    setIsFilterPanelOpen(false);
    focusFiltersButton();
  }, [focusFiltersButton]);

  // Handle clicking on a filter chip to highlight that filter
  const handleFilterChipClick = useCallback(
    (filterKey: string) => {
      // Open filter panel if not already open
      setIsFilterPanelOpen(true);

      // Find which section this filter belongs to
      let sectionKey = null;
      for (const option of filterOptions) {
        if (option.type === "section-header") {
          sectionKey = option.key;
        } else if (option.key === filterKey) {
          break;
        }
      }

      // Expand the section if it's collapsed
      if (sectionKey && collapsedSections[sectionKey]) {
        setCollapsedSections((prev) => ({
          ...prev,
          [sectionKey]: false,
        }));
      }

      // Set the highlighted filter key (triggers scroll and animation)
      setHighlightedFilterKey(filterKey);
      // And focus its first control, drawn by the next render
      setFocusRequest({ key: filterKey });
    },
    [filterOptions, collapsedSections]
  );

  useEffect(() => {
    if (focusRequest) {
      document.getElementById(`filter-${focusRequest.key}`)?.focus();
    }
  }, [focusRequest]);

  // Clear highlight after animation completes
  useEffect(() => {
    if (highlightedFilterKey) {
      const timer = setTimeout(() => {
        setHighlightedFilterKey(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [highlightedFilterKey]);

  // Only loading a preset from the menu shows its table columns; a default
  // preset applied on a visit leaves the user's saved columns alone
  const handleLoadPreset = useCallback(
    (preset: PresetToLoad) => {
      loadPreset(preset);
      onPresetColumns?.(presetColumnsOf(preset.tableColumns));
    },
    [loadPreset, onPresetColumns]
  );

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

  const handleToggleFilterPanel = useCallback(() => {
    setIsFilterPanelOpen((prev) => !prev);
  }, []);

  // How many filters are active, one per field as the chips draw them: the
  // Filters button's badge
  const activeFilterCount = useMemo(
    () => activeFieldCount(artifactType as ListEntity, filters, filterOptions),
    [artifactType, filters, filterOptions]
  );
  const hasActiveFilters = activeFilterCount > 0;

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
      {/* Collapsible Search Controls Container */}
      <div
        className="rounded-lg mb-4"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <h3
          className="font-semibold text-sm uppercase tracking-wide"
          style={{
            color: "var(--text-primary)",
            borderBottom: isControlsCollapsed
              ? "none"
              : "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left uppercase tracking-wide hover:opacity-80 transition-opacity"
            aria-expanded={!isControlsCollapsed}
            aria-controls="search-controls-content"
            onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
          >
            <span>Search &amp; Filter</span>
            <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>
              {isControlsCollapsed ? "▶" : "▼"}
            </span>
          </button>
        </h3>

        {/* Collapsible controls content */}
        {!isControlsCollapsed && (
          <div id="search-controls-content" className="p-3">
            {/* Row 1: Search, Sort, Filters - "What to show" */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-center gap-3 mb-3">
              {/* Search Input - Flexible width with min-width */}
              <div
                data-tv-search-item="search-input"
                className="w-full sm:flex-1 sm:min-w-[180px] sm:max-w-sm"
              >
                <SearchInput
                  placeholder="Search..."
                  value={searchText}
                  onSearch={setQuery}
                  className="w-full"
                />
              </div>

              {/* Sort, Filter */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:flex-nowrap">
                {/* Sort Control - No label, just dropdown + direction button */}
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

                {/* Filters Toggle Button */}
                {filterable && (
                  <div
                    ref={filtersButtonRef}
                    data-tv-search-item="filters-button"
                  >
                    <Button
                      onClick={handleToggleFilterPanel}
                      variant={isFilterPanelOpen ? "primary" : "secondary"}
                      size="sm"
                      className="flex items-center space-x-2 font-medium"
                      icon={
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
                            clipRule="evenodd"
                          />
                        </svg>
                      }
                    >
                      <span>Filters</span>
                      {hasActiveFilters && !isFilterPanelOpen && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full ml-1"
                          style={{
                            backgroundColor: "var(--accent-secondary)",
                            color: "white",
                          }}
                        >
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Presets, View Mode, Zoom, Settings - "How to show it" */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4">
              {/* Filter Presets */}
              <div data-tv-search-item="filter-presets">
                <FilterPresets
                  artifactType={artifactType}
                  context={effectiveContext}
                  currentFilters={filters}
                  currentSort={sortField}
                  currentDirection={sortDirection}
                  currentViewMode={viewMode}
                  currentZoomLevel={zoomLevel}
                  currentGridDensity={gridDensity}
                  currentTableColumns={currentTableColumns}
                  currentPerPage={perPage}
                  permanentFilters={permanentFilters}
                  onLoadPreset={handleLoadPreset}
                />
              </div>

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
              {viewModes?.some((m) => m.id === "wall") &&
                viewMode === "wall" && (
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

            {/* Active Filter Chips */}
            {filterable ? (
              <ActiveFilterChips
                kind={artifactType as ListEntity}
                filters={filters}
                filterOptions={filterOptions}
                onRemoveFilter={removeFilter}
                onFocusLeave={focusFiltersButton}
                onChipClick={handleFilterChipClick}
                permanentFilters={permanentFilters}
                permanentFiltersMetadata={permanentFiltersMetadata}
              />
            ) : (
              hasActiveFilters && (
                <StatusMessage
                  variant="info"
                  title={null}
                  message="Filters don't apply to the hierarchy view. Switch to Grid or Table to use them."
                />
              )
            )}
          </div>
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

      {/* Filter Panel */}
      <FilterPanel
        isOpen={filterable && isFilterPanelOpen}
        onCancel={handleFilterCancel}
        onClear={handleClearFilters}
        onSubmit={handleFilterSubmit}
        hasActiveFilters={hasActiveFilters}
        highlightedFilterKey={highlightedFilterKey}
        filterRefs={filterRefs}
      >
        {filterOptions.map((opt, index) => {
          const { key, type } = opt;

          // Render section header
          if (type === "section-header") {
            const isCollapsed = collapsedSections[key] || false;
            const toggleSection = () => {
              setCollapsedSections((prev) => ({
                ...prev,
                [key]: !prev[key],
              }));
            };

            const headerStyle = {
              backgroundColor: "var(--bg-secondary)",
              borderBottom: isCollapsed
                ? "none"
                : "2px solid var(--accent-primary)",
            };
            const headerClass =
              "font-semibold text-sm uppercase tracking-wide mb-3 rounded-md";

            return (
              <div
                key={`section-${key}`}
                className="col-span-full"
                style={{ gridColumn: "1 / -1" }}
              >
                {opt.collapsible ? (
                  <h3 className={headerClass} style={headerStyle}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between py-2 px-3 rounded-md text-left uppercase tracking-wide hover:opacity-80 transition-opacity"
                      style={{ color: "var(--text-primary)" }}
                      aria-expanded={!isCollapsed}
                      aria-controls={sectionControlIds[key]}
                      onClick={toggleSection}
                    >
                      <span>{opt.label}</span>
                      <svg
                        aria-hidden="true"
                        className={`w-4 h-4 transition-transform ${
                          isCollapsed ? "" : "rotate-180"
                        }`}
                        style={{ color: "var(--text-muted)" }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </h3>
                ) : (
                  <h3
                    className={`${headerClass} py-2 px-3`}
                    style={{ ...headerStyle, color: "var(--text-primary)" }}
                  >
                    {opt.label}
                  </h3>
                )}
              </div>
            );
          }

          // Check if this filter should be hidden (if in a collapsed section)
          let currentSectionKey = null;
          for (let i = index - 1; i >= 0; i--) {
            const option = filterOptions[i];
            if (option?.type === "section-header") {
              currentSectionKey = option.key;
              break;
            }
          }

          const isInCollapsedSection =
            currentSectionKey && collapsedSections[currentSectionKey];

          if (isInCollapsedSection) {
            return null;
          }

          // Render regular filter control
          return (
            <FieldEditor
              key={`FilterControl-${key}`}
              ref={(el: HTMLDivElement | null) => {
                if (el) filterRefs.current[key] = el;
              }}
              isHighlighted={highlightedFilterKey === key}
              option={opt}
              state={panelFilters}
              onChange={(next) => handleRowChange(opt, next)}
            />
          );
        })}
      </FilterPanel>
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
