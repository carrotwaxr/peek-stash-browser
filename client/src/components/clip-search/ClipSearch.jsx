import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getClips } from "../../services/api.js";
import { useWallPlayback } from "../../hooks/useWallPlayback.js";
import { useTableColumns } from "../../hooks/useTableColumns.js";
import {
  SearchInput,
  FilterPanel,
  FilterControl,
  Button,
  Pagination,
  SearchControls,
} from "../ui/index.js";
import { TableView, ColumnConfigPopover } from "../table/index.js";
import WallView from "../wall/WallView.jsx";
import ClipGrid from "./ClipGrid.jsx";

// View modes available for clip search
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
];

// Context settings for wall view preview behavior
const WALL_VIEW_SETTINGS = [
  {
    key: "wallPlayback",
    label: "Preview Behavior",
    type: "select",
    options: [
      { value: "autoplay", label: "Autoplay All" },
      { value: "hover", label: "Play on Hover" },
      { value: "static", label: "Static Thumbnails" },
    ],
  },
];

// No-op for SearchControls query change - ClipSearch manages its own data fetching
const noop = () => {};

export default function ClipSearch() {
  const navigate = useNavigate();
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showUngenerated, setShowUngenerated] = useState(false);
  const perPage = 24;

  // Wall playback preference (shared with scenes)
  const { wallPlayback, updateWallPlayback } = useWallPlayback();

  // Table columns for table view
  const {
    allColumns,
    visibleColumns,
    visibleColumnIds,
    columnOrder,
    toggleColumn,
    hideColumn,
    moveColumn,
    getColumnConfig,
  } = useTableColumns("clip");

  // Track current view mode for context settings
  const [currentViewMode, setCurrentViewMode] = useState("grid");

  // Filter state
  const [filters, setFilters] = useState({
    tagIds: [],
    sceneTagIds: [],
    performerIds: [],
    studioId: null,
    q: "",
  });

  // Filter panel state
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  // Staged filters for the filter panel (only applied on submit)
  const [stagedFilters, setStagedFilters] = useState(filters);

  const hasActiveFilters =
    filters.tagIds.length > 0 ||
    filters.sceneTagIds.length > 0 ||
    filters.performerIds.length > 0 ||
    filters.studioId ||
    filters.q;

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getClips({
        page,
        perPage,
        isGenerated: !showUngenerated,
        sortBy: "stashCreatedAt",
        sortDir: "desc",
        tagIds: filters.tagIds.length > 0 ? filters.tagIds : undefined,
        sceneTagIds: filters.sceneTagIds.length > 0 ? filters.sceneTagIds : undefined,
        performerIds: filters.performerIds.length > 0 ? filters.performerIds : undefined,
        studioId: filters.studioId || undefined,
        q: filters.q || undefined,
      });
      setClips(result.clips);
      setTotal(result.total);
    } catch (err) {
      console.error("Failed to fetch clips", err);
    } finally {
      setLoading(false);
    }
  }, [page, showUngenerated, filters]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  // Sync staged filters when panel opens
  useEffect(() => {
    if (isFilterPanelOpen) {
      setStagedFilters(filters);
    }
  }, [isFilterPanelOpen, filters]);

  const handleApplyFilters = () => {
    setFilters(stagedFilters);
    setPage(1);
    setIsFilterPanelOpen(false);
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      tagIds: [],
      sceneTagIds: [],
      performerIds: [],
      studioId: null,
      q: "",
    };
    setStagedFilters(clearedFilters);
    setFilters(clearedFilters);
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setFilters((f) => ({ ...f, q: value }));
    setPage(1);
  };

  // Handle clip click - navigate to scene at timestamp
  const handleClipClick = useCallback(
    (clip) => {
      navigate(`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`);
    },
    [navigate]
  );

  // Context settings only shown in wall view
  const contextSettings = useMemo(() => {
    return currentViewMode === "wall" ? WALL_VIEW_SETTINGS : [];
  }, [currentViewMode]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Clips</h1>
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <input
            type="checkbox"
            checked={showUngenerated}
            onChange={(e) => {
              setShowUngenerated(e.target.checked);
              setPage(1);
            }}
            className="rounded"
            style={{ borderColor: "var(--border-color)" }}
          />
          Show clips without previews
        </label>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search clip titles..."
            value={filters.q}
            onSearch={handleSearchChange}
            debounceMs={400}
          />
        </div>
        <Button
          variant={hasActiveFilters ? "primary" : "secondary"}
          onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
        >
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z"
              clipRule="evenodd"
            />
          </svg>
          Filters
          {hasActiveFilters && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/20">
              Active
            </span>
          )}
        </Button>
      </div>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onToggle={() => setIsFilterPanelOpen(false)}
        onSubmit={handleApplyFilters}
        onClear={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <FilterControl
          type="searchable-select"
          label="Clip Tags"
          entityType="tags"
          value={stagedFilters.tagIds}
          onChange={(value) => setStagedFilters((f) => ({ ...f, tagIds: value }))}
          multi={true}
          placeholder="Filter by clip tags..."
        />
        <FilterControl
          type="searchable-select"
          label="Scene Tags"
          entityType="tags"
          value={stagedFilters.sceneTagIds}
          onChange={(value) => setStagedFilters((f) => ({ ...f, sceneTagIds: value }))}
          multi={true}
          placeholder="Filter by scene tags..."
        />
        <FilterControl
          type="searchable-select"
          label="Performers"
          entityType="performers"
          value={stagedFilters.performerIds}
          onChange={(value) => setStagedFilters((f) => ({ ...f, performerIds: value }))}
          multi={true}
          placeholder="Filter by performers..."
        />
        <FilterControl
          type="searchable-select"
          label="Studio"
          entityType="studios"
          value={stagedFilters.studioId || ""}
          onChange={(value) => setStagedFilters((f) => ({ ...f, studioId: value || null }))}
          multi={false}
          placeholder="Filter by studio..."
        />
      </FilterPanel>

      {/* Results count */}
      {!loading && (
        <div className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          {total} clip{total !== 1 ? "s" : ""} found
        </div>
      )}

      {/* View Controls and Content - Using SearchControls for view mode/zoom/settings UI only */}
      <SearchControls
        artifactType="clip"
        viewModes={VIEW_MODES}
        onViewModeChange={setCurrentViewMode}
        onQueryChange={noop}
        wallPlayback={wallPlayback}
        onWallPlaybackChange={updateWallPlayback}
        contextSettings={contextSettings}
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
        totalCount={total}
        totalPages={totalPages}
        syncToUrl={false}
      >
        {({ viewMode, zoomLevel, gridDensity }) =>
          viewMode === "table" ? (
            <TableView
              items={clips}
              columns={visibleColumns}
              sort={{ field: "stashCreatedAt", direction: "desc" }}
              onHideColumn={hideColumn}
              entityType="clip"
              isLoading={loading}
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
          ) : viewMode === "wall" ? (
            <WallView
              items={clips}
              entityType="clip"
              zoomLevel={zoomLevel}
              playbackMode={wallPlayback}
              onItemClick={handleClipClick}
              loading={loading}
              emptyMessage="No clips found"
            />
          ) : (
            <ClipGrid
              clips={clips}
              loading={loading}
              density={gridDensity}
              onClipClick={handleClipClick}
            />
          )
        }
      </SearchControls>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalCount={total}
            showPerPageSelector={false}
          />
        </div>
      )}
    </div>
  );
}
