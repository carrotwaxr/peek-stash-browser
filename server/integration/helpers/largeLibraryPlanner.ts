/**
 * Query plans as SQLite makes them for a large library.
 *
 * The replay's tables hold a few rows each, and once a sync's
 * `PRAGMA optimize` has recorded that in `sqlite_stat1` (and, as Prisma's
 * SQLite is built with STAT4, `sqlite_stat4`), SQLite rightly scans them. A
 * plan test pins the plan for a library of 100k+ rows, which is the one
 * SQLite picks for tables it has no statistics for (it assumes about a
 * million rows each). So the planner explains on a copy of the test
 * database without the statistics, through one connection to it. The
 * production plans with statistics are measured on a prod-snapshot copy.
 */
import { PrismaClient } from "@prisma/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prisma from "../../prisma/singleton.js";

export interface LargeLibraryPlanner {
  /** The `EXPLAIN QUERY PLAN` lines of `sql`, in order. */
  planOf(sql: string, ...params: unknown[]): Promise<string[]>;
  /** Disconnects and deletes the copy. */
  close(): Promise<void>;
}

/** Copies the test database without statistics; `close()` it in `afterAll`. */
export async function largeLibraryPlanner(): Promise<LargeLibraryPlanner> {
  const dir = await mkdtemp(join(tmpdir(), "peek-plans-"));
  const file = join(dir, "plans.db");
  await prisma.$executeRawUnsafe("VACUUM INTO ?", file);
  const datasourceUrl = `file:${file}?connection_limit=1`;
  // A connection keeps the statistics it loaded after the table is gone, so
  // the plans are read on a new one
  const setup = new PrismaClient({ datasourceUrl });
  await setup.$executeRawUnsafe("DROP TABLE IF EXISTS sqlite_stat1");
  await setup.$executeRawUnsafe("DROP TABLE IF EXISTS sqlite_stat4");
  await setup.$disconnect();
  const client = new PrismaClient({ datasourceUrl });

  return {
    async planOf(sql, ...params) {
      const rows = await client.$queryRawUnsafe<{ detail: string }[]>(
        `EXPLAIN QUERY PLAN ${sql}`,
        ...params
      );
      return rows.map((row) => row.detail);
    },
    async close() {
      await client.$disconnect();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
