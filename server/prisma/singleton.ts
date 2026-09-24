import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

const prisma = new PrismaClient();

/**
 * Configure SQLite PRAGMAs for production performance.
 * Must be called once after database initialization (migrations),
 * before any application queries.
 *
 * Note: Prisma pools several SQLite connections here (its default limit, no
 * connection_limit in the URL), so a per-connection PRAGMA reaches only the
 * connection that runs it; busy_timeout is 5 s on every connection anyway,
 * the driver's default. WAL mode is persistent (database-level) and survives
 * reconnections.
 */
async function configureSQLite(client: PrismaClient = prisma): Promise<void> {
  // Critical PRAGMAs — server should not start without these
  // Note: SQLite PRAGMAs return result rows, so use $queryRaw (not $executeRaw)
  await client.$queryRaw`PRAGMA journal_mode = WAL`; // Readers never block writers
  await client.$queryRaw`PRAGMA foreign_keys = ON`; // Enforce referential integrity
  await client.$queryRaw`PRAGMA busy_timeout = 5000`; // Wait 5s for locks instead of failing

  // Performance PRAGMAs — beneficial but not required for correctness
  try {
    await client.$queryRaw`PRAGMA synchronous = NORMAL`; // Safe with WAL, faster writes
    await client.$queryRaw`PRAGMA temp_store = MEMORY`; // Keep temp tables in RAM
    await client.$queryRaw`PRAGMA cache_size = -64000`; // 64MB page cache (negative = KB)
    await client.$queryRaw`PRAGMA mmap_size = 268435456`; // 256MB memory-mapped I/O
  } catch (error) {
    logger.warn("Some optional SQLite PRAGMAs could not be set", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export { configureSQLite };
export default prisma;
