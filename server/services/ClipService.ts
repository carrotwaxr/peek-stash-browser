import { toProxyUrl } from "../utils/proxyUrl.js";
import type {
  ClipByIdOptions,
  ClipWithRelations as RawClipWithRelations,
  SceneClipsOptions,
} from "./ClipQueryBuilder.js";
import { clipQueryBuilder } from "./ClipQueryBuilder.js";
import type { ListQueryOptions } from "./query/EntityQueryBuilder.js";

/**
 * Clip data returned to the client, with its instance and its scene's.
 * Note: Raw Stash URLs (previewPath, screenshotPath, streamPath) are NOT exposed.
 * The client uses proxy endpoints like /api/proxy/clip/:id/preview for media.
 */
export interface ClipWithRelations {
  id: string;
  instanceId: string;
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
    instanceId: string;
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
        instanceId: scene.stashInstanceId,
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
    options: SceneClipsOptions
  ): Promise<ClipWithRelations[]> {
    const clips = await clipQueryBuilder.getClipsForScene(options);
    return clips.map((clip) => this.transformClip(clip));
  }

  /**
   * Get clips with filtering and pagination, as the viewer sees the library
   */
  async getClips(
    options: ListQueryOptions<"clip">
  ): Promise<{ clips: ClipWithRelations[]; total: number }> {
    const { items, total } = await clipQueryBuilder.execute(options);
    return {
      clips: items.map((clip) => this.transformClip(clip)),
      total,
    };
  }

  /**
   * The clips a ref names: one for an id:instanceId, one per instance
   * holding a bare id
   */
  async getClipById(options: ClipByIdOptions): Promise<ClipWithRelations[]> {
    const clips = await clipQueryBuilder.getClipById(options);
    return clips.map((clip) => this.transformClip(clip));
  }
}

export const clipService = new ClipService();
