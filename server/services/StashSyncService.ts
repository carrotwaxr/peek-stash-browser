/**
 * Stash Sync Service
 *
 * Handles syncing entities from Stash to the local SQLite cache.
 * Supports both full sync (all entities) and incremental sync (only changed).
 *
 * Key features:
 * - Paginated fetches (5000 per batch) to avoid memory issues
 * - Incremental sync via updated_at timestamps
 * - Junction table management for many-to-many relationships
 * - Progress events for UI feedback
 * - Soft delete for removed entities
 */

import { EventEmitter } from "events";
import type { Gallery, Group, Performer, Scene, Studio, Tag } from "stashapp-api";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
// Transform functions no longer needed - URLs transformed at read time
import { stashInstanceManager } from "./StashInstanceManager.js";
import { userStatsService } from "./UserStatsService.js";

export interface SyncProgress {
  entityType: string;
  phase: "fetching" | "processing" | "complete" | "error";
  current: number;
  total: number;
  message?: string;
}

export interface SyncResult {
  entityType: string;
  synced: number;
  deleted: number;
  durationMs: number;
  error?: string;
}

type EntityType = "scene" | "performer" | "studio" | "tag" | "group" | "gallery" | "image";

// Constants for sync configuration
const BATCH_SIZE = 500; // Number of entities to fetch per page

/**
 * Validate that an entity ID is safe for SQL insertion.
 * Stash IDs are typically numeric strings or UUIDs.
 * This provides defense-in-depth against SQL injection.
 */
