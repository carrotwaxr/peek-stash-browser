/**
 * A migration that failed at an earlier start: an atomic one (wrapped in
 * `BEGIN` ... `COMMIT`) left nothing behind, so the server marks it rolled
 * back and deploys again once; any other stops startup with the ways out.
 *
 * Each test adds a synthetic migration after the newest real one to a
 * sandbox's own migration folder, and runs `migrateDatabase` twice: the first
 * run is the start that failed, the second the next start.
 */
import type * as childProcessModule from "child_process";
import { execFile } from "child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MigrationFailedError,
  listMigrationFolders,
  migrateDatabase,
  readMigrationPlan,
  runPrismaCli,
} from "../../initializers/migrations.js";
import { must } from "../../tests/helpers/must.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

// Child processes run for real; the spy records the Prisma CLI starts
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcessModule>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

const FOLDERS = listMigrationFolders(PRISMA_DIR);
const NEWEST = must(FOLDERS[FOLDERS.length - 1], "the newest migration folder");
// Sorts after every real migration
const PROBE = "29990101000000_recovery_probe";

const ROOT = existsSync("/dev/shm") ? "/dev/shm" : os.tmpdir();

/** Creates a table, then inserts into one that may not exist yet. */
const PROBE_STATEMENTS = `CREATE TABLE "RecoveryProbe" ("id" INTEGER NOT NULL PRIMARY KEY);
INSERT INTO "RecoveryProbeSource" ("id") VALUES (1);`;

const ATOMIC_PROBE = `-- A synthetic migration in the atomic form
PRAGMA foreign_keys=OFF;
BEGIN;
${PROBE_STATEMENTS}
COMMIT;
PRAGMA foreign_keys=ON;
`;

/** The Prisma CLI arguments of each start, without the script and schema. */
function cliCalls(): string[][] {
  return vi
    .mocked(execFile)
    .mock.calls.map((call) => (call[1] ?? []).slice(1, -2));
}

describe("migration recovery", () => {
  let sandbox: MigrationSandbox | undefined;
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(ROOT, "peek-recovery-backups-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await sandbox?.remove();
    sandbox = undefined;
    rmSync(configDir, { recursive: true, force: true });
  });

  /**
   * The clock of the next start, a minute on: backups are named to the
   * second, and a real restart comes later than the next line of a test.
   */
  function nextStart(): void {
    vi.useFakeTimers({
      toFake: ["Date"],
      now: Date.now() + 60_000,
      shouldAdvanceTime: true,
    });
  }

  /** An up-to-date database whose migration folder also holds `sql`. */
  async function databaseWithProbe(sql: string): Promise<MigrationSandbox> {
    const db = await createDatabaseAt(NEWEST);
    sandbox = db;
    const folder = path.join(db.prismaDir, "migrations", PROBE);
    mkdirSync(folder);
    writeFileSync(path.join(folder, "migration.sql"), sql);
    return db;
  }

  function migrate(db: MigrationSandbox) {
    return migrateDatabase({
      client: db.client,
      databaseUrl: db.url,
      prismaDir: db.prismaDir,
      configDir,
    });
  }

  async function tablesOf(db: MigrationSandbox): Promise<string[]> {
    const rows = await db.client.$queryRaw<
      { name: string }[]
    >`SELECT name FROM sqlite_master WHERE type = 'table'`;
    return rows.map((row) => row.name);
  }

  it("an interrupted atomic migration is rolled back and retried once", async () => {
    const db = await databaseWithProbe(ATOMIC_PROBE);

    // The start that failed: the insert found no table, and the table the
    // migration created before it went with the rollback
    await expect(migrate(db)).rejects.toThrow("no such table");
    expect(await tablesOf(db)).not.toContain("RecoveryProbe");
    const failed = await readMigrationPlan(db.client, db.prismaDir);
    expect(failed.unfinished.map((row) => row.name)).toEqual([PROBE]);
    const backups = readdirSync(configDir);
    expect(backups).toHaveLength(1);

    // The cause is fixed; the next start retries
    await db.client.$executeRawUnsafe(
      `CREATE TABLE "RecoveryProbeSource" ("id" INTEGER)`
    );
    vi.mocked(execFile).mockClear();
    nextStart();

    const result = await migrate(db);

    expect(result.applied).toEqual([PROBE]);
    expect(cliCalls()).toEqual([
      ["migrate", "resolve", "--rolled-back", PROBE],
      ["migrate", "deploy"],
    ]);
    expect(await tablesOf(db)).toContain("RecoveryProbe");
    const after = await readMigrationPlan(db.client, db.prismaDir);
    expect(after.pending).toEqual([]);
    expect(after.unfinished).toEqual([]);
    // The backup the failed start took is still the one before the migration
    expect(readdirSync(configDir)).toEqual(backups);
  });

  it("a failed non-atomic migration stops startup naming the migration and the newest pre-migration backup", async () => {
    const db = await databaseWithProbe(PROBE_STATEMENTS);
    await expect(migrate(db)).rejects.toThrow("no such table");
    // Without a transaction, the statement before the failure stayed
    expect(await tablesOf(db)).toContain("RecoveryProbe");
    const backups = readdirSync(configDir);
    const backup = path.join(configDir, must(backups[0], "the backup"));
    vi.mocked(execFile).mockClear();
    nextStart();

    const next = migrate(db);

    await expect(next).rejects.toThrow(backup);
    await expect(next).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(next).rejects.toMatchObject({
      migration: PROBE,
      backup,
    });
    await expect(next).rejects.toThrow("no such table: RecoveryProbeSource");
    await expect(next).rejects.toThrow(`--rolled-back ${PROBE}`);
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(readdirSync(configDir)).toEqual(backups);
  });

  it("a retry that fails on an object the migration creates says to mark it applied", async () => {
    const db = await databaseWithProbe(ATOMIC_PROBE);
    await db.client.$executeRawUnsafe(
      `CREATE TABLE "RecoveryProbeSource" ("id" INTEGER)`
    );
    await migrate(db);
    // A stop between the migration's COMMIT and Prisma recording it
    await db.client.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET "finished_at" = NULL WHERE "migration_name" = '${PROBE}'`
    );
    vi.mocked(execFile).mockClear();
    nextStart();

    const next = migrate(db);

    await expect(next).rejects.toThrow('table "RecoveryProbe" already exists');
    await expect(next).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(next).rejects.toThrow(`--applied ${PROBE}`);
    expect(cliCalls()).toEqual([
      ["migrate", "resolve", "--rolled-back", PROBE],
      ["migrate", "deploy"],
    ]);

    // The command the message gives clears it
    await runPrismaCli(["migrate", "resolve", "--applied", PROBE], {
      prismaDir: db.prismaDir,
      databaseUrl: db.url,
    });
    const result = await migrate(db);
    expect(result.applied).toEqual([]);
    const after = await readMigrationPlan(db.client, db.prismaDir);
    expect(after.unfinished).toEqual([]);
    expect(after.pending).toEqual([]);
  });
});
