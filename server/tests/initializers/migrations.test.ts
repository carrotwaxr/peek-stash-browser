/**
 * The server owns its migrations: it reads `_prisma_migrations` through
 * Prisma, and starts the Prisma CLI once, only when a migration is pending.
 */
import { exec, execFile } from "child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initializeDatabase } from "../../initializers/database.js";
import {
  LEGACY_BASELINE_TABLES,
  LegacyDatabaseError,
  MigrationFailedError,
  type MigrationRow,
  migrateDatabase,
  objectMigrationAlreadyChanged,
  planMigrations,
  runPrismaCli,
} from "../../initializers/migrations.js";
import prisma from "../../prisma/singleton.js";
import {
  type PreMigrationBackup,
  databaseBackupService,
} from "../../services/DatabaseBackupService.js";
import { logger } from "../../utils/logger.js";
import { getServerVersion } from "../../utils/serverVersion.js";
import {
  anyOf,
  arrayContaining,
  objectContaining,
  stringContaining,
} from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

// What every child process answers; a test sets it before starting one.
// With `failingArg`, only a start whose arguments include it fails
const child = vi.hoisted(() => ({
  error: null as Error | null,
  stdout: "",
  stderr: "",
  failingArg: null as string | null,
}));

vi.mock("child_process", () => {
  type Callback = (error: Error | null, stdout: string, stderr: string) => void;
  const answer = (...args: unknown[]) => {
    const callback = args[args.length - 1] as Callback;
    const argv: unknown[] = Array.isArray(args[1]) ? args[1] : [];
    const fails = child.failingArg === null || argv.includes(child.failingArg);
    callback(
      fails ? child.error : null,
      child.stdout,
      fails ? child.stderr : ""
    );
  };
  return { exec: vi.fn(answer), execFile: vi.fn(answer) };
});

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/DatabaseBackupService.js", () => ({
  databaseBackupService: {
    createPreMigrationBackup: vi.fn(),
    listPreMigrationBackups: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockBackup = vi.mocked(databaseBackupService.createPreMigrationBackup);
const mockListBackups = vi.mocked(
  databaseBackupService.listPreMigrationBackups
);

// The repo's migration folders, which the server reads at startup
const FOLDERS = readdirSync(
  fileURLToPath(new URL("../../prisma/migrations/", import.meta.url)),
  { withFileTypes: true }
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const STARTED = new Date("2026-09-24T10:00:00Z");
const FINISHED = new Date("2026-09-24T10:00:01Z");

function appliedRow(name: string): MigrationRow {
  return {
    migration_name: name,
    started_at: STARTED,
    finished_at: FINISHED,
    rolled_back_at: null,
    logs: null,
  };
}

/** A row of a migration Prisma started and did not finish. */
function unfinishedRow(name: string, logs: string | null = null): MigrationRow {
  return {
    migration_name: name,
    started_at: STARTED,
    finished_at: null,
    rolled_back_at: null,
    logs,
  };
}

/**
 * A database holding `tables`, whose `_prisma_migrations` lists `applied`, all
 * finished, then `rows`. By default it has the v2.0.0 tables and migration
 * history.
 */
function databaseWith(
  applied: readonly string[],
  tables: readonly string[] = [...LEGACY_BASELINE_TABLES, "_prisma_migrations"],
  rows: readonly MigrationRow[] = []
): void {
  mockPrisma.$queryRaw.mockImplementation(
    prismaImpl<typeof prisma.$queryRaw>((query) => {
      const sql = "sql" in query ? query.sql : query.join("?");
      if (sql.includes("sqlite_master")) {
        return tables.map((name) => ({ name }));
      }
      if (sql.includes("_prisma_migrations")) {
        return [...applied.map(appliedRow), ...rows];
      }
      if (sql.includes("wal_checkpoint")) return [];
      throw new Error(`unexpected query: ${sql}`);
    })
  );
}

/** The SQL of every `$queryRaw` call, placeholders as `?`. */
function rawQueries(): string[] {
  return mockPrisma.$queryRaw.mock.calls.map(([query]) =>
    "sql" in query ? query.sql : query.join("?")
  );
}

/** The Prisma CLI arguments of each start, without the script and schema. */
function cliCalls(): string[][] {
  return vi
    .mocked(execFile)
    .mock.calls.map((call) => (call[1] ?? []).slice(1, -2));
}

beforeEach(() => {
  vi.clearAllMocks();
  child.error = null;
  child.stdout = "";
  child.stderr = "";
  child.failingArg = null;
});

describe("LEGACY_BASELINE_TABLES", () => {
  it("lists the tables 0_baseline creates", () => {
    const baseline = readFileSync(
      fileURLToPath(
        new URL(
          "../../prisma/migrations/0_baseline/migration.sql",
          import.meta.url
        )
      ),
      "utf8"
    );
    const created = [...baseline.matchAll(/CREATE TABLE "(\w+)"/g)].map(
      (match) => must(match[1], "a CREATE TABLE name")
    );

    expect(created).toHaveLength(19);
    expect(LEGACY_BASELINE_TABLES).toEqual(created);
  });
});

describe("planMigrations", () => {
  const folders = ["0_baseline", "20260101000000_a", "20260102000000_b"];

  it("finds every folder pending in a database with no tables", () => {
    const plan = planMigrations([], [], folders);

    expect(plan.shape).toBe("empty");
    expect(plan.pending).toEqual(folders);
    expect(plan.applied).toEqual([]);
  });

  it("calls a database with User and no _prisma_migrations a db push database", () => {
    expect(planMigrations(["User", "Playlist"], [], folders).shape).toBe(
      "dbPush"
    );
    expect(
      planMigrations(["User", "_prisma_migrations"], [], folders).shape
    ).toBe("migrated");
  });

  it("ignores rolled-back rows when it lists what is pending", () => {
    const rows: MigrationRow[] = [
      appliedRow("0_baseline"),
      {
        migration_name: "20260101000000_a",
        started_at: STARTED,
        finished_at: null,
        rolled_back_at: FINISHED,
        logs: "failed, then marked rolled back",
      },
    ];

    const plan = planMigrations(["User", "_prisma_migrations"], rows, folders);

    expect(plan.applied).toEqual(["0_baseline"]);
    expect(plan.pending).toEqual(["20260101000000_a", "20260102000000_b"]);
    expect(plan.unfinished).toEqual([]);
  });

  it("reports unfinished rows and applied names missing from the folder", () => {
    const rows: MigrationRow[] = [
      appliedRow("0_baseline"),
      {
        migration_name: "20260101000000_a",
        started_at: STARTED,
        finished_at: null,
        rolled_back_at: null,
        logs: "table already exists",
      },
      appliedRow("20260102000000_b"),
      appliedRow("20270101000000_from_a_newer_peek"),
    ];

    const plan = planMigrations(["User", "_prisma_migrations"], rows, folders);

    expect(plan.unfinished).toEqual([
      {
        name: "20260101000000_a",
        startedAt: STARTED,
        logs: "table already exists",
      },
    ]);
    expect(plan.unknownApplied).toEqual(["20270101000000_from_a_newer_peek"]);
    expect(plan.pending).toEqual(["20260101000000_a"]);
    expect(plan.applied).toEqual(["0_baseline", "20260102000000_b"]);
  });
});

describe("initializeDatabase", () => {
  it("does not start the Prisma CLI when _prisma_migrations lists every folder", async () => {
    databaseWith(FOLDERS);

    await initializeDatabase();

    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
    expect(mockBackup).not.toHaveBeenCalled();
  });

  it("runs one migrate deploy after closing the pool when a migration is pending", async () => {
    const last = must(
      FOLDERS[FOLDERS.length - 1],
      "the newest migration folder"
    );
    databaseWith(FOLDERS.slice(0, -1));

    await initializeDatabase();

    expect(vi.mocked(execFile)).toHaveBeenCalledExactlyOnceWith(
      process.execPath,
      [
        stringContaining("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        stringContaining("prisma/schema.prisma"),
      ],
      objectContaining({}),
      anyOf(Function)
    );
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
    // No pooled connection is open while the migration's DDL runs
    expect(
      must(mockPrisma.$disconnect.mock.invocationCallOrder[0])
    ).toBeLessThan(must(vi.mocked(execFile).mock.invocationCallOrder[0]));
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      `Applying 1 pending migration: ${last}`
    );
    // The backup is taken first, through the client that read the plan
    expect(mockBackup).toHaveBeenCalledExactlyOnceWith(
      getServerVersion(),
      objectContaining({ client: mockPrisma })
    );
    expect(must(mockBackup.mock.invocationCallOrder[0])).toBeLessThan(
      must(mockPrisma.$disconnect.mock.invocationCallOrder[0])
    );
  });

  it("takes no backup of a new database", async () => {
    databaseWith([], []);

    await initializeDatabase();

    expect(cliCalls()).toEqual([["migrate", "deploy"]]);
    expect(mockBackup).not.toHaveBeenCalled();
  });

  it("stops before any CLI when the backup fails", async () => {
    databaseWith(FOLDERS.slice(0, -1));
    const refusal = new Error("not enough space");
    mockBackup.mockRejectedValueOnce(refusal);

    await expect(initializeDatabase()).rejects.toBe(refusal);
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
  });

  it("checkpoints and truncates the WAL after a failed deploy, then rethrows", async () => {
    databaseWith(FOLDERS.slice(0, -1));
    child.error = new Error("Command failed");
    child.stderr = "Error: P3018 A migration failed to apply";

    await expect(initializeDatabase()).rejects.toThrow("P3018");
    const checkpoint = rawQueries().indexOf("PRAGMA wal_checkpoint(TRUNCATE)");
    expect(checkpoint).toBeGreaterThan(-1);
    expect(
      must(mockPrisma.$queryRaw.mock.invocationCallOrder[checkpoint])
    ).toBeGreaterThan(must(vi.mocked(execFile).mock.invocationCallOrder[0]));
  });
});

describe("initializeDatabase on a db push database", () => {
  it("marks a v2.0.0 database at the baseline, then deploys the rest", async () => {
    databaseWith([], LEGACY_BASELINE_TABLES);

    await initializeDatabase();

    expect(cliCalls()).toEqual([
      ["migrate", "resolve", "--applied", "0_baseline"],
      ["migrate", "deploy"],
    ]);
    expect(
      must(mockPrisma.$disconnect.mock.invocationCallOrder[0])
    ).toBeLessThan(must(vi.mocked(execFile).mock.invocationCallOrder[0]));
    // Marking the baseline is the first write: the backup comes before it
    expect(mockBackup).toHaveBeenCalledOnce();
    expect(must(mockBackup.mock.invocationCallOrder[0])).toBeLessThan(
      must(vi.mocked(execFile).mock.invocationCallOrder[0])
    );
  });

  it("stops a database from before v2.0.0 before starting any CLI", async () => {
    databaseWith(
      [],
      LEGACY_BASELINE_TABLES.filter(
        (table) => table !== "UserHiddenEntity" && table !== "StashInstance"
      )
    );

    await expect(initializeDatabase()).rejects.toThrow(LegacyDatabaseError);
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
    expect(mockBackup).not.toHaveBeenCalled();
  });
});

describe("runPrismaCli", () => {
  it("gives the CLI the database URL it is asked to migrate", async () => {
    await runPrismaCli(["migrate", "deploy"], {
      databaseUrl: "file:/tmp/sandbox.db",
    });

    expect(vi.mocked(execFile)).toHaveBeenCalledWith(
      process.execPath,
      arrayContaining(["migrate", "deploy"]),
      objectContaining({
        env: objectContaining({ DATABASE_URL: "file:/tmp/sandbox.db" }),
      }),
      anyOf(Function)
    );
  });

  it("rejects with the CLI's stderr in the message", async () => {
    child.error = new Error("Command failed");
    child.stderr = "Error: P3009 migrate found failed migrations";

    await expect(runPrismaCli(["migrate", "deploy"])).rejects.toThrow(
      "P3009 migrate found failed migrations"
    );
  });
});

describe("objectMigrationAlreadyChanged", () => {
  it("names a table or index the migration creates when the retry finds it there", () => {
    const sql = `PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "Probe" ("id" INTEGER NOT NULL PRIMARY KEY);
CREATE UNIQUE INDEX IF NOT EXISTS "Probe_id_key" ON "Probe"("id");
COMMIT;
PRAGMA foreign_keys=ON;`;

    expect(
      objectMigrationAlreadyChanged(
        sql,
        'Database error code: 1\n\nDatabase error:\ntable "Probe" already exists in \nCREATE TABLE ...'
      )
    ).toBe("Probe");
    expect(
      objectMigrationAlreadyChanged(
        sql,
        "Database error:\nindex probe_id_key already exists"
      )
    ).toBe("probe_id_key");
  });

  it("names a table, or a column, the migration drops or renames when the retry cannot find it", () => {
    const sql = `DROP TABLE IF EXISTS "scene_fts";
ALTER TABLE "new_Probe" RENAME TO "Probe";
DROP TABLE "Old";
ALTER TABLE "StashScene" DROP COLUMN "streams";
ALTER TABLE "User" ADD COLUMN "note" TEXT;`;

    expect(
      objectMigrationAlreadyChanged(sql, "Database error:\nno such table: Old")
    ).toBe("Old");
    expect(
      objectMigrationAlreadyChanged(
        sql,
        "Database error:\nno such table: main.new_Probe"
      )
    ).toBe("new_Probe");
    expect(
      objectMigrationAlreadyChanged(
        sql,
        'Database error:\nno such column: "streams"'
      )
    ).toBe("streams");
    expect(
      objectMigrationAlreadyChanged(
        sql,
        "Database error:\nduplicate column name: note"
      )
    ).toBe("note");
  });

  it("is null for an error on anything else", () => {
    const sql = `CREATE TABLE "Probe" ("id" INTEGER);
INSERT INTO "ProbeSource" ("id") VALUES (1);`;

    expect(
      objectMigrationAlreadyChanged(
        sql,
        "Database error:\nno such table: ProbeSource"
      )
    ).toBeNull();
    expect(
      objectMigrationAlreadyChanged(
        sql,
        'Database error:\ntable "Other" already exists'
      )
    ).toBeNull();
    expect(
      objectMigrationAlreadyChanged(
        sql,
        "Database error code: 13\n\nDatabase error:\ndatabase or disk is full"
      )
    ).toBeNull();
  });
});

describe("migrateDatabase with a migration an earlier start left unfinished", () => {
  const ATOMIC = "20260925000100_atomic";
  const PLAIN = "20260925000200_plain";
  const LATER = "20260925000300_later";
  const VERSION = getServerVersion();
  let prismaDir: string;

  beforeAll(() => {
    prismaDir = mkdtempSync(path.join(os.tmpdir(), "peek-migrations-test-"));
    const migrations: Record<string, string> = {
      "0_baseline": 'CREATE TABLE "User" ("id" INTEGER);',
      [ATOMIC]:
        'PRAGMA foreign_keys=OFF;\nBEGIN;\nCREATE TABLE "Probe" ("id" INTEGER);\nCOMMIT;\nPRAGMA foreign_keys=ON;\n',
      [PLAIN]: 'CREATE TABLE "Plain" ("id" INTEGER);\n',
      [LATER]:
        'PRAGMA foreign_keys=OFF;\nBEGIN;\nCREATE TABLE "Later" ("id" INTEGER);\nCOMMIT;\nPRAGMA foreign_keys=ON;\n',
    };
    for (const [name, sql] of Object.entries(migrations)) {
      mkdirSync(path.join(prismaDir, "migrations", name), { recursive: true });
      writeFileSync(
        path.join(prismaDir, "migrations", name, "migration.sql"),
        sql
      );
    }
  });

  afterAll(() => {
    rmSync(prismaDir, { recursive: true, force: true });
  });

  function backupFile(version: string): PreMigrationBackup {
    const filename = `peek-stash-browser.db.backup-20260924-101112-pre-${version}`;
    return {
      filename,
      path: `/app/data/${filename}`,
      size: 1024,
      createdAt: STARTED,
    };
  }

  /** The backups on disk: all of them, or those of the version asked for. */
  function backupsOnDisk(backups: readonly PreMigrationBackup[]): void {
    mockListBackups.mockImplementation((opts = {}) =>
      Promise.resolve(
        backups.filter(
          (backup) =>
            opts.version === undefined ||
            backup.filename.endsWith(`-pre-${opts.version}`)
        )
      )
    );
  }

  function migrate() {
    return migrateDatabase({ prismaDir, configDir: "/app/data" });
  }

  it("stops before any backup or CLI when the unfinished migration is not atomic", async () => {
    databaseWith(["0_baseline", ATOMIC], undefined, [
      unfinishedRow(
        PLAIN,
        "Migration name: 20260925000200_plain\n\nDatabase error code: 1\n\nDatabase error:\nno such table: Missing\n"
      ),
    ]);
    const newest = backupFile(VERSION);
    backupsOnDisk([backupFile("3.3.8"), newest]);

    const run = migrate();

    await expect(run).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(run).rejects.toMatchObject({
      migration: PLAIN,
      failure: "partial",
      backup: newest.path,
    });
    await expect(run).rejects.toThrow("no such table: Missing");
    await expect(run).rejects.toThrow(
      `migrate resolve --rolled-back ${PLAIN} --schema /app/prisma/schema.prisma`
    );
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(mockBackup).not.toHaveBeenCalled();
    expect(mockPrisma.$disconnect).not.toHaveBeenCalled();
  });

  it("says so when there is no pre-migration backup to restore", async () => {
    databaseWith(["0_baseline", ATOMIC], undefined, [unfinishedRow(PLAIN)]);
    backupsOnDisk([]);

    await expect(migrate()).rejects.toThrow(
      "There is no pre-migration backup in /app/data"
    );
  });

  it("marks an unfinished atomic migration rolled back and deploys once, reusing this version's backup", async () => {
    databaseWith(["0_baseline"], undefined, [unfinishedRow(ATOMIC)]);
    backupsOnDisk([backupFile(VERSION)]);

    const result = await migrate();

    expect(result.applied).toEqual([ATOMIC, PLAIN, LATER]);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      `Migration ${ATOMIC} was interrupted and rolled back; retrying`
    );
    expect(cliCalls()).toEqual([
      ["migrate", "resolve", "--rolled-back", ATOMIC],
      ["migrate", "deploy"],
    ]);
    expect(mockBackup).not.toHaveBeenCalled();
    expect(
      must(mockPrisma.$disconnect.mock.invocationCallOrder[0])
    ).toBeLessThan(must(vi.mocked(execFile).mock.invocationCallOrder[0]));
  });

  it("backs up before marking it rolled back when this version has no backup yet", async () => {
    databaseWith(["0_baseline"], undefined, [unfinishedRow(ATOMIC)]);
    backupsOnDisk([backupFile("3.3.8")]);
    mockBackup.mockResolvedValue(backupFile(VERSION));

    await migrate();

    expect(mockBackup).toHaveBeenCalledExactlyOnceWith(
      VERSION,
      objectContaining({ client: mockPrisma, dir: "/app/data" })
    );
    expect(must(mockBackup.mock.invocationCallOrder[0])).toBeLessThan(
      must(vi.mocked(execFile).mock.invocationCallOrder[0])
    );
  });

  it("throws MigrationFailedError when the retry fails again, after truncating the WAL", async () => {
    databaseWith(["0_baseline"], undefined, [unfinishedRow(ATOMIC)]);
    const backup = backupFile(VERSION);
    backupsOnDisk([backup]);
    child.failingArg = "deploy";
    child.error = new Error("Command failed");
    child.stderr = `Error: P3018\n\nMigration name: ${ATOMIC}\n\nDatabase error code: 13\n\nDatabase error:\ndatabase or disk is full\n`;

    const run = migrate();

    await expect(run).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(run).rejects.toMatchObject({
      migration: ATOMIC,
      failure: "retryFailed",
      backup: backup.path,
    });
    await expect(run).rejects.toThrow(
      "The database said: database or disk is full (SQLite error 13)."
    );
    await expect(run).rejects.toThrow("Peek retries it at every start");
    expect(rawQueries()).toContain("PRAGMA wal_checkpoint(TRUNCATE)");
  });

  it("rethrows a later migration's first failure as it is", async () => {
    databaseWith(["0_baseline"], undefined, [unfinishedRow(ATOMIC)]);
    backupsOnDisk([backupFile(VERSION)]);
    child.failingArg = "deploy";
    child.error = new Error("Command failed");
    child.stderr = `Error: P3018\n\nMigration name: ${LATER}\n\nDatabase error:\nno such table: Missing\n`;

    const run = migrate();

    await expect(run).rejects.toThrow(`Migration name: ${LATER}`);
    await expect(run).rejects.not.toBeInstanceOf(MigrationFailedError);
  });
});
