import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { stashCacheManager } from '../services/StashCacheManager.js';
import { transcodingManager } from '../services/TranscodingManager.js';
import { logger } from '../utils/logger.js';

/**
 * Get comprehensive server statistics
 * Includes system metrics, cache stats, transcoding info, and database size
 */
export const getStats = async (req: Request, res: Response) => {
  try {
    // Get cache stats with fallback
    let cacheStats;
    try {
      cacheStats = stashCacheManager.getStats();
    } catch (err) {
      logger.warn('Could not get cache stats', { error: (err as Error).message });
      cacheStats = {
        isInitialized: false,
        isRefreshing: false,
        lastRefreshed: null,
        counts: { scenes: 0, performers: 0, studios: 0, tags: 0 },
        estimatedCacheSize: '0 MB',
      };
    }

    // Get transcoding stats with fallback
    let transcodingStats;
    try {
      transcodingStats = transcodingManager.getStats();
    } catch (err) {
      logger.warn('Could not get transcoding stats', { error: (err as Error).message });
      transcodingStats = {
        activeSessions: 0,
        totalSessionsCreated: 0,
        sessions: [],
      };
    }

    // Get database size with fallback
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
    let dbSize = 0;
    try {
      if (dbPath) {
        const stats = await fs.stat(dbPath);
        dbSize = stats.size;
      }
    } catch (err) {
      logger.debug('Could not get database size', { error: (err as Error).message });
    }

    // Get transcoding cache size with fallback
    const segmentsDir = path.join(process.env.CONFIG_DIR || '/app/data', 'segments');
    let transcodingCacheSize = 0;
    let transcodingFileCount = 0;
    try {
      const files = await fs.readdir(segmentsDir);
      for (const file of files) {
        try {
          const filePath = path.join(segmentsDir, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            transcodingCacheSize += stats.size;
            transcodingFileCount++;
          }
        } catch (err) {
          // Skip individual file errors
          logger.debug('Could not stat file', { file, error: (err as Error).message });
        }
      }
    } catch (err) {
      // Directory might not exist yet or not accessible
      logger.debug('Could not read segments directory', { error: (err as Error).message });
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
        memoryUsagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(1),
      },

      // Process memory
      process: {
        heapUsed: formatBytes(memUsage.heapUsed),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsedPercent: ((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1),
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

      // Transcoding
      transcoding: {
        activeSessions: transcodingStats.activeSessions || 0,
        totalSessions: transcodingStats.totalSessionsCreated || 0,
        cacheSize: formatBytes(transcodingCacheSize),
        cacheSizeBytes: transcodingCacheSize,
        cacheFileCount: transcodingFileCount,
        sessions: (transcodingStats.sessions || []).map((session: any) => {
          try {
            return {
              sessionId: session.sessionId || 'unknown',
              sceneId: session.sceneId || 'unknown',
              quality: session.quality || 'unknown',
              startTime: session.startTime || new Date().toISOString(),
              currentSegment: session.currentSegment || 0,
              age: session.startTime
                ? formatDuration(Date.now() - new Date(session.startTime).getTime())
                : '0s',
              isActive: session.ffmpegProcess ? true : false,
            };
          } catch (err) {
            logger.warn('Error processing session', { error: (err as Error).message });
            return null;
          }
        }).filter(Boolean), // Remove any null entries from failed session processing
      },
    };

    res.json(stats);
  } catch (error) {
    // Catch-all error handler - this should never happen due to individual try-catches
    logger.error('Unexpected error in stats endpoint', {
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
        memoryUsagePercent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
      },
      process: {
        heapUsed: '0 MB',
        heapTotal: '0 MB',
        heapUsedPercent: '0',
        external: '0 MB',
        rss: '0 MB',
        arrayBuffers: '0 MB',
      },
      cache: {
        isInitialized: false,
        isRefreshing: false,
        lastRefreshed: null,
        counts: { scenes: 0, performers: 0, studios: 0, tags: 0 },
        estimatedSize: '0 MB',
      },
      database: { size: '0 B', sizeBytes: 0, path: '' },
      transcoding: {
        activeSessions: 0,
        totalSessions: 0,
        cacheSize: '0 B',
        cacheSizeBytes: 0,
        cacheFileCount: 0,
        sessions: [],
      },
    });
  }
};

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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

  return parts.join(' ');
}

/**
 * Format duration (milliseconds) to human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return formatUptime(seconds);
}

/**
 * Manually refresh the Stash cache
 * Admin-only endpoint to trigger cache refresh on demand
 */
export const refreshCache = async (req: Request, res: Response) => {
  try {
    logger.info('Manual cache refresh triggered by admin');
    await stashCacheManager.refreshCache();

    res.json({
      success: true,
      message: 'Cache refresh initiated'
    });
  } catch (error) {
    logger.error('Error refreshing cache', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to refresh cache'
    });
  }
};
