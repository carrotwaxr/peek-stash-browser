/**
 * useFilterState - Preset Initialization Tests
 *
 * Validates that useFilterState correctly loads viewMode and perPage from
 * default presets. This is the data layer that SearchControls depends on.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// Mock the API module before importing anything that uses it
vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from "../../src/services/api.js";
import { useFilterState } from "../../src/hooks/useFilterState.js";

const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
};

describe("useFilterState - preset initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets viewMode from default preset (e.g., 'hierarchy')", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            tag: [
              {
                id: "preset-hierarchy",
                sort: "name",
                direction: "ASC",
                filters: {},
                viewMode: "hierarchy",
              },
            ],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { tag: "preset-hierarchy" } });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "tag",
          initialSort: "name",
          defaultViewMode: "grid",
        }),
      { wrapper: createWrapper(["/"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // viewMode should be "hierarchy" from the preset, NOT "grid" (the default)
    expect(result.current.viewMode).toBe("hierarchy");
  });

  it("uses defaultViewMode when no preset exists", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({ presets: {} });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: {} });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "tag",
          initialSort: "name",
          defaultViewMode: "grid",
        }),
      { wrapper: createWrapper(["/"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // No preset, so should use the default view mode
    expect(result.current.viewMode).toBe("grid");
  });

  it("applies perPage from default preset on init when no URL per_page param", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            scene: [
              {
                id: "preset-custom-perpage",
                sort: "o_counter",
                direction: "DESC",
                filters: {},
                viewMode: "grid",
                perPage: 48,
              },
            ],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { scene: "preset-custom-perpage" } });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          defaultViewMode: "grid",
        }),
      { wrapper: createWrapper(["/"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // perPage should come from the preset (48), not the default (24)
    expect(result.current.pagination.perPage).toBe(48);
  });

  it("uses URL per_page over preset perPage when URL param is explicit", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            scene: [
              {
                id: "preset-custom-perpage",
                sort: "o_counter",
                direction: "DESC",
                filters: {},
                viewMode: "grid",
                perPage: 48,
              },
            ],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { scene: "preset-custom-perpage" } });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          defaultViewMode: "grid",
        }),
      // URL explicitly sets per_page=12 — should take precedence over preset
      { wrapper: createWrapper(["/?per_page=12"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // URL per_page should win over preset perPage
    expect(result.current.pagination.perPage).toBe(12);
  });

  it("defaults perPage to 24 when no preset and no URL param", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({ presets: {} });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: {} });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          defaultViewMode: "grid",
        }),
      { wrapper: createWrapper(["/"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // No preset, no URL param — should use default of 24
    expect(result.current.pagination.perPage).toBe(24);
  });

  it("applies preset perPage when URL has filter params but no per_page", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            scene: [
              {
                id: "preset-custom-perpage",
                sort: "o_counter",
                direction: "DESC",
                filters: {},
                viewMode: "grid",
                perPage: 48,
              },
            ],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { scene: "preset-custom-perpage" } });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "scene",
          initialSort: "o_counter",
          defaultViewMode: "grid",
          filterOptions: [{ key: "favorite", type: "checkbox" }],
        }),
      // URL has filter params but no per_page
      { wrapper: createWrapper(["/?favorite=true"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // Preset perPage should be applied since URL doesn't have explicit per_page
    expect(result.current.pagination.perPage).toBe(48);
  });

  it("uses preset viewMode even when URL has no view param", async () => {
    apiGet.mockImplementation((url) => {
      if (url === "/user/filter-presets") {
        return Promise.resolve({
          presets: {
            tag: [
              {
                id: "preset-table",
                sort: "scene_count",
                direction: "DESC",
                filters: {},
                viewMode: "table",
              },
            ],
          },
        });
      }
      if (url === "/user/default-presets") {
        return Promise.resolve({ defaults: { tag: "preset-table" } });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(
      () =>
        useFilterState({
          artifactType: "tag",
          initialSort: "name",
          defaultViewMode: "grid",
        }),
      { wrapper: createWrapper(["/"])  }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    expect(result.current.viewMode).toBe("table");
  });
});
