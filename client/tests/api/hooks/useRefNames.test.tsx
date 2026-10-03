/**
 * useRefNames: the names of the ids a filter chip shows, from the entity's
 * `/minimal` endpoint, kept under the entity's query root so a hide, a
 * restore or an instance change asks again.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateLibraryQueries } from "@/api/hooks/useLibraryReady";
import { useRefNames } from "@/api/hooks/useRefNames";
import { libraryApi } from "@/api/library";
import { getPlaylists, getSharedPlaylists } from "@/api/playlists";
import { queryKeys } from "@/api/queryKeys";

vi.mock("@/api/library", () => ({
  libraryApi: {
    findTagsMinimal: vi.fn(),
    findPerformersMinimal: vi.fn(),
    findStudiosMinimal: vi.fn(),
    findGroupsMinimal: vi.fn(),
    findGalleriesMinimal: vi.fn(),
    findScenesMinimal: vi.fn(),
  },
}));

vi.mock("@/api/playlists", () => ({
  getPlaylists: vi.fn(),
  getSharedPlaylists: vi.fn(),
}));

function setup(staleTime = 0) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime } },
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

    renderHook(() => useRefNames("images", ["1:a"]), { wrapper });
    renderHook(() => useRefNames("tags", []), { wrapper });
    renderHook(() => useRefNames(undefined, ["1:a"]), { wrapper });

    expect(libraryApi.findTagsMinimal).not.toHaveBeenCalled();
  });

  it("scene names come from the scene `/minimal` endpoint, keyed under the scenes root", async () => {
    vi.mocked(libraryApi.findScenesMinimal).mockResolvedValue([
      { id: "5", instanceId: "a", name: "Beach day" },
    ]);
    const { client, wrapper } = setup();
    const ids = ["5:a", "6:a"];

    const { result } = renderHook(() => useRefNames("scenes", ids), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Beach day"],
        unavailable: 1,
      })
    );
    expect(vi.mocked(libraryApi.findScenesMinimal).mock.calls[0]?.[0]).toEqual({
      ids,
      filter: { per_page: 100 },
    });
    expect(client.getQueryData(queryKeys.scenes.names(ids))).toBeDefined();
  });

  it("playlist names come from the viewer's own and shared lists, not `/minimal`", async () => {
    vi.mocked(getPlaylists).mockResolvedValue(
      untrusted({ playlists: [{ id: 12, name: "Road trip" }] })
    );
    vi.mocked(getSharedPlaylists).mockResolvedValue(
      untrusted({
        playlists: [{ id: 40, name: "Weekend", owner: { username: "alice" } }],
      })
    );
    const { client, wrapper } = setup();
    const ids = ["12", "40", "999"];

    const { result } = renderHook(() => useRefNames("playlists", ids), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Road trip", "Weekend"],
        unavailable: 1,
      })
    );
    expect(getPlaylists).toHaveBeenCalledTimes(1);
    expect(getSharedPlaylists).toHaveBeenCalledTimes(1);
    for (const find of Object.values(libraryApi)) {
      expect(find).not.toHaveBeenCalled();
    }
    // Under the playlists root, which a playlist change invalidates
    expect(client.getQueryData(queryKeys.playlists.names(ids))).toBeDefined();
    expect(queryKeys.playlists.names(ids)[0]).toBe("playlists");
  });

  it("a new set of playlist ids reads the cached lists; a playlist change asks again", async () => {
    vi.mocked(getPlaylists).mockResolvedValue(
      untrusted({ playlists: [{ id: 12, name: "Road trip" }] })
    );
    vi.mocked(getSharedPlaylists).mockResolvedValue(
      untrusted({
        playlists: [{ id: 40, name: "Weekend", owner: { username: "alice" } }],
      })
    );
    // The app's lists stay fresh for minutes
    const { client, wrapper } = setup(5 * 60 * 1000);

    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useRefNames("playlists", ids),
      { wrapper, initialProps: { ids: ["12"] } }
    );
    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Road trip"],
        unavailable: 0,
      })
    );

    rerender({ ids: ["40"] });
    await waitFor(() =>
      expect(result.current.data).toEqual({
        names: ["Weekend"],
        unavailable: 0,
      })
    );
    expect(getPlaylists).toHaveBeenCalledTimes(1);
    expect(getSharedPlaylists).toHaveBeenCalledTimes(1);

    // A playlist change invalidates the root: the lists are asked again
    await client.invalidateQueries({ queryKey: queryKeys.playlists.all() });
    await waitFor(() => expect(getPlaylists).toHaveBeenCalledTimes(2));
    expect(getSharedPlaylists).toHaveBeenCalledTimes(2);
  });
});
