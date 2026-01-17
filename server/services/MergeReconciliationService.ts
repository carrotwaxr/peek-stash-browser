/**
 * MergeReconciliationService
 *
 * Handles detection of merged scenes and transfer of user activity data
 * from orphaned scenes to their merge targets.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

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
}

export const mergeReconciliationService = new MergeReconciliationService();
