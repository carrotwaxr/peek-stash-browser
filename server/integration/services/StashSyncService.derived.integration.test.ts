/**
 * Integration tests for the scene sort columns sync stores (item 67 (c),
 * DB-07): `titleSort`, the title a scene's card shows (its own title, else
 * its file name without the extension, `getSceneFallbackTitle`) with ASCII
 * folded to lower case, as the list's title sort compares it; and
 * `performerCount` / `tagCount`, the scene's `ScenePerformer` and `SceneTag`
 * rows. The list sorts and filters on them through indexes instead of
 * computing them per scene on every request. Images store the same
 * `titleSort` (routed C7): their title, else `getImageFallbackTitle`.
 *
 * The first case of each block reads every row the startup sync wrote. The
 * others write through the batch writers under a made-up instance,
 * `derived-it`, which real sync never touches.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
} from "../../services/StashSyncService.js";
import { SyncChangeSet } from "../../services/SyncChangeSet.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import {
  IMAGE_DEFAULTS,
  SCENE_DEFAULTS,
} from "../../tests/helpers/syncRowDefaults.js";
import {
  getImageFallbackTitle,
  getSceneFallbackTitle,
} from "../../utils/titleUtils.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const DERIVED = "derived-it";

type SyncScene = SyncEntityOf<"scene">;
type SyncImage = SyncEntityOf<"image">;

/** A scene as Stash's sync query returns it */
function sceneRow(
  id: string,
  fields: {
    title?: string | null;
    path?: string | null;
    performers?: string[];
    tags?: string[];
  },
  updatedAt = "2026-01-02T00:00:00Z"
): SyncScene {
  return partialRow<SyncScene>({
    ...SCENE_DEFAULTS,
    id,
    title: fields.title ?? null,
    urls: [],
    files:
      fields.path === undefined || fields.path === null
        ? []
        : [partialRow({ path: fields.path })],
    captions: [],
    studio: null,
    performers: (fields.performers ?? []).map((p) => partialRow({ id: p })),
    tags: (fields.tags ?? []).map((t) => partialRow({ id: t })),
    groups: [],
    galleries: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
  });
}

function syncScenes(scenes: SyncScene[]) {
  return ENTITY_SYNC.scene.processBatch(scenes, DERIVED, {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  });
}

/** The title rule's case folding: ASCII only, as SQLite's lower() and NOCASE */
function foldAscii(value: string): string {
  return value.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

interface StoredScene {
  id: string;
  stashInstanceId: string;
  title: string | null;
  filePath: string | null;
  titleSort: string | null;
  performerCount: number;
  tagCount: number;
  /** COUNT(*) of the scene's junction rows */
  performers: bigint;
  tags: bigint;
}

/** The live scenes of `instanceId`, or of every configured instance */
async function storedScenes(instanceId?: string): Promise<StoredScene[]> {
  const instanceIds = instanceId
    ? [instanceId]
    : (await prisma.stashInstance.findMany({ select: { id: true } })).map(
        (i) => i.id
      );
  return prisma.$queryRawUnsafe<StoredScene[]>(
    `SELECT s.id, s.stashInstanceId, s.title, s.filePath, s.titleSort,
       s.performerCount, s.tagCount,
       (SELECT COUNT(*) FROM ScenePerformer sp WHERE sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId) AS performers,
       (SELECT COUNT(*) FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId) AS tags
     FROM StashScene s
     WHERE s.deletedAt IS NULL
       AND s.stashInstanceId IN (SELECT value FROM json_each(?))
     ORDER BY s.stashInstanceId, s.id`,
    JSON.stringify(instanceIds)
  );
}

/** Each stored scene whose columns differ from its title and junction rows */
function mismatches(scenes: StoredScene[]) {
  return scenes
    .map((s) => {
      // As the list shows it: `title || getSceneFallbackTitle(filePath)`
      const shown =
        s.title !== null && s.title !== ""
          ? s.title
          : getSceneFallbackTitle(s.filePath);
      return {
        scene: `${s.id}@${s.stashInstanceId}`,
        titleSort: s.titleSort,
        expected: shown === null ? null : foldAscii(shown),
        performerCount: s.performerCount,
        performers: Number(s.performers),
        tagCount: s.tagCount,
        tags: Number(s.tags),
      };
    })
    .filter(
      (m) =>
        m.titleSort !== m.expected ||
        m.performerCount !== m.performers ||
        m.tagCount !== m.tags
    );
}

async function clearSeed(): Promise<void> {
  const where = { sceneInstanceId: DERIVED };
  await prisma.scenePerformer.deleteMany({ where });
  await prisma.sceneTag.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: DERIVED } });
  await prisma.stashPerformer.deleteMany({
    where: { stashInstanceId: DERIVED },
  });
  await prisma.stashTag.deleteMany({ where: { stashInstanceId: DERIVED } });
}

