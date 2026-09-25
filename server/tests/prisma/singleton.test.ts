/**
 * Unit tests for configureSQLite: the PRAGMAs it sets, the values it reads
 * back into one info line, and a failing performance PRAGMA as a warning.
 */
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureSQLite } from "../../prisma/singleton.js";
import { logger } from "../../utils/logger.js";
import { must } from "../helpers/must.js";
import {
  type PrismaMock,
  createPrismaMock,
  prismaImpl,
} from "../helpers/prismaMock.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

const mockLogger = vi.mocked(logger, true);

/** What Prisma's SQLite answers to each statement (integers as bigint). */
const ANSWERS: Record<string, unknown[]> = {
  "PRAGMA journal_mode = WAL": [{ journal_mode: "wal" }],
  "PRAGMA busy_timeout": [{ timeout: 5000n }],
  "PRAGMA foreign_keys": [{ foreign_keys: 1n }],
  "SELECT sqlite_version() AS version": [{ version: "3.46.0" }],
  "PRAGMA synchronous = NORMAL": [],
  "PRAGMA temp_store = MEMORY": [],
  "PRAGMA cache_size = -64000": [],
  "PRAGMA mmap_size = 268435456": [{ mmap_size: 268435456n }],
};

/** The SQL of a `$queryRaw` call, placeholders as `?`. */
function sqlOf(query: TemplateStringsArray | { sql: string }): string {
  return "sql" in query ? query.sql : query.join("?");
}

/**
 * A client whose `$queryRaw` answers from ANSWERS (any other statement with no
 * rows, as a PRAGMA that sets a value does), throwing for `failing`.
 */
function clientAnswering(failing?: string): PrismaMock {
  const client = createPrismaMock();
  client.$queryRaw.mockImplementation(
    prismaImpl<PrismaClient["$queryRaw"]>((query) => {
      const sql = sqlOf(query);
      if (sql === failing) throw new Error("disk I/O error");
      return ANSWERS[sql] ?? [];
    })
  );
  return client;
}

function statements(client: PrismaMock): string[] {
  return client.$queryRaw.mock.calls.map(([query]) => sqlOf(query));
}

describe("configureSQLite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "file:/data/peek.db");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports the journal mode, busy_timeout, foreign_keys and SQLite version it read back", async () => {
    const client = clientAnswering();

    await configureSQLite(client);

    expect(mockLogger.info).toHaveBeenCalledWith("SQLite configured", {
      journalMode: "wal",
      busyTimeoutMs: 5000,
      foreignKeys: true,
      sqliteVersion: "3.46.0",
      pooled: true,
    });
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    // Prisma sets foreign_keys and busy_timeout on every connection itself:
    // they are read, never set
    expect(statements(client)).toEqual([
      "PRAGMA journal_mode = WAL",
      "PRAGMA synchronous = NORMAL",
      "PRAGMA temp_store = MEMORY",
      "PRAGMA cache_size = -64000",
      "PRAGMA mmap_size = 268435456",
      "PRAGMA busy_timeout",
      "PRAGMA foreign_keys",
      "SELECT sqlite_version() AS version",
    ]);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("a failing performance PRAGMA is a warning naming it, not a startup failure", async () => {
    const client = clientAnswering("PRAGMA cache_size = -64000");

    await expect(configureSQLite(client)).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "SQLite PRAGMA cache_size = -64000 could not be set; continuing without it",
      { error: "disk I/O error" }
    );
    // The PRAGMAs after it still run, and the info line still follows
    expect(statements(client)).toContain("PRAGMA mmap_size = 268435456");
    expect(must(mockLogger.info.mock.calls[0])[0]).toBe("SQLite configured");
  });
});
