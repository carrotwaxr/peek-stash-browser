/**
 * Cached Entity Query Service
 *
 * Provides methods to query cached entities from SQLite database.
 * Replaces direct StashCacheManager access with database queries.
 *
 * This is a transitional layer that maintains compatibility with existing
 * controller patterns while using the new SQLite cache.
 */

import prisma from "../prisma/singleton.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Default user fields for scenes (when no user data is merged)
 */
const DEFAULT_SCENE_USER_FIELDS = {
  rating: null,
  rating100: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
  play_duration: 0,
  resume_time: 0,
  play_history: [],
  o_history: [],
  last_played_at: null,
  last_o_at: null,
};

/**
 * Default user fields for performers
 */
const DEFAULT_PERFORMER_USER_FIELDS = {
  rating: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
  last_played_at: null,
  last_o_at: null,
};

/**
 * Default user fields for studios
 */
const DEFAULT_STUDIO_USER_FIELDS = {
  rating: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
};

/**
 * Default user fields for tags
 */
const DEFAULT_TAG_USER_FIELDS = {
  rating: null,
  rating100: null,
  favorite: false,
  o_counter: 0,
  play_count: 0,
};

/**
 * Default user fields for galleries
 */
const DEFAULT_GALLERY_USER_FIELDS = {
  rating: null,
  favorite: false,
};

/**
 * Default user fields for groups
 */
const DEFAULT_GROUP_USER_FIELDS = {
  rating: null,
  favorite: false,
};

class CachedEntityQueryService {
  // Columns to select for browse queries (excludes heavy streams/data columns)
  private readonly BROWSE_SELECT = {
    id: true,
    stashInstanceId: true,
    title: true,
    code: true,
    date: true,
    studioId: true,
    rating100: true,
    duration: true,
    organized: true,
    details: true,
    filePath: true,
    fileBitRate: true,
    fileFrameRate: true,
    fileWidth: true,
    fileHeight: true,
    fileVideoCodec: true,
    fileAudioCodec: true,
    fileSize: true,
    pathScreenshot: true,
    pathPreview: true,
    pathSprite: true,
    pathVtt: true,
    pathChaptersVtt: true,
    pathStream: true,
    pathCaption: true,
    // Explicitly NOT selecting: streams, data
    oCounter: true,
    playCount: true,
    playDuration: true,
    stashCreatedAt: true,
    stashUpdatedAt: true,
    syncedAt: true,
    deletedAt: true,
  } as const;

  // ==================== Scene Queries ====================

