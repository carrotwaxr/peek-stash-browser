import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useGalleryDetail,
  useGalleryList,
} from "../../../src/api/hooks/useGalleries";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findGalleries: vi.fn(),
    findGalleryById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    galleries: {
      all: () => ["galleries"],
      list: (
        instanceId: string | undefined,
        params: Record<string, unknown>
      ) => ["galleries", instanceId, "list", params],
      detail: (instanceId: string | undefined, id: string) => [
        "galleries",
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

describe("useGalleryList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useGalleryList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findGalleries).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { galleries: [], total: 0 };
    (libraryApi.findGalleries as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useGalleryList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findGalleries).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal)
    );
  });

  it("passes signal to queryFn", async () => {
    const mockData = { galleries: [], total: 0 };
    (libraryApi.findGalleries as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useGalleryList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findGalleries).toHaveBeenCalled());
    const callArgs = must(
      (libraryApi.findGalleries as ReturnType<typeof vi.fn>).mock.calls[0]
    );
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("keeps the previous page's data while the next page loads", async () => {
    const page1 = { findGalleries: { galleries: [{ id: "1" }], count: 2 } };
    (libraryApi.findGalleries as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useGalleryList({ filter: { page, per_page: 1 } }),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    await waitFor(() =>
      expect(libraryApi.findGalleries).toHaveBeenCalledTimes(2)
    );

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});

describe("useGalleryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => useGalleryDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findGalleryById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockGallery = { id: "gallery-1", title: "Test Gallery" };
    (libraryApi.findGalleryById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockGallery
    );

    const { result } = renderHook(() => useGalleryDetail("gallery-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockGallery);
    expect(libraryApi.findGalleryById).toHaveBeenCalledWith("gallery-1", null);
  });

  it("passes instanceId to findGalleryById", async () => {
    const mockGallery = { id: "gallery-1", title: "Test Gallery" };
    (libraryApi.findGalleryById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockGallery
    );

    const { result } = renderHook(
      () => useGalleryDetail("gallery-1", "instance-5"),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findGalleryById).toHaveBeenCalledWith(
      "gallery-1",
      "instance-5"
    );
  });
});
