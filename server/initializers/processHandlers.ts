import prisma from "../prisma/singleton.js";
import { stashSyncService } from "../services/StashSyncService.js";
import { logger } from "../utils/logger.js";

/**
 * Last-resort process handlers.
 *
 * An uncaught exception leaves the process in an unknown state (Node documents
 * that resuming is unsafe), so it is logged and the process exits with code 1;
 * the container's restart policy brings the server back. An unhandled promise
 * rejection leaves no half-run synchronous code, so it is logged and the
 * server keeps serving.
 */

/** Upper bound on the graceful shutdown before exiting anyway. */
export const FATAL_EXIT_TIMEOUT_MS = 5000;

// The logger serialises Error to {}, so log the stack as a string.
function describeError(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}

export function handleUnhandledRejection(reason: unknown): void {
  logger.error("Unhandled promise rejection", {
    error: describeError(reason),
  });
}

export function handleUncaughtException(
  err: unknown,
  exit: (code: number) => void = (code) => process.exit(code)
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
  void prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => exit(1));
}

export function installProcessHandlers(): void {
  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("uncaughtException", (err) => handleUncaughtException(err));
}
