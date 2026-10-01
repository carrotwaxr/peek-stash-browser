import React from "react";
import { QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../src/api/client";
import {
  useDecrementImageOCounter,
  useDecrementOCounter,
  useIncrementOCounter,
} from "../../../src/api/hooks/useOCounterMutation";
import { createQueryClient } from "../../../src/api/queryClient";
import { queryKeys } from "../../../src/api/queryKeys";
import { actAsync } from "../../testUtils";

vi.mock("../../../src/api/client", () => ({
  apiPost: vi.fn(),
  // The query client registers its library-stamp listener here
  setLibraryStampListener: vi.fn(),
}));

function sceneList(oCount: number) {
  return {
    findScenes: {
      scenes: [{ id: "scene-1", instanceId: "inst-1", o_counter: oCount }],
    },
  };
}

function imageList(oCounter: number) {
  return {
    findImages: {
      images: [{ id: "image-1", instanceId: "inst-1", oCounter }],
    },
  };
}

function createWrapper() {
  const queryClient = createQueryClient();
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    queryClient,
  };
}

describe("useIncrementOCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a mutation function", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    expect(result.current.mutate).toBeDefined();
    expect(typeof result.current.mutate).toBe("function");
  });

  it("calls scene o-counter endpoint with sceneId", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      oCount: 5,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/watch-history/increment-o", {
      sceneId: "scene-1",
      instanceId: "inst-1",
    });
  });

  it("calls image o-counter endpoint with imageId", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      oCount: 3,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ imageId: "image-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/image-view-history/increment-o", {
      imageId: "image-1",
      instanceId: "inst-1",
    });
  });

  it("passes instanceId for image o-counter", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      oCount: 1,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ imageId: "image-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/image-view-history/increment-o", {
      imageId: "image-1",
      instanceId: "inst-1",
    });
  });

  it("rejects when neither sceneId nor imageId is provided", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "Either sceneId or imageId is required"
    );
  });

  it("an O press writes the answer's count into the cached scene row and sends no list request", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 2 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    const listFn = vi.fn(() => Promise.resolve(sceneList(1)));
    queryClient.setQueryData(listKey, sceneList(1));
    const observer = new QueryObserver(queryClient, {
      queryKey: listKey,
      queryFn: listFn,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });
    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(listKey)).toEqual(sceneList(2));
    expect(listFn).not.toHaveBeenCalled();
    // Marked stale for the next visit, not refetched now
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it("a list query in flight when the increment resolves ends with the server's new count", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 2 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    queryClient.setQueryData(listKey, sceneList(1));
    // A refetch that began before the press and answers with the old count
    let answerOld: (value: unknown) => void = () => {};
    const observer = new QueryObserver(queryClient, {
      queryKey: listKey,
      queryFn: () =>
        new Promise((resolve) => {
          answerOld = resolve;
        }),
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    void queryClient.refetchQueries({ queryKey: listKey });
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: listKey })).toBe(1)
    );

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });
    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    answerOld(sceneList(1));
    await waitFor(() =>
      expect(queryClient.isFetching({ queryKey: listKey })).toBe(0)
    );

    expect(queryClient.getQueryData(listKey)).toEqual(sceneList(2));
    unsubscribe();
  });

  it("the scene id on another instance keeps its count", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 2 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    queryClient.setQueryData(listKey, {
      findScenes: {
        scenes: [
          { id: "scene-1", instanceId: "inst-1", o_counter: 1 },
          { id: "scene-1", instanceId: "inst-2", o_counter: 7 },
        ],
      },
    });

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });
    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(listKey)).toEqual({
      findScenes: {
        scenes: [
          { id: "scene-1", instanceId: "inst-1", o_counter: 2 },
          { id: "scene-1", instanceId: "inst-2", o_counter: 7 },
        ],
      },
    });
  });

  it("an image press patches oCounter on the Images page", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 4 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.images.list(undefined, { page: 1 });
    queryClient.setQueryData(listKey, imageList(3));

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });
    await actAsync(() => {
      result.current.mutate({ imageId: "image-1", instanceId: "inst-1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(listKey)).toEqual(imageList(4));
  });

  it("returns error state on API failure", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server error")
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe("useDecrementOCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the scene and its instance to the scene decrement and patches the cached count", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 2 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    queryClient.setQueryData(listKey, sceneList(3));
    const { result } = renderHook(() => useDecrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/watch-history/decrement-o", {
      sceneId: "scene-1",
      instanceId: "inst-1",
    });
    expect(result.current.data).toEqual({ success: true, oCount: 2 });
    expect(queryClient.getQueryData(listKey)).toEqual(sceneList(2));
  });
});

describe("useDecrementImageOCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removing the last O on an image patches oCounter on the Images page", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 0 });
    const { wrapper, queryClient } = createWrapper();
    const listKey = queryKeys.images.list(undefined, { page: 1 });
    queryClient.setQueryData(listKey, imageList(1));
    const { result } = renderHook(() => useDecrementImageOCounter(), {
      wrapper,
    });

    await actAsync(() => {
      result.current.mutate({ imageId: "image-1", instanceId: "inst-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/image-view-history/decrement-o", {
      imageId: "image-1",
      instanceId: "inst-1",
    });
    expect(result.current.data).toEqual({ success: true, oCount: 0 });
    expect(queryClient.getQueryData(listKey)).toEqual(imageList(0));
  });
});
