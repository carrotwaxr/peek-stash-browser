/**
 * The playlist previews' statement and the item reads
 * (services/PlaylistQueryService.ts). The same reads run against SQLite in
 * integration/services/PlaylistQueries.integration.test.ts.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { getVisibleEntityKeys } from "../../services/EntityAccessService.js";
import {
  appendItems,
  countUnavailableItems,
  duplicateVisibleItems,
  loadPlaylistItems,
  loadPlaylistPreviews,
  loadPlaylistQueue,
  moveItem,
  playlistsHoldingScene,
  removeUnavailableItems,
  sortPlaylistItems,
} from "../../services/PlaylistQueryService.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { NormalizedScene } from "../../types/index.js";
import type {
  PlaylistItemQueryRow,
  PlaylistPreviewQueryRow,
  PlaylistQueueQueryRow,
} from "../../types/internal/queryRows.js";
import type { ParsedPlaylistItemSort } from "../../types/parsedFilters.js";
import { entityKey } from "../../utils/entityRef.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: { getByRefs: vi.fn() },
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  getVisibleEntityKeys: vi.fn(),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockGetByRefs = vi.mocked(sceneQueryBuilder.getByRefs);
const mockVisibleKeys = vi.mocked(getVisibleEntityKeys);

const POSITION_ASC: ParsedPlaylistItemSort = {
  field: "position",
  direction: "ASC",
  seed: undefined,
};

const USER_ID = 7;
const ALLOWED = ["a", "b"];

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

function previewRow(
  fields: Partial<PlaylistPreviewQueryRow>
): PlaylistPreviewQueryRow {
  return {
    playlistId: 3,
    sceneId: "42",
    instanceId: "a",
    position: 0,
    title: "Title",
    filePath: null,
    pathScreenshot: null,
    visibleCount: 1n,
    ...fields,
  };
}

function itemRow(fields: Partial<PlaylistItemQueryRow>): PlaylistItemQueryRow {
  return {
    id: 1,
    playlistId: 9,
    sceneId: "42",
    instanceId: "a",
    position: 0,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    ...fields,
  };
}

const scene = (id: string, instanceId: string, title: string) =>
  partialRow<NormalizedScene>({ id, instanceId, title });

/** Every raw statement sent, with its parameters */
function statements(): Array<{ sql: string; params: unknown[] }> {
  return mockPrisma.$queryRawUnsafe.mock.calls.map(([sql, ...params]) => ({
    sql,
    params,
  }));
}

