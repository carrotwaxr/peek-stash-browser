import { Request, Response } from "express";
import { promises as fs } from "fs";
import os from "os";
import { stashEntityService } from "../services/StashEntityService.js";
import { stashSyncService } from "../services/StashSyncService.js";
import { logger } from "../utils/logger.js";

/**
 * Get comprehensive server statistics
 * Includes system metrics, cache stats, and database size
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    // Get cache stats with fallback
    let cacheStats;
    try {
      const [counts, isReady, lastRefreshed] = await Promise.all([
        stashEntityService.getStats(),
        stashEntityService.isReady(),
        stashEntityService.getLastRefreshed(),
      ]);
      cacheStats = {
        isInitialized: isReady,
        isRefreshing: stashSyncService.isSyncing(),
        lastRefreshed: lastRefreshed?.toISOString() || null,
        counts: {
          scenes: counts.scenes,
          performers: counts.performers,
          studios: counts.studios,
          tags: counts.tags,
          galleries: counts.galleries,
          groups: counts.groups,
          images: counts.images,
          clips: counts.clips,
          ungeneratedClips: counts.ungeneratedClips,
        },
        estimatedCacheSize: "N/A (SQLite)", // Size now in DB
      };
    } catch (err) {
      logger.warn("Could not get cache stats", {
        error: (err as Error).message,
      });
      cacheStats = {
        isInitialized: false,
        isRefreshing: false,
        lastRefreshed: null,
        counts: { scenes: 0, performers: 0, studios: 0, tags: 0, galleries: 0, groups: 0, images: 0, clips: 0, ungeneratedClips: 0 },
        estimatedCacheSize: "0 MB",
      };
    }

    // Get database size with fallback
    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "";
    let dbSize = 0;
    try {
      if (dbPath) {
        const stats = await fs.stat(dbPath);
        dbSize = stats.size;
      }
    } catch (err) {
      logger.debug("Could not get database size", {
        error: (err as Error).message,
      });
    }

    // System metrics with fallbacks
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuCount = os.cpus().length;

    const stats = {
      // System metrics
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpuCount,
        uptime: formatUptime(uptime),
        uptimeSeconds: Math.floor(uptime),
        totalMemory: formatBytes(totalMem),
        freeMemory: formatBytes(freeMem),
        usedMemory: formatBytes(totalMem - freeMem),
        memoryUsagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(
          1
        ),
      },

      // Process memory
      process: {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsedPercent: (
          (memUsage.heapUsed / memUsage.heapTotal) *
          100
        ).toFixed(1),
        external: formatBytes(memUsage.external),
        rss: formatBytes(memUsage.rss),
        arrayBuffers: formatBytes(memUsage.arrayBuffers || 0),
      },

      // Cache statistics
      cache: {
        isInitialized: cacheStats.isInitialized,
        isRefreshing: cacheStats.isRefreshing,
        lastRefreshed: cacheStats.lastRefreshed,
        counts: cacheStats.counts,
        estimatedSize: cacheStats.estimatedCacheSize,
      },

      // Database
      database: {
        size: formatBytes(dbSize),
        sizeBytes: dbSize,
        path: dbPath,
      },
    };

    res.json(stats);
  } catch (error) {
    // Catch-all error handler - this should never happen due to individual try-catches
    logger.error("Unexpected error in stats endpoint", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    // Return a minimal safe response instead of 500
    res.json({
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        uptime: formatUptime(process.uptime()),
        uptimeSeconds: Math.floor(process.uptime()),
        totalMemory: formatBytes(os.totalmem()),
        freeMemory: formatBytes(os.freemem()),
        usedMemory: formatBytes(os.totalmem() - os.freemem()),
        memoryUsagePercent: (
          ((os.totalmem() - os.freemem()) / os.totalmem()) *
          100
        ).toFixed(1),
      },
      process: {
        heapUsed: "0 MB",
        heapTotal: "0 MB",
        heapUsedPercent: "0",
        external: "0 MB",
        rss: "0 MB",
        arrayBuffers: "0 MB",
      },
      cache: {
        isInitialized: false,
        isRefreshing: false,
        lastRefreshed: null,
        counts: { scenes: 0, performers: 0, studios: 0, tags: 0, galleries: 0, groups: 0, images: 0, clips: 0, ungeneratedClips: 0 },
        estimatedSize: "0 MB",
      },
      database: { size: "0 B", sizeBytes: 0, path: "" },
    });
  }
};

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format uptime to human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * Manually refresh the Stash cache
 * Admin-only endpoint to trigger cache refresh on demand
 */
export const refreshCache = async (req: Request, res: Response) => {
  try {
    logger.info("Manual cache refresh triggered by admin");
    // Trigger a full sync (non-blocking - runs in background)
    stashSyncService.fullSync().catch((err: Error) => {
      logger.error("Background full sync failed", { error: err.message });
    });

    res.json({
      success: true,
      message: "Cache refresh initiated",
    });
  } catch (error) {
    logger.error("Error refreshing cache", {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    res.status(500).json({
      success: false,
      error: "Failed to refresh cache",
    });
  }
};
