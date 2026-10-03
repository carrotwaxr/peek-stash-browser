/**
 * useValueSearch: what typing in "+ Filter" finds besides fields: the
 * entities (tags, performers, studios, collections, galleries) whose name
 * matches, asked of each type's `/minimal` once, two characters or more,
 * 250 ms after the last key, five at most per type, each with its instance.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useValueSearch } from "@/components/filter-bar/useValueSearch";
import { type FilterOption, filterOptionsOf } from "@/utils/filterFields";

const minimal = vi.hoisted(() => ({
  findTagsMinimal: vi.fn(),
  findPerformersMinimal: vi.fn(),
  findStudiosMinimal: vi.fn(),
  findGroupsMinimal: vi.fn(),
  findGalleriesMinimal: vi.fn(),
  findScenesMinimal: vi.fn(),
}));
const playlists = vi.hoisted(() => ({
  getPlaylists: vi.fn(),
  getSharedPlaylists: vi.fn(),
}));

vi.mock("@/api/library", () => ({ libraryApi: minimal }));
vi.mock("@/api/playlists", () => playlists);
vi.mock("@/api", () => ({ libraryApi: minimal, ...playlists }));

const OPTIONS = filterOptionsOf("scene", "metric");

const wrapperOf = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

function setup(options: readonly FilterOption[] = OPTIONS, q = "") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = renderHook(
    ({ q }: { q: string }) => useValueSearch(options, q),
    { wrapper: wrapperOf(client), initialProps: { q } }
  );
  const type = (next: string) => rendered.rerender({ q: next });
  /** Lets the debounce and the request's answer through */
  const settle = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  return { ...rendered, client, type, settle };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  for (const find of Object.values(minimal)) find.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useValueSearch", () => {
  it("two characters or more, 250 ms after the last key, asks each ref row's /minimal once with filter: { q, per_page: 5 }", async () => {
    const hook = setup();

    hook.type("o");
    await hook.settle(500);
    expect(minimal.findTagsMinimal).not.toHaveBeenCalled();

    hook.type("ou");
    await hook.settle(200);
    hook.type("out");
    await hook.settle(200);
    // 200 ms after the last key: still waiting
    expect(minimal.findTagsMinimal).not.toHaveBeenCalled();
    await hook.settle(60);

    expect(minimal.findTagsMinimal).toHaveBeenCalledTimes(1);
    expect(minimal.findTagsMinimal).toHaveBeenCalledWith(
      { filter: { q: "out", per_page: 5 } },
      expect.any(AbortSignal)
    );
    for (const find of [
      minimal.findPerformersMinimal,
      minimal.findStudiosMinimal,
      minimal.findGroupsMinimal,
      minimal.findGalleriesMinimal,
    ]) {
      expect(find).toHaveBeenCalledTimes(1);
      expect(find).toHaveBeenCalledWith(
        { filter: { q: "out", per_page: 5 } },
        expect.any(AbortSignal)
      );
    }
    // A scene's title is not a value to filter by
    expect(minimal.findScenesMinimal).not.toHaveBeenCalled();
  });

  it("one request per entity type, not per row: Tags and Performer Tags share tags, and Tags names the result", async () => {
    minimal.findTagsMinimal.mockResolvedValue([
      { id: "2", instanceId: "a", name: "Outdoor" },
    ]);
    const tagRows = OPTIONS.filter((option) => option.entityType === "tags");
    expect(tagRows.length).toBeGreaterThan(1);
    const hook = setup(OPTIONS, "out");

    await hook.settle(260);

    expect(minimal.findTagsMinimal).toHaveBeenCalledTimes(1);
    const tags = hook.result.current.filter(
      (group) => group.field.entityType === "tags"
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]?.field.key).toBe(tagRows[0]?.key);
    expect(tags[0]?.field.label).toBe("Tags");
  });

  it("playlists are not searched (no /minimal)", async () => {
    const playlistRows = OPTIONS.filter(
      (option) => option.entityType === "playlists"
    );
    expect(playlistRows.length).toBeGreaterThan(0);
    const hook = setup(playlistRows, "fav");

    await hook.settle(260);

    for (const find of Object.values(minimal)) {
      expect(find).not.toHaveBeenCalled();
    }
    expect(playlists.getPlaylists).not.toHaveBeenCalled();
    expect(hook.result.current).toEqual([]);
  });

  it("a type none of the free rows has (a view-locked row's) is not searched", async () => {
    const hook = setup(
      OPTIONS.filter((option) => option.entityType !== "tags"),
      "out"
    );

    await hook.settle(260);

    expect(minimal.findTagsMinimal).not.toHaveBeenCalled();
    expect(minimal.findPerformersMinimal).toHaveBeenCalledTimes(1);
  });

  it("results carry id:instanceId from the server, never a bare id, five at most per type", async () => {
    minimal.findTagsMinimal.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        id: String(index + 1),
        instanceId: index % 2 === 0 ? "a" : "b",
        name: `Out ${index + 1}`,
      }))
    );
    const hook = setup(OPTIONS, "out");

    await hook.settle(260);

    const tags = hook.result.current.find(
      (group) => group.field.entityType === "tags"
    );
    expect(tags?.results.map((result) => result.ref)).toEqual([
      "1:a",
      "2:b",
      "3:a",
      "4:b",
      "5:a",
    ]);
    expect(tags?.results[0]?.name).toBe("Out 1");
  });

  it("an aborted, superseded search shows nothing stale", async () => {
    minimal.findTagsMinimal.mockImplementation(
      ({ filter }: { filter: { q: string } }) =>
        Promise.resolve([
          {
            id: filter.q === "out" ? "2" : "9",
            instanceId: "a",
            name: filter.q,
          },
        ])
    );
    const hook = setup(OPTIONS, "out");
    await hook.settle(260);
    expect(
      hook.result.current.find((group) => group.field.entityType === "tags")
        ?.results[0]?.ref
    ).toBe("2:a");

    // A new key: the old answer is not shown while the new one is awaited
    hook.type("outd");
    expect(hook.result.current).toEqual([]);
    await hook.settle(100);
    expect(hook.result.current).toEqual([]);
    await hook.settle(200);
    await hook.settle(60);
    expect(
      hook.result.current.find((group) => group.field.entityType === "tags")
        ?.results[0]?.ref
    ).toBe("9:a");

    // Back under two characters: nothing, at once
    hook.type("o");
    expect(hook.result.current).toEqual([]);
  });

  it("a request still in flight when the text changes is aborted, and its late answer is never shown", async () => {
    let signalOfFirst: AbortSignal | undefined;
    minimal.findTagsMinimal.mockImplementationOnce(
      (_params: unknown, signal: AbortSignal) => {
        signalOfFirst = signal;
        return new Promise(() => undefined);
      }
    );
    const hook = setup(OPTIONS, "out");
    await hook.settle(260);
    expect(signalOfFirst?.aborted).toBe(false);

    hook.type("outd");
    await hook.settle(260);

    expect(signalOfFirst?.aborted).toBe(true);
    expect(minimal.findTagsMinimal).toHaveBeenCalledTimes(2);
  });
});