describe("loadPlaylistPreviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("sends nothing for no playlists", async () => {
    const previews = await loadPlaylistPreviews({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistIds: [],
    });
    expect(previews.size).toBe(0);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("sends nothing without an allowed instance, and every playlist previews nothing", async () => {
    const previews = await loadPlaylistPreviews({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistIds: [3, 5],
    });
    expect([...previews]).toEqual([
      [3, { items: [], visibleCount: 0 }],
      [5, { items: [], visibleCount: 0 }],
    ]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("reads every playlist's previews in one statement driven by the ids: exclusion join with the instance, live, allowed instances", async () => {
    await loadPlaylistPreviews({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistIds: [3, 5],
    });

    const [only, ...rest] = statements();
    expect(rest).toEqual([]);
    const { sql, params } = must(only);
    expect(sql).toContain("FROM json_each(?) j");
    expect(sql).toContain(
      "CROSS JOIN PlaylistItem pi ON pi.playlistId = j.value"
    );
    expect(sql).toContain(
      "CROSS JOIN StashScene s ON s.id = pi.sceneId AND s.stashInstanceId = pi.instanceId"
    );
    expect(sql).toContain(
      "e.userId = ? AND e.entityType = 'scene' AND e.entityId = pi.sceneId AND (e.instanceId = '' OR e.instanceId = pi.instanceId)"
    );
    expect(sql).toContain(
      "s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)"
    );
    expect(sql).toContain(
      "ROW_NUMBER() OVER (PARTITION BY pi.playlistId ORDER BY pi.position, pi.id)"
    );
    expect(sql).toContain("WHERE rn <= 4");
    expect(params).toEqual([JSON.stringify([3, 5]), USER_ID, "a", "b"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("groups the rows by playlist into compact previews, with proxied screenshots and the visible count", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      previewRow({
        playlistId: 3,
        sceneId: "42",
        instanceId: "a",
        position: 1,
        title: "On A",
        pathScreenshot: "http://stash-a/scene/42/screenshot",
        visibleCount: 6n,
      }),
      previewRow({
        playlistId: 3,
        sceneId: "42",
        instanceId: "b",
        position: 4,
        title: "",
        filePath: "/media/Clip From B.mp4",
        pathScreenshot: null,
        visibleCount: 6n,
      }),
    ]);

    const previews = await loadPlaylistPreviews({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistIds: [3, 5],
    });

    expect(previews.get(3)).toEqual({
      items: [
        {
          sceneId: "42",
          instanceId: "a",
          position: 1,
          scene: {
            id: "42",
            instanceId: "a",
            title: "On A",
            paths: {
              screenshot: toProxyUrl("http://stash-a/scene/42/screenshot", "a"),
            },
          },
        },
        {
          sceneId: "42",
          instanceId: "b",
          position: 4,
          // An empty title falls back to the file name, as on every list
          scene: {
            id: "42",
            instanceId: "b",
            title: "Clip From B",
            paths: { screenshot: null },
          },
        },
      ],
      visibleCount: 6,
    });
    // A playlist with no row has nothing the user can see
    expect(previews.get(5)).toEqual({ items: [], visibleCount: 0 });
  });
});

describe("loadPlaylistItems without paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByRefs.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it("the visible items in SQL, in position order, each with its own instance's scene: one statement, no count, no page", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      itemRow({ id: 1, sceneId: "42", instanceId: "a", position: 0 }),
      itemRow({ id: 2, sceneId: "42", instanceId: "b", position: 1 }),
      itemRow({ id: 4, sceneId: "44", instanceId: "a", position: 3 }),
    ]);
    // In no particular order; 44@a was hidden after the statement
    mockGetByRefs.mockResolvedValue([
      scene("42", "b", "From B"),
      scene("42", "a", "From A"),
    ]);

    const { items, totalItems } = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
    });

    const [only, ...rest] = statements();
    expect(rest).toEqual([]);
    const { sql, params } = must(only);
    expect(sql).toContain(
      "CROSS JOIN StashScene s ON s.id = pi.sceneId AND s.stashInstanceId = pi.instanceId"
    );
    expect(sql).toContain(
      "pi.playlistId = ? AND s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)"
    );
    expect(sql).toContain("ORDER BY pi.position ASC, pi.id ASC");
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("COUNT(*)");
    expect(params).toEqual([USER_ID, 9, "a", "b"]);
    expect(placeholders(sql)).toBe(params.length);
    expect(mockPrisma.playlistItem.findMany).not.toHaveBeenCalled();

    expect(mockGetByRefs).toHaveBeenCalledExactlyOnceWith({
      userId: USER_ID,
      refs: [
        { id: "42", instanceId: "a" },
        { id: "42", instanceId: "b" },
        { id: "44", instanceId: "a" },
      ],
      allowedInstanceIds: ALLOWED,
    });
    // Every item has its scene; one hidden since the statement is left out
    expect(items.map((i) => [i.id, i.scene.title])).toEqual([
      [1, "From A"],
      [2, "From B"],
    ]);
    expect(totalItems).toBe(2);
  });

  it("reads the scenes a list page (250 refs) at a time", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue(
      Array.from({ length: 600 }, (_, n) =>
        itemRow({ id: n + 1, sceneId: String(1000 + n), position: n })
      )
    );

    await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
    });

    expect(
      mockGetByRefs.mock.calls.map(([options]) => options.refs.length)
    ).toEqual([PER_PAGE_MAX, PER_PAGE_MAX, 100]);
  });

  it("without an allowed instance, no item, no statement and the builder is not asked", async () => {
    const result = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistId: 9,
    });

    expect(result).toEqual({ items: [], totalItems: 0 });
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mockGetByRefs).not.toHaveBeenCalled();
  });
});

