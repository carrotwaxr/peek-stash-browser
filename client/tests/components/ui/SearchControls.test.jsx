/**
 * SearchControls Component Tests
 *
 * Tests critical user flows for filter application, sorting, and pagination.
 * These tests focus on what the user sees and does, not implementation details.
 *
 * Key principle: Test what SHOULD happen, not what currently happens.
 * If a test fails, investigate whether it's a bug in the code or the test.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SearchControls from "../../../src/components/ui/SearchControls.jsx";

// Create a mock state object that can be manipulated per test
let mockFilterState = {};

// Mock the hooks and contexts
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

// Create default mock filter state for tests
const createMockFilterState = (overrides = {}) => ({
  filters: {},
  sort: { field: "o_counter", direction: "DESC" },
  pagination: { page: 1, perPage: 24 },
  searchText: "",
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
  loadPreset: vi.fn(),
  ...overrides,
});

// Helper to render SearchControls with required providers
const renderSearchControls = (props = {}, filterStateOverrides = {}) => {
  // Set up the mock filter state before rendering
  mockFilterState = createMockFilterState(filterStateOverrides);

  const defaultProps = {
    artifactType: "scene",
    onQueryChange: vi.fn(),
    totalPages: 10,
    totalCount: 240,
  };

  const mergedProps = { ...defaultProps, ...props };

  return {
    ...render(
      <MemoryRouter initialEntries={["/"]}>
        <SearchControls {...mergedProps} />
      </MemoryRouter>
    ),
    onQueryChange: mergedProps.onQueryChange,
  };
};

describe("SearchControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterState = createMockFilterState();
  });

  describe("Initial Rendering", () => {
    it("renders search input, sort control, and filters button", () => {
      renderSearchControls();

      // Should have search input
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();

      // Should have sort dropdown (there are multiple comboboxes - sort and per-page)
      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBeGreaterThanOrEqual(1);

      // Should have filters button
      expect(screen.getByText("Filters")).toBeInTheDocument();
    });

    it("triggers initial query on mount", async () => {
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      // Initial query should have default values
      const query = onQueryChange.mock.calls[0][0];
      expect(query.filter).toMatchObject({
        page: 1,
        per_page: 24,
        direction: "DESC",
      });
    });

    it("uses correct filter type for artifact type", async () => {
      const onQueryChange = vi.fn();
      renderSearchControls({ artifactType: "performer", onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      const query = onQueryChange.mock.calls[0][0];
      expect(query).toHaveProperty("performer_filter");
      expect(query).not.toHaveProperty("scene_filter");
    });
  });

  describe("Filter Panel", () => {
    it("opens filter panel when Filters button is clicked", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      // Find Filters button by its text and click
      const filtersButton = screen.getByText("Filters").closest("button");
      await user.click(filtersButton);

      // Filter panel should be visible - look for Apply Filters button
      await waitFor(() => {
        expect(screen.getByText("Apply Filters")).toBeInTheDocument();
      });
    });

    it("closes filter panel when Apply Filters is clicked", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      // Open panel
      const filtersButton = screen.getByText("Filters").closest("button");
      await user.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText("Apply Filters")).toBeInTheDocument();
      });

      // Click Apply
      const applyButton = screen.getByText("Apply Filters").closest("button");
      await user.click(applyButton);

      // Panel should close (Apply Filters button should disappear)
      await waitFor(() => {
        expect(screen.queryByText("Apply Filters")).not.toBeInTheDocument();
      });
    });
  });

  describe("Filter Application", () => {
    it("calls onQueryChange when filter panel is submitted", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      // Clear initial call
      onQueryChange.mockClear();

      // Open filter panel
      const filtersButton = screen.getByText("Filters").closest("button");
      await user.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText("Apply Filters")).toBeInTheDocument();
      });

      // Apply filters (even without changes, should still trigger onQueryChange)
      const applyButton = screen.getByText("Apply Filters").closest("button");
      await user.click(applyButton);

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      // Query should have page reset to 1
      const query = onQueryChange.mock.calls[0][0];
      expect(query.filter.page).toBe(1);
    });
  });

  describe("Sort Controls", () => {
    it("changes sort field when dropdown selection changes", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      // Find and change the sort dropdown (first combobox)
      const sortSelect = screen.getAllByRole("combobox")[0];
      await user.selectOptions(sortSelect, "rating");

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      const query = onQueryChange.mock.calls[0][0];
      expect(query.filter.sort).toBe("rating");
    });

    it("generates random seed for random sort", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      // Select random sort
      const sortSelect = screen.getAllByRole("combobox")[0];
      await user.selectOptions(sortSelect, "random");

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      const query = onQueryChange.mock.calls[0][0];
      // Sort should be random_XXXXXXXX format
      expect(query.filter.sort).toMatch(/^random_\d+$/);
    });
  });

  describe("Search Text", () => {
    it("updates query when search text changes", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      // Type in search box
      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "test query");

      // Should trigger query with search text (may be debounced)
      await waitFor(
        () => {
          expect(onQueryChange).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const query = onQueryChange.mock.calls[onQueryChange.mock.calls.length - 1][0];
      expect(query.filter.q).toBe("test query");
    });

    it("resets page to 1 when search text changes", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, "test");

      await waitFor(
        () => {
          expect(onQueryChange).toHaveBeenCalled();
        },
        { timeout: 1000 }
      );

      const query = onQueryChange.mock.calls[onQueryChange.mock.calls.length - 1][0];
      expect(query.filter.page).toBe(1);
    });
  });

  describe("Pagination", () => {
    it("renders pagination controls when totalPages > 0", () => {
      renderSearchControls({ totalPages: 10, totalCount: 240 });

      // Should have pagination info showing (both top and bottom pagination)
      const paginationElements = screen.getAllByText(/of 240/);
      expect(paginationElements.length).toBeGreaterThanOrEqual(1);
    });

    it("changes per_page when dropdown selection changes", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();
      renderSearchControls({ onQueryChange, totalPages: 10, totalCount: 240 });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      // Find per_page dropdown - it should have options like 12, 24, 48
      const comboboxes = screen.getAllByRole("combobox");
      // Per page selector should be one with "24" as current value
      const perPageSelect = comboboxes.find((cb) =>
        Array.from(cb.options).some((opt) => opt.value === "48")
      );

      if (perPageSelect) {
        await user.selectOptions(perPageSelect, "48");

        await waitFor(() => {
          expect(onQueryChange).toHaveBeenCalled();
        });

        const query = onQueryChange.mock.calls[0][0];
        expect(query.filter.per_page).toBe(48);
        expect(query.filter.page).toBe(1); // Should reset to page 1
      }
    });
  });

  describe("Different Artifact Types", () => {
    it("shows performer sort options for performer artifact type", () => {
      renderSearchControls({ artifactType: "performer" });

      // Find the sort dropdown
      const sortSelect = screen.getAllByRole("combobox")[0];

      // Should have performer-specific sort options like "Height"
      const options = Array.from(sortSelect.options).map((opt) => opt.textContent);
      expect(options).toContain("Height");
    });

    it("builds correct filter type for each artifact type", async () => {
      const testCases = [
        { artifactType: "scene", expectedKey: "scene_filter" },
        { artifactType: "performer", expectedKey: "performer_filter" },
        { artifactType: "studio", expectedKey: "studio_filter" },
        { artifactType: "tag", expectedKey: "tag_filter" },
        { artifactType: "group", expectedKey: "group_filter" },
        { artifactType: "gallery", expectedKey: "gallery_filter" },
        { artifactType: "image", expectedKey: "image_filter" },
      ];

      for (const { artifactType, expectedKey } of testCases) {
        const onQueryChange = vi.fn();

        const { unmount } = render(
          <MemoryRouter initialEntries={["/"]}>
            <SearchControls
              artifactType={artifactType}
              onQueryChange={onQueryChange}
              totalPages={1}
              totalCount={10}
            />
          </MemoryRouter>
        );

        await waitFor(() => {
          expect(onQueryChange).toHaveBeenCalled();
        });

        const query = onQueryChange.mock.calls[0][0];
        expect(query).toHaveProperty(expectedKey);

        unmount();
      }
    });
  });

  describe("Loading State", () => {
    it("shows loading spinner when isLoadingPresets is true", () => {
      mockFilterState = createMockFilterState({ isLoadingPresets: true });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <SearchControls
            artifactType="scene"
            onQueryChange={vi.fn()}
            totalPages={10}
            totalCount={240}
          />
        </MemoryRouter>
      );

      // Should show loading text
      expect(screen.getByText("Loading filters...")).toBeInTheDocument();
    });
  });

  describe("Clear Filters", () => {
    it("shows Clear All button when filters are active", async () => {
      const user = userEvent.setup();
      // Render with active filters
      renderSearchControls({}, { filters: { favorite: true } });

      // Open filter panel to see Clear All
      const filtersButton = screen.getByText("Filters").closest("button");
      await user.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText("Clear All")).toBeInTheDocument();
      });
    });

    it("calls onQueryChange when Clear All is clicked", async () => {
      const user = userEvent.setup();
      const onQueryChange = vi.fn();

      renderSearchControls({ onQueryChange }, { filters: { favorite: true } });

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });

      onQueryChange.mockClear();

      // Open filter panel
      const filtersButton = screen.getByText("Filters").closest("button");
      await user.click(filtersButton);

      await waitFor(() => {
        expect(screen.getByText("Clear All")).toBeInTheDocument();
      });

      // Click Clear All
      const clearButton = screen.getByText("Clear All").closest("button");
      await user.click(clearButton);

      await waitFor(() => {
        expect(onQueryChange).toHaveBeenCalled();
      });
    });
  });
});