describeWithDb("Scene sort columns (integration)", () => {
  beforeEach(async () => {
    await clearSeed();
    await prisma.stashPerformer.createMany({
      data: ["1", "2"].map((id) => ({
        id,
        stashInstanceId: DERIVED,
        name: `Derived IT performer ${id}`,
      })),
    });
    await prisma.stashTag.createMany({
      data: ["1", "2"].map((id) => ({
        id,
        stashInstanceId: DERIVED,
        name: `Derived IT tag ${id}`,
      })),
    });
  });

  afterAll(async () => {
    await clearSeed();
  });

  it("every synced scene's titleSort is its displayed title, case-folded, and its counts are its junction rows", async () => {
    const scenes = await storedScenes();

    expect(scenes.length).toBeGreaterThan(0);
    expect(mismatches(scenes)).toEqual([]);
  });

  it("an untitled scene sorts by its file name without the extension, as its card shows it", async () => {
    await syncScenes([
      sceneRow("1", { path: "/videos/Beach Day.MP4" }),
      sceneRow("2", { title: "", path: "/videos/Beach Day (2).mp4" }),
      sceneRow("3", { path: "D:\\Clips\\Final.Cut.mkv" }),
      sceneRow("4", { path: "/videos/no-extension" }),
      sceneRow("5", { path: "/videos/.hidden" }),
      sceneRow("6", { path: "/videos/ends-with-dot." }),
      sceneRow("7", { path: "/videos/folder/" }),
      sceneRow("8", {}),
      sceneRow("9", { title: "Élan VITAL", path: "/videos/other.mp4" }),
      sceneRow("10", { title: "  Spaced", path: "/videos/other.mp4" }),
    ]);

    const scenes = await storedScenes(DERIVED);
    expect(mismatches(scenes)).toEqual([]);
    expect(scenes.map((s) => [s.id, s.titleSort])).toEqual([
      ["1", "beach day"],
      ["10", "  spaced"],
      ["2", "beach day (2)"],
      ["3", "final.cut"],
      ["4", "no-extension"],
      ["5", ""],
      ["6", "ends-with-dot."],
      ["7", "/videos/folder/"],
      ["8", null],
      // SQLite's lower() folds ASCII only, as NOCASE compares
      ["9", "Élan vital"],
    ]);
  });

  it("re-syncing a scene whose tags changed refreshes tagCount", async () => {
    await syncScenes([
      sceneRow("1", {
        title: "Before",
        performers: ["1", "2"],
        tags: ["1", "2"],
      }),
    ]);
    const before = await storedScenes(DERIVED);

    await syncScenes([
      sceneRow(
        "1",
        { title: "After", performers: [], tags: ["2"] },
        "2026-01-03T00:00:00Z"
      ),
    ]);
    const after = await storedScenes(DERIVED);

    expect(
      before.map((s) => [s.titleSort, s.performerCount, s.tagCount])
    ).toEqual([["before", 2, 2]]);
    expect(
      after.map((s) => [s.titleSort, s.performerCount, s.tagCount])
    ).toEqual([["after", 0, 1]]);
    expect(mismatches(after)).toEqual([]);
  });
});

/** An image as Stash's sync query returns it */
function imageRow(
  id: string,
  fields: { title?: string | null; path?: string | null },
  updatedAt = "2026-01-02T00:00:00Z"
): SyncImage {
  return partialRow<SyncImage>({
    ...IMAGE_DEFAULTS,
    id,
    title: fields.title ?? null,
    files:
      fields.path === undefined || fields.path === null
        ? []
        : [partialRow({ path: fields.path })],
    studio: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
  });
}

function syncImages(images: SyncImage[]) {
  return ENTITY_SYNC.image.processBatch(images, DERIVED, {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  });
}

interface StoredImage {
  id: string;
  stashInstanceId: string;
  title: string | null;
  filePath: string | null;
  titleSort: string | null;
}

