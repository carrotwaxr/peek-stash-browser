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
import { sortOptionsFor, withoutLockedOptions } from "../../utils/listQuery";
import type { ListEntity } from "../../utils/urlParams";
import {
  ActiveFilterChips,
  Button,
  ContextSettings,
  FilterControl,
  FilterPanel,
  FilterPresets,
  Pagination,
  SearchInput,
  SortControl,
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
}

const NO_FILTERS: Record<string, unknown> = {};

/** A filter value that filters: not empty, and an object with a value set */
const isActiveFilter = (value: unknown) =>
  value !== undefined &&
  value !== "" &&
  (typeof value !== "object" ||
    value === null ||
    Object.values(value).some((v) => v !== "" && v !== undefined));
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
}: SearchControlsProps) => {
  // Use context if provided, otherwise fall back to artifactType
  const effectiveContext = context || artifactType;
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [highlightedFilterKey, setHighlightedFilterKey] = useState<
    string | null
  >(null);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const topPaginationRef = useRef<HTMLDivElement>(null); // Ref for top pagination element
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

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    clearFilters();
    setDraft(null);
    setIsFilterPanelOpen(false);
  }, [clearFilters]);

  // Handle filter change in panel (editing before submit)
  const handleFilterChange = useCallback(
    (filterKey: string, value: unknown) => {
      setDraft((prev) => ({
        base: filters,
        values: {
          ...(prev && deepEqual(prev.base, filters) ? prev.values : filters),
          [filterKey]: value === "" ? undefined : value,
        },
      }));
    },
    [filters]
  );

  // Apply the draft and close the panel
  const handleFilterSubmit = useCallback(() => {
    applyFilters(panelFilters);
    setDraft(null);
    setIsFilterPanelOpen(false);
  }, [applyFilters, panelFilters]);

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
    },
    [filterOptions, collapsedSections]
  );

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

  // How many filters are active: the Filters button's badge
  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(isActiveFilter).length,
    [filters]
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
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
          style={{
            borderBottom: isControlsCollapsed
              ? "none"
              : "1px solid var(--border-color)",
          }}
          onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
        >
          <h3
            className="font-semibold text-sm uppercase tracking-wide"
            style={{ color: "var(--text-primary)" }}
          >
            Search &amp; Filter
          </h3>
          <span style={{ color: "var(--text-secondary)" }}>
            {isControlsCollapsed ? "▶" : "▼"}
          </span>
        </div>

        {/* Collapsible controls content */}
        {!isControlsCollapsed && (
          <div className="p-3">
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
                <div data-tv-search-item="filters-button">
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
            <ActiveFilterChips
              filters={filters}
              filterOptions={filterOptions}
              onRemoveFilter={removeFilter}
              onChipClick={handleFilterChipClick}
              permanentFilters={permanentFilters}
              permanentFiltersMetadata={permanentFiltersMetadata}
            />
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
        isOpen={isFilterPanelOpen}
        onToggle={handleToggleFilterPanel}
        onClear={handleClearFilters}
        onSubmit={handleFilterSubmit}
        hasActiveFilters={hasActiveFilters}
        highlightedFilterKey={highlightedFilterKey}
        filterRefs={filterRefs}
      >
        {filterOptions.map((opt, index) => {
          const { defaultValue, key, type, ...rest } = opt;

          // Render section header
          if (type === "section-header") {
            const isCollapsed = collapsedSections[key] || false;
            const toggleSection = () => {
              setCollapsedSections((prev) => ({
                ...prev,
                [key]: !prev[key],
              }));
            };

            return (
              <div
                key={`section-${key}`}
                className="col-span-full"
                style={{ gridColumn: "1 / -1" }}
              >
                <div
                  className="flex items-center justify-between py-2 px-3 mb-3 rounded-md cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderBottom: isCollapsed
                      ? "none"
                      : "2px solid var(--accent-primary)",
                  }}
                  onClick={opt.collapsible ? toggleSection : undefined}
                >
                  <h3
                    className="font-semibold text-sm uppercase tracking-wide"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {opt.label}
                  </h3>
                  {opt.collapsible && (
                    <svg
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
                  )}
                </div>
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
          const {
            modifierOptions,
            modifierKey,
            defaultModifier,
            supportsHierarchy,
            hierarchyKey,
            hierarchyLabel,
            ...filterProps
          } = rest;

          return (
            <FilterControl
              key={`FilterControl-${key}`}
              ref={(el: HTMLDivElement | null) => {
                if (el) filterRefs.current[key] = el;
              }}
              isHighlighted={highlightedFilterKey === key}
              onChange={(value: unknown) => handleFilterChange(key, value)}
              value={panelFilters[key] || defaultValue}
              type={
                type as
                  | "select"
                  | "searchable-select"
                  | "checkbox"
                  | "number"
                  | "text"
                  | "date"
                  | "range"
                  | "imperial-height-range"
                  | "date-range"
                  | "time-range"
              }
              label={filterProps.label!}
              modifierOptions={modifierOptions}
              // Untouched, the option's default: the modifier the request carries
              modifierValue={
                (modifierKey
                  ? (panelFilters[modifierKey] as string | undefined)
                  : undefined) ?? defaultModifier
              }
              onModifierChange={(value: unknown) =>
                modifierKey && handleFilterChange(modifierKey, value)
              }
              supportsHierarchy={supportsHierarchy}
              hierarchyLabel={hierarchyLabel}
              hierarchyValue={
                hierarchyKey
                  ? (panelFilters[hierarchyKey] as number | undefined)
                  : undefined
              }
              onHierarchyChange={
                hierarchyKey
                  ? (value: unknown) => handleFilterChange(hierarchyKey, value)
                  : undefined
              }
              {...filterProps}
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
