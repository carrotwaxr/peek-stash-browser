import fs from "fs/promises";

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Cleanup interval in milliseconds (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Clean up expired downloads by deleting files and updating status
 *
 * Finds all downloads with status "COMPLETED" that have expired,
 * deletes their files from disk, and marks them as "EXPIRED".
 */
export async function cleanupExpiredDownloads(): Promise<void> {
  const now = new Date();

  logger.info("Starting download cleanup job");

  try {
    // Find all completed downloads that have expired
    const expiredDownloads = await prisma.download.findMany({
      where: {
        status: "COMPLETED",
        expiresAt: {
          lt: now,
        },
      },
    });

    if (expiredDownloads.length === 0) {
      logger.info("No expired downloads to clean up");
      return;
    }

    logger.info(`Found ${expiredDownloads.length} expired download(s) to clean up`);

    let successCount = 0;
    let errorCount = 0;

    for (const download of expiredDownloads) {
      try {
        // Delete the file if it exists
        if (download.filePath) {
          try {
            await fs.unlink(download.filePath);
            logger.debug(`Deleted expired download file: ${download.filePath}`);
          } catch (fileError) {
            // File might already be deleted - log but continue
            if ((fileError as NodeJS.ErrnoException).code === "ENOENT") {
              logger.debug(`File already deleted: ${download.filePath}`);
            } else {
              logger.warn(`Failed to delete file: ${download.filePath}`, {
                error: fileError instanceof Error ? fileError.message : String(fileError),
              });
            }
          }
        }

        // Update download status to EXPIRED and clear filePath
        await prisma.download.update({
          where: { id: download.id },
          data: {
            status: "EXPIRED",
            filePath: null,
          },
        });

        successCount++;
        logger.debug(`Marked download ${download.id} as expired`, {
          fileName: download.fileName,
        });
      } catch (error) {
        errorCount++;
        logger.error(`Failed to clean up download ${download.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info(`Download cleanup completed`, {
      processed: expiredDownloads.length,
      success: successCount,
      errors: errorCount,
    });
  } catch (error) {
    logger.error("Download cleanup job failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Schedule the download cleanup job to run periodically
 *
 * Runs cleanup immediately on startup, then every hour.
 */
export function scheduleDownloadCleanup(): void {
  logger.info("Scheduling download cleanup job (runs every hour)");

  // Run immediately on startup
  cleanupExpiredDownloads();

  // Schedule to run every hour
  setInterval(() => {
    cleanupExpiredDownloads();
  }, CLEANUP_INTERVAL_MS);
}
