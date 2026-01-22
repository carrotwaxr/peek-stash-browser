import prisma from "../prisma/singleton.js";
import { Prisma } from "@prisma/client";

export interface ClipQueryOptions {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  isGenerated?: boolean;
  sceneId?: string;
  tagIds?: string[];
  sceneTagIds?: string[];
  performerIds?: string[];
  studioId?: string;
  q?: string;
}

/**
 * Clip data returned to the client.
 * Note: Raw Stash URLs (previewPath, screenshotPath, streamPath) are NOT exposed.
 * The client uses proxy endpoints like /api/proxy/clip/:id/preview for media.
 */
export interface ClipWithRelations {
  id: string;
  sceneId: string;
  title: string | null;
  seconds: number;
  endSeconds: number | null;
  primaryTagId: string | null;
  isGenerated: boolean;
  stashCreatedAt: Date | null;
  stashUpdatedAt: Date | null;
  primaryTag: { id: string; name: string; color: string | null } | null;
  tags: Array<{ id: string; name: string; color: string | null }>;
  scene: {
    id: string;
    title: string | null;
    pathScreenshot: string | null;
    studioId: string | null;
  };
}

export class ClipService {
  /**
   * Transform URL to proxy format
   * Handles full URLs (http://...) by extracting path+query
   */
  private transformUrl(urlOrPath: string | null): string | null {
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

    // Assume it's a relative path
    return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
  }

  /**
   * Transform clip scene data to use proxy URLs
   */
  private transformClipScene(scene: { id: string; title: string | null; pathScreenshot: string | null; studioId: string | null }) {
    return {
      ...scene,
      pathScreenshot: this.transformUrl(scene.pathScreenshot),
    };
  }

  /**
   * Transform a clip database record to the client-safe format.
   * Strips raw Stash URLs and only includes fields the client needs.
   */
  private transformClip(
    clip: {
      id: string;
      sceneId: string;
      title: string | null;
      seconds: number;
      endSeconds: number | null;
      primaryTagId: string | null;
      isGenerated: boolean;
      stashCreatedAt: Date | null;
      stashUpdatedAt: Date | null;
      primaryTag: { id: string; name: string; color: string | null } | null;
      tags: Array<{ tag: { id: string; name: string; color: string | null } }>;
      scene: { id: string; title: string | null; pathScreenshot: string | null; studioId: string | null };
    }
  ): ClipWithRelations {
    return {
      id: clip.id,
      sceneId: clip.sceneId,
      title: clip.title,
      seconds: clip.seconds,
      endSeconds: clip.endSeconds,
      primaryTagId: clip.primaryTagId,
      isGenerated: clip.isGenerated,
      stashCreatedAt: clip.stashCreatedAt,
      stashUpdatedAt: clip.stashUpdatedAt,
      primaryTag: clip.primaryTag,
      tags: clip.tags.map((ct) => ct.tag),
      scene: this.transformClipScene(clip.scene),
    };
  }

  /**
   * Get clips for a specific scene
   */
  async getClipsForScene(
    sceneId: string,
    userId: number,
    includeUngenerated = false
  ): Promise<ClipWithRelations[]> {
    const whereClause: Prisma.StashClipWhereInput = {
      sceneId,
      deletedAt: null,
    };

    if (!includeUngenerated) {
      whereClause.isGenerated = true;
    }

    // Check if scene is excluded for this user
    const isExcluded = await prisma.userExcludedEntity.findFirst({
      where: { userId, entityType: "scene", entityId: sceneId },
    });

    if (isExcluded) {
      return [];
    }

    const clips = await prisma.stashClip.findMany({
      where: whereClause,
      include: {
        primaryTag: { select: { id: true, name: true, color: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
        scene: {
          select: { id: true, title: true, pathScreenshot: true, studioId: true },
        },
      },
      orderBy: { seconds: "asc" },
    });

    return clips.map((clip) => this.transformClip(clip));
  }

  /**
   * Get clips with filtering and pagination
   */
  async getClips(
    userId: number,
    options: ClipQueryOptions = {}
  ): Promise<{ clips: ClipWithRelations[]; total: number }> {
    const {
      page = 1,
      perPage = 24,
      sortBy = "stashCreatedAt",
      sortDir = "desc",
      isGenerated,
      sceneId,
      tagIds,
      sceneTagIds,
      performerIds,
      studioId,
      q,
    } = options;

    const whereClause: Prisma.StashClipWhereInput = {
      deletedAt: null,
    };

    if (isGenerated !== undefined) {
      whereClause.isGenerated = isGenerated;
    }

    if (sceneId) {
      whereClause.sceneId = sceneId;
    }

    if (q) {
      whereClause.title = { contains: q };
    }

    if (tagIds && tagIds.length > 0) {
      whereClause.OR = [
        { primaryTagId: { in: tagIds } },
        { tags: { some: { tagId: { in: tagIds } } } },
      ];
    }

    // Scene-level filters
    const sceneFilters: Prisma.StashSceneWhereInput = {};

    if (sceneTagIds && sceneTagIds.length > 0) {
      sceneFilters.tags = { some: { tagId: { in: sceneTagIds } } };
    }

    if (performerIds && performerIds.length > 0) {
      sceneFilters.performers = { some: { performerId: { in: performerIds } } };
    }

    if (studioId) {
      sceneFilters.studioId = studioId;
    }

    if (Object.keys(sceneFilters).length > 0) {
      whereClause.scene = sceneFilters;
    }

    // Exclude clips from excluded scenes
    const excludedSceneIds = await prisma.userExcludedEntity.findMany({
      where: { userId, entityType: "scene" },
      select: { entityId: true },
    });

    if (excludedSceneIds.length > 0) {
      whereClause.sceneId = {
        ...((typeof whereClause.sceneId === 'object' ? whereClause.sceneId : {}) as object),
        notIn: excludedSceneIds.map((e) => e.entityId),
      };
    }

    const [clips, total] = await Promise.all([
      prisma.stashClip.findMany({
        where: whereClause,
        include: {
          primaryTag: { select: { id: true, name: true, color: true } },
          tags: {
            include: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
          scene: {
            select: { id: true, title: true, pathScreenshot: true, studioId: true },
          },
        },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.stashClip.count({ where: whereClause }),
    ]);

    return {
      clips: clips.map((clip) => this.transformClip(clip)),
      total,
    };
  }

  /**
   * Get a single clip by ID
   */
  async getClipById(clipId: string, userId: number): Promise<ClipWithRelations | null> {
    const clip = await prisma.stashClip.findFirst({
      where: { id: clipId, deletedAt: null },
      include: {
        primaryTag: { select: { id: true, name: true, color: true } },
        tags: {
          include: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
        scene: {
          select: { id: true, title: true, pathScreenshot: true, studioId: true },
        },
      },
    });

    if (!clip) return null;

    // Check if scene is excluded
    const isExcluded = await prisma.userExcludedEntity.findFirst({
      where: { userId, entityType: "scene", entityId: clip.sceneId },
    });

    if (isExcluded) return null;

    return this.transformClip(clip);
  }
}

export const clipService = new ClipService();
