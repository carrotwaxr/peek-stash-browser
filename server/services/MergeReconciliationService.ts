/**
 * MergeReconciliationService
 *
 * Handles detection of merged scenes and transfer of user activity data
 * from orphaned scenes to their merge targets.
 */
import { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Merge two JSON arrays (for oHistory and playHistory).
 * Deduplicates by stringified value and sorts.
 */
function mergeJsonArrays(arr1: unknown, arr2: unknown): string {
  const list1 = parseJsonArray(arr1);
  const list2 = parseJsonArray(arr2);
  const merged = [...list1, ...list2];
  // Deduplicate by stringified value
  const seen = new Set<string>();
  const deduped = merged.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort by timestamp/startTime if present
  deduped.sort((a, b) => {
    const aTime = typeof a === "string" ? a : (a as Record<string, unknown>).startTime || (a as Record<string, unknown>).time || "";
    const bTime = typeof b === "string" ? b : (b as Record<string, unknown>).startTime || (b as Record<string, unknown>).time || "";
    return String(aTime).localeCompare(String(bTime));
  });
  return JSON.stringify(deduped);
}

function parseJsonArray(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function laterDate(d1: Date | null, d2: Date | null): Date | null {
  if (!d1) return d2;
  if (!d2) return d1;
  return d1 > d2 ? d1 : d2;
}

export interface OrphanedSceneInfo {
  id: string;
  title: string | null;
  phash: string | null;
  deletedAt: Date;
  userActivityCount: number;
  totalPlayCount: number;
  hasRatings: boolean;
  hasFavorites: boolean;
}

export interface PhashMatch {
  sceneId: string;
  title: string | null;
  similarity: "exact" | "similar";
  recommended: boolean;
}

export interface ReconcileResult {
  sourceSceneId: string;
  targetSceneId: string;
  usersReconciled: number;
  mergeRecordsCreated: number;
}

class MergeReconciliationService {
  /**
   * Find all soft-deleted scenes that have orphaned user activity data.
   */
  async findOrphanedScenesWithActivity(): Promise<OrphanedSceneInfo[]> {
    // Find deleted scenes that have WatchHistory or SceneRating records
    const orphans = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string | null;
        phash: string | null;
        deletedAt: Date;
        watchHistoryCount: number;
        totalPlayCount: number;
        ratingCount: number;
        favoriteCount: number;
      }>
    >`
      SELECT
        s.id,
        s.title,
        s.phash,
        s.deletedAt,
        COALESCE(wh.watchHistoryCount, 0) as watchHistoryCount,
        COALESCE(wh.totalPlayCount, 0) as totalPlayCount,
        COALESCE(r.ratingCount, 0) as ratingCount,
        COALESCE(r.favoriteCount, 0) as favoriteCount
      FROM StashScene s
      LEFT JOIN (
        SELECT sceneId, COUNT(*) as watchHistoryCount, SUM(playCount) as totalPlayCount
        FROM WatchHistory
        GROUP BY sceneId
      ) wh ON wh.sceneId = s.id
      LEFT JOIN (
        SELECT sceneId, COUNT(*) as ratingCount, SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favoriteCount
        FROM SceneRating
        GROUP BY sceneId
      ) r ON r.sceneId = s.id
      WHERE s.deletedAt IS NOT NULL
        AND (wh.watchHistoryCount > 0 OR r.ratingCount > 0)
      ORDER BY s.deletedAt DESC
    `;

    return orphans.map((o) => ({
      id: o.id,
      title: o.title,
      phash: o.phash,
      deletedAt: o.deletedAt,
      userActivityCount: Number(o.watchHistoryCount) + Number(o.ratingCount),
      totalPlayCount: Number(o.totalPlayCount),
      hasRatings: Number(o.ratingCount) > 0,
      hasFavorites: Number(o.favoriteCount) > 0,
    }));
  }

  /**
   * Find potential phash matches for an orphaned scene.
   */
  async findPhashMatches(sceneId: string): Promise<PhashMatch[]> {
    const scene = await prisma.stashScene.findUnique({
      where: { id: sceneId },
      select: { phash: true, phashes: true },
    });

    if (!scene?.phash) {
      return [];
    }

    // Get all phashes for this scene
    const scenePhashes: string[] = [scene.phash];
    if (scene.phashes) {
      try {
        const parsed = JSON.parse(scene.phashes);
        if (Array.isArray(parsed)) {
          scenePhashes.push(...parsed.filter((p: string) => p !== scene.phash));
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Find non-deleted scenes with matching phash
    const matches = await prisma.stashScene.findMany({
      where: {
        id: { not: sceneId },
        deletedAt: null,
        OR: [
          { phash: { in: scenePhashes } },
          // Also check if any of our phashes appear in their phashes array
          // This is a simple string contains check for SQLite
          ...scenePhashes.map((ph) => ({ phashes: { contains: ph } })),
        ],
      },
      select: {
        id: true,
        title: true,
        phash: true,
        stashUpdatedAt: true,
      },
      orderBy: { stashUpdatedAt: "desc" },
    });

    return matches.map((m, index) => ({
      sceneId: m.id,
      title: m.title,
      similarity: "exact" as const,
      recommended: index === 0, // Recommend the most recently updated
    }));
  }

  /**
   * Transfer user activity data from source scene to target scene.
   * Creates a MergeRecord for audit.
   */
  async transferUserData(
    sourceSceneId: string,
    targetSceneId: string,
    userId: number,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<{ success: boolean; mergeRecordId?: string }> {
    const sourceHistory = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
    });

    const sourceRating = await prisma.sceneRating.findUnique({
      where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
    });

    if (!sourceHistory && !sourceRating) {
      return { success: false }; // Nothing to transfer
    }

    // Transfer WatchHistory
    if (sourceHistory) {
      const targetHistory = await prisma.watchHistory.findUnique({
        where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      });

      if (targetHistory) {
        // Merge with existing
        await prisma.watchHistory.update({
          where: { userId_sceneId: { userId, sceneId: targetSceneId } },
          data: {
            playCount: targetHistory.playCount + sourceHistory.playCount,
            playDuration: targetHistory.playDuration + sourceHistory.playDuration,
            oCount: targetHistory.oCount + sourceHistory.oCount,
            oHistory: mergeJsonArrays(targetHistory.oHistory, sourceHistory.oHistory),
            playHistory: mergeJsonArrays(targetHistory.playHistory, sourceHistory.playHistory),
            lastPlayedAt: laterDate(targetHistory.lastPlayedAt, sourceHistory.lastPlayedAt),
            // resumeTime: keep target's (survivor wins)
          },
        });
      } else {
        // Create new record for target
        await prisma.watchHistory.create({
          data: {
            userId,
            sceneId: targetSceneId,
            playCount: sourceHistory.playCount,
            playDuration: sourceHistory.playDuration,
            resumeTime: sourceHistory.resumeTime,
            lastPlayedAt: sourceHistory.lastPlayedAt,
            oCount: sourceHistory.oCount,
            oHistory: sourceHistory.oHistory as Prisma.InputJsonValue,
            playHistory: sourceHistory.playHistory as Prisma.InputJsonValue,
          },
        });
      }
    }

    // Transfer SceneRating
    if (sourceRating) {
      const targetRating = await prisma.sceneRating.findUnique({
        where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      });

      if (targetRating) {
        // Merge: survivor wins for rating, OR for favorite
        await prisma.sceneRating.update({
          where: { userId_sceneId: { userId, sceneId: targetSceneId } },
          data: {
            rating: targetRating.rating ?? sourceRating.rating,
            favorite: targetRating.favorite || sourceRating.favorite,
          },
        });
      } else {
        // Create new record for target
        await prisma.sceneRating.create({
          data: {
            userId,
            sceneId: targetSceneId,
            rating: sourceRating.rating,
            favorite: sourceRating.favorite,
          },
        });
      }
    }

    // Create audit record
    const mergeRecord = await prisma.mergeRecord.create({
      data: {
        sourceSceneId,
        targetSceneId,
        matchedByPhash,
        userId,
        playCountTransferred: sourceHistory?.playCount ?? 0,
        playDurationTransferred: sourceHistory?.playDuration ?? 0,
        oCountTransferred: sourceHistory?.oCount ?? 0,
        ratingTransferred: sourceRating?.rating,
        favoriteTransferred: sourceRating?.favorite ?? false,
        reconciledBy,
        automatic: reconciledBy === null,
      },
    });

    // Delete source records after successful transfer
    if (sourceHistory) {
      await prisma.watchHistory.delete({
        where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
      });
    }
    if (sourceRating) {
      await prisma.sceneRating.delete({
        where: { userId_sceneId: { userId, sceneId: sourceSceneId } },
      });
    }

    logger.info(`Transferred user data from scene ${sourceSceneId} to ${targetSceneId} for user ${userId}`);

    return { success: true, mergeRecordId: mergeRecord.id };
  }

  /**
   * Reconcile all user data for a source scene to a target scene.
   */
  async reconcileScene(
    sourceSceneId: string,
    targetSceneId: string,
    matchedByPhash: string | null,
    reconciledBy: number | null
  ): Promise<ReconcileResult> {
    // Find all users with activity on the source scene
    const usersWithHistory = await prisma.watchHistory.findMany({
      where: { sceneId: sourceSceneId },
      select: { userId: true },
    });

    const usersWithRatings = await prisma.sceneRating.findMany({
      where: { sceneId: sourceSceneId },
      select: { userId: true },
    });

    // Combine and deduplicate user IDs
    const userIds = [...new Set([
      ...usersWithHistory.map((h) => h.userId),
      ...usersWithRatings.map((r) => r.userId),
    ])];

    let mergeRecordsCreated = 0;

    for (const userId of userIds) {
      const result = await this.transferUserData(
        sourceSceneId,
        targetSceneId,
        userId,
        matchedByPhash,
        reconciledBy
      );
      if (result.success) {
        mergeRecordsCreated++;
      }
    }

    logger.info(`Reconciled ${mergeRecordsCreated} users from scene ${sourceSceneId} to ${targetSceneId}`);

    return {
      sourceSceneId,
      targetSceneId,
      usersReconciled: userIds.length,
      mergeRecordsCreated,
    };
  }

  /**
   * Discard orphaned user data for a scene (delete WatchHistory and SceneRating).
   */
  async discardOrphanedData(sceneId: string): Promise<{ watchHistoryDeleted: number; ratingsDeleted: number }> {
    const watchHistoryResult = await prisma.watchHistory.deleteMany({
      where: { sceneId },
    });

    const ratingsResult = await prisma.sceneRating.deleteMany({
      where: { sceneId },
    });

    logger.info(`Discarded orphaned data for scene ${sceneId}: ${watchHistoryResult.count} watch history, ${ratingsResult.count} ratings`);

    return {
      watchHistoryDeleted: watchHistoryResult.count,
      ratingsDeleted: ratingsResult.count,
    };
  }
}

export const mergeReconciliationService = new MergeReconciliationService();
