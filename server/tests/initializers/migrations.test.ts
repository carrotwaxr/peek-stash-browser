/**
 * The server owns its migrations: it reads `_prisma_migrations` through
 * Prisma, and starts the Prisma CLI once, only when a migration is pending.
 */
import { exec, execFile } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../../initializers/database.js";
import {
  LEGACY_BASELINE_TABLES,
  LegacyDatabaseError,
  type MigrationRow,
  planMigrations,
  runPrismaCli,
} from "../../initializers/migrations.js";
import prisma from "../../prisma/singleton.js";
import { logger } from "../../utils/logger.js";
import {
  anyOf,
  arrayContaining,
  objectContaining,
  stringContaining,
} from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

// What every child process answers; a test sets it before starting one
const child = vi.hoisted(() => ({
  error: null as Error | null,
  stdout: "",
  stderr: "",
}));

vi.mock("child_process", () => {
  type Callback = (error: Error | null, stdout: string, stderr: string) => void;
  const answer = (...args: unknown[]) => {
    const callback = args[args.length - 1] as Callback;
    callback(child.error, child.stdout, child.stderr);
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

const mockPrisma = vi.mocked(prisma, true);

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

/**
 * A database holding `tables`, whose `_prisma_migrations` lists `applied`, all
 * finished. By default it has the v2.0.0 tables and migration history.
 */
function databaseWith(
  applied: readonly string[],
  tables: readonly string[] = [...LEGACY_BASELINE_TABLES, "_prisma_migrations"]
): void {
  mockPrisma.$queryRaw.mockImplementation(
    prismaImpl<typeof prisma.$queryRaw>((query) => {
      const sql = "sql" in query ? query.sql : query.join("?");
      if (sql.includes("sqlite_master")) {
        return tables.map((name) => ({ name }));
      }
      if (sql.includes("_prisma_migrations")) return applied.map(appliedRow);
      throw new Error(`unexpected query: ${sql}`);
    })
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
