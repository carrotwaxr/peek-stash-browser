/**
 * `20260925000100_drop_scene_fts` drops the unused `scene_fts` FTS5 table and
 * the three triggers that copied every scene write into it (sweep item 68).
 *
 * The drop runs on a sandbox database built at the migration before it. The
 * sync case runs on the suite's own database, which global setup migrated
 * through every migration, under a made-up instance that real sync never
 * touches, through the sync's own scene batch method.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import prisma from "../../prisma/singleton.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
} from "../../services/StashSyncService.js";
import { arrayContaining } from "../../tests/helpers/matchers.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

/** The newest migration before the drop */
const BEFORE_DROP = "20260923000300_restore_recovery_key_column";

interface SchemaObject {
  type: string;
  name: string;
}

async function sceneFtsObjects(
  client: MigrationSandbox["client"]
): Promise<SchemaObject[]> {
  // GLOB, not LIKE: `_` is a wildcard in LIKE
  return client.$queryRaw<SchemaObject[]>`
    SELECT type, name FROM sqlite_master
    WHERE name GLOB 'scene_fts*'
    ORDER BY type, name
  `;
}

describe("drop scene_fts migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("no scene_fts table or trigger after migrating", async () => {
    const db = await createDatabaseAt(BEFORE_DROP);
    sandbox = db;
    const before = await sceneFtsObjects(db.client);
    expect(before).toEqual(
      arrayContaining<SchemaObject>([
        { type: "table", name: "scene_fts" },
        { type: "trigger", name: "scene_fts_insert" },
        { type: "trigger", name: "scene_fts_delete" },
        { type: "trigger", name: "scene_fts_update" },
      ])
    );

    await db.client.$disconnect();
    await runPrismaCli(["migrate", "deploy"], {
      prismaDir: PRISMA_DIR,
      databaseUrl: db.url,
    });

    expect(await sceneFtsObjects(db.client)).toEqual([]);
  });
});

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "drop-scene-fts-it-instance";

/** A scene as Stash's compact scene query returns it */
type SyncScene = SyncEntityOf<"scene">;

function stashScene(id: string, title: string): SyncScene {
  return {
    id,
    title,
    code: `CODE-${id}`,
    date: "2026-01-01",
    details: `Details of ${title}`,
    director: null,
    organized: false,
    rating100: null,
    o_counter: 0,
    play_count: 0,
    play_duration: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    urls: [],
    studio: null,
    performers: [],
    tags: [],
    groups: [],
    galleries: [],
    files: [],
    paths: {
      screenshot: null,
      preview: null,
      sprite: null,
      vtt: null,
      webp: null,
      caption: null,
    },
    captions: [],
    sceneStreams: [],
  };
}

async function clearTestScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
}

describeWithDb("scene sync without scene_fts (integration)", () => {
  beforeEach(clearTestScenes);
  afterAll(clearTestScenes);

  it("scene rows written before and after keep their data", async () => {
    // A row an earlier sync stored
    await prisma.stashScene.create({
      data: {
        id: "1",
        stashInstanceId: TEST_INSTANCE,
        title: "Stored before",
        details: "Old details",
        code: "OLD-1",
      },
    });

    // The next sync upserts it and stores a scene it has not seen
    await ENTITY_SYNC.scene.processBatch(
      [stashScene("1", "Synced after"), stashScene("2", "New scene")],
      TEST_INSTANCE,
      { signal: new AbortController().signal }
    );

    const rows = await prisma.stashScene.findMany({
      where: { stashInstanceId: TEST_INSTANCE },
      select: {
        id: true,
        title: true,
        details: true,
        code: true,
        deletedAt: true,
      },
      orderBy: { id: "asc" },
    });
    expect(rows).toEqual([
      {
        id: "1",
        title: "Synced after",
        details: "Details of Synced after",
        code: "CODE-1",
        deletedAt: null,
      },
      {
        id: "2",
        title: "New scene",
        details: "Details of New scene",
        code: "CODE-2",
        deletedAt: null,
      },
    ]);
  });
});
