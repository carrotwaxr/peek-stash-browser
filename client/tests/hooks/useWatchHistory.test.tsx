import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  useWatchHistory,
  useAllWatchHistory,
} from "../../src/hooks/useWatchHistory";
import type { AuthContextValue } from "../../src/contexts/AuthContextProvider";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/api", () => ({
  apiGet: vi.fn(),
}));

import { useAuth } from "../../src/hooks/useAuth";
import { apiGet } from "../../src/api";

const useAuthMock = useAuth as unknown as Mock;
const apiGetMock = apiGet as unknown as Mock;

describe("useWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  describe("initial fetch", () => {
    it("fetches watch history for scene on mount", async () => {
      const mockHistory = { resumeTime: 120, oCount: 3, playCount: 10 };
      apiGetMock.mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).toHaveBeenCalledWith("/watch-history/scene-1");
      expect(result.current.watchHistory).toEqual(mockHistory);
      expect(result.current.error).toBeNull();
    });

    it("handles fetch error", async () => {
      apiGetMock.mockRejectedValue(new Error("Not found"));

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Not found");
      expect(result.current.watchHistory).toBeNull();
    });

    it("does not fetch without sceneId", async () => {
      const { result } = renderHook(() => useWatchHistory(null as any));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });

    it("does not fetch when not authenticated", async () => {
      useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });
  });

  describe("updateQuality", () => {
    it("stores quality value in ref", async () => {
      apiGetMock.mockResolvedValue({});

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // updateQuality doesn't trigger re-render (ref-based), just verify it doesn't throw
      act(() => {
        result.current.updateQuality("1080p");
      });
    });
  });

  describe("refresh", () => {
    it("re-fetches watch history", async () => {
      apiGetMock
        .mockResolvedValueOnce({ oCount: 1 })
        .mockResolvedValueOnce({ oCount: 5 });

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.watchHistory).toEqual({ oCount: 1 });
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.watchHistory).toEqual({ oCount: 5 });
      expect(apiGet).toHaveBeenCalledTimes(2);
    });
  });
});

describe("useAllWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  it("fetches all watch history on mount", async () => {
    const mockHistory = [
      { sceneId: "1", resumeTime: 60 },
      { sceneId: "2", resumeTime: 120 },
    ];
    apiGetMock.mockResolvedValue({ watchHistory: mockHistory });

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiGet).toHaveBeenCalledWith(
      "/watch-history?limit=20&inProgress=false"
    );
    expect(result.current.data).toEqual(mockHistory);
  });

  it("passes inProgress and limit params", async () => {
    apiGetMock.mockResolvedValue({ watchHistory: [] });

    renderHook(() => useAllWatchHistory({ inProgress: true, limit: 10 }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        "/watch-history?limit=10&inProgress=true"
      );
    });
  });

  it("does not fetch when not authenticated", async () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it("handles fetch error", async () => {
    apiGetMock.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("provides refresh function", async () => {
    apiGetMock
      .mockResolvedValueOnce({ watchHistory: [{ sceneId: "1" }] })
      .mockResolvedValueOnce({ watchHistory: [{ sceneId: "1" }, { sceneId: "2" }] });

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toHaveLength(2);
  });
});
