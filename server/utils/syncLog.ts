import { logger } from "./logger.js";

/**
 * Logs a sync that ended with `error` where nobody else reports it (a
 * background or scheduled run). An abort (an admin's Abort, or shutdown) is
 * not a failure: it logs "Sync aborted" at info. Anything else logs `failure`
 * at error level with the error's message.
 */
export function logSyncFailure(
  failure: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  if (error instanceof Error && error.message === "Sync aborted") {
    logger.info("Sync aborted", context);
    return;
  }
  logger.error(failure, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
}