describe("loadPlaylistItems with paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByRefs.mockResolvedValue([]);
  });

  /** Answers the count statement with `total` and the page statement with `rows` */
  function answer(total: number, rows: PlaylistItemQueryRow[]): void {
    mockPrisma.$queryRawUnsafe.mockImplementation(
      prismaImpl((sql: string) =>
        sql.includes("COUNT(*)") ? [{ total: BigInt(total) }] : rows
      )
    );
  }

  it("reads one page of the visible items in SQL, then their scenes, in position order", async () => {
    answer(6, [
      itemRow({ id: 6, sceneId: "42", instanceId: "b", position: 5 }),
      itemRow({ id: 7, sceneId: "50", instanceId: "a", position: 6 }),
    ]);
    mockGetByRefs.mockResolvedValue([
      scene("50", "a", "Fifty"),
      scene("42", "b", "From B"),
    ]);

    const { items, totalItems } = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      paging: { page: 2, perPage: 2 },
    });

    const sent = statements();
    const page = must(sent.find((s) => !s.sql.includes("COUNT(*)")));
    const count = must(sent.find((s) => s.sql.includes("COUNT(*)")));
    expect(sent).toHaveLength(2);
    for (const { sql } of sent) {
      expect(sql).toContain(
        "CROSS JOIN StashScene s ON s.id = pi.sceneId AND s.stashInstanceId = pi.instanceId"
      );
      expect(sql).toContain(
        "e.entityId = pi.sceneId AND (e.instanceId = '' OR e.instanceId = pi.instanceId)"
      );
      expect(sql).toContain(
        "pi.playlistId = ? AND s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)"
      );
    }
    expect(page.sql).toContain("ORDER BY pi.position ASC, pi.id ASC");
    expect(page.sql).toContain("LIMIT ? OFFSET ?");
    expect(page.params).toEqual([USER_ID, 9, "a", "b", 2, 2]);
    expect(placeholders(page.sql)).toBe(page.params.length);
    expect(count.params).toEqual([USER_ID, 9, "a", "b"]);
    expect(placeholders(count.sql)).toBe(count.params.length);

    expect(mockGetByRefs).toHaveBeenCalledExactlyOnceWith({
      userId: USER_ID,
      refs: [
        { id: "42", instanceId: "b" },
        { id: "50", instanceId: "a" },
      ],
      allowedInstanceIds: ALLOWED,
    });
    expect(items.map((i) => [i.id, i.position, i.scene.title])).toEqual([
      [6, 5, "From B"],
      [7, 6, "Fifty"],
    ]);
    expect(totalItems).toBe(6);
  });

  it("an item whose scene the builder no longer returns is left out", async () => {
    answer(2, [
      itemRow({ id: 1, sceneId: "42", position: 0 }),
      itemRow({ id: 2, sceneId: "43", position: 1 }),
    ]);
    mockGetByRefs.mockResolvedValue([scene("43", "a", "Still here")]);

    const { items } = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      paging: { page: 1, perPage: 50 },
    });

    expect(items.map((i) => i.id)).toEqual([2]);
  });

  it("a page past the end reads no scenes", async () => {
    answer(6, []);

    const result = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      paging: { page: 9, perPage: 2 },
    });

    expect(result).toEqual({ items: [], totalItems: 6 });
    expect(mockGetByRefs).not.toHaveBeenCalled();
  });

  it("without an allowed instance, an empty page and no statement", async () => {
    const result = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistId: 9,
      paging: { page: 1, perPage: 50 },
    });

    expect(result).toEqual({ items: [], totalItems: 0 });
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(mockGetByRefs).not.toHaveBeenCalled();
  });
});

