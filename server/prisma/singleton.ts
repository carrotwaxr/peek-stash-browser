import { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

const prisma = new PrismaClient();

/**
 * Performance PRAGMAs: beneficial, not required for correctness. Each is
 * per-connection, so it reaches only the one pooled connection that runs it
 * (about 12 % faster list queries there; the other connections keep SQLite's
 * defaults).
 */
const PERFORMANCE_PRAGMAS = [
  "synchronous = NORMAL", // Safe with WAL, faster commits
  "temp_store = MEMORY", // Temp tables and sorts in RAM
  "cache_size = -64000", // 64 MB page cache (negative = KiB)
  "mmap_size = 268435456", // 256 MB memory-mapped I/O
] as const;

/** Whether DATABASE_URL leaves Prisma its pool (no `connection_limit=1`). */
function isPooled(databaseUrl = process.env.DATABASE_URL ?? ""): boolean {
  const query = databaseUrl.split("?")[1] ?? "";
  return !query.split("&").includes("connection_limit=1");
}

/**
 * Configure SQLite once after migrations, before any application query, and
 * log what the database reports.
 *
 * - The client pools connections: Prisma's SQLite default is
 *   `num_cpus * 2 + 1`, and DATABASE_URL sets no `connection_limit`.
 * - `journal_mode = WAL` is database-level and persistent, so it holds on
 *   every connection: readers never block the writer.
 * - Prisma opens every connection with `foreign_keys = ON` and
 *   `busy_timeout = 5000`, so neither is set here; setting them on one
 *   connection would change nothing. They are read back into the log.
 * - `busy_timeout` (5 s per connection) is the only way a statement blocked
 *   by another writer waits; after it, the statement fails with "database is
 *   locked". `?socket_timeout=N` on DATABASE_URL would change it pool-wide.
 *   It is not raised: a longer wait is not what keeps Peek's own writers
 *   apart. Its transactions, multi-row writes and user-path writes queue
 *   in-process through `dbWrite`, so they never contend for the lock; the
 *   single-row writes left outside the queue (settings, setup, auth) wait
 *   here, behind units the writer rule keeps under 1 s.
 * - The performance PRAGMAs reach only the connection that runs them. One
 *   that fails is a warning naming it, not a startup failure.
 *
 * `synchronous` is not read back: the read may run on another pooled
 * connection and report that connection's default.
 */
async function configureSQLite(client: PrismaClient = prisma): Promise<void> {
  // PRAGMAs return rows, so $queryRaw (not $executeRaw). WAL is required: a
  // failure here stops startup.
  const [journal] = await client.$queryRaw<
    { journal_mode: string }[]
  >`PRAGMA journal_mode = WAL`;

  for (const pragma of PERFORMANCE_PRAGMAS) {
    try {
      // A constant from the list above, never input
      await client.$queryRaw(Prisma.raw(`PRAGMA ${pragma}`));
    } catch (error) {
      logger.warn(
        `SQLite PRAGMA ${pragma} could not be set; continuing without it`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  const [busy] = await client.$queryRaw<
    { timeout: bigint }[]
  >`PRAGMA busy_timeout`;
  const [foreignKeys] = await client.$queryRaw<
    { foreign_keys: bigint }[]
  >`PRAGMA foreign_keys`;
  const [version] = await client.$queryRaw<
    { version: string }[]
  >`SELECT sqlite_version() AS version`;

  logger.info("SQLite configured", {
    journalMode: journal?.journal_mode,
    busyTimeoutMs: busy === undefined ? undefined : Number(busy.timeout),
    foreignKeys: Number(foreignKeys?.foreign_keys) === 1,
    sqliteVersion: version?.version,
    pooled: isPooled(),
  });
}

export { configureSQLite };
export default prisma;
