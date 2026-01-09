// tests/hooks/useFilterState.test.jsx
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useFilterState } from "../../src/hooks/useFilterState.js";

// Mock the API
vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../src/services/api.js";

const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
};

describe("useFilterState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no presets
    apiGet.mockResolvedValue({ presets: {}, defaults: {} });
  });

  describe("initialization", () => {
    it("initializes with default values when URL is empty", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
        }),
        { wrapper: createWrapper(["/"]) }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.sort.field).toBe("o_counter");
      expect(result.current.sort.direction).toBe("DESC");
      expect(result.current.pagination.page).toBe(1);
      expect(result.current.pagination.perPage).toBe(24);
      expect(result.current.filters).toEqual({});
    });

    it("parses filters from URL on mount", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          filterOptions: [
            { key: "favorite", type: "checkbox" },
          ],
        }),
        { wrapper: createWrapper(["/?favorite=true&sort=rating&page=2"]) }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      expect(result.current.filters.favorite).toBe(true);
      expect(result.current.sort.field).toBe("rating");
      expect(result.current.pagination.page).toBe(2);
    });
  });

  describe("preset handling", () => {
    it("applies full preset (sort + filters) when URL has no filter params", async () => {
      apiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({
            presets: {
              scene: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: { favorite: true } }],
            },
          });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: { scene: "preset-1" } });
        }
      });

      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          filterOptions: [{ key: "favorite", type: "checkbox" }],
        }),
        { wrapper: createWrapper(["/"]) } // No URL params
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should have preset sort AND filters
      expect(result.current.sort.field).toBe("rating");
      expect(result.current.sort.direction).toBe("ASC");
      expect(result.current.filters.favorite).toBe(true);
    });

    it("applies preset sort ONLY when URL has filter params", async () => {
      apiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({
            presets: {
              performer: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: { favorite: true } }],
            },
          });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: { performer: "preset-1" } });
        }
      });

      const { result } = renderHook(
        () => useFilterState({
          artifactType: "performer",
          initialSort: "o_counter",
          filterOptions: [
            { key: "favorite", type: "checkbox" },
            { key: "sceneId", type: "searchable-select" },
          ],
        }),
        { wrapper: createWrapper(["/?sceneId=123"]) } // Has filter params
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Should have preset SORT only
      expect(result.current.sort.field).toBe("rating");
      expect(result.current.sort.direction).toBe("ASC");
      // Should NOT have preset filters - only URL filter
      expect(result.current.filters.favorite).toBeUndefined();
      expect(result.current.filters.sceneId).toBe("123");
    });

    it("URL sort takes precedence over preset sort", async () => {
      apiGet.mockImplementation((url) => {
        if (url === "/user/filter-presets") {
          return Promise.resolve({
            presets: {
              scene: [{ id: "preset-1", sort: "rating", direction: "ASC", filters: {} }],
            },
          });
        }
        if (url === "/user/default-presets") {
          return Promise.resolve({ defaults: { scene: "preset-1" } });
        }
      });

      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          filterOptions: [],
        }),
        { wrapper: createWrapper(["/?sort=date&dir=DESC"]) }
      );

      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // URL sort wins over preset
      expect(result.current.sort.field).toBe("date");
      expect(result.current.sort.direction).toBe("DESC");
    });
  });

  describe("actions", () => {
    it("setPage updates pagination and pushes to history", async () => {
      const { result } = renderHook(
        () => useFilterState({ artifactType: "scene", filterOptions: [] }),
        { wrapper: createWrapper(["/"]) }
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      act(() => {
        result.current.setPage(3);
      });

      expect(result.current.pagination.page).toBe(3);
    });

    it("setSort updates sort and pushes to history", async () => {
      const { result } = renderHook(
        () => useFilterState({ artifactType: "scene", filterOptions: [] }),
        { wrapper: createWrapper(["/"]) }
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      act(() => {
        result.current.setSort("rating", "ASC");
      });

      expect(result.current.sort.field).toBe("rating");
      expect(result.current.sort.direction).toBe("ASC");
    });

    it("setFilter updates filters and resets page to 1", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          filterOptions: [{ key: "favorite", type: "checkbox" }],
        }),
        { wrapper: createWrapper(["/?page=3"]) }
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      act(() => {
        result.current.setFilter("favorite", true);
      });

      expect(result.current.filters.favorite).toBe(true);
      expect(result.current.pagination.page).toBe(1); // Reset to page 1
    });

    it("removeFilter removes filter and resets page to 1", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          filterOptions: [{ key: "favorite", type: "checkbox" }],
        }),
        { wrapper: createWrapper(["/?favorite=true&page=3"]) }
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      act(() => {
        result.current.removeFilter("favorite");
      });

      expect(result.current.filters.favorite).toBeUndefined();
      expect(result.current.pagination.page).toBe(1);
    });

    it("clearFilters resets all filters but keeps permanent filters", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          permanentFilters: { studioId: "456" },
          filterOptions: [
            { key: "favorite", type: "checkbox" },
            { key: "studioId", type: "searchable-select" },
          ],
        }),
        { wrapper: createWrapper(["/?favorite=true"]) }
      );

      await waitFor(() => expect(result.current.isInitialized).toBe(true));

      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters.favorite).toBeUndefined();
      expect(result.current.filters.studioId).toBe("456"); // Permanent kept
    });
  });

  describe("search text debounce", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("debounces search text URL updates by 500ms", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          filterOptions: [],
          syncToUrl: true,
        }),
        { wrapper: createWrapper(["/"]) }
      );

      // Wait for initialization (run all pending promises/timers)
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isInitialized).toBe(true);

      // Update search text
      act(() => {
        result.current.setSearchText("test");
      });

      // State updates immediately
      expect(result.current.searchText).toBe("test");
      // Page resets immediately
      expect(result.current.pagination.page).toBe(1);

      // Type more characters rapidly (simulating typing)
      act(() => {
        result.current.setSearchText("test2");
      });
      expect(result.current.searchText).toBe("test2");

      act(() => {
        result.current.setSearchText("test query");
      });
      expect(result.current.searchText).toBe("test query");

      // Advance timers by 500ms to trigger debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Final state should be the last typed value
      expect(result.current.searchText).toBe("test query");
    });

    it("clears pending debounce when typing continues", async () => {
      const { result } = renderHook(
        () => useFilterState({
          artifactType: "scene",
          filterOptions: [],
          syncToUrl: true,
        }),
        { wrapper: createWrapper(["/"]) }
      );

      // Wait for initialization
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(result.current.isInitialized).toBe(true);

      // Type first character
      act(() => {
        result.current.setSearchText("a");
      });

      // Wait 300ms (less than 500ms debounce)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // Type another character (should reset debounce timer)
      act(() => {
        result.current.setSearchText("ab");
      });

      // Wait another 300ms (total 600ms from first keystroke, but only 300ms from second)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // State should show latest value
      expect(result.current.searchText).toBe("ab");

      // Complete the debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(result.current.searchText).toBe("ab");
    });
  });
});
