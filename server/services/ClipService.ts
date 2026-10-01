import type { ClipWithRelations } from "../types/api/clips.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import type {
  ClipByIdOptions,
  ClipWithRelations as RawClipWithRelations,
  SceneClipsOptions,
} from "./ClipQueryBuilder.js";
import { clipQueryBuilder } from "./ClipQueryBuilder.js";
import type { ListQueryOptions } from "./query/EntityQueryBuilder.js";

/** The clip row the endpoints answer (`shared/types/api/clips.ts`) */
export type { ClipWithRelations };

export class ClipService {
  /**
   * Transform clip from query builder to client-safe format with proxy URLs
   * and its dates as ISO strings
   */
  private transformClip(clip: RawClipWithRelations): ClipWithRelations {
    const { screenshotPath, scene, stashCreatedAt, stashUpdatedAt, ...rest } =
      clip;
    return {
      ...rest,
      stashCreatedAt: stashCreatedAt?.toISOString() ?? null,
      stashUpdatedAt: stashUpdatedAt?.toISOString() ?? null,
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
   * Get clips with filtering and pagination, as the viewer sees the library;
   * the total is null when the request asked for no count
   */
  async getClips(
    options: ListQueryOptions<"clip">
  ): Promise<{ clips: ClipWithRelations[]; total: number | null }> {
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
