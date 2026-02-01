// server/services/UserStatsAggregationService.ts
/**
 * Aggregates user statistics for the My Stats page.
 *
 * Top lists are read from pre-computed UserEntityRanking table,
 * which is populated by RankingComputeService on login and engagement changes.
 *
 * Rankings use percentile-based scoring:
 * - Raw engagement: (oCount × 5) + (normalizedDuration) + (playCount)
 * - Engagement rate: raw engagement / library presence
 * - Percentile: rank among all entities user has engaged with (100 = top)
 */

import prisma from "../prisma/singleton.js";

/**
 * Valid sort options for top lists
 */
export type TopListSortBy = "engagement" | "oCount" | "playCount";

/**
 * Options for getUserStats
 */
export interface UserStatsOptions {
  sortBy?: TopListSortBy;
}
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
 * @param urlOrPath - The URL or path to transform
 * @param instanceId - Optional Stash instance ID for multi-instance routing
 */
export function transformUrl(urlOrPath: string | null, instanceId?: string | null): string | null {
  if (!urlOrPath) return null;

  // If it's already a proxy URL, return as-is
  if (urlOrPath.startsWith("/api/proxy/stash")) {
    return urlOrPath;
  }

  let proxyPath: string;

  // If it's a full URL (http://...), extract path + query
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    try {
      const url = new URL(urlOrPath);
      const pathWithQuery = url.pathname + url.search;
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(pathWithQuery)}`;
    } catch {
      // If URL parsing fails, treat as path
      proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
    }
  } else {
    // Otherwise treat as path and encode it
    proxyPath = `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
  }

  // Add instanceId for multi-instance routing
  if (instanceId) {
    proxyPath += `&instanceId=${encodeURIComponent(instanceId)}`;
  }

  return proxyPath;
}