function validateEntityId(id: string): boolean {
  // Allow alphanumeric, hyphens (UUIDs), and underscores
  // Most Stash IDs are numeric, but UUIDs are possible
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

class StashSyncService extends EventEmitter {
  private syncInProgress = false;
  private readonly PAGE_SIZE = BATCH_SIZE;
  private abortController: AbortController | null = null;
  private batchItemCount = 0; // Track items within current batch for progress logging

  /**
   * Escape a string for SQL, handling quotes
   */
  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Escape a nullable string for SQL
   * Returns 'value' or NULL
   */
  private escapeNullable(value: string | null | undefined): string {
    if (value === null || value === undefined) return "NULL";
    return `'${this.escape(value)}'`;
  }

  /**
   * Check if a sync is currently in progress
   */
  isSyncing(): boolean {
    return this.syncInProgress;
  }

  /**
   * Abort current sync if running
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info("Sync abort requested");
    }
  }

  /**
   * Full sync - fetches all entities from Stash
   * Used on first run or when incremental sync fails
   */
  async fullSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting full sync...");

      // Sync each entity type in order (dependencies first)
      // Tags must be synced first since other entities reference them via junction tables
      // Save state after each entity so restarts don't re-sync completed types
      let result: SyncResult;

      result = await this.syncTags(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncStudios(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncPerformers(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncGroups(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncGalleries(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncScenes(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncImages(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      // Rebuild user stats to reflect current entity relationships
      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      const duration = Date.now() - startTime;
      logger.info("Full sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced })),
      });

      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === "Sync aborted") {
        logger.info("Full sync aborted by user");
      } else {
        logger.error("Full sync failed", { error: errorMsg });
      }

      throw error;
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Smart incremental sync - checks each entity type independently
   * - Skips entities with no changes since last sync
   * - Re-syncs entities that never completed
   * - Uses per-entity-type timestamps for incremental updates
   */
  async smartIncrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      logger.warn("Sync already in progress, skipping");
      return [];
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting smart incremental sync...");

      // Entity types in dependency order
      const entityTypes: EntityType[] = [
        "studio",
        "tag",
        "performer",
        "group",
        "gallery",
        "scene",
        "image",
      ];

      for (const entityType of entityTypes) {
        this.checkAbort();

        // Get sync state for this specific entity type
        const syncState = await this.getEntitySyncState(stashInstanceId, entityType);
        const lastSync = syncState?.lastFullSync || syncState?.lastIncrementalSync;

        if (!lastSync) {
          // Never synced - do full sync for this entity type only
          logger.info(`${entityType}: No previous sync, syncing all`);
          const result = await this.syncEntityType(entityType, stashInstanceId, true);
          results.push(result);
          await this.saveSyncState(stashInstanceId, "full", result);
        } else {
          // Check how many entities changed since last sync
          const changeCount = await this.getChangeCount(entityType, lastSync, stashInstanceId);

          if (changeCount === 0) {
            logger.info(`${entityType}: No changes since ${lastSync.toISOString()}, skipping`);
            results.push({
              entityType,
              synced: 0,
              deleted: 0,
              durationMs: 0,
            });
          } else {
            logger.info(
              `${entityType}: ${changeCount} changes since ${lastSync.toISOString()}, syncing`
            );
            const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
            results.push(result);
            await this.saveSyncState(stashInstanceId, "incremental", result);
          }
        }
      }

      const duration = Date.now() - startTime;
      logger.info("Smart incremental sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced })),
      });

      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === "Sync aborted") {
        logger.info("Smart incremental sync aborted by user");
      } else {
        logger.error("Smart incremental sync failed", { error: errorMsg });
      }

      throw error;
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Get sync state for a specific entity type
   */
  private async getEntitySyncState(
    stashInstanceId: string | undefined,
    entityType: EntityType
  ): Promise<{ lastFullSync: Date | null; lastIncrementalSync: Date | null } | null> {
    const syncState = await prisma.syncState.findFirst({
      where: {
        stashInstanceId: stashInstanceId || null,
        entityType,
      },
    });

    return syncState;
  }

  /**
   * Get count of entities updated since a given date
   * Used to determine if we need to sync at all
   */
  private async getChangeCount(
    entityType: EntityType,
    since: Date,
    _stashInstanceId?: string
  ): Promise<number> {
    const stash = stashInstanceManager.getDefault();
    const filter = {
      updated_at: { modifier: "GREATER_THAN", value: since.toISOString() },
    };

    try {
      switch (entityType) {
        case "scene": {
          const result = await stash.findScenesCompact({
            filter: { page: 1, per_page: 0 },
            scene_filter: filter as any,
          });
          return result.findScenes.count;
        }
        case "performer": {
          const result = await stash.findPerformers({
            filter: { page: 1, per_page: 0 },
            performer_filter: filter as any,
          });
          return result.findPerformers.count;
        }
        case "studio": {
          const result = await stash.findStudios({
            filter: { page: 1, per_page: 0 },
            studio_filter: filter as any,
          });
          return result.findStudios.count;
        }
        case "tag": {
          const result = await stash.findTags({
            filter: { page: 1, per_page: 0 },
            tag_filter: filter as any,
          });
          return result.findTags.count;
        }
        case "group": {
          const result = await stash.findGroups({
            filter: { page: 1, per_page: 0 },
            group_filter: filter as any,
          });
          return result.findGroups.count;
        }
        case "gallery": {
          const result = await stash.findGalleries({
            filter: { page: 1, per_page: 0 },
            gallery_filter: filter as any,
          });
          return result.findGalleries.count;
        }
        case "image": {
          const result = await stash.findImages({
            filter: { page: 1, per_page: 0 },
            image_filter: filter as any,
          });
          return result.findImages.count;
        }
        default:
          return 0;
      }
    } catch (error) {
      logger.warn(`Failed to get change count for ${entityType}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // If we can't determine, assume there are changes
      return 1;
    }
  }

  /**
   * Sync a specific entity type
   */
  private async syncEntityType(
    entityType: EntityType,
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    switch (entityType) {
      case "studio":
        return this.syncStudios(stashInstanceId, isFullSync, lastSyncTime);
      case "tag":
        return this.syncTags(stashInstanceId, isFullSync, lastSyncTime);
      case "performer":
        return this.syncPerformers(stashInstanceId, isFullSync, lastSyncTime);
      case "group":
        return this.syncGroups(stashInstanceId, isFullSync, lastSyncTime);
      case "gallery":
        return this.syncGalleries(stashInstanceId, isFullSync, lastSyncTime);
      case "scene":
        return this.syncScenes(stashInstanceId, isFullSync, lastSyncTime);
      case "image":
        return this.syncImages(stashInstanceId, isFullSync, lastSyncTime);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Incremental sync - fetches only changed entities
   */
  async incrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      logger.warn("Sync already in progress, skipping");
      return [];
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      const lastSync = await this.getLastSyncTime(stashInstanceId);

      if (!lastSync) {
        logger.info("No previous sync found, performing full sync");
        this.syncInProgress = false;
        this.abortController = null;
        return this.fullSync(stashInstanceId);
      }

      logger.info("Starting incremental sync", { since: lastSync.toISOString() });

      // Sync each entity type (only changed)
      // Tags must be synced first since other entities reference them via junction tables
      // Save state after each entity so restarts are efficient
      let result: SyncResult;

      result = await this.syncTags(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncStudios(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncPerformers(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncGroups(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncGalleries(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncScenes(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      this.checkAbort();

      result = await this.syncImages(stashInstanceId, false, lastSync);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "incremental", result);
      // Rebuild user stats to reflect current entity relationships
      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      const duration = Date.now() - startTime;
      logger.info("Incremental sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced })),
      });

      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg === "Sync aborted") {
        logger.info("Incremental sync aborted by user");
      } else {
        logger.error("Incremental sync failed", { error: errorMsg });
      }

      throw error;
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Sync a single entity (for webhook updates)
   * Note: For entity types without singular find methods, we use findXxx with ids filter
   */
  async syncSingleEntity(
    entityType: EntityType,
    entityId: string,
    action: "create" | "update" | "delete",
    stashInstanceId?: string
  ): Promise<void> {
    logger.info("Single entity sync", { entityType, entityId, action });

    if (action === "delete") {
      // Soft delete the entity
      await this.softDeleteEntity(entityType, entityId);
      return;
    }

    // Fetch and upsert the entity
    const stash = stashInstanceManager.getDefault();

    switch (entityType) {
      case "scene": {
        // Use findScenes with ids filter for single scene
        const result = await stash.findScenes({ ids: [entityId] });
        if (result.findScenes.scenes.length > 0) {
          await this.processScenesBatch(result.findScenes.scenes as Scene[], stashInstanceId, 0, 1);
        }
        break;
      }
      case "performer": {
        const result = await stash.findPerformers({ ids: [entityId] });
        if (result.findPerformers.performers.length > 0) {
          await this.processPerformersBatch(
            result.findPerformers.performers as Performer[],
            stashInstanceId
          );
        }
        break;
      }
      case "studio": {
        const result = await stash.findStudios({ ids: [entityId] });
        if (result.findStudios.studios.length > 0) {
          await this.processStudiosBatch(result.findStudios.studios as Studio[], stashInstanceId);
        }
        break;
      }
      case "tag": {
        const result = await stash.findTags({ ids: [entityId] });
        if (result.findTags.tags.length > 0) {
          await this.processTagsBatch(result.findTags.tags as Tag[], stashInstanceId);
        }
        break;
      }
      case "group": {
        const result = await stash.findGroup({ id: entityId });
        if (result.findGroup) {
          await this.processGroupsBatch([result.findGroup as Group], stashInstanceId);
        }
        break;
      }
      case "gallery": {
        const result = await stash.findGallery({ id: entityId });
        if (result.findGallery) {
          await this.processGalleriesBatch([result.findGallery as Gallery], stashInstanceId);
        }
        break;
      }
      case "image": {
        const result = await stash.findImages({ image_ids: [parseInt(entityId, 10)] });
        if (result.findImages.images.length > 0) {
          await this.processImagesBatch(result.findImages.images, stashInstanceId);
        }
        break;
      }
    }
  }

  // ==================== Scene Sync ====================

  private async syncScenes(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing scenes...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "scene",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        // Build filter for incremental sync
        const sceneFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        logger.debug(`Fetching scenes page ${page}...`);
        const fetchStart = Date.now();
        const result = await stash.findScenesCompact({
          filter: { page, per_page: this.PAGE_SIZE },
          scene_filter: sceneFilter as any,
        });
        logger.debug(`Fetched page ${page} in ${Date.now() - fetchStart}ms`);

        const scenes = result.findScenes.scenes;
        totalCount = result.findScenes.count;

        if (scenes.length === 0) break;

        // Process batch with progress logging every 500 items
        await this.processScenesBatch(scenes as Scene[], stashInstanceId, totalSynced, totalCount);

        totalSynced += scenes.length;
        this.emit("progress", {
          entityType: "scene",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        // Log batch completion at debug level
        logger.debug(`Scenes: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "scene",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Scenes synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "scene",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "scene",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processScenesBatch(
    scenes: Scene[],
    stashInstanceId: string | undefined,
    _batchStart: number,
    _totalCount: number
  ): Promise<void> {
    // Skip empty batches
    if (scenes.length === 0) return;

    // Validate all scene IDs for SQL safety (defense-in-depth)
    const invalidIds = scenes.filter(s => !validateEntityId(s.id));
    if (invalidIds.length > 0) {
      logger.warn(`Skipping ${invalidIds.length} scenes with invalid IDs`);
    }
    const validScenes = scenes.filter(s => validateEntityId(s.id));
    if (validScenes.length === 0) return;

    const sceneIds = validScenes.map((s) => s.id);

    // Bulk delete all junction records for this batch
    await Promise.all([
      prisma.scenePerformer.deleteMany({ where: { sceneId: { in: sceneIds } } }),
      prisma.sceneTag.deleteMany({ where: { sceneId: { in: sceneIds } } }),
      prisma.sceneGroup.deleteMany({ where: { sceneId: { in: sceneIds } } }),
      prisma.sceneGallery.deleteMany({ where: { sceneId: { in: sceneIds } } }),
    ]);

    // Build bulk scene upsert using raw SQL
    const sceneValues = validScenes
      .map((scene) => {
        const file = scene.files?.[0];
        const paths = scene.paths as any; // Cast to any to access optional chapters_vtt

        return `(
      '${this.escape(scene.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(scene.title)},
      ${this.escapeNullable(scene.code)},
      ${this.escapeNullable(scene.date)},
      ${scene.studio?.id ? `'${this.escape(scene.studio.id)}'` : "NULL"},
      ${scene.rating100 ?? "NULL"},
      ${file?.duration ? Math.round(file.duration) : "NULL"},
      ${scene.organized ? 1 : 0},
      ${this.escapeNullable(scene.details)},
      ${this.escapeNullable(scene.director)},
      ${this.escapeNullable(JSON.stringify(scene.urls || []))},
      ${this.escapeNullable(file?.path)},
      ${file?.bit_rate ?? "NULL"},
      ${file?.frame_rate ?? "NULL"},
      ${file?.width ?? "NULL"},
      ${file?.height ?? "NULL"},
      ${this.escapeNullable(file?.video_codec)},
      ${this.escapeNullable(file?.audio_codec)},
      ${file?.size ?? "NULL"},
      ${this.escapeNullable(paths?.screenshot)},
      ${this.escapeNullable(paths?.preview)},
      ${this.escapeNullable(paths?.sprite)},
      ${this.escapeNullable(paths?.vtt)},
      ${this.escapeNullable(paths?.chapters_vtt)},
      ${this.escapeNullable(paths?.stream)},
      ${this.escapeNullable(paths?.caption)},
      ${this.escapeNullable(JSON.stringify(scene.sceneStreams || []))},
      ${scene.o_counter ?? 0},
      ${scene.play_count ?? 0},
      ${scene.play_duration ?? 0},
      ${scene.created_at ? `'${scene.created_at}'` : "NULL"},
      ${scene.updated_at ? `'${scene.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashScene (
      id, stashInstanceId, title, code, date, studioId, rating100, duration,
      organized, details, director, urls, filePath, fileBitRate, fileFrameRate, fileWidth,
      fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
      pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption,
      streams, oCounter, playCount, playDuration, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${sceneValues}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      code = excluded.code,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      duration = excluded.duration,
      organized = excluded.organized,
      details = excluded.details,
      director = excluded.director,
      urls = excluded.urls,
      filePath = excluded.filePath,
      fileBitRate = excluded.fileBitRate,
      fileFrameRate = excluded.fileFrameRate,
      fileWidth = excluded.fileWidth,
      fileHeight = excluded.fileHeight,
      fileVideoCodec = excluded.fileVideoCodec,
      fileAudioCodec = excluded.fileAudioCodec,
      fileSize = excluded.fileSize,
      pathScreenshot = excluded.pathScreenshot,
      pathPreview = excluded.pathPreview,
      pathSprite = excluded.pathSprite,
      pathVtt = excluded.pathVtt,
      pathChaptersVtt = excluded.pathChaptersVtt,
      pathStream = excluded.pathStream,
      pathCaption = excluded.pathCaption,
      streams = excluded.streams,
      oCounter = excluded.oCounter,
      playCount = excluded.playCount,
      playDuration = excluded.playDuration,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Collect all junction records (validate related entity IDs too)
    const performerRecords: string[] = [];
    const tagRecords: string[] = [];
    const groupRecords: string[] = [];
    const galleryRecords: string[] = [];

    for (const scene of validScenes) {
      for (const p of scene.performers || []) {
        if (validateEntityId(p.id)) {
          performerRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(p.id)}')`
          );
        }
      }
      for (const t of scene.tags || []) {
        if (validateEntityId(t.id)) {
          tagRecords.push(`('${this.escape(scene.id)}', '${this.escape(t.id)}')`);
        }
      }
      for (const g of scene.groups || []) {
        const groupObj = (g as any).group || g;
        if (validateEntityId(groupObj.id)) {
          const index = (g as any).scene_index ?? "NULL";
          groupRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(groupObj.id)}', ${index})`
          );
        }
      }
      for (const g of scene.galleries || []) {
        if (validateEntityId(g.id)) {
          galleryRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(g.id)}')`
          );
        }
      }
    }

    // Batch insert junction records
    const inserts = [];

    if (performerRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO ScenePerformer (sceneId, performerId) VALUES ${performerRecords.join(",")}`
        )
      );
    }
    if (tagRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneTag (sceneId, tagId) VALUES ${tagRecords.join(",")}`
        )
      );
    }
    if (groupRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneGroup (sceneId, groupId, sceneIndex) VALUES ${groupRecords.join(",")}`
        )
      );
    }
    if (galleryRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneGallery (sceneId, galleryId) VALUES ${galleryRecords.join(",")}`
        )
      );
    }

    await Promise.all(inserts);

  }

  // ==================== Performer Sync ====================

  private async syncPerformers(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing performers...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "performer",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const performerFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findPerformers({
          filter: { page, per_page: this.PAGE_SIZE },
          performer_filter: performerFilter as any,
        });

        const performers = result.findPerformers.performers;
        totalCount = result.findPerformers.count;

        if (performers.length === 0) break;

        await this.processPerformersBatch(performers as Performer[], stashInstanceId);

        totalSynced += performers.length;
        this.emit("progress", {
          entityType: "performer",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Performers: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "performer",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Performers synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "performer",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "performer",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processPerformersBatch(
    performers: Performer[],
    stashInstanceId?: string
  ): Promise<void> {
    // Skip empty batches
    if (performers.length === 0) return;

    // Validate IDs
    const validPerformers = performers.filter(p => validateEntityId(p.id));
    if (validPerformers.length === 0) return;

    const values = validPerformers
      .map((performer) => {
        return `(
      '${this.escape(performer.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(performer.name)},
      ${this.escapeNullable(performer.disambiguation)},
      ${this.escapeNullable(performer.gender)},
      ${this.escapeNullable(performer.birthdate)},
      ${performer.favorite ? 1 : 0},
      ${performer.rating100 ?? "NULL"},
      ${this.escapeNullable(performer.details)},
      ${this.escapeNullable(JSON.stringify(performer.alias_list || []))},
      ${this.escapeNullable(performer.country)},
      ${this.escapeNullable(performer.ethnicity)},
      ${this.escapeNullable(performer.hair_color)},
      ${this.escapeNullable(performer.eye_color)},
      ${performer.height_cm ?? "NULL"},
      ${performer.weight ?? "NULL"},
      ${this.escapeNullable(performer.measurements)},
      ${this.escapeNullable(performer.fake_tits)},
      ${this.escapeNullable(performer.tattoos)},
      ${this.escapeNullable(performer.piercings)},
      ${this.escapeNullable(performer.career_length)},
      ${this.escapeNullable(performer.death_date)},
      ${this.escapeNullable(performer.url)},
      ${this.escapeNullable(performer.image_path)},
      ${performer.scene_count ?? 0},
      ${performer.image_count ?? 0},
      ${performer.gallery_count ?? 0},
      ${(performer as any).group_count ?? 0},
      ${performer.created_at ? `'${performer.created_at}'` : "NULL"},
      ${performer.updated_at ? `'${performer.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashPerformer (
      id, stashInstanceId, name, disambiguation, gender, birthdate, favorite,
      rating100, details, aliasList,
      country, ethnicity, hairColor, eyeColor, heightCm, weightKg, measurements, fakeTits,
      tattoos, piercings, careerLength, deathDate, url, imagePath,
      sceneCount, imageCount, galleryCount, groupCount,
      stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      disambiguation = excluded.disambiguation,
      gender = excluded.gender,
      birthdate = excluded.birthdate,
      favorite = excluded.favorite,
      rating100 = excluded.rating100,
      details = excluded.details,
      aliasList = excluded.aliasList,
      country = excluded.country,
      ethnicity = excluded.ethnicity,
      hairColor = excluded.hairColor,
      eyeColor = excluded.eyeColor,
      heightCm = excluded.heightCm,
      weightKg = excluded.weightKg,
      measurements = excluded.measurements,
      fakeTits = excluded.fakeTits,
      tattoos = excluded.tattoos,
      piercings = excluded.piercings,
      careerLength = excluded.careerLength,
      deathDate = excluded.deathDate,
      url = excluded.url,
      imagePath = excluded.imagePath,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      galleryCount = excluded.galleryCount,
      groupCount = excluded.groupCount,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Sync performer tags to PerformerTag junction table
    for (const performer of validPerformers) {
      const performerTags = (performer as any).tags;
      if (performerTags && Array.isArray(performerTags) && performerTags.length > 0) {
        const performerId = performer.id;

        // Delete existing tags for this performer
        await prisma.$executeRawUnsafe(
          `DELETE FROM PerformerTag WHERE performerId = '${this.escape(performerId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = performerTags.filter((t: any) => t?.id && validateEntityId(t.id));
        if (validTags.length > 0) {
          const tagValues = validTags
            .map((t: any) => `('${this.escape(performerId)}', '${this.escape(t.id)}')`)
            .join(", ");

          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO PerformerTag (performerId, tagId) VALUES ${tagValues}`
          );
        }
      }
    }
  }

  // ==================== Studio Sync ====================

  private async syncStudios(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing studios...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "studio",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const studioFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findStudios({
          filter: { page, per_page: this.PAGE_SIZE },
          studio_filter: studioFilter as any,
        });

        const studios = result.findStudios.studios;
        totalCount = result.findStudios.count;

        if (studios.length === 0) break;

        await this.processStudiosBatch(studios as Studio[], stashInstanceId);

        totalSynced += studios.length;
        this.emit("progress", {
          entityType: "studio",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Studios: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "studio",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Studios synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "studio",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "studio",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processStudiosBatch(
    studios: Studio[],
    stashInstanceId?: string
  ): Promise<void> {
    // Skip empty batches
    if (studios.length === 0) return;

    // Validate IDs
    const validStudios = studios.filter(s => validateEntityId(s.id));
    if (validStudios.length === 0) return;

    const values = validStudios
      .map((studio) => {
        return `(
      '${this.escape(studio.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(studio.name)},
      ${studio.parent_studio?.id ? `'${this.escape(studio.parent_studio.id)}'` : "NULL"},
      ${studio.favorite ? 1 : 0},
      ${studio.rating100 ?? "NULL"},
      ${studio.scene_count ?? 0},
      ${studio.image_count ?? 0},
      ${studio.gallery_count ?? 0},
      ${(studio as any).performer_count ?? 0},
      ${(studio as any).group_count ?? 0},
      ${this.escapeNullable(studio.details)},
      ${this.escapeNullable(studio.url)},
      ${this.escapeNullable(studio.image_path)},
      ${studio.created_at ? `'${studio.created_at}'` : "NULL"},
      ${studio.updated_at ? `'${studio.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashStudio (
      id, stashInstanceId, name, parentId, favorite, rating100,
      sceneCount, imageCount, galleryCount, performerCount, groupCount,
      details, url, imagePath, stashCreatedAt,
      stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      parentId = excluded.parentId,
      favorite = excluded.favorite,
      rating100 = excluded.rating100,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      galleryCount = excluded.galleryCount,
      performerCount = excluded.performerCount,
      groupCount = excluded.groupCount,
      details = excluded.details,
      url = excluded.url,
      imagePath = excluded.imagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Sync studio tags to StudioTag junction table
    for (const studio of validStudios) {
      const studioTags = (studio as any).tags;
      if (studioTags && Array.isArray(studioTags) && studioTags.length > 0) {
        const studioId = studio.id;

        // Delete existing tags for this studio
        await prisma.$executeRawUnsafe(
          `DELETE FROM StudioTag WHERE studioId = '${this.escape(studioId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = studioTags.filter((t: any) => t?.id && validateEntityId(t.id));
        if (validTags.length > 0) {
          const tagValues = validTags
            .map((t: any) => `('${this.escape(studioId)}', '${this.escape(t.id)}')`)
            .join(", ");

          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO StudioTag (studioId, tagId) VALUES ${tagValues}`
          );
        }
      }
    }
  }

  // ==================== Tag Sync ====================

  private async syncTags(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing tags...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "tag",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const tagFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findTags({
          filter: { page, per_page: this.PAGE_SIZE },
          tag_filter: tagFilter as any,
        });

        const tags = result.findTags.tags;
        totalCount = result.findTags.count;

        if (tags.length === 0) break;

        await this.processTagsBatch(tags as Tag[], stashInstanceId);

        totalSynced += tags.length;
        this.emit("progress", {
          entityType: "tag",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Tags: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "tag",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Tags synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "tag",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "tag",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processTagsBatch(tags: Tag[], stashInstanceId?: string): Promise<void> {
    // Skip empty batches
    if (tags.length === 0) return;

    // Validate IDs
    const validTags = tags.filter(t => validateEntityId(t.id));
    if (validTags.length === 0) return;

    const values = validTags
      .map((tag) => {
        const parentIds = tag.parents?.map((p) => p.id) || [];
        const aliases = (tag as any).aliases || [];
        return `(
      '${this.escape(tag.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(tag.name)},
      ${tag.favorite ? 1 : 0},
      ${tag.scene_count ?? 0},
      ${tag.image_count ?? 0},
      ${tag.gallery_count ?? 0},
      ${tag.performer_count ?? 0},
      ${(tag as any).studio_count ?? 0},
      ${(tag as any).group_count ?? 0},
      ${tag.scene_marker_count ?? 0},
      ${this.escapeNullable(tag.description)},
      ${this.escapeNullable(JSON.stringify(aliases))},
      ${this.escapeNullable(JSON.stringify(parentIds))},
      ${this.escapeNullable(tag.image_path)},
      ${tag.created_at ? `'${tag.created_at}'` : "NULL"},
      ${tag.updated_at ? `'${tag.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashTag (
      id, stashInstanceId, name, favorite,
      sceneCount, imageCount, galleryCount, performerCount, studioCount, groupCount, sceneMarkerCount,
      description, aliases, parentIds, imagePath, stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      favorite = excluded.favorite,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      galleryCount = excluded.galleryCount,
      performerCount = excluded.performerCount,
      studioCount = excluded.studioCount,
      groupCount = excluded.groupCount,
      sceneMarkerCount = excluded.sceneMarkerCount,
      description = excluded.description,
      aliases = excluded.aliases,
      parentIds = excluded.parentIds,
      imagePath = excluded.imagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
  }

  // ==================== Group Sync ====================

  private async syncGroups(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing groups...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "group",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const groupFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findGroups({
          filter: { page, per_page: this.PAGE_SIZE },
          group_filter: groupFilter as any,
        });

        const groups = result.findGroups.groups;
        totalCount = result.findGroups.count;

        if (groups.length === 0) break;

        await this.processGroupsBatch(groups as Group[], stashInstanceId);

        totalSynced += groups.length;
        this.emit("progress", {
          entityType: "group",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Groups: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "group",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Groups synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "group",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "group",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processGroupsBatch(groups: Group[], stashInstanceId?: string): Promise<void> {
    // Skip empty batches
    if (groups.length === 0) return;

    // Validate IDs
    const validGroups = groups.filter(g => validateEntityId(g.id));
    if (validGroups.length === 0) return;

    const values = validGroups
      .map((group) => {
        const duration = group.duration || null;
        const urls = group.urls || [];
        return `(
      '${this.escape(group.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(group.name)},
      ${this.escapeNullable(group.date)},
      ${group.studio?.id ? `'${this.escape(group.studio.id)}'` : "NULL"},
      ${group.rating100 ?? "NULL"},
      ${duration ? Math.round(duration) : "NULL"},
      ${group.scene_count ?? 0},
      ${(group as any).performer_count ?? 0},
      ${this.escapeNullable(group.director)},
      ${this.escapeNullable(group.synopsis)},
      ${this.escapeNullable(JSON.stringify(urls))},
      ${this.escapeNullable(group.front_image_path)},
      ${this.escapeNullable(group.back_image_path)},
      ${group.created_at ? `'${group.created_at}'` : "NULL"},
      ${group.updated_at ? `'${group.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashGroup (
      id, stashInstanceId, name, date, studioId, rating100, duration,
      sceneCount, performerCount,
      director, synopsis, urls, frontImagePath, backImagePath, stashCreatedAt,
      stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      duration = excluded.duration,
      sceneCount = excluded.sceneCount,
      performerCount = excluded.performerCount,
      director = excluded.director,
      synopsis = excluded.synopsis,
      urls = excluded.urls,
      frontImagePath = excluded.frontImagePath,
      backImagePath = excluded.backImagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Sync group tags to GroupTag junction table
    for (const group of validGroups) {
      const groupTags = (group as any).tags;
      if (groupTags && Array.isArray(groupTags) && groupTags.length > 0) {
        const groupId = group.id;

        // Delete existing tags for this group
        await prisma.$executeRawUnsafe(
          `DELETE FROM GroupTag WHERE groupId = '${this.escape(groupId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = groupTags.filter((t: any) => t?.id && validateEntityId(t.id));
        if (validTags.length > 0) {
          const tagValues = validTags
            .map((t: any) => `('${this.escape(groupId)}', '${this.escape(t.id)}')`)
            .join(", ");

          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO GroupTag (groupId, tagId) VALUES ${tagValues}`
          );
        }
      }
    }
  }

  // ==================== Gallery Sync ====================

  private async syncGalleries(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing galleries...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "gallery",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const galleryFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findGalleries({
          filter: { page, per_page: this.PAGE_SIZE },
          gallery_filter: galleryFilter as any,
        });

        const galleries = result.findGalleries.galleries;
        totalCount = result.findGalleries.count;

        if (galleries.length === 0) break;

        await this.processGalleriesBatch(galleries as Gallery[], stashInstanceId);

        totalSynced += galleries.length;
        this.emit("progress", {
          entityType: "gallery",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Galleries: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "gallery",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Galleries synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "gallery",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "gallery",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processGalleriesBatch(
    galleries: Gallery[],
    stashInstanceId?: string
  ): Promise<void> {
    // Skip empty batches
    if (galleries.length === 0) return;

    // Validate IDs
    const validGalleries = galleries.filter(g => validateEntityId(g.id));
    if (validGalleries.length === 0) return;

    const values = validGalleries
      .map((gallery) => {
        const folder = gallery.folder;
        // Get first file's basename for zip gallery title fallback
        const fileBasename = gallery.files?.[0]?.basename || null;
        return `(
      '${this.escape(gallery.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(gallery.title)},
      ${this.escapeNullable(gallery.date)},
      ${gallery.studio?.id ? `'${this.escape(gallery.studio.id)}'` : "NULL"},
      ${gallery.rating100 ?? "NULL"},
      ${gallery.image_count ?? 0},
      ${this.escapeNullable(gallery.details)},
      ${this.escapeNullable(gallery.url)},
      ${this.escapeNullable(gallery.code)},
      ${this.escapeNullable(folder?.path)},
      ${this.escapeNullable(fileBasename)},
      ${this.escapeNullable(gallery.paths?.cover)},
      ${gallery.created_at ? `'${gallery.created_at}'` : "NULL"},
      ${gallery.updated_at ? `'${gallery.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashGallery (
      id, stashInstanceId, title, date, studioId, rating100, imageCount,
      details, url, code, folderPath, fileBasename, coverPath, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      imageCount = excluded.imageCount,
      details = excluded.details,
      url = excluded.url,
      code = excluded.code,
      folderPath = excluded.folderPath,
      fileBasename = excluded.fileBasename,
      coverPath = excluded.coverPath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Sync gallery performers (junction table)
    const performerInserts: { galleryId: string; performerId: string }[] = [];
    for (const gallery of validGalleries) {
      if (gallery.performers && gallery.performers.length > 0) {
        for (const performer of gallery.performers) {
          if (validateEntityId(performer.id)) {
            performerInserts.push({
              galleryId: gallery.id,
              performerId: performer.id,
            });
          }
        }
      }
    }

    // Delete existing gallery-performer relationships for these galleries
    const galleryIds = validGalleries.map((g) => `'${this.escape(g.id)}'`).join(",");
    await prisma.$executeRawUnsafe(`
      DELETE FROM GalleryPerformer WHERE galleryId IN (${galleryIds})
    `);

    // Insert new gallery-performer relationships
    if (performerInserts.length > 0) {
      const performerValues = performerInserts
        .map((p) => `('${this.escape(p.galleryId)}', '${this.escape(p.performerId)}')`)
        .join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO GalleryPerformer (galleryId, performerId)
        VALUES ${performerValues}
      `);
    }

    // Sync gallery tags to GalleryTag junction table
    const tagInserts: { galleryId: string; tagId: string }[] = [];
    for (const gallery of validGalleries) {
      const galleryTags = (gallery as any).tags;
      if (galleryTags && Array.isArray(galleryTags) && galleryTags.length > 0) {
        for (const tag of galleryTags) {
          if (tag?.id && validateEntityId(tag.id)) {
            tagInserts.push({
              galleryId: gallery.id,
              tagId: tag.id,
            });
          }
        }
      }
    }

    // Delete existing gallery-tag relationships for these galleries
    await prisma.$executeRawUnsafe(`
      DELETE FROM GalleryTag WHERE galleryId IN (${galleryIds})
    `);

    // Insert new gallery-tag relationships
    if (tagInserts.length > 0) {
      const tagValues = tagInserts
        .map((t) => `('${this.escape(t.galleryId)}', '${this.escape(t.tagId)}')`)
        .join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO GalleryTag (galleryId, tagId)
        VALUES ${tagValues}
      `);
    }
  }

  // ==================== Image Sync ====================

  private async syncImages(
    stashInstanceId: string | undefined,
    isFullSync: boolean,
    lastSyncTime?: Date
  ): Promise<SyncResult> {
    logger.info("Syncing images...");
    const startTime = Date.now();
    const stash = stashInstanceManager.getDefault();
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;

    this.emit("progress", {
      entityType: "image",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      while (true) {
        this.checkAbort();

        const imageFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: lastSyncTime.toISOString() } }
          : undefined;

        const result = await stash.findImages({
          filter: { page, per_page: this.PAGE_SIZE },
          image_filter: imageFilter as any,
        });

        const images = result.findImages.images;
        totalCount = result.findImages.count;

        if (images.length === 0) break;

        await this.processImagesBatch(images, stashInstanceId);

        totalSynced += images.length;
        this.emit("progress", {
          entityType: "image",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Images: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`);

        if (totalSynced >= totalCount) break;
        page++;
      }

      this.emit("progress", {
        entityType: "image",
        phase: "complete",
        current: totalSynced,
        total: totalSynced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Images synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "image",
        synced: totalSynced,
        deleted: 0,
        durationMs,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "image",
        phase: "error",
        current: totalSynced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processImagesBatch(images: any[], stashInstanceId?: string): Promise<void> {
    // Skip empty batches
    if (images.length === 0) return;

    // Validate IDs
    const validImages = images.filter((i: any) => validateEntityId(i.id));
    if (validImages.length === 0) return;

    const imageIds = validImages.map((i: any) => i.id);

    // Bulk delete junction records
    await Promise.all([
      prisma.imagePerformer.deleteMany({ where: { imageId: { in: imageIds } } }),
      prisma.imageTag.deleteMany({ where: { imageId: { in: imageIds } } }),
      prisma.imageGallery.deleteMany({ where: { imageId: { in: imageIds } } }),
    ]);

    // Build bulk image upsert
    const values = validImages.map((image: any) => {
      const visualFile = image.visual_files?.[0];
      const paths = image.paths;
      return `(
        '${this.escape(image.id)}',
        ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
        ${this.escapeNullable(image.title)},
        ${this.escapeNullable(image.date)},
        ${image.studio?.id ? `'${this.escape(image.studio.id)}'` : 'NULL'},
        ${image.rating100 ?? 'NULL'},
        ${image.o_counter ?? 0},
        ${image.organized ? 1 : 0},
        ${this.escapeNullable(visualFile?.path)},
        ${visualFile?.width ?? 'NULL'},
        ${visualFile?.height ?? 'NULL'},
        ${visualFile?.size ?? 'NULL'},
        ${this.escapeNullable(paths?.thumbnail)},
        ${this.escapeNullable(paths?.preview)},
        ${this.escapeNullable(paths?.image)},
        ${image.created_at ? `'${image.created_at}'` : 'NULL'},
        ${image.updated_at ? `'${image.updated_at}'` : 'NULL'},
        datetime('now'),
        NULL
      )`;
    }).join(',\n');

    await prisma.$executeRawUnsafe(`
      INSERT INTO StashImage (
        id, stashInstanceId, title, date, studioId, rating100, oCounter, organized,
        filePath, width, height, fileSize, pathThumbnail, pathPreview, pathImage,
        stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
      ) VALUES ${values}
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        date = excluded.date,
        studioId = excluded.studioId,
        rating100 = excluded.rating100,
        oCounter = excluded.oCounter,
        organized = excluded.organized,
        filePath = excluded.filePath,
        width = excluded.width,
        height = excluded.height,
        fileSize = excluded.fileSize,
        pathThumbnail = excluded.pathThumbnail,
        pathPreview = excluded.pathPreview,
        pathImage = excluded.pathImage,
        stashCreatedAt = excluded.stashCreatedAt,
        stashUpdatedAt = excluded.stashUpdatedAt,
        syncedAt = excluded.syncedAt,
        deletedAt = NULL
    `);

    // Collect junction records (validate related entity IDs too)
    const performerRecords: string[] = [];
    const tagRecords: string[] = [];
    const galleryRecords: string[] = [];

    for (const image of validImages) {
      for (const p of image.performers || []) {
        if (validateEntityId(p.id)) {
          performerRecords.push(`('${this.escape(image.id)}', '${this.escape(p.id)}')`);
        }
      }
      for (const t of image.tags || []) {
        if (validateEntityId(t.id)) {
          tagRecords.push(`('${this.escape(image.id)}', '${this.escape(t.id)}')`);
        }
      }
      for (const g of image.galleries || []) {
        if (validateEntityId(g.id)) {
          galleryRecords.push(`('${this.escape(image.id)}', '${this.escape(g.id)}')`);
        }
      }
    }

    // Batch insert junction records
    const inserts = [];

    if (performerRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImagePerformer (imageId, performerId) VALUES ${performerRecords.join(',')}`
      ));
    }
    if (tagRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImageTag (imageId, tagId) VALUES ${tagRecords.join(',')}`
      ));
    }
    if (galleryRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImageGallery (imageId, galleryId) VALUES ${galleryRecords.join(',')}`
      ));
    }

    await Promise.all(inserts);
  }

  // ==================== Junction Table Sync ====================
  // These methods use raw SQL INSERT OR IGNORE for performance:
  // - Handles duplicates (existing relationships) silently
  // - Handles FK constraint violations (orphaned references) silently
  // - Much faster than individual upserts for batch operations

  private async syncScenePerformers(sceneId: string, performers: any[]): Promise<void> {
    if (performers.length === 0) {
      // Delete all if no performers
      await prisma.scenePerformer.deleteMany({ where: { sceneId } });
      return;
    }

    const newPerformerIds = performers.map((p: any) => p.id);

    // Delete removed performers
    await prisma.scenePerformer.deleteMany({
      where: {
        sceneId,
        performerId: { notIn: newPerformerIds },
      },
    });

    // Batch insert with INSERT OR IGNORE (handles duplicates and FK violations)
    const values = performers.map((p: any) => `('${sceneId}', '${p.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ScenePerformer" ("sceneId", "performerId") VALUES ${values}`
    );
  }

  private async syncSceneTags(sceneId: string, tags: any[]): Promise<void> {
    if (tags.length === 0) {
      await prisma.sceneTag.deleteMany({ where: { sceneId } });
      return;
    }

    const newTagIds = tags.map((t: any) => t.id);

    await prisma.sceneTag.deleteMany({
      where: {
        sceneId,
        tagId: { notIn: newTagIds },
      },
    });

    const values = tags.map((t: any) => `('${sceneId}', '${t.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "SceneTag" ("sceneId", "tagId") VALUES ${values}`
    );
  }

  private async syncSceneGroups(sceneId: string, groups: any[]): Promise<void> {
    if (groups.length === 0) {
      await prisma.sceneGroup.deleteMany({ where: { sceneId } });
      return;
    }

    const newGroupIds = groups.map((g: any) => (g.group || g).id);

    await prisma.sceneGroup.deleteMany({
      where: {
        sceneId,
        groupId: { notIn: newGroupIds },
      },
    });

    // SceneGroup has sceneIndex field, use INSERT OR REPLACE to update it
    const values = groups
      .map((g: any) => {
        const groupObj = g.group || g;
        const sceneIndex = g.scene_index ?? "NULL";
        return `('${sceneId}', '${groupObj.id}', ${sceneIndex})`;
      })
      .join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR REPLACE INTO "SceneGroup" ("sceneId", "groupId", "sceneIndex") VALUES ${values}`
    );
  }

  private async syncSceneGalleries(sceneId: string, galleries: any[]): Promise<void> {
    if (galleries.length === 0) {
      await prisma.sceneGallery.deleteMany({ where: { sceneId } });
      return;
    }

    const newGalleryIds = galleries.map((g: any) => g.id);

    await prisma.sceneGallery.deleteMany({
      where: {
        sceneId,
        galleryId: { notIn: newGalleryIds },
      },
    });

    const values = galleries.map((g: any) => `('${sceneId}', '${g.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "SceneGallery" ("sceneId", "galleryId") VALUES ${values}`
    );
  }

  private async syncImagePerformers(imageId: string, performers: any[]): Promise<void> {
    if (performers.length === 0) {
      await prisma.imagePerformer.deleteMany({ where: { imageId } });
      return;
    }

    const newPerformerIds = performers.map((p: any) => p.id);

    await prisma.imagePerformer.deleteMany({
      where: {
        imageId,
        performerId: { notIn: newPerformerIds },
      },
    });

    const values = performers.map((p: any) => `('${imageId}', '${p.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ImagePerformer" ("imageId", "performerId") VALUES ${values}`
    );
  }

  private async syncImageTags(imageId: string, tags: any[]): Promise<void> {
    if (tags.length === 0) {
      await prisma.imageTag.deleteMany({ where: { imageId } });
      return;
    }

    const newTagIds = tags.map((t: any) => t.id);

    await prisma.imageTag.deleteMany({
      where: {
        imageId,
        tagId: { notIn: newTagIds },
      },
    });

    const values = tags.map((t: any) => `('${imageId}', '${t.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ImageTag" ("imageId", "tagId") VALUES ${values}`
    );
  }

  private async syncImageGalleries(imageId: string, galleries: any[]): Promise<void> {
    if (galleries.length === 0) {
      await prisma.imageGallery.deleteMany({ where: { imageId } });
      return;
    }

    const newGalleryIds = galleries.map((g: any) => g.id);

    await prisma.imageGallery.deleteMany({
      where: {
        imageId,
        galleryId: { notIn: newGalleryIds },
      },
    });

    const values = galleries.map((g: any) => `('${imageId}', '${g.id}')`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ImageGallery" ("imageId", "galleryId") VALUES ${values}`
    );
  }

  // ==================== Helper Methods ====================

  private checkAbort(): void {
    if (this.abortController?.signal.aborted) {
      throw new Error("Sync aborted");
    }
  }

  private async softDeleteEntity(entityType: EntityType, entityId: string): Promise<void> {
    const now = new Date();

    switch (entityType) {
      case "scene":
        await prisma.stashScene.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "performer":
        await prisma.stashPerformer.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "studio":
        await prisma.stashStudio.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "tag":
        await prisma.stashTag.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "group":
        await prisma.stashGroup.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "gallery":
        await prisma.stashGallery.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
      case "image":
        await prisma.stashImage.update({
          where: { id: entityId },
          data: { deletedAt: now },
        });
        break;
    }
  }

  private async getLastSyncTime(stashInstanceId?: string): Promise<Date | null> {
    const syncState = await prisma.syncState.findFirst({
      where: {
        stashInstanceId: stashInstanceId || null,
        entityType: "scene", // Use scene as the reference entity type
      },
    });

    return syncState?.lastFullSync || syncState?.lastIncrementalSync || null;
  }

  /**
   * Save sync state for a single entity type immediately after sync completes
   */
  private async saveSyncState(
    stashInstanceId: string | undefined,
    syncType: "full" | "incremental",
    result: SyncResult
  ): Promise<void> {
    const now = new Date();
    const instanceId = stashInstanceId ?? null;

    const updateData = {
      ...(syncType === "full" ? { lastFullSync: now } : { lastIncrementalSync: now }),
      lastSyncCount: result.synced,
      lastSyncDurationMs: result.durationMs,
      lastError: result.error ?? null,
      totalEntities: result.synced,
    };

    // Find existing record
    const existing = await prisma.syncState.findFirst({
      where: {
        stashInstanceId: instanceId,
        entityType: result.entityType,
      },
    });

    if (existing) {
      await prisma.syncState.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.syncState.create({
        data: {
          stashInstanceId: instanceId,
          entityType: result.entityType,
          ...updateData,
        },
      });
    }
  }

  private async updateAllSyncStates(
    stashInstanceId: string | undefined,
    syncType: "full" | "incremental",
    results: SyncResult[],
    _totalDurationMs: number
  ): Promise<void> {
    const now = new Date();
    const instanceId = stashInstanceId ?? null;

    for (const result of results) {
      // Find existing sync state
      const existing = await prisma.syncState.findFirst({
        where: {
          stashInstanceId: instanceId,
          entityType: result.entityType,
        },
      });

      const updateData = {
        ...(syncType === "full" ? { lastFullSync: now } : { lastIncrementalSync: now }),
        lastSyncCount: result.synced,
        lastSyncDurationMs: result.durationMs,
        lastError: result.error ?? null,
        totalEntities: result.synced,
      };

      if (existing) {
        await prisma.syncState.update({
          where: { id: existing.id },
          data: updateData,
        });
      } else {
        await prisma.syncState.create({
          data: {
            stashInstanceId: instanceId,
            entityType: result.entityType,
            ...updateData,
          },
        });
      }
    }
  }

  /**
   * Get sync status for all entity types
   */
  async getSyncStatus(stashInstanceId?: string): Promise<{
    states: any[];
    settings: any;
    inProgress: boolean;
  }> {
    const states = await prisma.syncState.findMany({
      where: { stashInstanceId: stashInstanceId || null },
    });

    const settings = await prisma.syncSettings.findFirst();

    return {
      states,
      settings: settings || {
        syncIntervalMinutes: 60,
        enableScanSubscription: true,
        enablePluginWebhook: false,
      },
      inProgress: this.syncInProgress,
    };
  }
}

// Export singleton instance
export const stashSyncService = new StashSyncService();
