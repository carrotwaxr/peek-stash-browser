/**
 * The playlist previews' statement and the item reads
 * (services/PlaylistQueryService.ts). The same reads run against SQLite in
 * integration/services/PlaylistQueries.integration.test.ts.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  loadPlaylistItems,
  loadPlaylistPreviews,
} from "../../services/PlaylistQueryService.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import type { NormalizedScene } from "../../types/index.js";
import type {
  PlaylistItemQueryRow,
  PlaylistPreviewQueryRow,
} from "../../types/internal/queryRows.js";
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

const mockPrisma = vi.mocked(prisma, true);
const mockGetByRefs = vi.mocked(sceneQueryBuilder.getByRefs);

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
  });

  it("every item in position order, each with its own instance's scene; an item with an empty instance gets none", async () => {
    mockPrisma.playlistItem.findMany.mockResolvedValue([
      partialRow({
        id: 1,
        playlistId: 9,
        sceneId: "42",
        instanceId: "a",
        position: 0,
      }),
      partialRow({
        id: 2,
        playlistId: 9,
        sceneId: "42",
        instanceId: "b",
        position: 1,
      }),
      partialRow({
        id: 3,
        playlistId: 9,
        sceneId: "43",
        instanceId: "",
        position: 2,
      }),
      partialRow({
        id: 4,
        playlistId: 9,
        sceneId: "44",
        instanceId: "a",
        position: 3,
      }),
    ]);
    // In no particular order; 44@a is not visible to the user
    mockGetByRefs.mockResolvedValue([
      scene("42", "b", "From B"),
      scene("42", "a", "From A"),
    ]);

    const { items, totalItems } = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: ALLOWED,
      playlistId: 9,
    });

    expect(mockPrisma.playlistItem.findMany).toHaveBeenCalledWith({
      where: { playlistId: 9 },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    expect(mockGetByRefs).toHaveBeenCalledExactlyOnceWith({
      userId: USER_ID,
      refs: [
        { id: "42", instanceId: "a" },
        { id: "42", instanceId: "b" },
        { id: "44", instanceId: "a" },
      ],
      allowedInstanceIds: ALLOWED,
    });
    expect(items.map((i) => [i.id, i.scene?.title ?? null])).toEqual([
      [1, "From A"],
      [2, "From B"],
      [3, null],
      [4, null],
    ]);
    expect(totalItems).toBe(2);
    expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("reads the scenes a list page (250 refs) at a time", async () => {
    mockPrisma.playlistItem.findMany.mockResolvedValue(
      Array.from({ length: 600 }, (_, n) =>
        partialRow({
          id: n + 1,
          playlistId: 9,
          sceneId: String(1000 + n),
          instanceId: "a",
          position: n,
        })
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

  it("without an allowed instance, every item comes back with no scene and the builder is not asked", async () => {
    mockPrisma.playlistItem.findMany.mockResolvedValue([
      partialRow({
        id: 1,
        playlistId: 9,
        sceneId: "42",
        instanceId: "a",
        position: 0,
      }),
    ]);

    const { items, totalItems } = await loadPlaylistItems({
      userId: USER_ID,
      allowedInstanceIds: [],
      playlistId: 9,
    });

    expect(items.map((i) => i.scene)).toEqual([null]);
    expect(totalItems).toBe(0);
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
    expect(page.sql).toContain("ORDER BY pi.position, pi.id");
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
    expect(items.map((i) => [i.id, i.position, i.scene?.title])).toEqual([
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
