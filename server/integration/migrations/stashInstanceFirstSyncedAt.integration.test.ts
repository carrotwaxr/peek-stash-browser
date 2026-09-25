/**
 * `20260925000900_stash_instance_first_synced_at` adds
 * `StashInstance.firstSyncedAt`: an instance shows to users once its first
 * sync's exclusions are computed. Every instance that has synced something
 * keeps showing after the upgrade: one with a `SyncState` row that records
 * a sync, or with a cached entity. One that never synced anything stays
 * NULL and shows after its first sync. Values are epoch milliseconds, as
 * Prisma stores a DateTime.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
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
const BEFORE = "20260925000850_stash_instance_last_full_pass";
const MIGRATION = "20260925000900_stash_instance_first_synced_at";

type Client = MigrationSandbox["client"];

/** Raw SQL: the client follows the current schema, which has the column. */
async function addInstance(client: Client, id: string): Promise<void> {
  await client.$executeRawUnsafe(
    `INSERT INTO "StashInstance" ("id", "name", "url", "apiKey", "updatedAt")
     VALUES (?, ?, ?, 'k', ?)`,
    id,
    id,
    `http://${id}:9999/graphql`,
    Date.UTC(2026, 0, 1)
  );
}

async function addState(
  client: Client,
  instance: string,
  entityType: string,
  columns: Partial<
    Record<
      | "lastFullSyncTimestamp"
      | "lastIncrementalSyncTimestamp"
      | "lastFullSyncActual"
      | "lastIncrementalSyncActual",
      string | number
    >
  > = {}
): Promise<void> {
  await client.$executeRawUnsafe(
    `INSERT INTO "SyncState" ("stashInstanceId", "entityType",
       "lastFullSyncTimestamp", "lastIncrementalSyncTimestamp",
       "lastFullSyncActual", "lastIncrementalSyncActual")
     VALUES (?, ?, ?, ?, ?, ?)`,
    instance,
    entityType,
    columns.lastFullSyncTimestamp ?? null,
    columns.lastIncrementalSyncTimestamp ?? null,
    columns.lastFullSyncActual ?? null,
    columns.lastIncrementalSyncActual ?? null
  );
}

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

describe("stash instance first synced at migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("marks every instance that has synced something as synced, and leaves the others on their first sync", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    const ids = [
      "scenes",
      "images-only",
      "empty-library",
      "legacy-cache",
      "never-synced",
      "no-rows",
    ];
    for (const id of ids) await addInstance(client, id);
    // A synced library: scene watermarks, as the prod snapshot's "default"
    await addState(client, "scenes", "scene", {
      lastFullSyncTimestamp: "2026-08-23T08:05:09-07:00",
      lastIncrementalSyncTimestamp: "2026-09-22T22:50:13-07:00",
      lastFullSyncActual: Date.UTC(2026, 8, 23, 15),
    });
    // A Stash of images only: no scene ever synced
    await addState(client, "images-only", "scene", {
      lastFullSyncActual: Date.UTC(2026, 8, 23, 15),
    });
    await addState(client, "images-only", "image", {
      lastFullSyncTimestamp: "2026-09-01T10:00:00-07:00",
      lastFullSyncActual: Date.UTC(2026, 8, 23, 15),
    });
    // A sync ran and found nothing: no watermark, only when it ran
    await addState(client, "empty-library", "tag", {
      lastIncrementalSyncActual: Date.UTC(2026, 8, 24, 9),
    });
    // Cached rows whose SyncState had no instance (deleted by 000800)
    await client.$executeRawUnsafe(
      `INSERT INTO "StashTag" ("id", "stashInstanceId", "name") VALUES ('1', 'legacy-cache', 'Tag')`
    );
    // Rows, but nothing ever synced: a first sync that never finished
    await addState(client, "never-synced", "scene");
    await addState(client, "never-synced", "tag");

    const startedAt = Date.now();
    await migrate(db);

    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; kind: string; at: bigint | null }>
    >(
      // "+ 0": a raw read of a DATETIME column comes back as a Date
      `SELECT "id", typeof("firstSyncedAt") AS kind, "firstSyncedAt" + 0 AS at
       FROM "StashInstance" ORDER BY "id"`
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    for (const id of [
      "scenes",
      "images-only",
      "empty-library",
      "legacy-cache",
    ]) {
      const row = byId[id];
      expect(row?.kind, id).toBe("integer");
      // Whole seconds, taken while the migration ran
      expect(Number(row?.at), id).toBeGreaterThanOrEqual(
        Math.floor(startedAt / 1000) * 1000
      );
      expect(Number(row?.at), id).toBeLessThanOrEqual(Date.now());
    }
    for (const id of ["never-synced", "no-rows"]) {
      expect(byId[id], id).toEqual({ id, kind: "null", at: null });
    }

    // Prisma reads the column back as a date
    const synced = await client.stashInstance.findUnique({
      where: { id: "scenes" },
      select: { firstSyncedAt: true },
    });
    expect(synced?.firstSyncedAt).toBeInstanceOf(Date);

    expect(
      await client.$queryRawUnsafe<Array<{ integrity_check: string }>>(
        "PRAGMA integrity_check"
      )
    ).toEqual([{ integrity_check: "ok" }]);
    expect(
      await client.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
  });
});
