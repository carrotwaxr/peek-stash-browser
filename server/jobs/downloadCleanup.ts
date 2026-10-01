import fs from "fs/promises";
import path from "path";
import prisma from "../prisma/singleton.js";
import { downloadJobQueue } from "../services/DownloadJobQueue.js";
import { downloadsDir, zipPath } from "../utils/downloadPaths.js";
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

    logger.info(
      `Found ${expiredDownloads.length} expired download(s) to clean up`
    );

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
                error:
                  fileError instanceof Error
                    ? fileError.message
                    : String(fileError),
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

const USER_DIR_PATTERN = /^user-(\d+)$/;
const ZIP_FILE_PATTERN = /^download-(\d+)\.zip$/;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Removes the zip files nothing owns: the folder of a user that no longer
 * exists, and a `download-<id>.zip` that is neither being built (the queue
 * holds it) nor the file of a COMPLETED row. Builds interrupted by a crash,
 * and deletes that failed, leave such files. Never throws: one file that
 * cannot be removed is logged and the sweep goes on.
 */
export async function sweepOrphanedDownloadFiles(): Promise<void> {
  const root = downloadsDir();
  let removedFiles = 0;
  let removedFolders = 0;
  let failures = 0;

  try {
    const entries = await fs
      .readdir(root, { withFileTypes: true })
      .catch((error: unknown) => {
        if (isMissing(error)) return [];
        throw error;
      });
    const userFolders = entries.flatMap((entry) => {
      const match = entry.isDirectory()
        ? USER_DIR_PATTERN.exec(entry.name)
        : null;
      return match ? [{ name: entry.name, userId: Number(match[1]) }] : [];
    });
    if (userFolders.length === 0) return;

    const users = await prisma.user.findMany({
      where: { id: { in: userFolders.map((folder) => folder.userId) } },
      select: { id: true },
    });
    const existing = new Set(users.map((user) => user.id));

    for (const folder of userFolders) {
      const dir = path.join(root, folder.name);
      try {
        if (!existing.has(folder.userId)) {
          await fs.rm(dir, { recursive: true, force: true });
          removedFolders++;
          continue;
        }

        const files = (await fs.readdir(dir))
          .map((name) => ({ name, match: ZIP_FILE_PATTERN.exec(name) }))
          .flatMap(({ match }) => (match ? [Number(match[1])] : []));
        if (files.length === 0) continue;

        const completed = await prisma.download.findMany({
          where: {
            id: { in: files },
            userId: folder.userId,
            status: "COMPLETED",
          },
          select: { id: true, filePath: true },
        });
        const kept = new Set(
          completed.flatMap((row) =>
            row.filePath === zipPath(folder.userId, row.id) ? [row.id] : []
          )
        );

        for (const id of files) {
          if (kept.has(id)) continue;
          try {
            // Checked as late as possible: a build may have started since
            // the rows were read
            if (downloadJobQueue.isActive(id)) continue;
            await fs.unlink(zipPath(folder.userId, id));
            removedFiles++;
          } catch (error) {
            if (isMissing(error)) continue;
            failures++;
            logger.warn("Could not remove a stray download file", {
              downloadId: id,
              error: describeError(error),
            });
          }
        }
      } catch (error) {
        failures++;
        logger.warn("Could not sweep a download folder", {
          folder: folder.name,
          error: describeError(error),
        });
      }
    }
  } catch (error) {
    logger.error("Download file sweep failed", {
      error: describeError(error),
    });
    return;
  }

  if (removedFiles > 0 || removedFolders > 0 || failures > 0) {
    logger.info("Download file sweep completed", {
      removedFiles,
      removedFolders,
      failures,
    });
  }
}

/** One hourly pass: expire finished zips, then remove stray files */
async function runDownloadCleanup(): Promise<void> {
  await cleanupExpiredDownloads();
  await sweepOrphanedDownloadFiles();
}

/**
 * Schedule the download cleanup job to run periodically
 *
 * Runs cleanup immediately on startup, then every hour.
 */
export function scheduleDownloadCleanup(): void {
  logger.info("Scheduling download cleanup job (runs every hour)");

  // Run immediately on startup
  void runDownloadCleanup();

  // Schedule to run every hour
  setInterval(() => {
    void runDownloadCleanup();
  }, CLEANUP_INTERVAL_MS);
}
