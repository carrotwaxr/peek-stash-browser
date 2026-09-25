/**
 * A second Prisma client pinned to one SQLite connection, for work that keeps
 * TEMP tables between statements (the exclusion recompute).
 *
 * TEMP tables live on one connection, and the main client pools several. An
 * interactive $transaction would pin a connection too, but Prisma opens it
 * with BEGIN IMMEDIATE on SQLite: the database write lock is held for the
 * whole transaction even when it only reads, so playback pings, ratings and
 * sync writes queue behind it. This client runs its statements outside any
 * Prisma transaction on its single connection, so under WAL it takes no
 * write lock on the main database.
 *
 * The connection's TEMP namespace is shared by everything that uses this
 * client, so `withComputeConnection` runs its callers one at a time, and
 * `readSnapshot` gives them a deferred read transaction to compute in.
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

let clientPromise: Promise<PrismaClient> | null = null;

/** DATABASE_URL with connection_limit=1, replacing any limit already set. */
export function singleConnectionUrl(databaseUrl: string): string {
  const q = databaseUrl.indexOf("?");
  const base = q === -1 ? databaseUrl : databaseUrl.slice(0, q);
  const query = q === -1 ? "" : databaseUrl.slice(q + 1);
  const params = query
    .split("&")
    .filter((p) => p !== "" && !p.startsWith("connection_limit="));
  params.push("connection_limit=1");
  return `${base}?${params.join("&")}`;
}

async function createClient(): Promise<PrismaClient> {
  // Read at first use, not at import: the integration harness sets
  // DATABASE_URL at runtime.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new PrismaClient({
    datasourceUrl: singleConnectionUrl(databaseUrl),
  });
  try {
    // Per-connection PRAGMAs; with one connection they are set once.
    // PRAGMAs return rows, so $queryRawUnsafe rather than $executeRawUnsafe.
    // The page cache and synchronous level match the main client's
    // (prisma/singleton.ts): the exclusion swap runs on this connection, and
    // on 180k rows the default 2 MB cache and FULL sync double its lock hold
    // (947 ms against 494 ms in the sqlite3 CLI).
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    await client.$queryRawUnsafe("PRAGMA temp_store = MEMORY");
    await client.$queryRawUnsafe("PRAGMA cache_size = -64000");
    await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
  return client;
}

/** The single-connection client, created and configured on first use. */
export function getComputeClient(): Promise<PrismaClient> {
  clientPromise ??= createClient().catch((error: unknown) => {
    clientPromise = null; // let the next call retry
    throw error;
  });
  return clientPromise;
}

/** Disconnect the client if it was ever created (shutdown). */
export async function disconnectComputeClient(): Promise<void> {
  const pending = clientPromise;
  clientPromise = null;
  if (!pending) return;
  try {
    const client = await pending;
    await client.$disconnect();
  } catch {
    /* never connected, or already gone */
  }
}

// The connection's callers, one at a time: `tail` settles when the last
// caller enqueued has released.
let tail: Promise<void> = Promise.resolve();

/**
 * Run `fn` on the single-connection client, after every caller enqueued
 * before it and before every caller after: the TEMP tables are shared, so
 * two computes must never interleave. Take the connection before entering a
 * `dbWrite` unit, never inside one: a unit waiting here would hold the
 * writer queue for as long as the caller ahead of it computes.
 */
export async function withComputeConnection<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous; // never rejects: release() is the only way it settles
  try {
    const db = await getComputeClient();
    return await fn(db);
  } finally {
    release();
  }
}

/**
 * Run `fn` inside a deferred BEGIN on the compute connection: a read
 * snapshot of the main database that takes no write lock under WAL (Prisma's
 * interactive $transaction opens with BEGIN IMMEDIATE, which would hold the
 * write lock for the whole compute). TEMP tables created inside are kept:
 * the snapshot ends with COMMIT, which a transaction that wrote only TEMP
 * tables completes without the main write lock, where ROLLBACK would drop
 * them. When the body or the COMMIT throws, the snapshot is rolled back and
 * the error rethrown. If even the ROLLBACK fails, the connection could still
 * be inside the snapshot, pinning stale data and failing the next BEGIN, so
 * the client is disconnected and the next call opens a fresh one.
 */
export async function readSnapshot<T>(
  db: Pick<PrismaClient, "$executeRawUnsafe">,
  fn: () => Promise<T>
): Promise<T> {
  await db.$executeRawUnsafe("BEGIN");
  try {
    const result = await fn();
    await db.$executeRawUnsafe("COMMIT");
    return result;
  } catch (error) {
    try {
      await db.$executeRawUnsafe("ROLLBACK");
    } catch (rollbackError) {
      logger.warn(
        "Compute snapshot could not be rolled back, reconnecting the compute client",
        {
          error:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        }
      );
      await disconnectComputeClient();
    }
    throw error;
  }
}