class UserStatsAggregationService {
  /**
   * Get all user stats in a single call
   * Top lists read from pre-computed UserEntityRanking table
   * @param userId - The user ID
   * @param options - Optional parameters for customization
   */
  async getUserStats(userId: number, options: UserStatsOptions = {}): Promise<UserStatsResponse> {
    const { sortBy = "engagement" } = options;

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
      this.getTopScenes(userId, 10, sortBy),
      this.getTopPerformers(userId, 10, sortBy),
      this.getTopStudios(userId, 10, sortBy),
      this.getTopTags(userId, 10, sortBy),
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
      clipCount: statsMap.get("clip") ?? 0,
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
   * Map sortBy option to Prisma orderBy field
   */
  private getSortField(sortBy: TopListSortBy): "percentileRank" | "oCount" | "playCount" {
    switch (sortBy) {
      case "oCount":
        return "oCount";
      case "playCount":
        return "playCount";
      case "engagement":
      default:
        return "percentileRank";
    }
  }

  /**
   * Get top scenes by the specified sort order from pre-computed rankings
   */
  private async getTopScenes(userId: number, limit: number, sortBy: TopListSortBy = "engagement"): Promise<TopScene[]> {
    // Query pre-computed rankings
    const rankings = await prisma.userEntityRanking.findMany({
      where: { userId, entityType: "scene" },
      orderBy: { [this.getSortField(sortBy)]: "desc" },
      take: limit,
    });

    if (rankings.length === 0) return [];

    // Fetch scene details including stashInstanceId for proxy routing
    const scenes = await prisma.stashScene.findMany({
      where: { id: { in: rankings.map((r) => r.entityId) } },
      select: { id: true, title: true, filePath: true, pathScreenshot: true, stashInstanceId: true },
    });

    const sceneMap = new Map(scenes.map((s) => [s.id, s]));

    return rankings.map((r) => {
      const scene = sceneMap.get(r.entityId);
      return {
        id: r.entityId,
        title: scene?.title ?? null,
        filePath: scene?.filePath ?? null,
        imageUrl: transformUrl(scene?.pathScreenshot ?? null, scene?.stashInstanceId),
        playCount: r.playCount,
        playDuration: Math.round(r.playDuration),
        oCount: r.oCount,
        score: r.percentileRank,
      };
    });
  }

  /**
   * Get top performers by the specified sort order from pre-computed rankings
   */
  private async getTopPerformers(userId: number, limit: number, sortBy: TopListSortBy = "engagement"): Promise<TopPerformer[]> {
    // Query pre-computed rankings
    const rankings = await prisma.userEntityRanking.findMany({
      where: { userId, entityType: "performer" },
      orderBy: { [this.getSortField(sortBy)]: "desc" },
      take: limit,
    });

    if (rankings.length === 0) return [];

    // Fetch performer details including stashInstanceId for proxy routing
    const performers = await prisma.stashPerformer.findMany({
      where: { id: { in: rankings.map((r) => r.entityId) } },
      select: { id: true, name: true, imagePath: true, stashInstanceId: true },
    });

    const performerMap = new Map(performers.map((p) => [p.id, p]));

    return rankings.map((r) => {
      const performer = performerMap.get(r.entityId);
      return {
        id: r.entityId,
        name: performer?.name ?? "Unknown",
        imageUrl: transformUrl(performer?.imagePath ?? null, performer?.stashInstanceId),
        playCount: r.playCount,
        playDuration: Math.round(r.playDuration),
        oCount: r.oCount,
        score: r.percentileRank,
      };
    });
  }

  /**
   * Get top studios by the specified sort order from pre-computed rankings
   */
  private async getTopStudios(userId: number, limit: number, sortBy: TopListSortBy = "engagement"): Promise<TopStudio[]> {
    // Query pre-computed rankings
    const rankings = await prisma.userEntityRanking.findMany({
      where: { userId, entityType: "studio" },
      orderBy: { [this.getSortField(sortBy)]: "desc" },
      take: limit,
    });

    if (rankings.length === 0) return [];

    // Fetch studio details including stashInstanceId for proxy routing
    const studios = await prisma.stashStudio.findMany({
      where: { id: { in: rankings.map((r) => r.entityId) } },
      select: { id: true, name: true, imagePath: true, stashInstanceId: true },
    });

    const studioMap = new Map(studios.map((s) => [s.id, s]));

    return rankings.map((r) => {
      const studio = studioMap.get(r.entityId);
      return {
        id: r.entityId,
        name: studio?.name ?? "Unknown",
        imageUrl: transformUrl(studio?.imagePath ?? null, studio?.stashInstanceId),
        playCount: r.playCount,
        playDuration: Math.round(r.playDuration),
        oCount: r.oCount,
        score: r.percentileRank,
      };
    });
  }

  /**
   * Get top tags by the specified sort order from pre-computed rankings
   */
  private async getTopTags(userId: number, limit: number, sortBy: TopListSortBy = "engagement"): Promise<TopTag[]> {
    // Query pre-computed rankings
    const rankings = await prisma.userEntityRanking.findMany({
      where: { userId, entityType: "tag" },
      orderBy: { [this.getSortField(sortBy)]: "desc" },
      take: limit,
    });

    if (rankings.length === 0) return [];

    // Fetch tag details including stashInstanceId for proxy routing
    const tags = await prisma.stashTag.findMany({
      where: { id: { in: rankings.map((r) => r.entityId) } },
      select: { id: true, name: true, imagePath: true, stashInstanceId: true },
    });

    const tagMap = new Map(tags.map((t) => [t.id, t]));

    return rankings.map((r) => {
      const tag = tagMap.get(r.entityId);
      return {
        id: r.entityId,
        name: tag?.name ?? "Unknown",
        imageUrl: transformUrl(tag?.imagePath ?? null, tag?.stashInstanceId),
        playCount: r.playCount,
        playDuration: Math.round(r.playDuration),
        oCount: r.oCount,
        score: r.percentileRank,
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

    // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
    const scene = await prisma.stashScene.findFirst({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, filePath: true, pathScreenshot: true, stashInstanceId: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? null,
      filePath: scene.filePath ?? null,
      imageUrl: transformUrl(scene.pathScreenshot, scene.stashInstanceId),
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

    // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
    const image = await prisma.stashImage.findFirst({
      where: { id: result[0].imageId },
      select: { id: true, title: true, filePath: true, pathThumbnail: true, stashInstanceId: true },
    });

    if (!image) return null;

    return {
      id: image.id,
      title: image.title ?? null,
      filePath: image.filePath ?? null,
      imageUrl: transformUrl(image.pathThumbnail, image.stashInstanceId),
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

    // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
    const scene = await prisma.stashScene.findFirst({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, filePath: true, pathScreenshot: true, stashInstanceId: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? null,
      filePath: scene.filePath ?? null,
      imageUrl: transformUrl(scene.pathScreenshot, scene.stashInstanceId),
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

    // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
    const performer = await prisma.stashPerformer.findFirst({
      where: { id: result[0].performerId },
      select: { id: true, name: true, imagePath: true, stashInstanceId: true },
    });

    if (!performer) return null;

    return {
      id: performer.id,
      name: performer.name ?? "Unknown",
      imageUrl: transformUrl(performer.imagePath, performer.stashInstanceId),
      oCount: result[0].oCounter,
    };
  }
}

export const userStatsAggregationService = new UserStatsAggregationService();
export default userStatsAggregationService;
