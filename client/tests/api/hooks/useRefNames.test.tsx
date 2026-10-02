/**
 * useRefNames: the names of the ids a filter chip shows, from the entity's
 * `/minimal` endpoint, kept under the entity's query root so a hide, a
 * restore or an instance change asks again.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateLibraryQueries } from "@/api/hooks/useLibraryReady";
import { useRefNames } from "@/api/hooks/useRefNames";
import { libraryApi } from "@/api/library";
import { queryKeys } from "@/api/queryKeys";

vi.mock("@/api/library", () => ({
  libraryApi: {
    findTagsMinimal: vi.fn(),
    findPerformersMinimal: vi.fn(),
    findStudiosMinimal: vi.fn(),
    findGroupsMinimal: vi.fn(),
    findGalleriesMinimal: vi.fn(),
  },
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useRefNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks one /minimal request with the ids, keyed under the entity's root, so a library invalidation refetches it", async () => {
    vi.mocked(libraryApi.findTagsMinimal).mockResolvedValue([
      { id: "1", instanceId: "a", name: "Blonde" },
      { id: "2", instanceId: "a", name: "Outdoor" },
    ]);
    const { client, wrapper } = setup();
    const ids = ["1:a", "2:a"];

    const { result } = renderHook(() => useRefNames("tags", ids), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Blonde", "Outdoor"],
        unavailable: 0,
      })
    );
    expect(libraryApi.findTagsMinimal).toHaveBeenCalledTimes(1);
    expect(vi.mocked(libraryApi.findTagsMinimal).mock.calls[0]?.[0]).toEqual({
      ids,
      filter: { per_page: 100 },
    });
    expect(client.getQueryData(queryKeys.tags.names(ids))).toBeDefined();
    expect(queryKeys.tags.names(ids)).toEqual([
      "tags",
      undefined,
      "names",
      ids,
    ]);

    await invalidateLibraryQueries(client);
    await waitFor(() =>
      expect(libraryApi.findTagsMinimal).toHaveBeenCalledTimes(2)
    );
  });

  it("bare ids are sent as they are", async () => {
    vi.mocked(libraryApi.findStudiosMinimal).mockResolvedValue([
      { id: "772", instanceId: "a", name: "Brazzers" },
      { id: "971", instanceId: "a", name: "Reality Kings" },
    ]);
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useRefNames("studios", ["772", "971"]),
      {
        wrapper,
      }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(
      vi.mocked(libraryApi.findStudiosMinimal).mock.calls[0]?.[0]?.ids
    ).toEqual(["772", "971"]);
    expect(result.current.data).toEqual({
      names: ["Brazzers", "Reality Kings"],
      unavailable: 0,
    });
  });

  it("an id the lookup omits is unavailable, never named by its id", async () => {
    vi.mocked(libraryApi.findTagsMinimal).mockResolvedValue([
      { id: "1", instanceId: "a", name: "Blonde" },
      // Another instance's tag 2 is not the one asked for
      { id: "2", instanceId: "b", name: "Elsewhere" },
    ]);
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useRefNames("tags", ["1:a", "2:a", "3:a"]),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Blonde"],
        unavailable: 2,
      })
    );
  });

  it("a bare id found on two instances is one name", async () => {
    vi.mocked(libraryApi.findStudiosMinimal).mockResolvedValue([
      { id: "772", instanceId: "a", name: "Brazzers" },
      { id: "772", instanceId: "b", name: "Brazzers" },
    ]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useRefNames("studios", ["772"]), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Brazzers"],
        unavailable: 0,
      })
    );
  });

  it("asks nothing for an entity with no /minimal endpoint, or no ids", () => {
    const { wrapper } = setup();

    renderHook(() => useRefNames("scenes", ["1:a"]), { wrapper });
    renderHook(() => useRefNames("tags", []), { wrapper });
    renderHook(() => useRefNames(undefined, ["1:a"]), { wrapper });

    expect(libraryApi.findTagsMinimal).not.toHaveBeenCalled();
  });
});
