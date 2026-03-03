import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUserStats } from "../../src/hooks/useUserStats";
import { createQueryWrapper } from "../testUtils";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/api", () => ({
  apiGet: vi.fn(),
  queryKeys: {
    user: {
      stats: () => ["user", "stats"],
    },
  },
}));

import { useAuth } from "../../src/hooks/useAuth";
import { apiGet } from "../../src/api";
import type { Mock } from "vitest";

const useAuthMock = useAuth as unknown as Mock;
const apiGetMock = apiGet as unknown as Mock;

describe("useUserStats", () => {
  const mockStats = {
    totalScenes: 100,
    totalPlayTime: 5000,
    topPerformers: [{ id: "1", name: "Test", engagement: 50 }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    apiGetMock.mockResolvedValue(mockStats);
  });

  describe("initial fetch", () => {
    it("fetches stats on mount with default sort", async () => {
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Default sortBy is "engagement" — should not add query param
      expect(apiGetMock).toHaveBeenCalledWith("/user-stats");
      expect(result.current.data).toEqual(mockStats);
      expect(result.current.error).toBeNull();
    });

    it("adds sortBy param when not engagement", async () => {
      renderHook(() => useUserStats({ sortBy: "oCount" }), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith("/user-stats?sortBy=oCount");
      });
    });

    it("adds sortBy param for playCount", async () => {
      renderHook(() => useUserStats({ sortBy: "playCount" }), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats?sortBy=playCount",
        );
      });
    });
  });

  describe("auth gate", () => {
    it("does not fetch when not authenticated", async () => {
      useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });

      // When disabled, isLoading is false immediately
      expect(result.current.loading).toBe(false);
      expect(apiGetMock).not.toHaveBeenCalled();
      expect(result.current.data).toBeNull();
    });
  });

  describe("error handling", () => {
    it("sets error message on failure", async () => {
      apiGetMock.mockRejectedValue(new Error("Forbidden"));

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Forbidden");
      expect(result.current.data).toBeNull();
    });

    it("uses fallback message when error has no message", async () => {
      apiGetMock.mockRejectedValue({});

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to fetch stats");
    });
  });

  describe("refresh", () => {
    it("re-fetches stats", async () => {
      const updatedStats = { ...mockStats, totalScenes: 200 };
      apiGetMock
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(updatedStats);

      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockStats);
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(updatedStats);
      });
    });
  });

  describe("sort change re-fetch", () => {
    it("re-fetches when sortBy changes", async () => {
      apiGetMock.mockResolvedValue(mockStats);

      const { rerender } = renderHook(
        ({ sortBy }: { sortBy: string }) => useUserStats({ sortBy } as any),
        {
          initialProps: { sortBy: "engagement" },
          wrapper: createQueryWrapper(),
        },
      );

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith("/user-stats");
      });

      rerender({ sortBy: "oCount" });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith("/user-stats?sortBy=oCount");
      });
    });
  });
});
