// client/tests/hooks/useFilterState.viewMode.test.jsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { useFilterState } from "../../src/hooks/useFilterState.js";

// Mock the API calls
vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn((url) => {
    if (url === "/user/filter-presets") {
      return Promise.resolve({ presets: {} });
    }
    if (url === "/user/default-presets") {
      return Promise.resolve({ defaults: {} });
    }
    return Promise.resolve({});
  }),
}));

// Helper to capture URL search params
let capturedSearchParams = null;
const SearchParamsCapture = ({ children }) => {
  const [searchParams] = useSearchParams();
  capturedSearchParams = searchParams;
  return children;
};

// Wrapper to provide router context with initial URL
const createWrapper = (initialEntries = ["/"]) => {
  return ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <SearchParamsCapture>{children}</SearchParamsCapture>
    </MemoryRouter>
  );
};

describe("useFilterState - view mode persistence", () => {
  beforeEach(() => {
    capturedSearchParams = null;
  });

  it("reads view mode from URL when present", async () => {
    const Wrapper = createWrapper(["/?view=folder"]);

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    // Wait for async initialization to complete
    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // View mode should be "folder" from URL, not "grid" (default)
    expect(result.current.viewMode).toBe("folder");
  });

  it("uses default view mode when URL has no view param", async () => {
    const Wrapper = createWrapper(["/"]);

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    expect(result.current.viewMode).toBe("grid");
  });

  it("preserves view mode in URL after initialization", async () => {
    const Wrapper = createWrapper(["/?view=folder"]);

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    // URL should still have view=folder
    expect(capturedSearchParams.get("view")).toBe("folder");
  });

  it("restores view mode from URL after remount (simulating browser back)", async () => {
    // Simulate: URL has view=folder (from browser history after back navigation)
    const Wrapper = createWrapper(["/?view=folder"]);

    // First mount
    const { result, unmount } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    expect(result.current.viewMode).toBe("folder");

    // Unmount (simulating navigation away)
    unmount();

    // Remount with same URL (simulating browser back)
    const { result: result2 } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result2.current.isInitialized).toBe(true);
    });

    // View mode should be restored from URL
    expect(result2.current.viewMode).toBe("folder");
  });

  it("initializes viewMode to default before async completes", () => {
    const Wrapper = createWrapper(["/?view=folder"]);

    const { result } = renderHook(
      () => useFilterState({
        artifactType: "gallery",
        defaultViewMode: "grid",
      }),
      { wrapper: Wrapper }
    );

    // Before initialization completes, viewMode is the default
    // This is expected behavior - we just need to make sure it updates
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.viewMode).toBe("grid"); // Initial state before async completes
  });
});