/** The live images of `instanceId`, or of every configured instance */
async function storedImages(instanceId?: string): Promise<StoredImage[]> {
  const instanceIds = instanceId
    ? [instanceId]
    : (await prisma.stashInstance.findMany({ select: { id: true } })).map(
        (i) => i.id
      );
  return prisma.$queryRawUnsafe<StoredImage[]>(
    `SELECT i.id, i.stashInstanceId, i.title, i.filePath, i.titleSort
     FROM StashImage i
     WHERE i.deletedAt IS NULL
       AND i.stashInstanceId IN (SELECT value FROM json_each(?))
     ORDER BY i.stashInstanceId, i.id`,
    JSON.stringify(instanceIds)
  );
}

/** Each stored image whose titleSort differs from its displayed title */
function imageMismatches(images: StoredImage[]) {
  return images
    .map((i) => {
      // As the list shows it: `title || getImageFallbackTitle(filePath)`
      const shown =
        i.title !== null && i.title !== ""
          ? i.title
          : getImageFallbackTitle(i.filePath);
      return {
        image: `${i.id}@${i.stashInstanceId}`,
        titleSort: i.titleSort,
        expected: shown === null ? null : foldAscii(shown),
      };
    })
    .filter((m) => m.titleSort !== m.expected);
}

async function clearImages(): Promise<void> {
  await prisma.stashImage.deleteMany({ where: { stashInstanceId: DERIVED } });
}

describeWithDb("Image sort key (integration)", () => {
  beforeEach(async () => {
    await clearImages();
  });

  afterAll(async () => {
    await clearImages();
  });

  it("every synced image's titleSort is its displayed title, case-folded", async () => {
    const images = await storedImages();

    expect(images.length).toBeGreaterThan(0);
    expect(imageMismatches(images)).toEqual([]);
  });

  it("an untitled image's titleSort is its file name without the extension, ASCII lower-cased", async () => {
    await syncImages([
      imageRow("1", { path: "/pictures/Beach Day.JPG" }),
      imageRow("2", { title: "", path: "/pictures/Beach Day (2).jpg" }),
      imageRow("3", { path: "D:\\Photos\\Final.Cut.png" }),
      imageRow("4", { path: "/pictures/no-extension" }),
      imageRow("5", { path: "/pictures/.hidden" }),
      imageRow("6", { path: "/pictures/ends-with-dot." }),
      imageRow("7", { path: "/pictures/folder/" }),
      imageRow("8", {}),
      imageRow("9", { title: "Élan VITAL", path: "/pictures/other.jpg" }),
      imageRow("10", { title: "  Spaced", path: "/pictures/other.jpg" }),
      // An image inside a zip: Stash's path names the member after the zip
      imageRow("11", { path: "/pictures/Set.zip/Img 01.webp" }),
    ]);

    const images = await storedImages(DERIVED);
    expect(imageMismatches(images)).toEqual([]);
    expect(images.map((i) => [i.id, i.titleSort])).toEqual([
      ["1", "beach day"],
      ["10", "  spaced"],
      ["11", "img 01"],
      ["2", "beach day (2)"],
      ["3", "final.cut"],
      ["4", "no-extension"],
      ["5", ""],
      ["6", "ends-with-dot."],
      ["7", "/pictures/folder/"],
      ["8", null],
      // SQLite's lower() folds ASCII only, as NOCASE compares
      ["9", "Élan vital"],
    ]);
  });

  it("a title change on sync rewrites titleSort", async () => {
    await syncImages([imageRow("1", { title: "Before", path: "/p/a.jpg" })]);
    const before = await storedImages(DERIVED);

    await syncImages([
      imageRow(
        "1",
        { title: "After", path: "/p/a.jpg" },
        "2026-01-03T00:00:00Z"
      ),
    ]);
    const renamed = await storedImages(DERIVED);

    await syncImages([
      imageRow(
        "1",
        { title: null, path: "/p/Moved.JPG" },
        "2026-01-04T00:00:00Z"
      ),
    ]);
    const untitled = await storedImages(DERIVED);

    expect(before.map((i) => i.titleSort)).toEqual(["before"]);
    expect(renamed.map((i) => i.titleSort)).toEqual(["after"]);
    expect(untitled.map((i) => i.titleSort)).toEqual(["moved"]);
  });
});
