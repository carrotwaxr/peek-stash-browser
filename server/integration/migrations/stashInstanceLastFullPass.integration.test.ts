/**
 * `20260925000850_stash_instance_last_full_pass` adds
 * `StashInstance.lastFullPassAt`, when the instance's last full pass ran to
 * the end, which the daily full pass reads. It starts at the newest
 * `lastFullSyncActual` among the instance's `SyncState` rows, so an
 * upgraded install does not run a full pass of every instance at once. The
 * values are stored as Prisma stores a DateTime, epoch milliseconds; a
 * time held as text is converted.
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
const BEFORE = "20260925000800_sync_state_instance_required";
const MIGRATION = "20260925000850_stash_instance_last_full_pass";

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
  lastFullSyncActual: number | string | null
): Promise<void> {
  await client.$executeRawUnsafe(
    `INSERT INTO "SyncState" ("stashInstanceId", "entityType", "lastFullSyncActual")
     VALUES (?, ?, ?)`,
    instance,
    entityType,
    lastFullSyncActual
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

describe("stash instance last full pass migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("sets each instance's last full pass to the newest full sync time of its types", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    const oldest = Date.UTC(2026, 8, 20, 10);
    const newest = Date.UTC(2026, 8, 23, 20, 37, 1, 644);
    const middle = Date.UTC(2026, 8, 22, 8);
    for (const id of ["ints", "texts", "none", "no-rows"]) {
      await addInstance(client, id);
    }
    // Epoch milliseconds, as Prisma writes them, and a type never synced
    await addState(client, "ints", "tag", oldest);
    await addState(client, "ints", "scene", newest);
    await addState(client, "ints", "image", middle);
    await addState(client, "ints", "clip", null);
    // Text, as a hand edit or an old default would leave it: the newest is
    // the text one, and it keeps its milliseconds
    await addState(client, "texts", "tag", oldest);
    await addState(client, "texts", "scene", "2026-09-21 11:30:00");
    await addState(client, "texts", "image", "2026-09-24T09:15:30.250Z");
    // No type ever finished a full sync
    await addState(client, "none", "tag", null);

    await migrate(db);

    const rows = await client.$queryRawUnsafe<
      Array<{ id: string; kind: string; at: bigint | null }>
    >(
      // "+ 0": a raw read of a DATETIME column comes back as a Date
      `SELECT "id", typeof("lastFullPassAt") AS kind, "lastFullPassAt" + 0 AS at
       FROM "StashInstance" ORDER BY "id"`
    );
    expect(rows).toEqual([
      { id: "ints", kind: "integer", at: BigInt(newest) },
      { id: "no-rows", kind: "null", at: null },
      { id: "none", kind: "null", at: null },
      {
        id: "texts",
        kind: "integer",
        at: BigInt(Date.UTC(2026, 8, 24, 9, 15, 30, 250)),
      },
    ]);

    // Prisma reads the column back as the same instants
    const passes = await client.stashInstance.findMany({
      select: { id: true, lastFullPassAt: true },
      orderBy: { id: "asc" },
    });
    expect(
      passes.map((p) => [p.id, p.lastFullPassAt?.toISOString() ?? null])
    ).toEqual([
      ["ints", new Date(newest).toISOString()],
      ["no-rows", null],
      ["none", null],
      ["texts", "2026-09-24T09:15:30.250Z"],
    ]);

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
