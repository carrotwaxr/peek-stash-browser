// client/src/hooks/__tests__/useFilterState.test.jsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useFilterState } from "../useFilterState.js";

// Mock the API
vi.mock("../../services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../services/api.js";

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
});
