import type { ReactNode } from "react";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { actAsync } from "@tests/testUtils";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { apiGet } from "../../src/api";
import { markLibraryNotReady } from "../../src/api/hooks/useLibraryReady";
import { createQueryClient } from "../../src/api/queryClient";
import type { AuthContextValue } from "../../src/contexts/AuthContextProvider";
import { useAuth } from "../../src/hooks/useAuth";
import {
  useWatchHistory,
  useWatchedScenes,
} from "../../src/hooks/useWatchHistory";

vi.mock("../../src/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

vi.mock("../../src/api", () => ({
  apiGet: vi.fn(),
}));

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

      const { result } = renderHook(() => useWatchHistory("scene-1", "inst-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).toHaveBeenCalledWith(
        "/watch-history/scene-1?instanceId=inst-1"
      );
      expect(result.current.watchHistory).toEqual(mockHistory);
      expect(result.current.error).toBeNull();
    });

    it("handles fetch error", async () => {
      apiGetMock.mockRejectedValue(new Error("Not found"));

      const { result } = renderHook(() => useWatchHistory("scene-1", "inst-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Not found");
      expect(result.current.watchHistory).toBeNull();
    });

    it("does not fetch without sceneId", async () => {
      const { result } = renderHook(() =>
        useWatchHistory(untrusted<string>(null), "inst-1")
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });

    it("sends the scene's instance", async () => {
      apiGetMock.mockResolvedValue({});

      const { result } = renderHook(() => useWatchHistory("7", "server-b"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).toHaveBeenCalledWith(
        "/watch-history/7?instanceId=server-b"
      );
    });

    it("does not fetch without an instance", async () => {
      const { result } = renderHook(() => useWatchHistory("7", ""));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });

    it("does not fetch when not authenticated", async () => {
      useAuthMock.mockReturnValue({ isAuthenticated: false, isLoading: false });

      const { result } = renderHook(() => useWatchHistory("scene-1", "inst-1"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(apiGet).not.toHaveBeenCalled();
    });
  });

  describe("updateQuality", () => {
    it("stores quality value in ref", async () => {
      apiGetMock.mockResolvedValue({});

      const { result } = renderHook(() => useWatchHistory("scene-1", "inst-1"));

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

      const { result } = renderHook(() => useWatchHistory("scene-1", "inst-1"));

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

describe("useWatchedScenes", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const params = {
    view: "in_progress",
    sort: "recent",
    page: 1,
    perPage: 12,
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it("asks for one page with the view, sort, page and per_page", async () => {
    const body = { scenes: [{ id: "1" }], total: 5, totalPlayDuration: 60 };
    apiGetMock.mockResolvedValue(body);

    const { result } = renderHook(() => useWatchedScenes(params), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(body);
    });
    expect(apiGet).toHaveBeenCalledOnce();
    expect(apiGet).toHaveBeenCalledWith(
      "/watch-history/scenes?view=in_progress&sort=recent&page=1&per_page=12",
      expect.anything()
    );
  });

  it("sends count=false when the totals are not wanted", async () => {
    apiGetMock.mockResolvedValue({ scenes: [], total: null });

    renderHook(() => useWatchedScenes({ ...params, count: false }), {
      wrapper,
    });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        "/watch-history/scenes?view=in_progress&sort=recent&page=1&per_page=12&count=false",
        expect.anything()
      );
    });
  });

  it("asks a new question when the page changes", async () => {
    apiGetMock.mockResolvedValue({ scenes: [], total: 0 });

    const { rerender } = renderHook(
      ({ page }) => useWatchedScenes({ ...params, page }),
      { wrapper, initialProps: { page: 1 } }
    );
    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledTimes(1);
    });
    rerender({ page: 2 });

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledTimes(2);
    });
    expect(apiGet).toHaveBeenLastCalledWith(
      "/watch-history/scenes?view=in_progress&sort=recent&page=2&per_page=12",
      expect.anything()
    );
  });

  it("waits while the library is initializing", async () => {
    markLibraryNotReady(client);
    apiGetMock.mockResolvedValue({ scenes: [], total: 0 });

    renderHook(() => useWatchedScenes(params), { wrapper });
    await actAsync(() => undefined);

    expect(apiGet).not.toHaveBeenCalled();
  });
});
