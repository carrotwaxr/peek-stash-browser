/**
 * Integration tests for the scene sort columns sync stores (item 67 (c),
 * DB-07): `titleSort`, the title a scene's card shows (its own title, else
 * its file name without the extension, `getSceneFallbackTitle`) with ASCII
 * folded to lower case, as the list's title sort compares it; and
 * `performerCount` / `tagCount`, the scene's `ScenePerformer` and `SceneTag`
 * rows. The list sorts and filters on them through indexes instead of
 * computing them per scene on every request. Images store the same
 * `titleSort` (routed C7): their title, else `getImageFallbackTitle`. Every
 * type stores Stash's created_at and updated_at as epoch milliseconds.
 * Studio and collection aliases, every performer link, and a gallery's
 * organized flag and zip path are stored as Stash returns them. A date
 * Stash answers for none ("0001-01-01", a collection with no date) is
 * stored as NULL.
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
  GALLERY_DEFAULTS,
  GROUP_DEFAULTS,
  IMAGE_DEFAULTS,
  PERFORMER_DEFAULTS,
  SCENE_DEFAULTS,
  STUDIO_DEFAULTS,
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

/** The seven types whose batches write Stash's created_at and updated_at */
const TIMESTAMP_TABLES = [
  "StashScene",
  "StashPerformer",
  "StashStudio",
  "StashTag",
  "StashGroup",
  "StashGallery",
  "StashImage",
] as const;

describeWithDb("Stash timestamps (integration)", () => {
  it("every synced type stores its Stash timestamps as integers", async () => {
    const instanceIds = (
      await prisma.stashInstance.findMany({ select: { id: true } })
    ).map((i) => i.id);

    // Each table's storage classes of the two columns, NULL aside
    const storage: Record<string, string[]> = {};
    for (const table of TIMESTAMP_TABLES) {
      const rows = await prisma.$queryRawUnsafe<Array<{ kind: string }>>(
        `SELECT typeof("stashCreatedAt") AS kind FROM "${table}"
         WHERE "stashInstanceId" IN (SELECT value FROM json_each(?))
         UNION
         SELECT typeof("stashUpdatedAt") FROM "${table}"
         WHERE "stashInstanceId" IN (SELECT value FROM json_each(?))`,
        JSON.stringify(instanceIds),
        JSON.stringify(instanceIds)
      );
      storage[table] = rows
        .map((r) => r.kind)
        .filter((kind) => kind !== "null")
        .sort();
    }

    // Epoch milliseconds, as Prisma stores a DateTime: never Stash's text
    expect(storage).toEqual(
      Object.fromEntries(TIMESTAMP_TABLES.map((table) => [table, ["integer"]]))
    );
  });
});

describeWithDb("Aliases, links and gallery fields (integration)", () => {
  const run = () => ({
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  });

  afterAll(async () => {
    await prisma.stashGallery.deleteMany({
      where: { stashInstanceId: DERIVED },
    });
    await prisma.stashStudio.deleteMany({
      where: { stashInstanceId: DERIVED },
    });
  });

  it("every performer's links come in as a JSON list, the replay's with two links among them", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ urls: string | null }>>(
      `SELECT urls FROM StashPerformer
       WHERE stashInstanceId IN (SELECT id FROM StashInstance)`
    );
    const lists = rows.map((r) => ({
      urls: r.urls === null ? null : (JSON.parse(r.urls) as string[]),
    }));
    expect(lists.length).toBeGreaterThan(0);
    // A list is never stored empty
    expect(lists.filter(({ urls }) => urls?.length === 0)).toEqual([]);
    expect(lists.some(({ urls }) => (urls?.length ?? 0) >= 2)).toBe(true);
  });

  it("a replay gallery stores its organized flag, and a collection its aliases", async () => {
    // Through the client, which reads a boolean as one (a raw read does not
    // always). Other files seed galleries under made-up instances, so the
    // replay's are the organized ones; none of them is a zip
    const instances = await prisma.stashInstance.findMany({
      select: { id: true },
    });
    const galleries = await prisma.stashGallery.findMany({
      where: { stashInstanceId: { in: instances.map((i) => i.id) } },
      select: { organized: true, filePath: true },
    });
    expect(galleries.some((g) => g.organized)).toBe(true);
    expect(galleries.filter((g) => g.filePath !== null)).toEqual([]);

    const groups = await prisma.$queryRawUnsafe<Array<{ aliases: string }>>(
      `SELECT aliases FROM StashGroup
       WHERE aliases = 'Group 100002 aliases'
         AND stashInstanceId IN (SELECT id FROM StashInstance)`
    );
    expect(groups.length).toBeGreaterThan(0);
  });

  // The replay library has no studio with aliases and no zip gallery, so these
  // two go through the batch writers with the sync's test fakes
  it("a studio's aliases and a zip gallery's path are stored through the batch writers", async () => {
    await ENTITY_SYNC.studio.processBatch(
      [
        partialRow<SyncEntityOf<"studio">>({
          ...STUDIO_DEFAULTS,
          id: "1",
          name: "Derived IT studio",
          stash_ids: [],
          aliases: ["A", "B"],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        }),
      ],
      DERIVED,
      run()
    );
    await ENTITY_SYNC.gallery.processBatch(
      [
        partialRow<SyncEntityOf<"gallery">>({
          ...GALLERY_DEFAULTS,
          id: "1",
          title: "Derived IT zip",
          organized: true,
          files: [partialRow({ path: "/z/a.cbz", basename: "a.cbz" })],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        }),
        partialRow<SyncEntityOf<"gallery">>({
          ...GALLERY_DEFAULTS,
          id: "2",
          title: "Derived IT folder",
          organized: false,
          folder: partialRow({ path: "/f/dir" }),
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        }),
      ],
      DERIVED,
      run()
    );

    const studio = await prisma.stashStudio.findUnique({
      where: { id_stashInstanceId: { id: "1", stashInstanceId: DERIVED } },
    });
    expect(studio?.aliases).toBe('["A","B"]');

    const zip = await prisma.stashGallery.findUnique({
      where: { id_stashInstanceId: { id: "1", stashInstanceId: DERIVED } },
    });
    expect(zip).toMatchObject({ organized: true, filePath: "/z/a.cbz" });
    const folder = await prisma.stashGallery.findUnique({
      where: { id_stashInstanceId: { id: "2", stashInstanceId: DERIVED } },
    });
    expect(folder).toMatchObject({ organized: false, filePath: null });
  });
});

