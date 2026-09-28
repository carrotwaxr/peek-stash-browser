import { toProxyUrl } from "../utils/proxyUrl.js";
import type {
  ClipQueryOptions as QueryBuilderOptions,
  ClipWithRelations as RawClipWithRelations,
} from "./ClipQueryBuilder.js";
import { clipQueryBuilder } from "./ClipQueryBuilder.js";

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
  randomSeed?: number; // Seed for consistent random ordering
  allowedInstanceIds?: string[];
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
  screenshotUrl: string | null;
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
   * Transform clip from query builder to client-safe format with proxy URLs
   */
  private transformClip(clip: RawClipWithRelations): ClipWithRelations {
    const { screenshotPath, scene, ...rest } = clip;
    return {
      ...rest,
      screenshotUrl: toProxyUrl(screenshotPath, scene.stashInstanceId),
      scene: {
        id: scene.id,
        title: scene.title,
        pathScreenshot: toProxyUrl(scene.pathScreenshot, scene.stashInstanceId),
        studioId: scene.studioId,
      },
    };
  }

  /**
   * Get clips for a specific scene
   */
  async getClipsForScene(
    sceneId: string,
    userId: number,
    includeUngenerated = false,
    allowedInstanceIds?: string[]
  ): Promise<ClipWithRelations[]> {
    const clips = await clipQueryBuilder.getClipsForScene(
      sceneId,
      userId,
      includeUngenerated,
      allowedInstanceIds
    );
    return clips.map((clip) => this.transformClip(clip));
  }

  /**
   * Get clips with filtering and pagination
   * Uses SQL-native query builder with JOIN-based exclusions to avoid P2029 parameter limit errors
   */
  async getClips(
    userId: number,
    options: ClipQueryOptions = {}
  ): Promise<{ clips: ClipWithRelations[]; total: number }> {
    const queryOptions: QueryBuilderOptions = {
      userId,
      ...options,
    };

    const result = await clipQueryBuilder.getClips(queryOptions);

    return {
      clips: result.clips.map((clip) => this.transformClip(clip)),
      total: result.total,
    };
  }

  /**
   * Get a single clip by ID
   */
  async getClipById(
    clipId: string,
    userId: number
  ): Promise<ClipWithRelations | null> {
    const clip = await clipQueryBuilder.getClipById(clipId, userId);
    if (!clip) return null;
    return this.transformClip(clip);
  }
}

export const clipService = new ClipService();