describe("moveItem's order (movedOrder)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Moves the item among rows listed in playlist order ("h" a visible
   * item, "x" one the owner cannot see; the number is the item id), and
   * answers the ids the renumbering was sent, or null when nothing was
   * written.
   */
  async function moved(
    rows: ReadonlyArray<readonly [number, "v" | "x"]>,
    itemId: number,
    index: number
  ): Promise<number[] | null> {
    vi.clearAllMocks();
    mockPrisma.$queryRawUnsafe.mockResolvedValue(
      rows.map(([id, kind]) => ({ id, visible: kind === "v" ? 1n : 0n }))
    );
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    const written = await moveItem(9, USER_ID, ALLOWED, itemId, index);
    if (!written) {
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      return null;
    }
    const call: unknown[] = must(mockPrisma.$executeRawUnsafe.mock.calls[0]);
    const order = call[1];
    expect(typeof order).toBe("string");
    return JSON.parse(String(order)) as number[];
  }

  const FOUR = [
    [1, "v"],
    [2, "v"],
    [3, "v"],
    [4, "v"],
  ] as const;

  it("reads the playlist's items in order with their visibility, and renumbers by the ids it writes", async () => {
    await moved(FOUR, 1, 1);

    const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    expect(sql).toContain("LEFT JOIN StashScene s");
    expect(sql).toContain("ORDER BY pi.position, pi.id");
    expect(params).toEqual(["a", "b", USER_ID, 9]);
    const [renumber] = must(mockPrisma.$executeRawUnsafe.mock.calls[0]);
    expect(renumber).toContain("UPDATE PlaylistItem SET position = o.pos");
  });

  it("moves an item down to the index among the others", async () => {
    expect(await moved(FOUR, 1, 2)).toEqual([2, 3, 1, 4]);
  });

  it("moves an item up to the index among the others", async () => {
    expect(await moved(FOUR, 4, 1)).toEqual([1, 4, 2, 3]);
  });

  it("index 0 puts the item first", async () => {
    expect(await moved(FOUR, 3, 0)).toEqual([3, 1, 2, 4]);
  });

  it("an index past the end puts the item last", async () => {
    expect(await moved(FOUR, 1, 99)).toEqual([2, 3, 4, 1]);
  });

  it("moving an item to the index it holds changes nothing", async () => {
    expect(await moved(FOUR, 2, 1)).toEqual([1, 2, 3, 4]);
  });

  it("counts the index among visible items only: hidden ones keep their place between their neighbours", async () => {
    const rows = [
      [1, "v"],
      [2, "x"],
      [3, "v"],
      [4, "x"],
      [5, "v"],
    ] as const;

    // Visible 1, 3, 5: item 5 goes before the visible item at index 1 (3);
    // 2 stays after 1, and 4 stays between 3 and the moved item's old place
    expect(await moved(rows, 5, 1)).toEqual([1, 2, 5, 3, 4]);
    // Visible 1, 3, 5: item 1 to index 1 goes before visible 5, so after 4
    expect(await moved(rows, 1, 1)).toEqual([2, 3, 4, 1, 5]);
  });

  it("past the end of the visible items lands right after the last visible one, before trailing hidden items", async () => {
    const rows = [
      [1, "v"],
      [2, "v"],
      [3, "x"],
    ] as const;

    expect(await moved(rows, 1, 5)).toEqual([2, 1, 3]);
  });

  it("the only visible item stays where it is, hidden ones around it untouched", async () => {
    const rows = [
      [1, "x"],
      [2, "v"],
      [3, "x"],
    ] as const;

    expect(await moved(rows, 2, 0)).toEqual([1, 2, 3]);
    expect(await moved(rows, 2, 7)).toEqual([1, 2, 3]);
  });

  it("an item the owner cannot see, or one not in the playlist, writes nothing and answers false", async () => {
    const rows = [
      [1, "v"],
      [2, "x"],
    ] as const;

    expect(await moved(rows, 2, 0)).toBeNull();
    expect(await moved(rows, 99, 0)).toBeNull();
  });
});

describe("duplicateVisibleItems", () => {
  it("copies the visible items in position order, numbered from 0, into the new playlist", () => {
    const copy = duplicateVisibleItems(USER_ID, ALLOWED, 12);
    const { sql } = copy;

    expect(sql).toContain("INSERT INTO PlaylistItem");
    expect(sql).toContain(
      "ROW_NUMBER() OVER (ORDER BY pi.position, pi.id) - 1"
    );
    expect(sql).toContain("CROSS JOIN StashScene s");
    expect(sql).toContain(
      "s.deletedAt IS NULL AND e.id IS NULL AND s.stashInstanceId IN (?, ?)"
    );
    expect(placeholders(sql)).toBe(copy.paramsFor(34).length);
  });

  it("binds the new playlist id first, then the time, the viewer, the source playlist and the allowed instances, in statement order", () => {
    const copy = duplicateVisibleItems(USER_ID, ALLOWED, 12);
    const before = Date.now();

    const params = copy.paramsFor(34);

    const [newId, addedAt, ...rest] = params;
    expect(newId).toBe(34);
    expect(addedAt).toBeGreaterThanOrEqual(before);
    expect(addedAt).toBeLessThanOrEqual(Date.now());
    expect(rest).toEqual([USER_ID, 12, "a", "b"]);
  });

  it("each call to paramsFor takes its own playlist id", () => {
    const copy = duplicateVisibleItems(USER_ID, ALLOWED, 12);

    expect(copy.paramsFor(1)[0]).toBe(1);
    expect(copy.paramsFor(2)[0]).toBe(2);
  });

  it("a viewer with no allowed instance copies nothing", () => {
    const { sql } = duplicateVisibleItems(USER_ID, [], 12);

    expect(sql).toContain("AND 1 = 0");
  });
});

