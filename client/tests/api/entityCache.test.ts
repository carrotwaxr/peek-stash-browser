/**
 * patchEntityInCache: the viewer's new rating, favorite or O count is
 * written into every cached row and detail entry of that entity (matched
 * by id and instance, under the roots that hold its type), and nowhere
 * else. The rollback it returns puts the previous values back.
 * markLibraryStale marks the library stale without fetching it.
 * cancelEntityQueries cancels the entity's list fetches around a write, but
 * never a signed link's (a cancelled first fetch would leave Safari with no
 * sources and fail a cast start).
 */
import {
  type QueryClient,
  type QueryKey,
  QueryObserver,
} from "@tanstack/react-query";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelEntityQueries, patchEntityInCache } from "@/api/entityCache";
import { markLibraryStale } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { isLinkQuery, queryKeys } from "@/api/queryKeys";

/** The cached data under a key, read as a plain object for assertions. */
function read(client: QueryClient, key: QueryKey): unknown {
  return client.getQueryData(key);
}

describe("patchEntityInCache", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it("patches a performer row on a cached performers list page found by id and instance", () => {
    const key = queryKeys.performers.list(undefined, { page: 1 });
    client.setQueryData(key, {
      findPerformers: {
        count: 2,
        performers: [
          { id: "5", instanceId: "a", favorite: false },
          { id: "5", instanceId: "b", favorite: false },
        ],
      },
    });

    patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { favorite: true }
    );

    expect(read(client, key)).toEqual({
      findPerformers: {
        count: 2,
        performers: [
          { id: "5", instanceId: "a", favorite: true },
          { id: "5", instanceId: "b", favorite: false },
        ],
      },
    });
  });

  it("leaves a scene with the same id and instance alone when a performer changes", () => {
    const key = queryKeys.scenes.list(undefined, { page: 1 });
    const data = {
      findScenes: { scenes: [{ id: "5", instanceId: "a", favorite: false }] },
    };
    client.setQueryData(key, data);

    patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { favorite: true }
    );

    expect(read(client, key)).toBe(data);
  });

  it("patches a scene wherever scene rows are cached", () => {
    const row = () => ({ id: "9", instanceId: "a", favorite: false });
    const keys: Array<[QueryKey, unknown]> = [
      [
        queryKeys.scenes.list(undefined, { page: 1 }),
        { findScenes: { scenes: [row()] } },
      ],
      [queryKeys.scenes.similar("a", "1", 1), { scenes: [row()] }],
      [
        queryKeys.scenes.recommended({ filter: { page: 1, per_page: 24 } }),
        { scenes: [row()] },
      ],
      [queryKeys.homeCarousels.byKey("recentlyAdded"), [row()]],
      [queryKeys.carousels.execute("7"), { scenes: [row()] }],
      [
        queryKeys.watchHistory.scenes({
          view: "all",
          sort: "recent",
          page: 1,
          perPage: 24,
        }),
        { scenes: [row()] },
      ],
      [
        queryKeys.playlists.detail(3),
        { items: [{ id: 1, sceneId: "9", scene: row() }] },
      ],
    ];
    for (const [key, data] of keys) client.setQueryData(key, data);

    patchEntityInCache(
      client,
      { type: "scene", id: "9", instanceId: "a" },
      { favorite: true }
    );

    for (const [key] of keys) {
      expect(JSON.stringify(read(client, key)), JSON.stringify(key)).toContain(
        '"favorite":true'
      );
      expect(
        JSON.stringify(read(client, key)),
        JSON.stringify(key)
      ).not.toContain('"favorite":false');
    }
  });

  it("patches a detail entry holding the entity itself", () => {
    const named = queryKeys.performers.detail("a", "5");
    const bare = queryKeys.performers.detail(undefined, "5");
    client.setQueryData(named, { id: "5", instanceId: "a", favorite: false });
    client.setQueryData(bare, { id: "5", instanceId: "a", favorite: false });

    patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { favorite: true }
    );

    expect(read(client, named)).toEqual({
      id: "5",
      instanceId: "a",
      favorite: true,
    });
    expect(read(client, bare)).toEqual({
      id: "5",
      instanceId: "a",
      favorite: true,
    });
  });

  it("does not add a field a row lacks", () => {
    const key = queryKeys.scenes.list(undefined, { page: 1 });
    client.setQueryData(key, {
      findScenes: {
        scenes: [
          {
            id: "5",
            instanceId: "a",
            favorite: false,
            performers: [{ id: "5", instanceId: "a", name: "P" }],
          },
        ],
      },
    });

    patchEntityInCache(
      client,
      { type: "scene", id: "5", instanceId: "a" },
      { favorite: true, rating100: 80 }
    );

    expect(read(client, key)).toEqual({
      findScenes: {
        scenes: [
          {
            id: "5",
            instanceId: "a",
            favorite: true,
            performers: [{ id: "5", instanceId: "a", name: "P" }],
          },
        ],
      },
    });
  });

  it("patches `oCounter` on image list rows and `o_counter` on scenes", () => {
    const images = queryKeys.images.list(undefined, { page: 1 });
    const scenes = queryKeys.scenes.list(undefined, { page: 1 });
    client.setQueryData(images, {
      findImages: { images: [{ id: "3", instanceId: "a", oCounter: 1 }] },
    });
    client.setQueryData(scenes, {
      findScenes: { scenes: [{ id: "3", instanceId: "a", o_counter: 1 }] },
    });

    patchEntityInCache(
      client,
      { type: "image", id: "3", instanceId: "a" },
      { oCount: 2 }
    );
    patchEntityInCache(
      client,
      { type: "scene", id: "3", instanceId: "a" },
      { oCount: 4 }
    );

    expect(read(client, images)).toEqual({
      findImages: { images: [{ id: "3", instanceId: "a", oCounter: 2 }] },
    });
    expect(read(client, scenes)).toEqual({
      findScenes: { scenes: [{ id: "3", instanceId: "a", o_counter: 4 }] },
    });
  });

  it("keeps untouched rows and queries as they were", () => {
    const key = queryKeys.performers.list(undefined, { page: 1 });
    const other = { id: "6", instanceId: "a", favorite: false };
    client.setQueryData(key, {
      findPerformers: {
        performers: [{ id: "5", instanceId: "a", favorite: false }, other],
      },
    });
    const unrelatedKey = queryKeys.performers.list(undefined, { page: 2 });
    const unrelated = {
      findPerformers: {
        performers: [{ id: "7", instanceId: "a", favorite: false }],
      },
    };
    client.setQueryData(unrelatedKey, unrelated);
    const updatedAt = client.getQueryState(unrelatedKey)?.dataUpdatedAt;

    patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { favorite: true }
    );

    const patched = read(client, key) as {
      findPerformers: { performers: unknown[] };
    };
    expect(patched.findPerformers.performers[1]).toBe(other);
    expect(read(client, unrelatedKey)).toBe(unrelated);
    expect(client.getQueryState(unrelatedKey)?.dataUpdatedAt).toBe(updatedAt);
  });

  it("a performer row's `rating` and `rating100` both take the new rating", () => {
    const key = queryKeys.performers.list(undefined, { page: 1 });
    client.setQueryData(key, {
      findPerformers: {
        performers: [{ id: "5", instanceId: "a", rating: 20, rating100: 20 }],
      },
    });

    patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { rating100: 90 }
    );

    expect(read(client, key)).toEqual({
      findPerformers: {
        performers: [{ id: "5", instanceId: "a", rating: 90, rating100: 90 }],
      },
    });
  });

  it("the returned rollback restores every patched query, the detail entries included, and leaves the others alone", () => {
    const list = queryKeys.performers.list(undefined, { page: 1 });
    const named = queryKeys.performers.detail("a", "5");
    const bare = queryKeys.performers.detail(undefined, "5");
    const listData = {
      findPerformers: {
        performers: [
          {
            id: "5",
            instanceId: "a",
            favorite: false,
            rating: 40,
            rating100: 40,
          },
        ],
      },
    };
    const detailData = {
      id: "5",
      instanceId: "a",
      favorite: false,
      rating: 40,
      rating100: 40,
    };
    client.setQueryData(list, listData);
    client.setQueryData(named, detailData);
    client.setQueryData(bare, { ...detailData });
    const unrelatedKey = queryKeys.studios.list(undefined, { page: 1 });
    const unrelated = {
      findStudios: { studios: [{ id: "5", instanceId: "a", favorite: false }] },
    };
    client.setQueryData(unrelatedKey, unrelated);
    const unrelatedAt = client.getQueryState(unrelatedKey)?.dataUpdatedAt;

    const rollback = patchEntityInCache(
      client,
      { type: "performer", id: "5", instanceId: "a" },
      { favorite: true, rating100: 100 }
    );
    expect(read(client, named)).toMatchObject({ favorite: true, rating: 100 });

    rollback();

    expect(read(client, list)).toEqual(listData);
    expect(read(client, named)).toEqual(detailData);
    expect(read(client, bare)).toEqual(detailData);
    expect(read(client, unrelatedKey)).toBe(unrelated);
    expect(client.getQueryState(unrelatedKey)?.dataUpdatedAt).toBe(unrelatedAt);
  });
});

