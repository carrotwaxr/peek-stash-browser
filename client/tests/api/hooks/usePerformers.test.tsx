import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findPerformers: vi.fn(),
    findPerformerById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    performers: {
      all: () => ["performers"],
      list: (instanceId: string | undefined, params: Record<string, unknown>) => [
        "performers",
        instanceId,
        "list",
        params,
      ],
      detail: (instanceId: string | undefined, id: string) => [
        "performers",
        instanceId,
        "detail",
        id,
      ],
    },
  },
}));

import { libraryApi } from "../../../src/api/library";
import {
  usePerformerList,
  usePerformerDetail,
} from "../../../src/api/hooks/usePerformers";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("usePerformerList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => usePerformerList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findPerformers).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { performers: [], total: 0 };
    (libraryApi.findPerformers as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => usePerformerList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findPerformers).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it("passes signal to queryFn", async () => {
    const mockData = { performers: [], total: 0 };
    (libraryApi.findPerformers as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => usePerformerList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findPerformers).toHaveBeenCalled());
    const callArgs = (libraryApi.findPerformers as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("passes instanceId through to query key", async () => {
    const mockData = { performers: [], total: 0 };
    (libraryApi.findPerformers as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => usePerformerList(params, "instance-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });
});

describe("usePerformerDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => usePerformerDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findPerformerById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockPerformer = { id: "perf-1", name: "Test Performer" };
    (libraryApi.findPerformerById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockPerformer
    );

    const { result } = renderHook(() => usePerformerDetail("perf-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockPerformer);
    expect(libraryApi.findPerformerById).toHaveBeenCalledWith("perf-1", null);
  });

  it("passes instanceId to findPerformerById", async () => {
    const mockPerformer = { id: "perf-1", name: "Test Performer" };
    (libraryApi.findPerformerById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockPerformer
    );

    const { result } = renderHook(() => usePerformerDetail("perf-1", "instance-2"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findPerformerById).toHaveBeenCalledWith("perf-1", "instance-2");
  });

  it("returns error state on failure", async () => {
    (libraryApi.findPerformerById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Not found")
    );

    const { result } = renderHook(() => usePerformerDetail("bad-id"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
