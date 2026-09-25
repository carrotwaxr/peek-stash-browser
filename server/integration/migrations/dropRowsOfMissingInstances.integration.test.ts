/**
 * `20260925000300_drop_rows_of_missing_instances` deletes cached Stash rows
 * whose instance no longer exists: entity rows, junction rows with either
 * side on such an instance, and `SyncState` rows for such an instance or for
 * none (the NULL rows January's multi-instance migration left). Nothing else
 * could reach them. A database whose setup never created an instance keeps
 * everything, and per-user tables are left alone.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
import { PrismaClient } from "@prisma/client";
import { cpSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

/** The newest migration before this one */
const BEFORE = "20260925000200_drop_scene_streams_and_recovery_key";
const MIGRATION = "20260925000300_drop_rows_of_missing_instances";

type Client = MigrationSandbox["client"];
type Row = Record<string, unknown>;

/** The 8 entity tables, with the columns a row needs besides its keys. */
const ENTITY_TABLES: Record<string, Row> = {
  StashScene: {},
  StashPerformer: { name: "p" },
  StashStudio: { name: "s" },
  StashTag: { name: "t" },
  StashGroup: { name: "g" },
  StashGallery: {},
  StashImage: {},
  StashClip: { sceneId: "1", seconds: 0 },
};

/** The 13 junctions: [table, side a, table of a, side b, table of b]. */
const JUNCTIONS: Array<[string, string, string, string, string]> = [
  ["SceneTag", "scene", "StashScene", "tag", "StashTag"],
  ["ScenePerformer", "scene", "StashScene", "performer", "StashPerformer"],
  ["SceneGroup", "scene", "StashScene", "group", "StashGroup"],
  ["SceneGallery", "scene", "StashScene", "gallery", "StashGallery"],
  ["ImageTag", "image", "StashImage", "tag", "StashTag"],
  ["ImagePerformer", "image", "StashImage", "performer", "StashPerformer"],
  ["ImageGallery", "image", "StashImage", "gallery", "StashGallery"],
  ["GalleryTag", "gallery", "StashGallery", "tag", "StashTag"],
  [
    "GalleryPerformer",
    "gallery",
    "StashGallery",
    "performer",
    "StashPerformer",
  ],
  ["PerformerTag", "performer", "StashPerformer", "tag", "StashTag"],
  ["StudioTag", "studio", "StashStudio", "tag", "StashTag"],
  ["GroupTag", "group", "StashGroup", "tag", "StashTag"],
  ["ClipTag", "clip", "StashClip", "tag", "StashTag"],
];

/** Every table the test reads back, before and after migrating. */
const TABLES = [
  ...Object.keys(ENTITY_TABLES),
  ...JUNCTIONS.map(([table]) => table),
  "SyncState",
  "SceneRating",
  "StashInstance",
];

async function insert(client: Client, table: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  await client.$executeRawUnsafe(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    ...Object.values(row)
  );
}

async function addInstance(client: Client, id: string): Promise<void> {
  await client.stashInstance.create({
    data: { id, name: id, url: `http://${id}:9999/graphql`, apiKey: "k" },
  });
}

/** One row of every entity table, id `id`, on `instance`. */
async function seedEntities(
  client: Client,
  id: string,
  instance: string
): Promise<void> {
  for (const [table, columns] of Object.entries(ENTITY_TABLES)) {
    await insert(client, table, { id, stashInstanceId: instance, ...columns });
  }
}

/** One row of every junction, from entity `id` to entity `id`. */
async function seedJunctions(
  client: Client,
  id: string,
  instanceA: string,
  instanceB: string
): Promise<void> {
  for (const [table, a, , b] of JUNCTIONS) {
    await insert(client, table, {
      [`${a}Id`]: id,
      [`${a}InstanceId`]: instanceA,
      [`${b}Id`]: id,
      [`${b}InstanceId`]: instanceB,
    });
  }
}

// Raw SQL: the column is NOT NULL from 20260925000800 on, and the client
// follows the current schema
async function seedSyncState(
  client: Client,
  instance: string | null
): Promise<void> {
  await insert(client, "SyncState", {
    stashInstanceId: instance,
    entityType: "scene",
    lastFullSyncTimestamp: "2026-01-26T00:00:00Z",
  });
}

/** Every row of every table the test reads, in a stable order. */
async function snapshot(client: Client): Promise<Record<string, Row[]>> {
  const tables: Record<string, Row[]> = {};
  for (const table of TABLES) {
    tables[table] = await client.$queryRawUnsafe<Row[]>(
      `SELECT * FROM "${table}" ORDER BY 1, 2, 3`
    );
  }
  return tables;
}

