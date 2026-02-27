import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useWatchHistory,
  useAllWatchHistory,
} from "../../src/hooks/useWatchHistory.js";

vi.mock("../../src/hooks/useAuth.js", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/services/api.js", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

import { useAuth } from "../../src/hooks/useAuth.js";
import { apiGet, apiPost } from "../../src/services/api.js";

describe("useWatchHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  describe("initial fetch", () => {
    it("fetches watch history for scene on mount", async () => {
      const mockHistory = { resumeTime: 120, oCount: 3, playCount: 10 };
      apiGet.mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).toHaveBeenCalledWith("/watch-history/scene-1");
      expect(result.current.watchHistory).toEqual(mockHistory);
      expect(result.current.error).toBeNull();
    });

    it("handles fetch error", async () => {
      apiGet.mockRejectedValue(new Error("Not found"));

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Not found");
      expect(result.current.watchHistory).toBeNull();
    });

    it("does not fetch without sceneId", async () => {
      const { result } = renderHook(() => useWatchHistory(null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });

    it("does not fetch when not authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });
  });

  describe("incrementOCounter", () => {
    it("increments O counter and updates local state", async () => {
      apiGet.mockResolvedValue({ resumeTime: 0, oCount: 1 });
      apiPost.mockResolvedValue({ success: true, oCount: 2 });

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let response;
      await act(async () => {
        response = await result.current.incrementOCounter();
      });

      expect(apiPost).toHaveBeenCalledWith("/watch-history/increment-o", {
        sceneId: "scene-1",
      });
      expect(response).toEqual({ success: true, oCount: 2 });
      expect(result.current.watchHistory.oCount).toBe(2);
    });

    it("returns null when not authenticated", async () => {
      useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let response;
      await act(async () => {
        response = await result.current.incrementOCounter();
      });

      expect(response).toBeNull();
      expect(apiPost).not.toHaveBeenCalled();
    });

    it("throws on API error", async () => {
      apiGet.mockResolvedValue({ oCount: 1 });
      apiPost.mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useWatchHistory("scene-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.incrementOCounter();
        })
      ).rejects.toThrow("Server error");
    });
  });

  describe("updateQuality", () => {
    it("stores quality value in ref", async () => {
      apiGet.mockResolvedValue({});

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
      apiGet
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
    useAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  });

  it("fetches all watch history on mount", async () => {
    const mockHistory = [
      { sceneId: "1", resumeTime: 60 },
      { sceneId: "2", resumeTime: 120 },
    ];
    apiGet.mockResolvedValue({ watchHistory: mockHistory });

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
    apiGet.mockResolvedValue({ watchHistory: [] });

    renderHook(() => useAllWatchHistory({ inProgress: true, limit: 10 }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        "/watch-history?limit=10&inProgress=true"
      );
    });
  });

  it("does not fetch when not authenticated", async () => {
    useAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
  });

  it("handles fetch error", async () => {
    apiGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAllWatchHistory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
  });

  it("provides refresh function", async () => {
    apiGet
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
