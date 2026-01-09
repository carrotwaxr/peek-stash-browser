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
});
