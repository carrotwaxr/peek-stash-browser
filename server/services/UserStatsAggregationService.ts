// server/services/UserStatsAggregationService.ts

import prisma from "../prisma/singleton.js";
import type {
  UserStatsResponse,
  LibraryStats,
  EngagementStats,
  TopScene,
  TopPerformer,
  TopStudio,
  TopTag,
  HighlightScene,
  HighlightImage,
  HighlightPerformer,
} from "../types/api/index.js";

/**
 * Transform a Stash URL/path to a proxy URL
 * All Stash URLs must be proxied to avoid leaking the API key to clients
 */
export function transformUrl(urlOrPath: string | null): string | null {
  if (!urlOrPath) return null;

  // If it's already a proxy URL, return as-is
  if (urlOrPath.startsWith("/api/proxy/stash")) {
    return urlOrPath;
  }

  // If it's a full URL (http://...), extract path + query
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    try {
      const url = new URL(urlOrPath);
      const pathWithQuery = url.pathname + url.search;
      return `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
    } catch {
      // If URL parsing fails, treat as path
      return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }
  }

  // Otherwise treat as path and encode it
  return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
}

class UserStatsAggregationService {
  /**
   * Get all user stats in a single call
   * All queries respect content exclusions via UserExcludedEntity
   */
  async getUserStats(userId: number): Promise<UserStatsResponse> {
    const [
      library,
      engagement,
      topScenes,
      topPerformers,
      topStudios,
      topTags,
      mostWatchedScene,
      mostViewedImage,
      mostOdScene,
      mostOdPerformer,
    ] = await Promise.all([
      this.getLibraryStats(userId),
      this.getEngagementStats(userId),
      this.getTopScenes(userId, 5),
      this.getTopPerformers(userId, 5),
      this.getTopStudios(userId, 5),
      this.getTopTags(userId, 5),
      this.getMostWatchedScene(userId),
      this.getMostViewedImage(userId),
      this.getMostOdScene(userId),
      this.getMostOdPerformer(userId),
    ]);

    return {
      library,
      engagement,
      topScenes,
      topPerformers,
      topStudios,
      topTags,
      mostWatchedScene,
      mostViewedImage,
      mostOdScene,
      mostOdPerformer,
    };
  }

  /**
   * Get library counts from pre-computed UserEntityStats
   */
  private async getLibraryStats(userId: number): Promise<LibraryStats> {
    const stats = await prisma.userEntityStats.findMany({
      where: { userId },
      select: { entityType: true, visibleCount: true },
    });

    const statsMap = new Map(stats.map((s) => [s.entityType, s.visibleCount]));

    return {
      sceneCount: statsMap.get("scene") ?? 0,
      performerCount: statsMap.get("performer") ?? 0,
      studioCount: statsMap.get("studio") ?? 0,
      tagCount: statsMap.get("tag") ?? 0,
      galleryCount: statsMap.get("gallery") ?? 0,
      imageCount: statsMap.get("image") ?? 0,
    };
  }

  /**
   * Get engagement totals with exclusion filtering
   */
  private async getEngagementStats(userId: number): Promise<EngagementStats> {
    // Run scene and image engagement queries in parallel (both filtered by exclusions)
    const [sceneStats, imageStats] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          totalWatchTime: number | null;
          totalPlayCount: number | null;
          totalOCount: number | null;
          uniqueScenesWatched: number | null;
        }>
      >`
        SELECT
          COALESCE(SUM(w.playDuration), 0) as totalWatchTime,
          COALESCE(SUM(w.playCount), 0) as totalPlayCount,
          COALESCE(SUM(w.oCount), 0) as totalOCount,
          COUNT(DISTINCT w.sceneId) as uniqueScenesWatched
        FROM WatchHistory w
        LEFT JOIN UserExcludedEntity e
          ON e.userId = ${userId}
          AND e.entityType = 'scene'
          AND e.entityId = w.sceneId
        WHERE w.userId = ${userId}
          AND e.id IS NULL
      `,
      prisma.$queryRaw<
        Array<{
          totalImagesViewed: number | null;
          imageOCount: number | null;
        }>
      >`
        SELECT
          COUNT(DISTINCT iv.imageId) as totalImagesViewed,
          COALESCE(SUM(iv.oCount), 0) as imageOCount
        FROM ImageViewHistory iv
        LEFT JOIN UserExcludedEntity e
          ON e.userId = ${userId}
          AND e.entityType = 'image'
          AND e.entityId = iv.imageId
        WHERE iv.userId = ${userId}
          AND e.id IS NULL
      `,
    ]);

    const scene = sceneStats[0] || {};
    const image = imageStats[0] || {};

    return {
      totalWatchTime: Number(scene.totalWatchTime) || 0,
      totalPlayCount: Number(scene.totalPlayCount) || 0,
      totalOCount:
        (Number(scene.totalOCount) || 0) + (Number(image.imageOCount) || 0),
      totalImagesViewed: Number(image.totalImagesViewed) || 0,
      uniqueScenesWatched: Number(scene.uniqueScenesWatched) || 0,
    };
  }

  /**
   * Get top scenes by play count (exclusion-aware)
   */
  private async getTopScenes(
    userId: number,
    limit: number
  ): Promise<TopScene[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        sceneId: string;
        playCount: number;
        playDuration: number;
        oCount: number;
      }>
    >`
      SELECT
        w.sceneId,
        w.playCount,
        w.playDuration,
        w.oCount
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND w.playCount > 0
      ORDER BY w.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch scene details
    const scenes = await prisma.stashScene.findMany({
      where: { id: { in: stats.map((s) => s.sceneId) } },
      select: { id: true, title: true, filePath: true, pathScreenshot: true },
    });

    const sceneMap = new Map(scenes.map((s) => [s.id, s]));

    return stats.map((s) => {
      const scene = sceneMap.get(s.sceneId);
      return {
        id: s.sceneId,
        title: scene?.title ?? null,
        filePath: scene?.filePath ?? null,
        imageUrl: transformUrl(scene?.pathScreenshot ?? null),
        playCount: s.playCount,
        playDuration: Math.round(s.playDuration),
        oCount: s.oCount,
      };
    });
  }

  /**
   * Get top performers by play count (exclusion-aware)
   * Aggregates playDuration from WatchHistory via ScenePerformer join
   */
  private async getTopPerformers(
    userId: number,
    limit: number
  ): Promise<TopPerformer[]> {
    // Get top performers with aggregated playDuration from WatchHistory
    const stats = await prisma.$queryRaw<
      Array<{
        performerId: string;
        playCount: number;
        oCounter: number;
        playDuration: number;
      }>
    >`
      SELECT
        ups.performerId,
        ups.playCount,
        ups.oCounter,
        COALESCE(dur.totalDuration, 0) as playDuration
      FROM UserPerformerStats ups
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
      LEFT JOIN (
        SELECT sp.performerId, SUM(w.playDuration) as totalDuration
        FROM ScenePerformer sp
        JOIN WatchHistory w ON w.sceneId = sp.sceneId AND w.userId = ${userId}
        GROUP BY sp.performerId
      ) dur ON dur.performerId = ups.performerId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND ups.playCount > 0
      ORDER BY ups.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch performer details
    const performers = await prisma.stashPerformer.findMany({
      where: { id: { in: stats.map((s) => s.performerId) } },
      select: { id: true, name: true, imagePath: true },
    });

    const performerMap = new Map(performers.map((p) => [p.id, p]));

    return stats.map((s) => {
      const performer = performerMap.get(s.performerId);
      return {
        id: s.performerId,
        name: performer?.name ?? "Unknown",
        imageUrl: transformUrl(performer?.imagePath ?? null),
        playCount: s.playCount,
        playDuration: Math.round(Number(s.playDuration) || 0),
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get top studios by play count (exclusion-aware)
   * Aggregates playDuration from WatchHistory via StashScene.studioId
   */
  private async getTopStudios(
    userId: number,
    limit: number
  ): Promise<TopStudio[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        studioId: string;
        playCount: number;
        oCounter: number;
        playDuration: number;
      }>
    >`
      SELECT
        uss.studioId,
        uss.playCount,
        uss.oCounter,
        COALESCE(dur.totalDuration, 0) as playDuration
      FROM UserStudioStats uss
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'studio'
        AND e.entityId = uss.studioId
      LEFT JOIN (
        SELECT s.studioId, SUM(w.playDuration) as totalDuration
        FROM StashScene s
        JOIN WatchHistory w ON w.sceneId = s.id AND w.userId = ${userId}
        WHERE s.studioId IS NOT NULL
        GROUP BY s.studioId
      ) dur ON dur.studioId = uss.studioId
      WHERE uss.userId = ${userId}
        AND e.id IS NULL
        AND uss.playCount > 0
      ORDER BY uss.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch studio details
    const studios = await prisma.stashStudio.findMany({
      where: { id: { in: stats.map((s) => s.studioId) } },
      select: { id: true, name: true, imagePath: true },
    });

    const studioMap = new Map(studios.map((s) => [s.id, s]));

    return stats.map((s) => {
      const studio = studioMap.get(s.studioId);
      return {
        id: s.studioId,
        name: studio?.name ?? "Unknown",
        imageUrl: transformUrl(studio?.imagePath ?? null),
        playCount: s.playCount,
        playDuration: Math.round(Number(s.playDuration) || 0),
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get top tags by play count (exclusion-aware)
   * Aggregates playDuration from WatchHistory via SceneTag join
   */
  private async getTopTags(userId: number, limit: number): Promise<TopTag[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        tagId: string;
        playCount: number;
        oCounter: number;
        playDuration: number;
      }>
    >`
      SELECT
        uts.tagId,
        uts.playCount,
        uts.oCounter,
        COALESCE(dur.totalDuration, 0) as playDuration
      FROM UserTagStats uts
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'tag'
        AND e.entityId = uts.tagId
      LEFT JOIN (
        SELECT st.tagId, SUM(w.playDuration) as totalDuration
        FROM SceneTag st
        JOIN WatchHistory w ON w.sceneId = st.sceneId AND w.userId = ${userId}
        GROUP BY st.tagId
      ) dur ON dur.tagId = uts.tagId
      WHERE uts.userId = ${userId}
        AND e.id IS NULL
        AND uts.playCount > 0
      ORDER BY uts.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch tag details
    const tags = await prisma.stashTag.findMany({
      where: { id: { in: stats.map((s) => s.tagId) } },
      select: { id: true, name: true, imagePath: true },
    });

    const tagMap = new Map(tags.map((t) => [t.id, t]));

    return stats.map((s) => {
      const tag = tagMap.get(s.tagId);
      return {
        id: s.tagId,
        name: tag?.name ?? "Unknown",
        imageUrl: transformUrl(tag?.imagePath ?? null),
        playCount: s.playCount,
        playDuration: Math.round(Number(s.playDuration) || 0),
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get most watched scene (by play count, exclusion-aware)
   */
  private async getMostWatchedScene(
    userId: number
  ): Promise<HighlightScene | null> {
    const result = await prisma.$queryRaw<
      Array<{
        sceneId: string;
        playCount: number;
      }>
    >`
      SELECT
        w.sceneId,
        w.playCount
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND w.playCount > 0
      ORDER BY w.playCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const scene = await prisma.stashScene.findUnique({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, filePath: true, pathScreenshot: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? null,
      filePath: scene.filePath ?? null,
      imageUrl: transformUrl(scene.pathScreenshot),
      playCount: result[0].playCount,
    };
  }

  /**
   * Get most viewed image (by view count, exclusion-aware)
   */
  private async getMostViewedImage(
    userId: number
  ): Promise<HighlightImage | null> {
    const result = await prisma.$queryRaw<
      Array<{
        imageId: string;
        viewCount: number;
      }>
    >`
      SELECT
        iv.imageId,
        iv.viewCount
      FROM ImageViewHistory iv
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'image'
        AND e.entityId = iv.imageId
      WHERE iv.userId = ${userId}
        AND e.id IS NULL
        AND iv.viewCount > 0
      ORDER BY iv.viewCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const image = await prisma.stashImage.findUnique({
      where: { id: result[0].imageId },
      select: { id: true, title: true, filePath: true, pathThumbnail: true },
    });

    if (!image) return null;

    return {
      id: image.id,
      title: image.title ?? null,
      filePath: image.filePath ?? null,
      imageUrl: transformUrl(image.pathThumbnail),
      viewCount: result[0].viewCount,
    };
  }

  /**
   * Get scene with most Os (exclusion-aware)
   */
  private async getMostOdScene(userId: number): Promise<HighlightScene | null> {
    const result = await prisma.$queryRaw<
      Array<{
        sceneId: string;
        oCount: number;
      }>
    >`
      SELECT
        w.sceneId,
        w.oCount
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND w.oCount > 0
      ORDER BY w.oCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const scene = await prisma.stashScene.findUnique({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, filePath: true, pathScreenshot: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? null,
      filePath: scene.filePath ?? null,
      imageUrl: transformUrl(scene.pathScreenshot),
      oCount: result[0].oCount,
    };
  }

  /**
   * Get performer with most Os (exclusion-aware)
   */
  private async getMostOdPerformer(
    userId: number
  ): Promise<HighlightPerformer | null> {
    const result = await prisma.$queryRaw<
      Array<{
        performerId: string;
        oCounter: number;
      }>
    >`
      SELECT
        ups.performerId,
        ups.oCounter
      FROM UserPerformerStats ups
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND ups.oCounter > 0
      ORDER BY ups.oCounter DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const performer = await prisma.stashPerformer.findUnique({
      where: { id: result[0].performerId },
      select: { id: true, name: true, imagePath: true },
    });

    if (!performer) return null;

    return {
      id: performer.id,
      name: performer.name ?? "Unknown",
      imageUrl: transformUrl(performer.imagePath),
      oCount: result[0].oCounter,
    };
  }
}

export const userStatsAggregationService = new UserStatsAggregationService();
export default userStatsAggregationService;
