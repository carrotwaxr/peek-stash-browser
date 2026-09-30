/**
 * A detail page's tab counts (B19): asked once the page knows its entity's
 * own instance, with the page's toggle, under the entity's query root so
 * the library's refreshes reach them.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateLibraryQueries } from "../../../src/api/hooks/useLibraryReady";
import { useRelationCounts } from "../../../src/api/hooks/useRelationCounts";
import { libraryApi } from "../../../src/api/library";

vi.mock("../../../src/api/library", () => ({
  libraryApi: { getRelationCounts: vi.fn() },
}));

const getRelationCounts = vi.mocked(libraryApi.getRelationCounts);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useRelationCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRelationCounts.mockResolvedValue({
      counts: {
        scenes: 1,
        galleries: 0,
        images: 2,
        performers: 3,
        studios: 0,
        groups: 1,
      },
    });
  });

  it("asks nothing until the entity's instance is known", () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useRelationCounts("tag", "5", undefined),
      { wrapper }
    );
    expect(result.current.data).toBeUndefined();
    expect(getRelationCounts).not.toHaveBeenCalled();
  });

  it("asks for the entity on its instance with the page's toggle", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useRelationCounts("tag", "5", "inst-b", { includeSubTags: true }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data?.counts.images).toBe(2));
    expect(getRelationCounts).toHaveBeenCalledWith(
      "tag",
      "5",
      "inst-b",
      { includeSubTags: true, includeSubStudios: false },
      expect.any(AbortSignal)
    );
  });

  it("keeps the entity's counts while a toggle's load, never another entity's", async () => {
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ id, sub }: { id: string; sub: boolean }) =>
        useRelationCounts("studio", id, "inst-a", { includeSubStudios: sub }),
      { wrapper, initialProps: { id: "5", sub: false } }
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    getRelationCounts.mockReturnValue(new Promise(() => {}));
    rerender({ id: "5", sub: true });
    expect(result.current.data?.counts.images).toBe(2);

    rerender({ id: "6", sub: true });
    expect(result.current.data).toBeUndefined();
  });

  it("is refreshed with the library's queries", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => useRelationCounts("performer", "5", "inst-a"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    await invalidateLibraryQueries(client);

    expect(getRelationCounts).toHaveBeenCalledTimes(2);
  });
});
