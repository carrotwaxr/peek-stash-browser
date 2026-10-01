import type { ReactNode } from "react";
import type { UserStatsResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Mock } from "vitest";
import { apiGet } from "../../src/api";
import { useAuth } from "../../src/hooks/useAuth";
import { useUserStats } from "../../src/hooks/useUserStats";
import { createQueryWrapper } from "../testUtils";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/api", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  apiGet: vi.fn(),
  queryKeys: {
    user: {
      stats: () => ["user", "stats"],
    },
  },
}));

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
      expect(apiGetMock).toHaveBeenCalledWith(
        "/user-stats",
        expect.any(AbortSignal)
      );
      expect(result.current.data).toEqual(mockStats);
      expect(result.current.error).toBeNull();
    });

    it("adds sortBy param when not engagement", async () => {
      renderHook(() => useUserStats({ sortBy: "oCount" }), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats?sortBy=oCount",
          expect.any(AbortSignal)
        );
      });
    });

    it("adds sortBy param for playCount", async () => {
      renderHook(() => useUserStats({ sortBy: "playCount" }), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats?sortBy=playCount",
          expect.any(AbortSignal)
        );
      });
    });
  });

  describe("typed response", () => {
    it("sends sortBy, keys the query by it, and returns the typed response", async () => {
      const { result } = renderHook(() => useUserStats({ sortBy: "oCount" }), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGetMock).toHaveBeenCalledWith(
        "/user-stats?sortBy=oCount",
        expect.any(AbortSignal)
      );
      expect(result.current.data).toEqual(mockStats);
      expectTypeOf(
        result.current.data
      ).toEqualTypeOf<UserStatsResponse | null>();
    });
  });

  describe("auth gate", () => {
    it("does not fetch when not authenticated", () => {
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
    it("on the default sort asks /user-stats?refresh=1 and resolves once the refreshed answer is in the query", async () => {
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

      await act(async () => {
        await result.current.refresh();
      });

      expect(apiGetMock).toHaveBeenLastCalledWith(
        "/user-stats?refresh=1",
        expect.any(AbortSignal)
      );
      await waitFor(() => {
        expect(result.current.data).toEqual(updatedStats);
      });
    });

    it("on another sort keeps sortBy beside refresh=1", async () => {
      const { result } = renderHook(() => useUserStats({ sortBy: "oCount" }), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => {
        expect(result.current.data).toEqual(mockStats);
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(apiGetMock).toHaveBeenLastCalledWith(
        "/user-stats?sortBy=oCount&refresh=1",
        expect.any(AbortSignal)
      );
    });

    it("rejects when the refresh fails, keeping the previous answer", async () => {
      apiGetMock
        .mockResolvedValueOnce(mockStats)
        .mockRejectedValueOnce(new Error("Boom"));
      const { result } = renderHook(() => useUserStats(), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => {
        expect(result.current.data).toEqual(mockStats);
      });

      await act(async () => {
        await expect(result.current.refresh()).rejects.toThrow("Boom");
      });

      expect(result.current.data).toEqual(mockStats);
    });

    it("marks the other sorts stale so they refetch on their next view", async () => {
      const topStats = { ...mockStats, totalScenes: 1 };
      const refreshed = { ...mockStats, totalScenes: 2 };
      const afterRefresh = { ...mockStats, totalScenes: 3 };
      apiGetMock.mockImplementation((url: string) => {
        if (url === "/user-stats") return Promise.resolve(topStats);
        if (url === "/user-stats?refresh=1") return Promise.resolve(refreshed);
        return Promise.resolve(afterRefresh);
      });
      // Fresh for good, so only a stale mark makes a sort refetch
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
      const { result, rerender } = renderHook(
        ({ sortBy }: { sortBy: "engagement" | "oCount" }) =>
          useUserStats({ sortBy }),
        {
          initialProps: { sortBy: "engagement" as "engagement" | "oCount" },
          wrapper,
        }
      );
      await waitFor(() => {
        expect(result.current.data).toEqual(topStats);
      });
      rerender({ sortBy: "oCount" });
      await waitFor(() => {
        expect(result.current.data).toEqual(afterRefresh);
      });
      rerender({ sortBy: "engagement" });
      await act(async () => {
        await result.current.refresh();
      });
      apiGetMock.mockClear();

      // The refreshed sort is current; the other one refetches when shown
      rerender({ sortBy: "oCount" });
      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats?sortBy=oCount",
          expect.any(AbortSignal)
        );
      });
      rerender({ sortBy: "engagement" });
      expect(apiGetMock).not.toHaveBeenCalledWith(
        "/user-stats",
        expect.any(AbortSignal)
      );
    });
  });

  describe("sort change re-fetch", () => {
    it("re-fetches when sortBy changes", async () => {
      apiGetMock.mockResolvedValue(mockStats);

      const { rerender } = renderHook(
        ({ sortBy }: { sortBy: "engagement" | "oCount" }) =>
          useUserStats({ sortBy }),
        {
          initialProps: {
            sortBy: "engagement" as "engagement" | "oCount",
          },
          wrapper: createQueryWrapper(),
        }
      );

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats",
          expect.any(AbortSignal)
        );
      });

      rerender({ sortBy: "oCount" });

      await waitFor(() => {
        expect(apiGetMock).toHaveBeenCalledWith(
          "/user-stats?sortBy=oCount",
          expect.any(AbortSignal)
        );
      });
    });
  });
});
