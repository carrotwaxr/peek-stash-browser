/**
 * invalidateExclusionDependents: after something the user can see changes
 * (a hide, a restore), every cached read that filters by the user's
 * exclusions is refetched or marked stale.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import {
  invalidateInstanceQueries,
  invalidateLibraryQueries,
} from "@/api/hooks/useLibraryReady";
import { invalidateExclusionDependents } from "@/api/invalidateExclusionDependents";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";

/** Seeds one query per key and returns which of them are now invalidated. */
function seed(client: QueryClient, keys: QueryKey[]): void {
  for (const key of keys) client.setQueryData(key, { seeded: true });
}

function invalidated(client: QueryClient, key: QueryKey): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

const LIBRARY_KEYS: QueryKey[] = [
  queryKeys.scenes.list("a", { page: 1 }),
  queryKeys.scenes.detail("a", "1"),
  queryKeys.scenes.similar("a", "1", 1),
  queryKeys.performers.list(undefined, { page: 1 }),
  queryKeys.studios.detail("a", "2"),
  queryKeys.tags.tree(undefined),
  queryKeys.galleries.list("a", {}),
  queryKeys.groups.list("a", {}),
  queryKeys.images.list("a", {}),
  queryKeys.clips.list({ page: 1 }),
  queryKeys.homeCarousels.byKey("recentlyAdded"),
  queryKeys.carousels.execute("7"),
];

describe("invalidateExclusionDependents", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = createQueryClient();
  });

  it("invalidates what invalidateLibraryQueries does, plus recommended and user stats", async () => {
    const recommended = queryKeys.scenes.recommended(1, 24);
    const stats = queryKeys.user.stats();
    const hidden = queryKeys.user.hiddenItems("scene", 2);
    seed(client, [...LIBRARY_KEYS, recommended, stats, hidden]);

    await invalidateExclusionDependents(client);

    for (const key of [...LIBRARY_KEYS, recommended, stats, hidden]) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
  });

  it("leaves unrelated queries alone", async () => {
    const unrelated = [
      queryKeys.user.permissions(),
      queryKeys.user.filterPresets(),
      queryKeys.playlists.all(),
      queryKeys.scenes.externalPlayerLink("a", "1"),
    ];
    seed(client, unrelated);

    await invalidateExclusionDependents(client);

    for (const key of unrelated) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(false);
    }
  });

  it("covers everything invalidateLibraryQueries covers", async () => {
    const other = createQueryClient();
    seed(client, LIBRARY_KEYS);
    seed(other, LIBRARY_KEYS);

    await invalidateLibraryQueries(other);
    await invalidateExclusionDependents(client);

    for (const key of LIBRARY_KEYS) {
      expect(invalidated(client, key)).toBe(invalidated(other, key));
    }
  });
});

describe("invalidateInstanceQueries", () => {
  it("also invalidates the setup status, recommended and user stats", async () => {
    const client = createQueryClient();
    const keys = [
      queryKeys.setup.status(),
      queryKeys.scenes.recommended(1, 24),
      queryKeys.user.stats(),
      queryKeys.scenes.list("a", {}),
    ];
    seed(client, keys);

    await invalidateInstanceQueries(client);

    for (const key of keys) {
      expect(invalidated(client, key), JSON.stringify(key)).toBe(true);
    }
  });
});
