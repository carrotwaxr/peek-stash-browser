/**
 * The Views write hooks: each calls its route, marks both preset queries
 * stale, and a 409 comes back as `{ conflict: true, reason }`, not a thrown
 * error: `nameTaken` for a name another View has, `stale` for a write another
 * tab beat.
 */
import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import { ApiError } from "@/api/client";
import {
  VIEW_NAME_TAKEN,
  useDeleteView,
  useOverwriteView,
  useRenameView,
  useSaveView,
  useSetDefaultView,
} from "@/api/hooks/useViews";
import { queryKeys } from "@/api/queryKeys";

const { mockApiPost, mockApiPut, mockApiPatch, mockApiDelete } = vi.hoisted(
  () => ({
    mockApiPost: vi.fn(),
    mockApiPut: vi.fn(),
    mockApiPatch: vi.fn(),
    mockApiDelete: vi.fn(),
  })
);

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiPost: mockApiPost,
  apiPut: mockApiPut,
  apiPatch: mockApiPatch,
  apiDelete: mockApiDelete,
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { wrapper, invalidate };
}

const BODY = {
  artifactType: "scene",
  context: "scene",
  name: "Fave",
  filters: { favorite: "true" },
  sort: "date",
  direction: "DESC",
};

const invalidatedKeys = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map(([filters]) => filters?.queryKey);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the Views write hooks", () => {
  it("useSaveView posts the body and marks both preset queries stale", async () => {
    mockApiPost.mockResolvedValue({ success: true, preset: { id: "p1" } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSaveView(), { wrapper });

    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync(BODY);
    });

    expect(mockApiPost).toHaveBeenCalledWith("/user/filter-presets", BODY);
    expect(answer).toEqual({
      conflict: false,
      data: { success: true, preset: { id: "p1" } },
    });
    expect(invalidatedKeys(invalidate)).toEqual([
      queryKeys.user.filterPresets(),
      queryKeys.user.defaultPresets(),
    ]);
  });

  it("useOverwriteView puts the changes on the View's route", async () => {
    mockApiPut.mockResolvedValue({ success: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useOverwriteView(), { wrapper });
    const changes = { filters: {}, sort: "title", direction: "ASC" };

    await act(async () => {
      await result.current.mutateAsync({
        artifactType: "scene",
        presetId: "p 1",
        body: changes,
      });
    });

    expect(mockApiPut).toHaveBeenCalledWith(
      "/user/filter-presets/scene/p%201",
      changes
    );
    expect(invalidatedKeys(invalidate)).toHaveLength(2);
  });

  it("useRenameView patches the name", async () => {
    mockApiPatch.mockResolvedValue({ success: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRenameView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        artifactType: "performer",
        presetId: "p2",
        name: "New name",
      });
    });

    expect(mockApiPatch).toHaveBeenCalledWith(
      "/user/filter-presets/performer/p2",
      { name: "New name" }
    );
    expect(invalidatedKeys(invalidate)).toHaveLength(2);
  });

  it("useDeleteView deletes the View's route", async () => {
    mockApiDelete.mockResolvedValue({ success: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeleteView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        artifactType: "scene",
        presetId: "p3",
      });
    });

    expect(mockApiDelete).toHaveBeenCalledWith("/user/filter-presets/scene/p3");
    expect(invalidatedKeys(invalidate)).toHaveLength(2);
  });

  it("useSetDefaultView puts the context and the View, or null to clear", async () => {
    mockApiPut.mockResolvedValue({ success: true, defaults: {} });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSetDefaultView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ context: "scene", presetId: "p1" });
    });
    await act(async () => {
      await result.current.mutateAsync({ context: "scene", presetId: null });
    });

    expect(mockApiPut).toHaveBeenNthCalledWith(1, "/user/default-preset", {
      context: "scene",
      presetId: "p1",
    });
    expect(mockApiPut).toHaveBeenNthCalledWith(2, "/user/default-preset", {
      context: "scene",
      presetId: null,
    });
    expect(invalidatedKeys(invalidate)).toHaveLength(4);
  });

  it("a 409 for a name another View has resolves as { conflict: true, reason: nameTaken } and still marks the queries stale", async () => {
    mockApiPatch.mockRejectedValue(
      new ApiError(VIEW_NAME_TAKEN, 409, {
        error: VIEW_NAME_TAKEN,
        errorType: "CONFLICT",
      })
    );
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRenameView(), { wrapper });

    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({
        artifactType: "scene",
        presetId: "p1",
        name: "Fave",
      });
    });

    expect(answer).toEqual({ conflict: true, reason: "nameTaken" });
    expect(result.current.isError).toBe(false);
    expect(invalidatedKeys(invalidate)).toHaveLength(2);
  });

  it("a 409 from a write another tab beat resolves as reason stale, and the Views are read again", async () => {
    const STALE = "Your settings changed while saving; try again";
    mockApiPost.mockRejectedValue(
      new ApiError(STALE, 409, { error: STALE, errorType: "CONFLICT" })
    );
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSaveView(), { wrapper });

    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync(BODY);
    });

    expect(answer).toEqual({ conflict: true, reason: "stale" });
    expect(invalidatedKeys(invalidate)).toHaveLength(2);
  });

  it("any other failure still rejects", async () => {
    mockApiDelete.mockRejectedValue(new ApiError("boom", 500));
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeleteView(), { wrapper });

    act(() => {
      result.current.mutate({ artifactType: "scene", presetId: "p1" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
