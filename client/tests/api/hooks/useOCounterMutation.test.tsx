import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../../../src/api/client";
import {
  useDecrementImageOCounter,
  useDecrementOCounter,
  useIncrementOCounter,
} from "../../../src/api/hooks/useOCounterMutation";
import { actAsync } from "../../testUtils";

vi.mock("../../../src/api/client", () => ({
  apiPost: vi.fn(),
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    scenes: {
      all: () => ["scenes"],
    },
    images: {
      all: () => ["images"],
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
      result.current.mutate({ sceneId: "scene-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/watch-history/increment-o", {
      sceneId: "scene-1",
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
      result.current.mutate({ imageId: "image-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiPost).toHaveBeenCalledWith("/image-view-history/increment-o", {
      imageId: "image-1",
    });
  });

  it("passes instanceId for image o-counter when provided", async () => {
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
      result.current.mutate({});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "Either sceneId or imageId is required"
    );
  });

  it("invalidates scene queries on successful scene increment", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      oCount: 2,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["scenes"] })
    );
  });

  it("invalidates image queries on successful image increment", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      oCount: 4,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ imageId: "image-1" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["images"] })
    );
  });

  it("returns error state on API failure", async () => {
    (apiPost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server error")
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useIncrementOCounter(), { wrapper });

    await actAsync(() => {
      result.current.mutate({ sceneId: "scene-1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe("useDecrementOCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the scene and its instance to the scene decrement and invalidates scenes", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 2 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["scenes"] });
  });
});

describe("useDecrementImageOCounter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the image and its instance to the image decrement and invalidates images", async () => {
    vi.mocked(apiPost).mockResolvedValue({ success: true, oCount: 0 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["images"] });
  });
});
