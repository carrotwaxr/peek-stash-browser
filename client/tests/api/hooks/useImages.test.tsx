import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useImageList } from "../../../src/api/hooks/useImages";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findImages: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    images: {
      all: () => ["images"],
      list: (
        instanceId: string | undefined,
        params: Record<string, unknown>
      ) => ["images", instanceId, "list", params],
      detail: (instanceId: string | undefined, id: string) => [
        "images",
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

describe("useImageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useImageList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findImages).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { images: [], total: 0 };
    (libraryApi.findImages as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useImageList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findImages).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal)
    );
  });

  it("passes signal to queryFn", async () => {
    const mockData = { images: [], total: 0 };
    (libraryApi.findImages as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useImageList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findImages).toHaveBeenCalled());
    const callArgs = (libraryApi.findImages as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("keeps the previous page's data while the next page loads", async () => {
    const page1 = { findImages: { images: [{ id: "1" }], count: 2 } };
    (libraryApi.findImages as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useImageList({ filter: { page, per_page: 1 } }),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    await waitFor(() => expect(libraryApi.findImages).toHaveBeenCalledTimes(2));

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});
