import { Request, Response } from 'express';
import prisma from '../prisma/singleton.js';
import { logger } from '../utils/logger.js';
import getStash from '../stash.js';

const MINIMUM_WATCH_DURATION = 300; // 5 minutes in seconds

/**
 * Update watch history with periodic ping from video player
 * Tracks playback progress, increments play count if threshold met
 */
export async function pingWatchHistory(req: Request, res: Response) {
  try {
    const { sceneId, currentTime, quality, sessionStart, seekEvents } = req.body;
    const userId = (req as any).user?.id;

    if (!sceneId || typeof currentTime !== 'number') {
      return res.status(400).json({ error: 'Missing required fields: sceneId, currentTime' });
    }

    logger.info('Watch history ping', {
      userId,
      sceneId,
      currentTime: currentTime.toFixed(2),
      quality,
    });

    // Get or create watch history record
    let watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    const now = new Date();
    const isNewSession = !watchHistory || !sessionStart;

    if (!watchHistory) {
      // Create new watch history record
      watchHistory = await prisma.watchHistory.create({
        data: {
          userId,
          sceneId,
          playCount: 0,
          playDuration: 0,
          resumeTime: currentTime,
          lastPlayedAt: now,
          oCount: 0,
          oHistory: [],
          playHistory: [],
        },
      });
    }

    // Parse existing play history
    const playHistory = Array.isArray(watchHistory.playHistory)
      ? watchHistory.playHistory
      : JSON.parse(watchHistory.playHistory as string || '[]');

    // Calculate session duration
    let sessionDuration = 0;
    if (sessionStart) {
      const sessionStartTime = new Date(sessionStart);
      sessionDuration = (now.getTime() - sessionStartTime.getTime()) / 1000;
    }

    // Increment play count if this session has reached 5 minutes
    let newPlayCount = watchHistory.playCount;
    if (sessionDuration >= MINIMUM_WATCH_DURATION && isNewSession) {
      newPlayCount++;
      logger.info('Play count incremented', { userId, sceneId, newPlayCount });
    }

    // Update watch history
    const updated = await prisma.watchHistory.update({
      where: { id: watchHistory.id },
      data: {
        resumeTime: currentTime,
        lastPlayedAt: now,
        playCount: newPlayCount,
        playDuration: watchHistory.playDuration + (sessionDuration > 0 ? sessionDuration : 0),
        playHistory: JSON.stringify([
          ...playHistory,
          {
            startTime: sessionStart || now.toISOString(),
            endTime: now.toISOString(),
            quality: quality || 'unknown',
            duration: sessionDuration,
            seekEvents: seekEvents || [],
          },
        ]),
      },
    });

    res.json({
      success: true,
      watchHistory: {
        playCount: updated.playCount,
        playDuration: updated.playDuration,
        resumeTime: updated.resumeTime,
        lastPlayedAt: updated.lastPlayedAt,
      },
    });
  } catch (error) {
    logger.error('Error updating watch history', { error });
    res.status(500).json({ error: 'Failed to update watch history' });
  }
}

/**
 * Increment O counter for a scene
 */
export async function incrementOCounter(req: Request, res: Response) {
  try {
    const { sceneId } = req.body;
    const userId = (req as any).user?.id;

    if (!sceneId) {
      return res.status(400).json({ error: 'Missing required field: sceneId' });
    }

    logger.info('Incrementing O counter', { userId, sceneId });

    // Get or create watch history record
    let watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    const now = new Date();

    if (!watchHistory) {
      // Create new watch history record
      watchHistory = await prisma.watchHistory.create({
        data: {
          userId,
          sceneId,
          playCount: 0,
          playDuration: 0,
          oCount: 1,
          oHistory: [now.toISOString()],
          playHistory: [],
          lastPlayedAt: now,
        },
      });
    } else {
      // Parse existing O history
      const oHistory = Array.isArray(watchHistory.oHistory)
        ? watchHistory.oHistory
        : JSON.parse(watchHistory.oHistory as string || '[]');

      // Update with incremented O counter
      watchHistory = await prisma.watchHistory.update({
        where: { id: watchHistory.id },
        data: {
          oCount: watchHistory.oCount + 1,
          oHistory: JSON.stringify([...oHistory, now.toISOString()]),
        },
      });
    }

    // Also increment O counter in Stash
    try {
      logger.info('Attempting to increment O counter in Stash', { sceneId });
      const stash = getStash();
      logger.info('Got Stash instance', { stashUrl: process.env.STASH_URL });
      const result = await stash.sceneIncrementO({ id: sceneId });
      logger.info('Successfully incremented O counter in Stash', { sceneId, result });
    } catch (stashError) {
      // Don't fail the request if Stash is unavailable
      logger.error('Failed to increment O counter in Stash', {
        sceneId,
        error: stashError,
        errorMessage: (stashError as Error).message,
        errorStack: (stashError as Error).stack
      });
    }

    res.json({
      success: true,
      oCount: watchHistory.oCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('Error incrementing O counter', { error });
    res.status(500).json({ error: 'Failed to increment O counter' });
  }
}

/**
 * Get watch history for a specific scene
 */
export async function getWatchHistory(req: Request, res: Response) {
  try {
    const { sceneId } = req.params;
    const userId = (req as any).user?.id;

    if (!sceneId) {
      return res.status(400).json({ error: 'Missing required parameter: sceneId' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const watchHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId } },
    });

    if (!watchHistory) {
      return res.json({
        exists: false,
        resumeTime: null,
        playCount: 0,
        oCount: 0,
      });
    }

    // Parse JSON fields
    const oHistory = Array.isArray(watchHistory.oHistory)
      ? watchHistory.oHistory
      : JSON.parse(watchHistory.oHistory as string || '[]');

    const playHistory = Array.isArray(watchHistory.playHistory)
      ? watchHistory.playHistory
      : JSON.parse(watchHistory.playHistory as string || '[]');

    res.json({
      exists: true,
      resumeTime: watchHistory.resumeTime,
      playCount: watchHistory.playCount,
      playDuration: watchHistory.playDuration,
      lastPlayedAt: watchHistory.lastPlayedAt,
      oCount: watchHistory.oCount,
      oHistory,
      playHistory,
    });
  } catch (error) {
    logger.error('Error getting watch history', { error });
    logger.error('Error details', { message: (error as Error).message, stack: (error as Error).stack });
    res.status(500).json({ error: 'Failed to get watch history' });
  }
}

/**
 * Get all watch history for current user (for Continue Watching carousel)
 */
export async function getAllWatchHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const onlyInProgress = req.query.inProgress === 'true';

    let where: any = { userId };

    if (onlyInProgress) {
      // Only return scenes with resume time (partially watched)
      where.resumeTime = { not: null };
    }

    const watchHistory = await prisma.watchHistory.findMany({
      where,
      orderBy: { lastPlayedAt: 'desc' },
      take: limit,
    });

    // Parse JSON fields for each record
    const parsed = watchHistory.map((record: any) => ({
      ...record,
      oHistory: Array.isArray(record.oHistory)
        ? record.oHistory
        : JSON.parse(record.oHistory as string || '[]'),
      playHistory: Array.isArray(record.playHistory)
        ? record.playHistory
        : JSON.parse(record.playHistory as string || '[]'),
    }));

    res.json({ watchHistory: parsed });
  } catch (error) {
    logger.error('Error getting all watch history', { error });
    res.status(500).json({ error: 'Failed to get watch history' });
  }
}
