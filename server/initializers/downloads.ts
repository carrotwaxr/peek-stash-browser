import { sweepOrphanedDownloadFiles } from "../jobs/downloadCleanup.js";
import { recoverPendingDownloads } from "../services/DownloadJobQueue.js";
import { logger } from "../utils/logger.js";

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Startup, once the instances' scenes are loaded: the playlist zips a restart
 * interrupted are built again, then the zip files no row and no build owns
 * (a crash left them) are removed. Neither step stops the server: a failure
 * (a busy database, a folder it cannot read) is logged, the next step runs,
 * and the hourly cleanup sweeps again.
 */
export async function resumeDownloadsAtStartup(): Promise<void> {
  try {
    await recoverPendingDownloads();
  } catch (error) {
    logger.error("Could not resume interrupted playlist zips", {
      error: describeError(error),
    });
  }
  try {
    await sweepOrphanedDownloadFiles();
  } catch (error) {
    logger.error("Could not sweep stray download files", {
      error: describeError(error),
    });
  }
}
