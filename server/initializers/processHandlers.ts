import type { Server } from "http";
import { disconnectComputeClient } from "../prisma/computeClient.js";
import prisma from "../prisma/singleton.js";
import { stashSyncService } from "../services/StashSyncService.js";
import { syncScheduler } from "../services/SyncScheduler.js";
import { logger } from "../utils/logger.js";
import { whenMigrationsSettled } from "./database.js";

/**
 * Process handlers: the graceful shutdown on SIGTERM and SIGINT, and the
 * last-resort handlers.
 *
 * `docker stop` sends SIGTERM and kills the container 10 s later. The
 * server is PID 1 in the image, and nginx goes with it when it exits.
 * The shutdown stops the syncs, closes the HTTP server, waits for the
 * migrations and the sync, checkpoints the WAL into the database file and
 * disconnects, so the next start (or a copy of the data volume) finds
 * everything in `peek-stash-browser.db`.
 *
 * An uncaught exception leaves the process in an unknown state (Node documents
 * that resuming is unsafe), so it is logged and the process exits with code 1;
 * the container's restart policy brings the server back. An unhandled promise
 * rejection leaves no half-run synchronous code, so it is logged and the
 * server keeps serving.
 */

/** Upper bound on the cleanup after an uncaught exception. */
export const FATAL_EXIT_TIMEOUT_MS = 5000;
/**
 * Upper bound on the graceful shutdown before exiting 1 anyway: under
 * Docker's default 10 s stop timeout, with room for the checkpoint.
 */
export const SHUTDOWN_DEADLINE_MS = 8000;
/**
 * How long requests in flight get to finish before their connections are
 * closed: a video stream or a keep-alive connection would hold the server
 * open until the deadline.
 */
export const CONNECTION_GRACE_MS = 1500;

type Exit = (code: number) => void;
const processExit: Exit = (code) => process.exit(code);

let httpServer: Server | null = null;
let shuttingDown = false;

// The logger serialises Error to {}, so log the stack as a string.
function describeError(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

/** The server the shutdown closes (`startServer`'s). */
export function registerHttpServer(server: Server): void {
  httpServer = server;
}

/** Whether a stop signal has started the shutdown; startup stops early. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Disconnects both Prisma clients; never rejects. */
export async function closeResources(): Promise<void> {
  await Promise.all([
    prisma.$disconnect().catch(() => undefined),
    disconnectComputeClient(),
  ]);
}

/**
 * Stops taking requests, then closes every connection still open after
 * CONNECTION_GRACE_MS. Resolves once the server has closed.
 */
async function closeHttpServer(server: Server): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    // An error only means it was not listening
    server.close(() => resolve());
  });
  const grace = setTimeout(() => {
    logger.info("Closing the connections still open");
    server.closeAllConnections();
  }, CONNECTION_GRACE_MS);
  grace.unref();
  await closed;
  clearTimeout(grace);
}

/**
 * Moves the WAL's pages into the database file and empties it. Best effort:
 * a recompute's read transaction on the compute connection can keep it from
 * finishing, which SQLite reports as busy.
 */
async function checkpointWal(): Promise<void> {
  try {
    const [result] = await prisma.$queryRaw<
      Array<{
        busy: number | bigint;
        log: number | bigint;
        checkpointed: number | bigint;
      }>
    >`PRAGMA wal_checkpoint(TRUNCATE)`;
    if (result && Number(result.busy) !== 0) {
      logger.warn("WAL checkpoint could not finish: the database was busy", {
        walPages: Number(result.log),
        checkpointedPages: Number(result.checkpointed),
      });
    }
  } catch (error) {
    logger.warn("WAL checkpoint failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The shutdown on SIGTERM or SIGINT. A second signal while it runs exits 1
 * at once, and so does SHUTDOWN_DEADLINE_MS passing.
 */
export async function gracefulShutdown(
  signal: string,
  exit: Exit = processExit
): Promise<void> {
  if (shuttingDown) {
    logger.warn(`Received ${signal} during the shutdown; exiting now`);
    exit(1);
    return;
  }
  shuttingDown = true;
  const started = performance.now();
  logger.info(`Received ${signal}, shutting down`);
  const deadline = setTimeout(() => {
    logger.error(
      `Shutdown did not finish within ${SHUTDOWN_DEADLINE_MS / 1000} s; exiting`
    );
    exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref();

  // 1. Nothing starts a new sync; the running job stops at its next check
  // (a Stash request in flight ends at once)
  syncScheduler.stop();
  stashSyncService.abort();

  // 2. No new requests; the ones in flight get the grace period
  if (httpServer) await closeHttpServer(httpServer);
  // A request that was running at the signal may have started or queued a
  // sync since; abort again so the release starts nothing
  stashSyncService.abort();

  // 3. A migration runs to its end (each is one transaction); then the
  // aborted job releases its lock
  await whenMigrationsSettled();
  await stashSyncService.whenIdle();

  // 4. Everything in the database file, the WAL emptied
  await checkpointWal();

  // 5. (D8: PRAGMA optimize)

  // 6. Both Prisma clients
  await closeResources();

  clearTimeout(deadline);
  logger.info(
    `Shutdown complete (${Math.round(performance.now() - started)} ms)`
  );
  exit(0);
}

export function handleUnhandledRejection(reason: unknown): void {
  logger.error("Unhandled promise rejection", {
    error: describeError(reason),
  });
}

export function handleUncaughtException(
  err: unknown,
  exit: Exit = processExit
): void {
  logger.error("Uncaught exception, shutting down", {
    error: describeError(err),
  });
  setTimeout(() => exit(1), FATAL_EXIT_TIMEOUT_MS).unref();
  try {
    stashSyncService.abort();
  } catch {
    // Shutting down regardless
  }
  void closeResources().finally(() => exit(1));
}

export function installProcessHandlers(): void {
  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("uncaughtException", (err) => handleUncaughtException(err));
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void gracefulShutdown(signal));
  }
}
