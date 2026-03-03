import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    updateRating: vi.fn(),
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
import { useUpdateRating } from "../../../src/api/hooks/useRatingMutation";

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

describe("useUpdateRating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a mutation function", () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    expect(result.current.mutate).toBeDefined();
    expect(typeof result.current.mutate).toBe("function");
  });

  it("calls libraryApi.updateRating with correct params on mutate", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        rating: 85,
        instanceId: "instance-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateRating).toHaveBeenCalledWith(
      "scene",
      "scene-1",
      85,
      "instance-1"
    );
  });

  it("passes null rating to clear rating", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        rating: null,
        instanceId: "instance-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateRating).toHaveBeenCalledWith(
      "scene",
      "scene-1",
      null,
      "instance-1"
    );
  });

  it("calls updateRating with null instanceId when not provided", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "performer",
        entityId: "perf-1",
        rating: 100,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(libraryApi.updateRating).toHaveBeenCalledWith(
      "performer",
      "perf-1",
      100,
      null
    );
  });

  it("invalidates scene queries on success with entityType='scene'", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        rating: 75,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["scenes"] })
    );
  });

  it("invalidates performer queries on success with entityType='performer'", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "performer",
        entityId: "perf-1",
        rating: 90,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["performers"] })
    );
  });

  it("returns error state on API failure", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Server error")
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "scene",
        entityId: "scene-1",
        rating: 50,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("does not crash for unknown entityType", async () => {
    (libraryApi.updateRating as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await act(async () => {
      result.current.mutate({
        entityType: "unknown" as any,
        entityId: "id-1",
        rating: 50,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