describe("appendItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ref = (id: string, instanceId: string) => ({ id, instanceId });

  it("inserts the scenes the adder can see, once each, in request order, and counts the rest", async () => {
    mockVisibleKeys.mockResolvedValue(
      new Set([entityKey("1", "a"), entityKey("3", "b")])
    );
    // One of the two visible scenes was already in the playlist
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);

    const result = await appendItems(9, USER_ID, [
      ref("3", "b"),
      ref("2", "a"),
      ref("1", "a"),
      ref("3", "b"),
    ]);

    expect(result).toEqual({ added: 1, alreadyInPlaylist: 1, unavailable: 1 });
    expect(mockVisibleKeys).toHaveBeenCalledWith(USER_ID, "scene", [
      ref("3", "b"),
      ref("2", "a"),
      ref("1", "a"),
    ]);
    const [sql, ...params] = must(mockPrisma.$executeRawUnsafe.mock.calls[0]);
    expect(sql).toContain("INSERT OR IGNORE INTO PlaylistItem");
    expect(placeholders(sql)).toBe(params.length);
    expect(params.slice(0, 4)).toEqual([
      JSON.stringify([
        ["3", "b"],
        ["1", "a"],
      ]),
      9,
      9,
      9,
    ]);
    expect(typeof params[4]).toBe("number");
  });

  it("writes nothing when the adder can see none of the scenes", async () => {
    mockVisibleKeys.mockResolvedValue(new Set());

    const result = await appendItems(9, USER_ID, [ref("1", "a")]);

    expect(result).toEqual({ added: 0, alreadyInPlaylist: 0, unavailable: 1 });
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("sortPlaylistItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renumbers every item in one statement, visible ones in the sort and the rest after them by position, and answers the count", async () => {
    mockPrisma.$executeRawUnsafe.mockResolvedValue(5);

    const count = await sortPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      sort: { field: "added_at", direction: "DESC", seed: undefined },
    });

    expect(count).toBe(5);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = must(mockPrisma.$executeRawUnsafe.mock.calls[0]);
    expect(sql).toContain("UPDATE PlaylistItem");
    expect(sql).toContain(
      "PARTITION BY vis.v ORDER BY pi.addedAt DESC, pi.position, pi.id"
    );
    expect(sql).toContain(
      "CASE WHEN n.v = 1 THEN n.rsort - 1 ELSE n.nvis + n.rpos - 1 END"
    );
    // vis's select list (the allowed instances), its join (the viewer's
    // exclusions), then its WHERE (the playlist)
    expect(params).toEqual(["a", "b", USER_ID, 9]);
    expect(placeholders(sql)).toBe(params.length);
  });
});

describe("playlistsHoldingScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks nothing for no playlists", async () => {
    const holding = await playlistsHoldingScene([], {
      id: "1",
      instanceId: "a",
    });

    expect(holding.size).toBe(0);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("answers the playlists whose items hold the scene on its own instance, in one statement", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { playlistId: 3 },
      { playlistId: 5 },
    ]);

    const holding = await playlistsHoldingScene([3, 4, 5], {
      id: "42",
      instanceId: "b",
    });

    expect([...holding]).toEqual([3, 5]);
    const [only, ...rest] = statements();
    expect(rest).toEqual([]);
    const { sql, params } = must(only);
    expect(sql).toContain("pi.instanceId = ? AND pi.sceneId = ?");
    expect(params).toEqual(["[3,4,5]", "b", "42"]);
  });
});

