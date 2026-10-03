import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApiClient from "../../../src/api/client";
import { apiGet, apiPost } from "../../../src/api/client";
import {
  type SimilarScenesResponse,
  useSceneList,
  useSceneMediaLink,
  useSimilarScenes,
} from "../../../src/api/hooks/useScenes";
import { libraryApi } from "../../../src/api/library";
import { queryKeys } from "../../../src/api/queryKeys";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findScenes: vi.fn(),
  },
}));

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSceneList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useSceneList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findScenes).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { scenes: [], total: 0 };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useSceneList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findScenes).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal)
    );
  });

  it("passes signal to queryFn", async () => {
    const mockData = { scenes: [], total: 0 };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useSceneList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findScenes).toHaveBeenCalled());
    const callArgs = must(
      (libraryApi.findScenes as ReturnType<typeof vi.fn>).mock.calls[0]
    );
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("passes instanceId through to query key", async () => {
    const mockData = { scenes: [], total: 0 };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useSceneList(params, "instance-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it("keeps the previous page's data while the next page loads", async () => {
    const page1 = { findScenes: { scenes: [{ id: "1" }], count: 2 } };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useSceneList({ filter: { page, per_page: 1 } }),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    await waitFor(() => expect(libraryApi.findScenes).toHaveBeenCalledTimes(2));

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});

describe("useSimilarScenes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Told apart by their count: the hook never reads the scenes
  const similarPage = (count: number): SimilarScenesResponse => ({
    scenes: [],
    count,
    page: 1,
    perPage: 1,
  });

  it("on a new scene the similar list is empty until its own answer arrives", async () => {
    const forFirst = similarPage(2);
    vi.mocked(apiGet)
      .mockResolvedValueOnce(forFirst)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ sceneId }: { sceneId: string }) =>
        useSimilarScenes(sceneId, "inst-a", 1),
      { wrapper: createWrapper(), initialProps: { sceneId: "1" } }
    );
    await waitFor(() => expect(result.current.data).toEqual(forFirst));

    rerender({ sceneId: "2" });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);
  });

  it("page 2 of the same scene keeps page 1 on screen while it loads", async () => {
    const page1 = similarPage(2);
    vi.mocked(apiGet)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useSimilarScenes("1", "inst-a", page),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.data).toEqual(page1));

    rerender({ page: 2 });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });

  it("the same scene id on another instance does not keep the list", async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce(similarPage(3))
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ instanceId }: { instanceId: string }) =>
        useSimilarScenes("1", instanceId, 1),
      { wrapper: createWrapper(), initialProps: { instanceId: "inst-a" } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ instanceId: "inst-b" });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));

    expect(result.current.data).toBeUndefined();
  });
});

describe("useSceneMediaLink", () => {
  const link = {
    expiresAt: "2026-10-04T00:00:00.000Z",
    streams: [],
    cast: null,
    captions: [],
    poster: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue(link);
  });

  it("posts {instanceId} to /scene/:id/media-link", async () => {
    const { result } = renderHook(() => useSceneMediaLink("5", "A"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(link);
    expect(apiPost).toHaveBeenCalledWith("/scene/5/media-link", {
      instanceId: "A",
    });
  });

  it("keys by instance and scene, so A:5 and B:5 differ", () => {
    expect(queryKeys.scenes.mediaLink("A", "5")).toEqual([
      "scenes",
      "A",
      "mediaLink",
      "5",
    ]);
    expect(queryKeys.scenes.mediaLink("A", "5")).not.toEqual(
      queryKeys.scenes.mediaLink("B", "5")
    );
  });

  it("is disabled without an id, and when the caller's enabled is false", () => {
    const wrapper = createWrapper();
    const noId = renderHook(() => useSceneMediaLink("", "A"), { wrapper });
    const noInstance = renderHook(() => useSceneMediaLink("5", ""), {
      wrapper,
    });
    const off = renderHook(
      () => useSceneMediaLink("5", "A", { enabled: false }),
      { wrapper }
    );

    for (const r of [noId, noInstance, off]) {
      expect(r.result.current.fetchStatus).toBe("idle");
    }
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("refetches hourly", async () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
      renderHook(() => useSceneMediaLink("5", "A"), { wrapper });
      await vi.advanceTimersByTimeAsync(0);
      expect(apiPost).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1000);
      expect(apiPost).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(apiPost).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
