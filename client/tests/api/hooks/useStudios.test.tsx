import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findStudios: vi.fn(),
    findStudioById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    studios: {
      all: () => ["studios"],
      list: (instanceId: string | undefined, params: Record<string, unknown>) => [
        "studios",
        instanceId,
        "list",
        params,
      ],
      detail: (instanceId: string | undefined, id: string) => [
        "studios",
        instanceId,
        "detail",
        id,
      ],
    },
  },
}));

import { libraryApi } from "../../../src/api/library";
import { useStudioList, useStudioDetail } from "../../../src/api/hooks/useStudios";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useStudioList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useStudioList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findStudios).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { studios: [], total: 0 };
    (libraryApi.findStudios as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { page: 1, perPage: 24 };
    const { result } = renderHook(() => useStudioList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findStudios).toHaveBeenCalledWith(params, expect.any(AbortSignal));
  });

  it("passes signal to queryFn", async () => {
    const mockData = { studios: [], total: 0 };
    (libraryApi.findStudios as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const params = { page: 1, perPage: 24 };
    renderHook(() => useStudioList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findStudios).toHaveBeenCalled());
    const callArgs = (libraryApi.findStudios as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });
});

describe("useStudioDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => useStudioDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findStudioById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockStudio = { id: "studio-1", name: "Test Studio" };
    (libraryApi.findStudioById as ReturnType<typeof vi.fn>).mockResolvedValue(mockStudio);

    const { result } = renderHook(() => useStudioDetail("studio-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockStudio);
    expect(libraryApi.findStudioById).toHaveBeenCalledWith("studio-1", null);
  });

  it("passes instanceId to findStudioById", async () => {
    const mockStudio = { id: "studio-1", name: "Test Studio" };
    (libraryApi.findStudioById as ReturnType<typeof vi.fn>).mockResolvedValue(mockStudio);

    const { result } = renderHook(() => useStudioDetail("studio-1", "instance-3"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findStudioById).toHaveBeenCalledWith("studio-1", "instance-3");
  });
});