describeWithDb("Dates Stash answers for none (integration)", () => {
  const run = () => ({
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  });
  const times = {
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
  const where = { stashInstanceId: DERIVED, id: { in: ["901", "902"] } };

  afterAll(async () => {
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashGallery.deleteMany({ where });
    await prisma.stashGroup.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
  });

  it("a year-1 date is stored as no date, a real one as Stash returns it", async () => {
    await ENTITY_SYNC.performer.processBatch(
      ["901", "902"].map((id) =>
        partialRow<SyncEntityOf<"performer">>({
          ...PERFORMER_DEFAULTS,
          id,
          name: `Dates IT performer ${id}`,
          stash_ids: [],
          birthdate: id === "901" ? "0001-01-01" : "1990-02-03",
          death_date: id === "901" ? "0001-01-01" : null,
          ...times,
        })
      ),
      DERIVED,
      run()
    );
    await ENTITY_SYNC.group.processBatch(
      ["901", "902"].map((id) =>
        partialRow<SyncEntityOf<"group">>({
          ...GROUP_DEFAULTS,
          id,
          name: `Dates IT collection ${id}`,
          date: id === "901" ? "0001-01-01" : "2020-05-01",
          ...times,
        })
      ),
      DERIVED,
      run()
    );
    await ENTITY_SYNC.gallery.processBatch(
      ["901", "902"].map((id) =>
        partialRow<SyncEntityOf<"gallery">>({
          ...GALLERY_DEFAULTS,
          id,
          title: `Dates IT gallery ${id}`,
          date: id === "901" ? "0001-01-01" : "2020-05-01",
          ...times,
        })
      ),
      DERIVED,
      run()
    );
    await syncScenes([
      { ...sceneRow("901", { title: "Dates IT 901" }), date: "0001-01-01" },
      { ...sceneRow("902", { title: "Dates IT 902" }), date: "2020-05-01" },
    ]);

    const dates = async (table: string, column = "date") =>
      prisma.$queryRawUnsafe<Array<{ id: string; value: string | null }>>(
        `SELECT id, "${column}" AS value FROM "${table}"
         WHERE stashInstanceId = ? AND id IN ('901', '902') ORDER BY id`,
        DERIVED
      );
    expect(await dates("StashGroup")).toEqual([
      { id: "901", value: null },
      { id: "902", value: "2020-05-01" },
    ]);
    expect(await dates("StashGallery")).toEqual([
      { id: "901", value: null },
      { id: "902", value: "2020-05-01" },
    ]);
    expect(await dates("StashScene")).toEqual([
      { id: "901", value: null },
      { id: "902", value: "2020-05-01" },
    ]);
    expect(await dates("StashPerformer", "birthdate")).toEqual([
      { id: "901", value: null },
      { id: "902", value: "1990-02-03" },
    ]);
    expect(await dates("StashPerformer", "deathDate")).toEqual([
      { id: "901", value: null },
      { id: "902", value: null },
    ]);
  });
});
