import { useState, useEffect, useCallback } from "react";
import { getClips } from "../../services/api.js";
import {
  SearchInput,
  FilterPanel,
  FilterControl,
  Button,
} from "../ui/index.js";
import ClipGrid from "./ClipGrid.jsx";

export default function ClipSearch() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showUngenerated, setShowUngenerated] = useState(false);
  const perPage = 24;

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

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Clips</h1>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showUngenerated}
            onChange={(e) => {
              setShowUngenerated(e.target.checked);
              setPage(1);
            }}
            className="rounded border-slate-500"
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
        <div className="text-sm text-slate-400 mb-4">
          {total} clip{total !== 1 ? "s" : ""} found
        </div>
      )}

      {/* Grid */}
      <ClipGrid clips={clips} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-slate-700 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-slate-700 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
