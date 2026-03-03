import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    updateFavorite: vi.fn(),
  },
}));

vi.mock("../../../src/api/queryKeys", () => ({
  queryKeys: {
    scenes: {
      all: () => ["scenes"],
    },
    performers: {
      all: () => ["performers"],
    },
    studios: {
      all: () => ["studios"],
    },
    tags: {
      all: () => ["tags"],
    },
    galleries: {
      all: () => ["galleries"],
    },
    groups: {
      all: () => ["groups"],
    },
    images: {
      all: () => ["images"],
    },
  },
}));

import { libraryApi } from "../../../src/api/library";
import { useUpdateFavorite } from "../../../src/api/hooks/useFavoriteMutation";

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

describe("useUpdateFavorite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a mutation function", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    expect(result.current.mutate).toBeDefined();
    expect(typeof result.current.mutate).toBe("function");
  });

  it("calls libraryApi.updateFavorite with correct params on mutate", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        favorite: true,
        instanceId: "instance-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateFavorite).toHaveBeenCalledWith(
      "scene",
      "scene-1",
      true,
      "instance-1"
    );
  });

  it("calls updateFavorite with null instanceId when not provided", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "performer",
        entityId: "perf-1",
        favorite: false,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateFavorite).toHaveBeenCalledWith(
      "performer",
      "perf-1",
      false,
      null
    );
  });

  it("invalidates scene queries on success with entityType='scene'", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        favorite: true,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["scenes"] })
    );
  });

  it("invalidates performer queries on success with entityType='performer'", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "performer",
        entityId: "perf-1",
        favorite: true,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["performers"] })
    );
  });

  it("does not crash for unknown entityType", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "unknown" as any,
        entityId: "id-1",
        favorite: true,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("returns error state on API failure", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server error")
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        favorite: true,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("sets favorite to false (unfavorite)", async () => {
    (libraryApi.updateFavorite as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        favorite: false,
        instanceId: "inst-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateFavorite).toHaveBeenCalledWith(
      "scene",
      "scene-1",
      false,
      "inst-1"
    );
  });
});