describe("loadPlaylistQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function queueRow(
    fields: Partial<PlaylistQueueQueryRow>
  ): PlaylistQueueQueryRow {
    return {
      sceneId: "42",
      instanceId: "a",
      title: "Title",
      filePath: "/videos/clip.mp4",
      pathScreenshot: "/scene/42/screenshot",
      duration: 61.5,
      studioName: "Studio",
      ...fields,
    };
  }

  it("without an allowed instance, an empty queue and no statement", async () => {
    const queue = await loadPlaylistQueue({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistId: 9,
      sort: POSITION_ASC,
    });

    expect(queue).toEqual([]);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("reads every visible item in the view's order in one statement, with the studio only when the viewer may see it", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

    await loadPlaylistQueue({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      sort: POSITION_ASC,
    });

    const [only, ...rest] = statements();
    expect(rest).toEqual([]);
    const { sql, params } = must(only);
    expect(sql).toContain("LEFT JOIN StashStudio qst");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM UserExcludedEntity qse WHERE qse.userId = ? AND qse.entityType = 'studio'"
    );
    expect(sql).toContain("ORDER BY pi.position ASC, pi.id ASC");
    // The scene exclusion join, the studio join, the playlist, the instances
    expect(params).toEqual([USER_ID, USER_ID, 9, "a", "b"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("numbers the entries in the order read, with a title from the file name when the scene has none, a proxied screenshot and no studio when hidden", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      queueRow({}),
      queueRow({
        sceneId: "7",
        instanceId: "b",
        title: "",
        filePath: "C:\\media\\holiday.mkv",
        pathScreenshot: null,
        duration: null,
        studioName: null,
      }),
      queueRow({ sceneId: "8", title: null, filePath: null }),
    ]);

    const queue = await loadPlaylistQueue({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
      sort: POSITION_ASC,
    });

    expect(queue).toEqual([
      {
        sceneId: "42",
        instanceId: "a",
        position: 0,
        scene: {
          title: "Title",
          paths: { screenshot: toProxyUrl("/scene/42/screenshot", "a") },
          files: [{ duration: 61.5, basename: "clip.mp4" }],
          studio: { name: "Studio" },
        },
      },
      {
        sceneId: "7",
        instanceId: "b",
        position: 1,
        scene: {
          title: "holiday",
          paths: { screenshot: toProxyUrl(null, "b") },
          files: [{ duration: null, basename: "holiday.mkv" }],
          studio: null,
        },
      },
      {
        sceneId: "8",
        instanceId: "a",
        position: 2,
        scene: {
          title: null,
          paths: { screenshot: toProxyUrl("/scene/42/screenshot", "a") },
          files: [],
          studio: { name: "Studio" },
        },
      },
    ]);
  });
});

describe("countUnavailableItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers the playlist's rows minus the ones the viewer can see, in one statement", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ total: 5n, visible: 3n }]);

    const count = await countUnavailableItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
    });

    expect(count).toBe(2);
    const [only, ...rest] = statements();
    expect(rest).toEqual([]);
    const { sql, params } = must(only);
    expect(sql).toContain(
      "(SELECT COUNT(*) FROM PlaylistItem WHERE playlistId = ?) AS total"
    );
    expect(sql).toContain("e.id IS NULL");
    expect(params).toEqual([9, USER_ID, 9, "a", "b"]);
    expect(placeholders(sql)).toBe(params.length);
  });

  it("without an allowed instance every item is unavailable", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ total: 4n, visible: 0n }]);

    const count = await countUnavailableItems({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistId: 9,
    });

    expect(count).toBe(4);
    const { sql, params } = must(statements()[0]);
    expect(sql).toContain("0 AS visible");
    expect(params).toEqual([9]);
  });

  it("never answers less than none, and none when no row comes back", async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { total: 2n, visible: 3n },
    ]);
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    const options = {
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
    };

    expect(await countUnavailableItems(options)).toBe(0);
    expect(await countUnavailableItems(options)).toBe(0);
  });
});

describe("removeUnavailableItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the playlist's items whose scene Stash deleted, in one statement, and answers how many went", async () => {
    mockPrisma.$executeRawUnsafe.mockResolvedValue(2);

    expect(await removeUnavailableItems(9)).toBe(2);

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = must(mockPrisma.$executeRawUnsafe.mock.calls[0]);
    expect(sql).toContain("DELETE FROM PlaylistItem");
    expect(sql).toContain("s.deletedAt IS NOT NULL");
    expect(sql).toContain("i.enabled = 1 AND i.firstSyncedAt IS NOT NULL");
    expect(params).toEqual([9]);
  });
});
