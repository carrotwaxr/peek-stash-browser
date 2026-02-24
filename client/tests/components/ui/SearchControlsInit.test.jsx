/**
 * SearchControls Initialization Tests
 *
 * Tests that SearchControls notifies parent components of viewMode and perPage
 * during initialization, not just during manual user interaction.
 *
 * Bug: When useFilterState loads a default preset that sets viewMode to
 * "hierarchy", SearchControls never calls onViewModeChange to notify the
 * parent (e.g., Tags.jsx). The parent's activeViewMode stays "grid", so
 * the hierarchy data fetch useEffect never triggers.
 */
import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SearchControls from "../../../src/components/ui/SearchControls.jsx";

// Track the mock state that useFilterState will return
let mockFilterState = {};

// Mock hooks and contexts
vi.mock("../../../src/hooks/useTVMode.js", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

vi.mock("../../../src/hooks/useHorizontalNavigation.js", () => ({
  useHorizontalNavigation: () => ({
    setItemRef: () => {},
    isFocused: () => false,
  }),
}));

vi.mock("../../../src/contexts/UnitPreferenceContext.js", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));

vi.mock("../../../src/contexts/CardDisplaySettingsContext.jsx", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showCodeOnCard: true,
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

// Mock useFilterState to provide controllable state
vi.mock("../../../src/hooks/useFilterState.js", () => ({
  useFilterState: () => mockFilterState,
}));

vi.mock("../../../src/services/api.js", () => ({
  apiGet: vi.fn().mockResolvedValue({ presets: {}, defaults: {} }),
  apiPost: vi.fn().mockResolvedValue({}),
  libraryApi: {
    findPerformers: vi.fn().mockResolvedValue({ findPerformers: { count: 0, performers: [] } }),
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudios: vi.fn().mockResolvedValue({ findStudios: { count: 0, studios: [] } }),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTags: vi.fn().mockResolvedValue({ findTags: { count: 0, tags: [] } }),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroups: vi.fn().mockResolvedValue({ findGroups: { count: 0, groups: [] } }),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleries: vi.fn().mockResolvedValue({ findGalleries: { count: 0, galleries: [] } }),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

// Helper to create mock filter state with full set of properties
const createMockFilterState = (overrides = {}) => ({
  filters: {},
  sort: { field: "o_counter", direction: "DESC" },
  pagination: { page: 1, perPage: 24 },
  searchText: "",
  viewMode: "grid",
  zoomLevel: "medium",
  gridDensity: "medium",
  timelinePeriod: null,
  isInitialized: true,
  isLoadingPresets: false,
  setFilter: vi.fn(),
  setFilters: vi.fn(),
  removeFilter: vi.fn(),
  clearFilters: vi.fn(),
  setSort: vi.fn(),
  setPage: vi.fn(),
  setPerPage: vi.fn(),
  setSearchText: vi.fn(),
  setViewMode: vi.fn(),
  setZoomLevel: vi.fn(),
  setGridDensity: vi.fn(),
  setTableColumns: vi.fn(),
  setTimelinePeriod: vi.fn(),
  loadPreset: vi.fn(),
  ...overrides,
});

describe("SearchControls - initialization notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterState = createMockFilterState();
  });

  it("calls onViewModeChange during init when preset sets non-default viewMode", async () => {
    const onViewModeChange = vi.fn();
    const onQueryChange = vi.fn();

    // Simulate useFilterState having loaded a preset with viewMode "hierarchy"
    mockFilterState = createMockFilterState({
      viewMode: "hierarchy",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <SearchControls
          artifactType="tag"
          onQueryChange={onQueryChange}
          onViewModeChange={onViewModeChange}
          totalPages={1}
          totalCount={10}
          viewModes={[
            { id: "grid", label: "Grid" },
            { id: "table", label: "Table" },
            { id: "hierarchy", label: "Hierarchy" },
          ]}
        />
      </MemoryRouter>
    );

    // Wait for the initial query to fire
    await waitFor(() => {
      expect(onQueryChange).toHaveBeenCalled();
    });

    // The bug: onViewModeChange should be called during initialization
    // so the parent knows to switch to hierarchy mode
    expect(onViewModeChange).toHaveBeenCalledWith("hierarchy");
  });

  it("calls onPerPageStateChange during init", async () => {
    const onPerPageStateChange = vi.fn();
    const onQueryChange = vi.fn();

    mockFilterState = createMockFilterState({
      pagination: { page: 1, perPage: 48 },
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <SearchControls
          artifactType="scene"
          onQueryChange={onQueryChange}
          onPerPageStateChange={onPerPageStateChange}
          totalPages={5}
          totalCount={240}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(onQueryChange).toHaveBeenCalled();
    });

    // The bug: onPerPageStateChange should be called during initialization
    // so the parent has the correct perPage value
    expect(onPerPageStateChange).toHaveBeenCalledWith(48);
  });

  it("calls onViewModeChange even when viewMode matches default (to sync parent)", async () => {
    const onViewModeChange = vi.fn();
    const onQueryChange = vi.fn();

    // viewMode is "grid" which matches the default - parent should still be notified
    mockFilterState = createMockFilterState({
      viewMode: "grid",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <SearchControls
          artifactType="tag"
          onQueryChange={onQueryChange}
          onViewModeChange={onViewModeChange}
          totalPages={1}
          totalCount={10}
          viewModes={[
            { id: "grid", label: "Grid" },
            { id: "table", label: "Table" },
          ]}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(onQueryChange).toHaveBeenCalled();
    });

    // Even for default viewMode, parent should be notified to stay in sync
    expect(onViewModeChange).toHaveBeenCalledWith("grid");
  });
});
