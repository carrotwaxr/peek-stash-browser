import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUserStats } from "../../src/hooks/useUserStats.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
}));

import { useAuth } from "../../src/hooks/useAuth.js";
import { apiGet } from "../../src/services/api.js";

describe("useUserStats", () => {
  const mockStats = {
    totalScenes: 100,
    totalPlayTime: 5000,
    topPerformers: [{ id: "1", name: "Test", engagement: 50 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiGet.mockResolvedValue(mockStats);
  });

  describe("initial fetch", () => {
    it("fetches stats on mount with default sort", async () => {
      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Default sortBy is "engagement" — should not add query param
      expect(apiGet).toHaveBeenCalledWith("/user-stats");
      expect(result.current.data).toEqual(mockStats);
      expect(result.current.error).toBeNull();
    });

    it("adds sortBy param when not engagement", async () => {
      renderHook(() => useUserStats({ sortBy: "oCount" }));

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/user-stats?sortBy=oCount");
      });
    });

    it("adds sortBy param for playCount", async () => {
      renderHook(() => useUserStats({ sortBy: "playCount" }));

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/user-stats?sortBy=playCount");
      });
    });
  });

  describe("auth gate", () => {
    it("does not fetch when not authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
      expect(result.current.data).toBeNull();
    });
  });

  describe("error handling", () => {
    it("sets error message on failure", async () => {
      apiGet.mockRejectedValue(new Error("Forbidden"));

      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Forbidden");
      expect(result.current.data).toBeNull();
    });

    it("uses fallback message when error has no message", async () => {
      apiGet.mockRejectedValue({});

      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch stats");
    });
  });

  describe("refresh", () => {
    it("re-fetches stats", async () => {
      const updatedStats = { ...mockStats, totalScenes: 200 };
      apiGet
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(updatedStats);

      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.data).toEqual(mockStats);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.data).toEqual(updatedStats);
    });

    it("accepts showLoading parameter", async () => {
      apiGet.mockResolvedValue(mockStats);

      const { result } = renderHook(() => useUserStats());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Refresh with showLoading=false should not set loading to true
      // (this is for sort changes where we want to avoid flicker)
      let loadingDuringRefresh = null;
      apiGet.mockImplementation(() => {
        loadingDuringRefresh = result.current.loading;
        return Promise.resolve(mockStats);
      });

      await act(async () => {
        await result.current.refresh(false);
      });

      expect(loadingDuringRefresh).toBe(false);
    });
  });

  describe("sort change re-fetch", () => {
    it("re-fetches when sortBy changes", async () => {
      apiGet.mockResolvedValue(mockStats);

      const { rerender } = renderHook(
        ({ sortBy }) => useUserStats({ sortBy }),
        { initialProps: { sortBy: "engagement" } }
      );

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/user-stats");
      });

      rerender({ sortBy: "oCount" });

      await waitFor(() => {
        expect(apiGet).toHaveBeenCalledWith("/user-stats?sortBy=oCount");
      });
    });
  });
});
