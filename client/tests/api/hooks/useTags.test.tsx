import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTagDetail, useTagList } from "../../../src/api/hooks/useTags";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findTags: vi.fn(),
    findTagById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    tags: {
      all: () => ["tags"],
      list: (
        instanceId: string | undefined,
        params: Record<string, unknown>
      ) => ["tags", instanceId, "list", params],
      detail: (instanceId: string | undefined, id: string) => [
        "tags",
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

describe("useTagList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useTagList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findTags).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { tags: [], total: 0 };
    (libraryApi.findTags as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useTagList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findTags).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal)
    );
  });

  it("passes signal to queryFn", async () => {
    const mockData = { tags: [], total: 0 };
    (libraryApi.findTags as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useTagList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findTags).toHaveBeenCalled());
    const callArgs = must(
      (libraryApi.findTags as ReturnType<typeof vi.fn>).mock.calls[0]
    );
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("keeps the previous page's data while the next page loads", async () => {
    const page1 = { findTags: { tags: [{ id: "1" }], count: 2 } };
    (libraryApi.findTags as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useTagList({ filter: { page, per_page: 1 } }),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    await waitFor(() => expect(libraryApi.findTags).toHaveBeenCalledTimes(2));

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});

describe("useTagDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => useTagDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findTagById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockTag = { id: "tag-1", name: "Test Tag" };
    (libraryApi.findTagById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTag
    );

    const { result } = renderHook(() => useTagDetail("tag-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTag);
    expect(libraryApi.findTagById).toHaveBeenCalledWith("tag-1", null);
  });

  it("passes instanceId to findTagById", async () => {
    const mockTag = { id: "tag-1", name: "Test Tag" };
    (libraryApi.findTagById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockTag
    );

    const { result } = renderHook(() => useTagDetail("tag-1", "instance-4"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findTagById).toHaveBeenCalledWith("tag-1", "instance-4");
  });
});
