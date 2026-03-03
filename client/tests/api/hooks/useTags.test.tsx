import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

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
      list: (instanceId: string | undefined, params: Record<string, unknown>) => [
        "tags",
        instanceId,
        "list",
        params,
      ],
      detail: (instanceId: string | undefined, id: string) => [
        "tags",
        instanceId,
        "detail",
        id,
      ],
    },
  },
}));

import { libraryApi } from "../../../src/api/library";
import { useTagList, useTagDetail } from "../../../src/api/hooks/useTags";

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
    (libraryApi.findTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { page: 1, perPage: 24 };
    const { result } = renderHook(() => useTagList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findTags).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it("passes signal to queryFn", async () => {
    const mockData = { tags: [], total: 0 };
    (libraryApi.findTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { page: 1, perPage: 24 };
    renderHook(() => useTagList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findTags).toHaveBeenCalled());
    const callArgs = (libraryApi.findTags as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
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
    (libraryApi.findTagById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTag);

    const { result } = renderHook(() => useTagDetail("tag-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTag);
    expect(libraryApi.findTagById).toHaveBeenCalledWith("tag-1", null);
  });

  it("passes instanceId to findTagById", async () => {
    const mockTag = { id: "tag-1", name: "Test Tag" };
    (libraryApi.findTagById as ReturnType<typeof vi.fn>).mockResolvedValue(mockTag);

    const { result } = renderHook(() => useTagDetail("tag-1", "instance-4"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findTagById).toHaveBeenCalledWith("tag-1", "instance-4");
  });
});
