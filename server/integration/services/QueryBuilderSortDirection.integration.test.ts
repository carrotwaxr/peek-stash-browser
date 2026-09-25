/**
 * Integration tests for sort-direction handling in the image and clip query
 * builders (item 3), and for the scene builder's title order (item 67 (c)).
 *
 * Both builders splice the sort direction into ORDER BY. These tests run
 * against the real test SQLite database with a hostile direction whose
 * subquery overflows (abs() of the minimum 64-bit integer), so SQLite raises
 * "integer overflow" if the text ever reaches the query.
 *
 * The scene list sorts by title through the stored `titleSort`, written by
 * sync: the order must be the order of the titles the list shows, ASCII
 * case-folded (what COLLATE NOCASE compared), ties broken by id. An untitled
 * scene shows its file name without the extension, and sorts by it.
 *
 * Rows are seeded under a made-up stashInstanceId so the real sync and other
 * tests never touch them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
} from "../../services/StashSyncService.js";
import { SyncChangeSet } from "../../services/SyncChangeSet.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "sortdir-it-instance";
const TEST_USER_ID = 999999;
const HOSTILE_DIRECTION = "ASC, (SELECT abs(-9223372036854775808))";

/**
 * Scenes whose title order differs from the old expression's: it compared
 * the file name with its extension, so "Beach.mp4" sorted after
 * "Beach (2).mp4" while the list showed "Beach" and "Beach (2)".
 */
const TITLED_SCENES: Array<[id: string, title: string | null, path: string]> = [
  ["11", null, "/videos/Beach.mp4"],
  ["12", null, "/videos/Beach (2).mp4"],
  ["13", "beach", "/videos/zzz.mp4"],
  ["14", "", "C:\\Videos\\Aardvark.mkv"],
  ["15", "Zebra", "/videos/aaa.mp4"],
  ["16", "alpha", "/videos/x.mp4"],
  ["17", "ALPHA", "/videos/y.mp4"],
];

/** The title rule's case folding: ASCII only, as SQLite's lower() and NOCASE */
function foldAscii(value: string): string {
  return value.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** SQLite's BINARY order on strings (code units agree with it here) */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function clearTestRows(): Promise<void> {
  await prisma.stashClip.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashImage.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
}

describeWithDb("Query builder sort direction (integration)", () => {
  beforeAll(async () => {
    await clearTestRows();

    await prisma.stashImage.createMany({
      data: [
        {
          id: "1",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-01"),
        },
        {
          id: "2",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-02"),
        },
        {
          id: "3",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-03"),
        },
      ],
    });

    await prisma.stashScene.create({
      data: { id: "1", stashInstanceId: TEST_INSTANCE },
    });

    // Written as sync writes them, so the stored sort columns are filled
    await ENTITY_SYNC.scene.processBatch(
      TITLED_SCENES.map(([id, title, path]) =>
        partialRow<SyncEntityOf<"scene">>({
          id,
          title,
          urls: [],
          files: [partialRow({ path })],
          captions: [],
          studio: null,
          performers: [],
          tags: [],
          groups: [],
          galleries: [],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        })
      ),
      TEST_INSTANCE,
      { signal: new AbortController().signal, changes: new SyncChangeSet() }
    );

    await prisma.stashClip.createMany({
      data: [
        {
          id: "1",
          stashInstanceId: TEST_INSTANCE,
          sceneId: "1",
          sceneInstanceId: TEST_INSTANCE,
          seconds: 0,
          isGenerated: true,
          stashCreatedAt: new Date("2024-01-01"),
        },
        {
          id: "2",
          stashInstanceId: TEST_INSTANCE,
          sceneId: "1",
          sceneInstanceId: TEST_INSTANCE,
          seconds: 10,
          isGenerated: true,
          stashCreatedAt: new Date("2024-01-02"),
        },
      ],
    });
  });

  afterAll(async () => {
    await clearTestRows();
  });

  it("image builder ignores a hostile direction", async () => {
    const result = await imageQueryBuilder.execute({
      userId: TEST_USER_ID,
      sort: "created_at",
      sortDirection: HOSTILE_DIRECTION as never,
      page: 1,
      perPage: 10,
      allowedInstanceIds: [TEST_INSTANCE],
    });

    expect(result.images.map((i) => i.id)).toEqual(["3", "2", "1"]);
  });

  it("clip builder ignores a hostile direction", async () => {
    const result = await clipQueryBuilder.getClips({
      userId: TEST_USER_ID,
      sortBy: "stashCreatedAt",
      sortDir: HOSTILE_DIRECTION as never,
      allowedInstanceIds: [TEST_INSTANCE],
    });

    expect(result.clips.map((c) => c.id)).toEqual(["2", "1"]);
  });

  it.each(["ASC", "DESC"] as const)(
    "scene title order %s is the displayed titles' order, case-folded, ties by id",
    async (direction) => {
      const result = await sceneQueryBuilder.execute({
        userId: TEST_USER_ID,
        sort: "title",
        sortDirection: direction,
        page: 1,
        perPage: 50,
        allowedInstanceIds: [TEST_INSTANCE],
      });

      const shown = result.scenes.map((s) => ({ id: s.id, title: s.title }));
      // NULL (no title, no file) first ascending, as SQLite orders it
      const ascending = [...shown].sort(
        (a, b) =>
          (a.title === null ? -1 : 0) - (b.title === null ? -1 : 0) ||
          compareText(foldAscii(a.title ?? ""), foldAscii(b.title ?? "")) ||
          compareText(a.id, b.id)
      );
      const expected = direction === "ASC" ? ascending : ascending.reverse();

      expect(shown.map((s) => s.id).sort()).toEqual(
        ["1", ...TITLED_SCENES.map(([id]) => id)].sort()
      );
      expect(shown).toEqual(expected);
      expect(shown.map((s) => s.title)).toContain("Beach");
    }
  );
});
