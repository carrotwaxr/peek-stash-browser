/**
 * Before it applies a pending migration, the server copies the database with
 * `VACUUM INTO` into its config directory, and keeps the newest three such
 * copies. Run against real SQLite files in a sandbox, with `CONFIG_DIR`
 * pointed at a directory of the test's own.
 */
import { PrismaClient } from "@prisma/client";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  listMigrationFolders,
  migrateDatabase,
} from "../../initializers/migrations.js";
import { must } from "../../tests/helpers/must.js";
import { getServerVersion } from "../../utils/serverVersion.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
  createEmptyDatabase,
} from "../helpers/migrationSandbox.js";

const FOLDERS = listMigrationFolders(PRISMA_DIR);
const NEWEST = must(FOLDERS[FOLDERS.length - 1], "the newest migration folder");
const SECOND_NEWEST = must(
  FOLDERS[FOLDERS.length - 2],
  "the second newest migration folder"
);

const VERSION = getServerVersion();
// The sandbox's database file is peek.db
const PRE_MIGRATION = new RegExp(
  `^peek\\.db\\.backup-\\d{8}-\\d{6}-pre-${VERSION.replace(/\./g, "\\.")}$`
);

const ROOT = existsSync("/dev/shm") ? "/dev/shm" : os.tmpdir();

describe("pre-migration backup", () => {
  let sandbox: MigrationSandbox | undefined;
  let configDir: string;
  const savedConfigDir = process.env.CONFIG_DIR;

  beforeEach(() => {
    // The quote checks that the path reaches SQLite as a bound value
    configDir = mkdtempSync(path.join(ROOT, "peek-backups-o'dir-"));
    process.env.CONFIG_DIR = configDir;
  });

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
    rmSync(configDir, { recursive: true, force: true });
    process.env.CONFIG_DIR = savedConfigDir;
  });

  async function oneMigrationBehind(): Promise<MigrationSandbox> {
    const db = await createDatabaseAt(SECOND_NEWEST);
    sandbox = db;
    await db.client.$executeRawUnsafe(
      `INSERT INTO "User" ("username", "password", "role", "updatedAt") VALUES ('backed-up-admin', 'hash', 'ADMIN', CURRENT_TIMESTAMP)`
    );
    return db;
  }

  function migrate(db: MigrationSandbox) {
    return migrateDatabase({
      client: db.client,
      databaseUrl: db.url,
      prismaDir: PRISMA_DIR,
    });
  }

  function appliedCount(client: PrismaClient): Promise<number> {
    return client.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `.then((rows) => Number(must(rows[0]).n));
  }

  it("a database one migration behind is copied once, as it was before the migration", async () => {
    const db = await oneMigrationBehind();

    const result = await migrate(db);

    expect(result.applied).toEqual([NEWEST]);
    const files = readdirSync(configDir);
    expect(files).toHaveLength(1);
    const backupName = must(files[0]);
    expect(backupName).toMatch(PRE_MIGRATION);

    const backup = new PrismaClient({
      datasourceUrl: `file:${path.join(configDir, backupName)}`,
    });
    try {
      expect(
        await backup.$queryRaw<
          { integrity_check: string }[]
        >`PRAGMA integrity_check`
      ).toEqual([{ integrity_check: "ok" }]);
      expect(
        await backup.$queryRaw<
          { username: string }[]
        >`SELECT username FROM "User"`
      ).toEqual([{ username: "backed-up-admin" }]);
      expect(await appliedCount(backup)).toBe(
        (await appliedCount(db.client)) - 1
      );
    } finally {
      await backup.$disconnect();
    }
  });

  it("takes no backup of a new database", async () => {
    const db = createEmptyDatabase();
    sandbox = db;

    const result = await migrate(db);

    expect(result.applied).toEqual(FOLDERS);
    expect(readdirSync(configDir)).toEqual([]);
  });

  it("takes no backup when nothing is pending", async () => {
    const db = await createDatabaseAt(NEWEST);
    sandbox = db;

    const result = await migrate(db);

    expect(result.applied).toEqual([]);
    expect(readdirSync(configDir)).toEqual([]);
  });

  it("the fourth pre-migration backup deletes the oldest, and never a manual or legacy one", async () => {
    const older = [
      "peek.db.backup-20260101-000000-pre-3.3.6",
      "peek.db.backup-20260102-000000-pre-3.3.7",
      "peek.db.backup-20260103-000000-pre-3.3.8",
    ];
    const kept = [
      "peek.db.backup-20250101-000000",
      "peek.db.backup.20250101_000000",
      "other.db.backup-20250101-000000-pre-3.0.0",
    ];
    for (const name of [...older, ...kept]) {
      writeFileSync(path.join(configDir, name), "");
    }
    const db = await oneMigrationBehind();

    await migrate(db);

    const files = readdirSync(configDir).sort();
    const created = files.filter(
      (name) => PRE_MIGRATION.test(name) && !older.includes(name)
    );
    expect(created).toHaveLength(1);
    expect(files).toEqual(
      [...older.slice(1), ...kept, must(created[0])].sort()
    );
  });
});
