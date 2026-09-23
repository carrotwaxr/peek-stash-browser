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
 * client: callers must serialize their use of it.
 */
import { PrismaClient } from "@prisma/client";

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
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    await client.$queryRawUnsafe("PRAGMA temp_store = MEMORY");
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
  return client;
}

/** The single-connection client, created and configured on first use. */
export function getComputeClient(): Promise<PrismaClient> {
  if (!clientPromise) {
    clientPromise = createClient().catch((error: unknown) => {
      clientPromise = null; // let the next call retry
      throw error;
    });
  }
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