describe("markLibraryStale", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it("marks the library, carousels, watched scenes and user stats stale and fetches nothing", async () => {
    const keys: QueryKey[] = [
      queryKeys.scenes.list(undefined, { page: 1 }),
      queryKeys.performers.detail("a", "5"),
      queryKeys.homeCarousels.byKey("recentlyAdded"),
      queryKeys.carousels.execute("7"),
      queryKeys.watchHistory.scenes({
        view: "all",
        sort: "recent",
        page: 1,
        perPage: 24,
      }),
      queryKeys.user.stats(),
    ];
    const queryFn = vi.fn(() => Promise.resolve({ fetched: true }));
    for (const key of keys) client.setQueryData(key, { seeded: true });
    const observer = new QueryObserver(client, {
      queryKey: must(keys[0], "the scenes list key"),
      queryFn,
    });
    const unsubscribe = observer.subscribe(() => {});

    await markLibraryStale(client);

    expect(queryFn).toHaveBeenCalledTimes(0);
    for (const key of keys) {
      const query = client.getQueryCache().find({ queryKey: key, exact: true });
      expect(query?.isStale(), JSON.stringify(key)).toBe(true);
    }
    unsubscribe();
  });
});

describe("cancelEntityQueries", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  /** A fetch under `key` that answers only when `answer` is called */
  function pendingFetch(key: QueryKey) {
    let answer: (value: unknown) => void = () => {};
    const fetched = client.fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      retry: false,
    });
    return { fetched, answer: (value: unknown) => answer(value) };
  }

  it("a rating write during a pending media-link fetch does not cancel it", async () => {
    const linkKey = queryKeys.scenes.mediaLink("inst-a", "12");
    const playerLinkKey = queryKeys.scenes.externalPlayerLink("inst-a", "12");
    const listKey = queryKeys.scenes.list(undefined, { page: 1 });
    const link = pendingFetch(linkKey);
    const playerLink = pendingFetch(playerLinkKey);
    const list = pendingFetch(listKey);
    // A list fetch that is cancelled rejects; caught so it is not unhandled
    const listOutcome = list.fetched.then(
      () => "answered",
      () => "cancelled"
    );

    await cancelEntityQueries(client, "scene");
    link.answer({ expiresAt: "later" });
    playerLink.answer({ url: "signed" });
    list.answer({ rows: [] });

    await expect(link.fetched).resolves.toEqual({ expiresAt: "later" });
    await expect(playerLink.fetched).resolves.toEqual({ url: "signed" });
    expect(client.getQueryState(linkKey)?.status).toBe("success");
    // The scene list's fetch is still cancelled, as the write needs
    await expect(listOutcome).resolves.toBe("cancelled");
  });

  it("isLinkQuery names the two signed link queries and nothing else", () => {
    expect(isLinkQuery(queryKeys.scenes.mediaLink("inst-a", "12"))).toBe(true);
    expect(
      isLinkQuery(queryKeys.scenes.externalPlayerLink("inst-a", "12"))
    ).toBe(true);
    expect(isLinkQuery(queryKeys.scenes.detail("inst-a", "12"))).toBe(false);
    expect(isLinkQuery(queryKeys.scenes.list(undefined, {}))).toBe(false);
  });
});
