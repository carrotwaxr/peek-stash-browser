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

  // Start the sync scheduler - it handles all sync logic including startup sync
  await syncScheduler.start();

  logger.info("=".repeat(60));
  logger.info("Peek Server Ready");
  logger.info("=".repeat(60));
};
