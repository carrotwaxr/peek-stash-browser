/**
 * Databases from before Peek kept migration history (`prisma db push`, up to
 * v2.0.0): a complete v2.0.0 database is marked at the baseline and migrated;
 * an older one, or a migrated one missing a v2.0.0 table, stops before any
 * change with an error naming the release to start first.
 *
 * Each database is built by running `0_baseline`'s statements (the v2.0.0
 * schema) through Prisma, less the tables a test leaves out.
 */
import type * as childProcessModule from "child_process";
import { execFile } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LegacyDatabaseError,
  listMigrationFolders,
  migrateDatabase,
  readMigrationPlan,
  runPrismaCli,
} from "../../initializers/migrations.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createEmptyDatabase,
} from "../helpers/migrationSandbox.js";

// Child processes run for real; the spy counts the Prisma CLI starts
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcessModule>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

const FOLDERS = listMigrationFolders(PRISMA_DIR);

const BASELINE_STATEMENTS = readFileSync(
  path.join(PRISMA_DIR, "migrations", "0_baseline", "migration.sql"),
  "utf8"
)
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((statement) => statement.trim())
  .filter((statement) => statement !== "");

describe("databases from before migration history", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  /** The v2.0.0 schema, without the `missing` tables and their indexes. */
  async function baselineDatabase(
    missing: readonly string[] = []
  ): Promise<MigrationSandbox> {
    const db = createEmptyDatabase();
    sandbox = db;
    for (const statement of BASELINE_STATEMENTS) {
      if (missing.some((table) => statement.includes(`"${table}"`))) continue;
      await db.client.$executeRawUnsafe(statement);
    }
    await db.client.$executeRawUnsafe(
      `INSERT INTO "User" ("username", "password", "role", "updatedAt") VALUES ('legacy-admin', 'hash', 'ADMIN', CURRENT_TIMESTAMP)`
    );
    return db;
  }

  async function tablesOf(db: MigrationSandbox): Promise<string[]> {
    const rows = await db.client.$queryRaw<
      { name: string }[]
    >`SELECT name FROM sqlite_master WHERE type = 'table'`;
    return rows.map((row) => row.name);
  }

  function migrate(db: MigrationSandbox) {
    return migrateDatabase({
      client: db.client,
      databaseUrl: db.url,
      prismaDir: PRISMA_DIR,
    });
  }

  it("a v2.0.0 database without migration history is baselined and fully migrated", async () => {
    const db = await baselineDatabase();
    const before = await readMigrationPlan(db.client, PRISMA_DIR);
    expect(before.shape).toBe("dbPush");

    const result = await migrate(db);

    expect(result.applied).toEqual(FOLDERS.slice(1));
    const after = await readMigrationPlan(db.client, PRISMA_DIR);
    expect(after.applied).toEqual(FOLDERS);
    expect(after.pending).toEqual([]);
    expect(after.unfinished).toEqual([]);
    const users = await db.client.$queryRaw<
      { username: string }[]
    >`SELECT username FROM "User"`;
    expect(users).toEqual([{ username: "legacy-admin" }]);
  });

  it("a database from before v2.0.0 stops with an error naming v2.0.0", async () => {
    const db = await baselineDatabase(["UserHiddenEntity", "StashInstance"]);
    vi.mocked(execFile).mockClear();

    const attempt = migrate(db);

    await expect(attempt).rejects.toBeInstanceOf(LegacyDatabaseError);
    await expect(attempt).rejects.toThrow(
      "created by Peek before v2.0.0 (missing tables: UserHiddenEntity, StashInstance)"
    );
    await expect(attempt).rejects.toThrow(
      "Start carrotwaxr/peek-stash-browser:2.0.0 on the same data directory once"
    );
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(await tablesOf(db)).not.toContain("_prisma_migrations");
  });

  it("a migrated database missing a v2.0.0 table names v3.2.2", async () => {
    const db = await baselineDatabase(["UserHiddenEntity"]);
    // What v2.0.1's start script did to a db push database, whatever its age
    await runPrismaCli(["migrate", "resolve", "--applied", "0_baseline"], {
      prismaDir: PRISMA_DIR,
      databaseUrl: db.url,
    });
    vi.mocked(execFile).mockClear();

    const attempt = migrate(db);

    await expect(attempt).rejects.toBeInstanceOf(LegacyDatabaseError);
    await expect(attempt).rejects.toThrow("(missing tables: UserHiddenEntity)");
    await expect(attempt).rejects.toThrow(
      "Start carrotwaxr/peek-stash-browser:3.2.2 on the same data directory once"
    );
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    const after = await readMigrationPlan(db.client, PRISMA_DIR);
    expect(after.applied).toEqual(["0_baseline"]);
  });
});
