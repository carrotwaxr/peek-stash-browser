import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGroupDetail, useGroupList } from "../../../src/api/hooks/useGroups";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findGroups: vi.fn(),
    findGroupById: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    groups: {
      all: () => ["groups"],
      list: (
        instanceId: string | undefined,
        params: Record<string, unknown>
      ) => ["groups", instanceId, "list", params],
      detail: (instanceId: string | undefined, id: string) => [
        "groups",
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

describe("useGroupList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when params is null", () => {
    const { result } = renderHook(() => useGroupList(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findGroups).not.toHaveBeenCalled();
  });

  it("fires query with correct params", async () => {
    const mockData = { groups: [], total: 0 };
    (libraryApi.findGroups as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    const { result } = renderHook(() => useGroupList(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
    expect(libraryApi.findGroups).toHaveBeenCalledWith(
      params,
      expect.any(AbortSignal)
    );
  });

  it("passes signal to queryFn", async () => {
    const mockData = { groups: [], total: 0 };
    (libraryApi.findGroups as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockData
    );

    const params = { filter: { page: 1, per_page: 24 } };
    renderHook(() => useGroupList(params), { wrapper: createWrapper() });

    await waitFor(() => expect(libraryApi.findGroups).toHaveBeenCalled());
    const callArgs = must(
      (libraryApi.findGroups as ReturnType<typeof vi.fn>).mock.calls[0]
    );
    expect(callArgs[1]).toBeInstanceOf(AbortSignal);
  });

  it("keeps the previous page's data while the next page loads", async () => {
    const page1 = { findGroups: { groups: [{ id: "1" }], count: 2 } };
    (libraryApi.findGroups as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        useGroupList({ filter: { page, per_page: 1 } }),
      { wrapper: createWrapper(), initialProps: { page: 1 } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ page: 2 });
    await waitFor(() => expect(libraryApi.findGroups).toHaveBeenCalledTimes(2));

    expect(result.current.data).toEqual(page1);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});

describe("useGroupDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fire query when id is undefined", () => {
    const { result } = renderHook(() => useGroupDetail(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(libraryApi.findGroupById).not.toHaveBeenCalled();
  });

  it("fires query and returns data on success", async () => {
    const mockGroup = { id: "group-1", name: "Test Group" };
    (libraryApi.findGroupById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockGroup
    );

    const { result } = renderHook(() => useGroupDetail("group-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockGroup);
    expect(libraryApi.findGroupById).toHaveBeenCalledWith("group-1", null);
  });

  it("passes instanceId to findGroupById", async () => {
    const mockGroup = { id: "group-1", name: "Test Group" };
    (libraryApi.findGroupById as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockGroup
    );

    const { result } = renderHook(
      () => useGroupDetail("group-1", "instance-6"),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.findGroupById).toHaveBeenCalledWith(
      "group-1",
      "instance-6"
    );
  });
});
