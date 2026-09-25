import { stashSyncService } from "../services/StashSyncService.js";
import { syncScheduler } from "../services/SyncScheduler.js";
import { logger } from "../utils/logger.js";

/**
 * Initialize cache by starting the SyncScheduler
 *
 * The SyncScheduler handles:
 * - Startup sync (full if first run, incremental otherwise)
 * - Polling interval for periodic syncs
 * - Manual sync triggers
 *
 * This function is called after the server starts listening,
 * so setup endpoints work during initial sync.
 */
export const initializeCache = async () => {
  logger.info("=".repeat(60));
  logger.info("Starting cache synchronization...");
  logger.info("=".repeat(60));

  // Remove the cached rows of instances that no longer exist (a deletion
  // that failed or was stopped midway) before any sync runs. This path runs
  // only when at least one instance exists.
  try {
    await stashSyncService.purgeUnknownInstanceCaches();
  } catch (error) {
    logger.error(
      "Could not remove the cached rows of deleted instances; the next start tries again",
      { error: error instanceof Error ? error.message : String(error) }
    );
  }

  // Start the sync scheduler - it handles all sync logic including startup sync
  await syncScheduler.start();

  logger.info("=".repeat(60));
  logger.info("Peek Server Ready");
  logger.info("=".repeat(60));
};