  /**
   * Get all scenes from cache
   * Returns scenes with default user fields (not merged with user-specific data)
   */
  async getAllScenes(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.cachedScene.findMany({
      where: { deletedAt: null },
      select: this.BROWSE_SELECT,
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformSceneForBrowse(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllScenes: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get scene by ID (includes related entities)
   */
  async getScene(id: string): Promise<NormalizedScene | null> {
    const cached = await prisma.cachedScene.findFirst({
      where: { id, deletedAt: null },
      include: {
        performers: { include: { performer: true } },
        tags: { include: { tag: true } },
        groups: { include: { group: true } },
        galleries: { include: { gallery: true } },
      },
    });

    if (!cached) return null;
    return this.transformSceneWithRelations(cached);
  }

  /**
   * Get scenes by IDs
   */
  async getScenesByIds(ids: string[]): Promise<NormalizedScene[]> {
    const cached = await prisma.cachedScene.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformScene(c));
  }

  /**
   * Get total scene count
   */
  async getSceneCount(): Promise<number> {
    return prisma.cachedScene.count({
      where: { deletedAt: null },
    });
  }

  /**
   * Search scenes using FTS5
   */
  async searchScenes(query: string, limit = 100): Promise<NormalizedScene[]> {
    try {
      // Use raw SQL for FTS5 search - select all scene columns
      const results = await prisma.$queryRaw<any[]>`
        SELECT s.*
        FROM scene_fts
        INNER JOIN CachedScene s ON scene_fts.id = s.id
        WHERE scene_fts MATCH ${query}
          AND s.deletedAt IS NULL
        ORDER BY rank
        LIMIT ${limit}
      `;

      return results.map((r) => this.transformScene(r));
    } catch (error) {
      // FTS might fail with special characters, fall back to LIKE search
      logger.warn("FTS5 search failed, falling back to LIKE", { error });
      return this.searchScenesLike(query, limit);
    }
  }

  /**
   * Fallback LIKE search for scenes
   */
  private async searchScenesLike(
    query: string,
    limit: number
  ): Promise<NormalizedScene[]> {
    const cached = await prisma.cachedScene.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: query } },
          { code: { contains: query } },
        ],
      },
      take: limit,
    });

    return cached.map((c) => this.transformScene(c));
  }

  // ==================== Performer Queries ====================

  /**
   * Get all performers from cache
   */
  async getAllPerformers(): Promise<NormalizedPerformer[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.cachedPerformer.findMany({
      where: { deletedAt: null },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformPerformer(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllPerformers: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get performer by ID
   */
  async getPerformer(id: string): Promise<NormalizedPerformer | null> {
    const cached = await prisma.cachedPerformer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformPerformer(cached);
  }

  /**
   * Get performers by IDs
   */
  async getPerformersByIds(ids: string[]): Promise<NormalizedPerformer[]> {
    const cached = await prisma.cachedPerformer.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformPerformer(c));
  }

  /**
   * Get total performer count
   */
  async getPerformerCount(): Promise<number> {
    return prisma.cachedPerformer.count({
      where: { deletedAt: null },
    });
  }

  /**
   * Search performers using FTS5
   */
  async searchPerformers(query: string, limit = 100): Promise<NormalizedPerformer[]> {
    try {
      const results = await prisma.$queryRaw<any[]>`
        SELECT p.*
        FROM performer_fts
        INNER JOIN CachedPerformer p ON performer_fts.id = p.id
        WHERE performer_fts MATCH ${query}
          AND p.deletedAt IS NULL
        ORDER BY rank
        LIMIT ${limit}
      `;

      return results.map((r) => this.transformPerformer(r));
    } catch (error) {
      logger.warn("FTS5 performer search failed, falling back to LIKE", { error });
      const cached = await prisma.cachedPerformer.findMany({
        where: {
          deletedAt: null,
          name: { contains: query },
        },
        take: limit,
      });
      return cached.map((c) => this.transformPerformer(c));
    }
  }

  // ==================== Studio Queries ====================

  /**
   * Get all studios from cache
   */
  async getAllStudios(): Promise<NormalizedStudio[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.cachedStudio.findMany({
      where: { deletedAt: null },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformStudio(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllStudios: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get studio by ID
   */
  async getStudio(id: string): Promise<NormalizedStudio | null> {
    const cached = await prisma.cachedStudio.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformStudio(cached);
  }

  /**
   * Get studios by IDs
   */
  async getStudiosByIds(ids: string[]): Promise<NormalizedStudio[]> {
    const cached = await prisma.cachedStudio.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformStudio(c));
  }

  /**
   * Get total studio count
   */
  async getStudioCount(): Promise<number> {
    return prisma.cachedStudio.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Tag Queries ====================

  /**
   * Get all tags from cache
   */
  async getAllTags(): Promise<NormalizedTag[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.cachedTag.findMany({
      where: { deletedAt: null },
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformTag(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllTags: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }

  /**
   * Get tag by ID
   */
  async getTag(id: string): Promise<NormalizedTag | null> {
    const cached = await prisma.cachedTag.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformTag(cached);
  }

  /**
   * Get tags by IDs
   */
  async getTagsByIds(ids: string[]): Promise<NormalizedTag[]> {
    const cached = await prisma.cachedTag.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformTag(c));
  }

  /**
   * Get total tag count
   */
  async getTagCount(): Promise<number> {
    return prisma.cachedTag.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Gallery Queries ====================

  /**
   * Get all galleries from cache
   */
  async getAllGalleries(): Promise<NormalizedGallery[]> {
    const cached = await prisma.cachedGallery.findMany({
      where: { deletedAt: null },
    });

    return cached.map((c) => this.transformGallery(c));
  }

  /**
   * Get gallery by ID
   */
  async getGallery(id: string): Promise<NormalizedGallery | null> {
    const cached = await prisma.cachedGallery.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformGallery(cached);
  }

  /**
   * Get galleries by IDs
   */
  async getGalleriesByIds(ids: string[]): Promise<NormalizedGallery[]> {
    const cached = await prisma.cachedGallery.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformGallery(c));
  }

  /**
   * Get total gallery count
   */
  async getGalleryCount(): Promise<number> {
    return prisma.cachedGallery.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Group Queries ====================

  /**
   * Get all groups from cache
   */
  async getAllGroups(): Promise<NormalizedGroup[]> {
    const cached = await prisma.cachedGroup.findMany({
      where: { deletedAt: null },
    });

    return cached.map((c) => this.transformGroup(c));
  }

  /**
   * Get group by ID
   */
  async getGroup(id: string): Promise<NormalizedGroup | null> {
    const cached = await prisma.cachedGroup.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformGroup(cached);
  }

  /**
   * Get groups by IDs
   */
  async getGroupsByIds(ids: string[]): Promise<NormalizedGroup[]> {
    const cached = await prisma.cachedGroup.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformGroup(c));
  }

  /**
   * Get total group count
   */
  async getGroupCount(): Promise<number> {
    return prisma.cachedGroup.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Image Queries ====================

  /**
   * Get all images from cache
   */
  async getAllImages(): Promise<any[]> {
    const cached = await prisma.cachedImage.findMany({
      where: { deletedAt: null },
    });

    return cached.map((c) => this.transformImage(c));
  }

  /**
   * Get image by ID
   */
  async getImage(id: string): Promise<any | null> {
    const cached = await prisma.cachedImage.findFirst({
      where: { id, deletedAt: null },
    });

    if (!cached) return null;
    return this.transformImage(cached);
  }

  /**
   * Get images by IDs
   */
  async getImagesByIds(ids: string[]): Promise<any[]> {
    const cached = await prisma.cachedImage.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });

    return cached.map((c) => this.transformImage(c));
  }

  /**
   * Get total image count
   */
  async getImageCount(): Promise<number> {
    return prisma.cachedImage.count({
      where: { deletedAt: null },
    });
  }

  // ==================== Stats/Aggregation Queries ====================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    scenes: number;
    performers: number;
    studios: number;
    tags: number;
    galleries: number;
    groups: number;
    images: number;
  }> {
    const [scenes, performers, studios, tags, galleries, groups, images] =
      await Promise.all([
        this.getSceneCount(),
        this.getPerformerCount(),
        this.getStudioCount(),
        this.getTagCount(),
        this.getGalleryCount(),
        this.getGroupCount(),
        this.getImageCount(),
      ]);

    return { scenes, performers, studios, tags, galleries, groups, images };
  }

  /**
   * Check if cache is ready (has data)
   */
  async isReady(): Promise<boolean> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: "scene" },
    });

    return !!(syncState?.lastFullSync || syncState?.lastIncrementalSync);
  }

  /**
   * Get last refresh time
   */
  async getLastRefreshed(): Promise<Date | null> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: "scene" },
      orderBy: { lastFullSync: "desc" },
    });

    return syncState?.lastFullSync || syncState?.lastIncrementalSync || null;
  }

  /**
   * Get cache version for FilteredEntityCacheService compatibility
   * Uses the last sync timestamp as a version number
   */
  async getCacheVersion(): Promise<number> {
    const syncState = await prisma.syncState.findFirst({
      where: { entityType: "scene" },
    });

    // Use the last sync time as a cache version (convert to integer timestamp)
    const lastSync = syncState?.lastIncrementalSync || syncState?.lastFullSync;
    return lastSync ? lastSync.getTime() : 0;
  }

  // ==================== Data Transform Helpers ====================

  /**
   * Generate scene stream URLs on-demand
   * All scenes have the same stream formats - only the ID varies
   * This eliminates storing ~4.4KB of redundant JSON per scene
   * Public so it can be used to populate streams for scene detail views
   */
  public generateSceneStreams(sceneId: string): Array<{url: string; mime_type: string; label: string}> {
    const formats = [
      { ext: '', mime: 'video/mp4', label: 'Direct stream', resolution: null },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4', resolution: 'ORIGINAL' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Low (240p)', resolution: 'LOW' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM', resolution: 'ORIGINAL' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Standard (480p)', resolution: 'STANDARD' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Low (240p)', resolution: 'LOW' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS', resolution: 'ORIGINAL' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Standard (480p)', resolution: 'STANDARD' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Low (240p)', resolution: 'LOW' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH', resolution: 'ORIGINAL' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Low (240p)', resolution: 'LOW' },
    ];

    return formats.map(f => {
      const basePath = `/scene/${sceneId}/stream${f.ext}`;
      const fullPath = f.resolution ? `${basePath}?resolution=${f.resolution}` : basePath;
      return {
        url: `/api/proxy/stash?path=${encodeURIComponent(fullPath)}`,
        mime_type: f.mime,
        label: f.label,
      };
    });
  }

  private transformScene(scene: any): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize ? Number(scene.fileSize) : null,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Generate streams on-demand (no longer stored in DB)
      sceneStreams: this.generateSceneStreams(scene.id),

      // Stash counters (override defaults)
      o_counter: scene.oCounter ?? 0,
      play_count: scene.playCount ?? 0,
      play_duration: scene.playDuration ?? 0,

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString() ?? null,
      updated_at: scene.stashUpdatedAt?.toISOString() ?? null,

      // Nested entities (empty - loaded separately or via include)
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
  }

  /**
   * Transform scene for browse queries (no streams - generated on demand)
   */
  private transformSceneForBrowse(scene: any): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize ? Number(scene.fileSize) : null,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Empty sceneStreams for browse - generated on demand for playback
      sceneStreams: [],

      // Stash counters (override defaults)
      o_counter: scene.oCounter ?? 0,
      play_count: scene.playCount ?? 0,
      play_duration: scene.playDuration ?? 0,

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString() ?? null,
      updated_at: scene.stashUpdatedAt?.toISOString() ?? null,

      // Nested entities (empty - loaded separately or via include)
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
  }

  private transformSceneWithRelations(scene: any): NormalizedScene {
    const base = this.transformScene(scene);

    // Add nested entities
    if (scene.performers) {
      base.performers = scene.performers.map((sp: any) =>
        this.transformPerformer(sp.performer)
      );
    }
    if (scene.tags) {
      base.tags = scene.tags.map((st: any) =>
        this.transformTag(st.tag)
      );
    }
    if (scene.groups) {
      base.groups = scene.groups.map((sg: any) => ({
        ...this.transformGroup(sg.group),
        scene_index: sg.sceneIndex,
      }));
    }
    if (scene.galleries) {
      base.galleries = scene.galleries.map((sg: any) =>
        this.transformGallery(sg.gallery)
      );
    }

    return base;
  }

  private transformPerformer(performer: any): NormalizedPerformer {
    return {
      ...DEFAULT_PERFORMER_USER_FIELDS,
      id: performer.id,
      name: performer.name,
      disambiguation: performer.disambiguation,
      gender: performer.gender,
      birthdate: performer.birthdate,
      favorite: performer.favorite ?? false,
      rating100: performer.rating100,
      scene_count: performer.sceneCount ?? 0,
      image_count: performer.imageCount ?? 0,
      gallery_count: performer.galleryCount ?? 0,
      details: performer.details,
      alias_list: performer.aliasList ? JSON.parse(performer.aliasList) : [],
      country: performer.country,
      ethnicity: performer.ethnicity,
      hair_color: performer.hairColor,
      eye_color: performer.eyeColor,
      height_cm: performer.heightCm,
      weight: performer.weightKg,
      measurements: performer.measurements,
      tattoos: performer.tattoos,
      piercings: performer.piercings,
      career_length: performer.careerLength,
      death_date: performer.deathDate,
      url: performer.url,
      image_path: this.transformUrl(performer.imagePath),
      created_at: performer.stashCreatedAt?.toISOString() ?? null,
      updated_at: performer.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedPerformer;
  }

  private transformStudio(studio: any): NormalizedStudio {
    return {
      ...DEFAULT_STUDIO_USER_FIELDS,
      id: studio.id,
      name: studio.name,
      parent_studio: studio.parentId ? { id: studio.parentId } : null,
      favorite: studio.favorite ?? false,
      rating100: studio.rating100,
      scene_count: studio.sceneCount ?? 0,
      image_count: studio.imageCount ?? 0,
      gallery_count: studio.galleryCount ?? 0,
      details: studio.details,
      url: studio.url,
      image_path: this.transformUrl(studio.imagePath),
      created_at: studio.stashCreatedAt?.toISOString() ?? null,
      updated_at: studio.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedStudio;
  }

  private transformTag(tag: any): NormalizedTag {
    return {
      ...DEFAULT_TAG_USER_FIELDS,
      id: tag.id,
      name: tag.name,
      favorite: tag.favorite ?? false,
      scene_count: tag.sceneCount ?? 0,
      image_count: tag.imageCount ?? 0,
      description: tag.description,
      parents: tag.parentIds ? JSON.parse(tag.parentIds).map((id: string) => ({ id })) : [],
      image_path: this.transformUrl(tag.imagePath),
      created_at: tag.stashCreatedAt?.toISOString() ?? null,
      updated_at: tag.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedTag;
  }

  private transformGroup(group: any): NormalizedGroup {
    return {
      ...DEFAULT_GROUP_USER_FIELDS,
      id: group.id,
      name: group.name,
      date: group.date,
      studio: group.studioId ? { id: group.studioId } : null,
      rating100: group.rating100,
      duration: group.duration,
      scene_count: group.sceneCount ?? 0,
      director: group.director,
      synopsis: group.synopsis,
      urls: group.urls ? JSON.parse(group.urls) : [],
      front_image_path: this.transformUrl(group.frontImagePath),
      back_image_path: this.transformUrl(group.backImagePath),
      created_at: group.stashCreatedAt?.toISOString() ?? null,
      updated_at: group.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGroup;
  }

  private transformGallery(gallery: any): NormalizedGallery {
    return {
      ...DEFAULT_GALLERY_USER_FIELDS,
      id: gallery.id,
      title: gallery.title,
      date: gallery.date,
      studio: gallery.studioId ? { id: gallery.studioId } : null,
      rating100: gallery.rating100,
      image_count: gallery.imageCount ?? 0,
      details: gallery.details,
      url: gallery.url,
      code: gallery.code,
      folder: gallery.folderPath ? { path: gallery.folderPath } : null,
      cover: gallery.coverPath ? { paths: { thumbnail: this.transformUrl(gallery.coverPath) } } : null,
      created_at: gallery.stashCreatedAt?.toISOString() ?? null,
      updated_at: gallery.stashUpdatedAt?.toISOString() ?? null,
    } as unknown as NormalizedGallery;
  }

  private transformImage(image: any): any {
    return {
      id: image.id,
      title: image.title,
      date: image.date,
      studio: image.studioId ? { id: image.studioId } : null,
      rating100: image.rating100,
      o_counter: image.oCounter ?? 0,
      organized: image.organized ?? false,
      files: image.filePath ? [{
        path: image.filePath,
        width: image.width,
        height: image.height,
        size: image.fileSize ? Number(image.fileSize) : null,
      }] : [],
      paths: {
        thumbnail: this.transformUrl(image.pathThumbnail),
        preview: this.transformUrl(image.pathPreview),
        image: this.transformUrl(image.pathImage),
      },
      created_at: image.stashCreatedAt?.toISOString() ?? null,
      updated_at: image.stashUpdatedAt?.toISOString() ?? null,
    };
  }

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

    // Otherwise treat as path and encode it
    return `/api/proxy/stash?path=${encodeURIComponent(urlOrPath)}`;
  }
}

// Export singleton instance
export const cachedEntityQueryService = new CachedEntityQueryService();
