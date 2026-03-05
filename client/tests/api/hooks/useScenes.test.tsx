import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findScenes: vi.fn(),
    findSceneById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    scenes: {
      all: () => ["scenes"],
      list: (instanceId: string | undefined, params: Record<string, unknown>) => [
        "scenes",
        instanceId,
        "list",
        params,
      ],
      detail: (instanceId: string | undefined, id: string) => [
        "scenes",
        instanceId,
        "detail",
        id,
      ],
    },
  },
}));

import { libraryApi } from "../../../src/api/library";
import { useSceneList, useSceneDetail } from "../../../src/api/hooks/useScenes";

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
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useSceneList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findScenes).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it("passes signal to queryFn", async () => {
    const mockData = { scenes: [], total: 0 };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useSceneList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findScenes).toHaveBeenCalled());
    const callArgs = (libraryApi.findScenes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("passes instanceId through to query key", async () => {
    const mockData = { scenes: [], total: 0 };
    (libraryApi.findScenes as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useSceneList(params, "instance-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });
});

describe("useSceneDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => useSceneDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findSceneById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockScene = { id: "scene-1", title: "Test Scene" };
    (libraryApi.findSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(mockScene);

    const { result } = renderHook(() => useSceneDetail("scene-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockScene);
    expect(libraryApi.findSceneById).toHaveBeenCalledWith("scene-1", null);
  });

  it("passes instanceId to findSceneById", async () => {
    const mockScene = { id: "scene-1", title: "Test Scene" };
    (libraryApi.findSceneById as ReturnType<typeof vi.fn>).mockResolvedValue(mockScene);

    const { result } = renderHook(() => useSceneDetail("scene-1", "instance-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findSceneById).toHaveBeenCalledWith("scene-1", "instance-2");
  });

  it("returns error state on failure", async () => {
    (libraryApi.findSceneById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Not found")
    );

    const { result } = renderHook(() => useSceneDetail("bad-id"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