/**
 * The instances a cached row lives on: an entity row's own, both sides of a
 * junction row. A column naming another row's instance (a gallery's studio,
 * a clip's scene) is a reference, and other tables have none.
 */
function ownInstances(table: string, row: Row): unknown[] {
  if (table in ENTITY_TABLES) return [row.stashInstanceId];
  const junction = JUNCTIONS.find(([name]) => name === table);
  if (!junction) return [];
  const [, a, , b] = junction;
  return [row[`${a}InstanceId`], row[`${b}InstanceId`]];
}

/**
 * Applies this migration alone: later ones also rewrite rows the snapshots
 * compare (20260925000400 nulls a studio-less gallery's studioInstanceId).
 */
async function migrate(db: MigrationSandbox): Promise<void> {
  await db.client.$disconnect();
  cpSync(
    path.join(PRISMA_DIR, "migrations", MIGRATION),
    path.join(db.prismaDir, "migrations", MIGRATION),
    { recursive: true }
  );
  await runPrismaCli(["migrate", "deploy"], {
    prismaDir: db.prismaDir,
    databaseUrl: db.url,
  });
}

describe("drop rows of missing instances migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("deletes only the rows of instances that no longer exist, and SyncState rows with no instance", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    await addInstance(client, "default");
    await addInstance(client, "inst-b");

    // Kept: the same entity ids on both instances, each linked to itself
    for (const instance of ["default", "inst-b"]) {
      await seedEntities(client, "1", instance);
      await seedJunctions(client, "1", instance, instance);
      await seedSyncState(client, instance);
    }
    // A link across the two existing instances is kept too
    await insert(client, "SceneTag", {
      sceneId: "1",
      sceneInstanceId: "default",
      tagId: "1",
      tagInstanceId: "inst-b",
    });

    // Gone: an instance deleted without its rows. Every entity table has a
    // row on it; every junction has a row with side a on it and one with
    // side b on it (the other side on `default`)
    await seedEntities(client, "1", "gone");
    await seedJunctions(client, "1", "gone", "default");
    await seedJunctions(client, "1", "default", "gone");
    await seedSyncState(client, "gone");
    // January's SyncState rows with no instance
    await seedSyncState(client, null);

    // A junction row whose two parents are gone as well (the dev database's
    // 54 orphans), written with foreign keys off on one connection
    const noFk = new PrismaClient({
      datasourceUrl: `${db.url}?connection_limit=1`,
    });
    try {
      await noFk.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
      await insert(noFk, "SceneTag", {
        sceneId: "2",
        sceneInstanceId: "gone",
        tagId: "2",
        tagInstanceId: "gone",
      });
    } finally {
      await noFk.$disconnect();
    }

    // A per-user row naming the gone instance is not this migration's to
    // delete (instance deletion, B2, owns per-user rows)
    const user = await client.user.create({
      data: { username: "u", password: "x" },
    });
    await insert(client, "SceneRating", {
      userId: user.id,
      sceneId: "1",
      instanceId: "gone",
      rating: 80,
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    });

    const before = await snapshot(client);
    await migrate(db);
    const after = await snapshot(client);

    const expected: Record<string, Row[]> = {};
    for (const [table, rows] of Object.entries(before)) {
      expected[table] = rows.filter((row) => {
        if (table === "SyncState") {
          return row.stashInstanceId !== null && row.stashInstanceId !== "gone";
        }
        return !ownInstances(table, row).includes("gone");
      });
    }
    expect(after).toEqual(expected);

    // What went: 8 entity rows, 26 + 1 junction rows, 2 SyncState rows
    const count = (tables: Record<string, Row[]>, names: string[]) =>
      names.reduce((sum, name) => sum + (tables[name]?.length ?? 0), 0);
    const entityTables = Object.keys(ENTITY_TABLES);
    const junctionTables = JUNCTIONS.map(([table]) => table);
    expect(count(before, entityTables) - count(after, entityTables)).toBe(8);
    expect(count(before, junctionTables) - count(after, junctionTables)).toBe(
      27
    );
    expect(count(before, ["SyncState"]) - count(after, ["SyncState"])).toBe(2);
    expect(after.SceneRating).toHaveLength(1);

    // No row is left pointing at a missing parent
    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA integrity_check")
    ).toEqual([{ integrity_check: "ok" }]);
  });

  it("deletes nothing from a database whose setup never created an instance", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    await seedEntities(client, "1", "inst-x");
    await seedJunctions(client, "1", "inst-x", "inst-x");
    await seedSyncState(client, "inst-x");
    await seedSyncState(client, null);

    const before = await snapshot(client);
    await migrate(db);
    const after = await snapshot(client);

    expect(after).toEqual(before);
    expect(after.SyncState).toHaveLength(2);
    expect(after.StashScene).toHaveLength(1);
  });
});
