import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSceneList } from "../../../src/api/hooks/useScenes";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findScenes: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    scenes: {
      all: () => ["scenes"],
      list: (
        instanceId: string | undefined,
        params: Record<string, unknown>
      ) => ["scenes", instanceId, "list", params],
      detail: (instanceId: string | undefined, id: string) => [
        "scenes",
        instanceId,
        "detail",
        id,
      ],
    },
  },
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
