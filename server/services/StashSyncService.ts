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
import type { Gallery, Group, Performer, Scene, Studio, Tag } from "../graphql/types.js";
import { SortDirectionEnum, CriterionModifier } from "../graphql/generated/graphql.js";
import type { FindFilterType, SceneMarkerFilterType } from "../graphql/generated/graphql.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
// Transform functions no longer needed - URLs transformed at read time
import { entityImageCountService } from "./EntityImageCountService.js";
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { userStatsService } from "./UserStatsService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { mergeReconciliationService } from "./MergeReconciliationService.js";
import { clipPreviewProber } from "./ClipPreviewProber.js";

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
  /** The max updated_at timestamp from synced entities (used for next incremental sync) */
  maxUpdatedAt?: string;
}

type EntityType = "scene" | "performer" | "studio" | "tag" | "group" | "gallery" | "image" | "clip";

// Plural forms for entity types (for logging)
const ENTITY_PLURALS: Record<EntityType, string> = {
  scene: "scenes",
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
  image: "images",
  clip: "clips",
};

// Constants for sync configuration
const BATCH_SIZE = 500; // Number of entities to fetch per page

/**
 * Format a timestamp for Stash GraphQL queries.
 *
 * Stash expects timestamps without timezone suffix. It interprets all timestamps as local time.
 * We store raw timestamp strings from Stash and strip the timezone when querying.
 *
 * Additionally, we add .999 milliseconds to handle Stash's sub-second precision.
 * Stash stores timestamps with sub-second precision internally but returns them truncated
 * to seconds in API responses. Without this adjustment, querying `> 19:41:58` would still
 * match an entity with actual timestamp `19:41:58.500`, causing infinite re-syncs.
 * Adding .999 ensures we skip all entities within that second.
 */
function formatTimestampForStash(timestamp: string): string {
  // Strip the timezone suffix to get the local time portion
  // "2025-12-28T09:47:03-08:00" -> "2025-12-28T09:47:03"
  // "2025-12-28T09:47:03Z" -> "2025-12-28T09:47:03"
  const withoutTz = timestamp.replace(/([+-]\d{2}:\d{2}|Z)$/, "");

  // Add .999 milliseconds to handle sub-second precision
  // "2025-12-28T09:47:03" -> "2025-12-28T09:47:03.999"
  // If already has milliseconds, replace them with .999
  if (/\.\d+$/.test(withoutTz)) {
    return withoutTz.replace(/\.\d+$/, ".999");
  }
  return `${withoutTz}.999`;
}

/**
 * Compare two RFC3339 timestamp strings to determine which is more recent.
 * Handles timestamps with different timezone offsets by parsing to Date objects.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareTimestamps(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return dateA.getTime() - dateB.getTime();
}

/**
 * Get the more recent of two RFC3339 timestamp strings.
 */
function getMostRecentTimestamp(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return compareTimestamps(a, b) >= 0 ? a : b;
}

/**
 * Get the max updated_at timestamp from a list of entities.
 * Returns the raw string from Stash (with timezone) to preserve accuracy.
 */
function getMaxUpdatedAt(entities: Array<{ updated_at?: string | null }>): string | undefined {
  let max: string | undefined;

  for (const entity of entities) {
    if (entity.updated_at) {
      if (!max || entity.updated_at > max) {
        max = entity.updated_at;
      }
    }
  }

  return max;
}

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

/**
 * Extract PHASH fingerprints from scene files.
 * Returns primary phash and array of all phashes.
 */
function extractPhashes(files: Array<{ fingerprints?: Array<{ type: string; value: string }> }> | undefined): {
  phash: string | null;
  phashes: string | null;
} {
  if (!files || files.length === 0) {
    return { phash: null, phashes: null };
  }

  const allPhashes: string[] = [];
  for (const file of files) {
    if (file.fingerprints) {
      for (const fp of file.fingerprints) {
        if (fp.type === "phash" && fp.value) {
          allPhashes.push(fp.value);
        }
      }
    }
  }

  if (allPhashes.length === 0) {
    return { phash: null, phashes: null };
  }

  return {
    phash: allPhashes[0],
    phashes: allPhashes.length > 1 ? JSON.stringify(allPhashes) : null,
  };
}

class StashSyncService extends EventEmitter {
  private syncInProgress = false;
  private readonly PAGE_SIZE = BATCH_SIZE;
  private abortController: AbortController | null = null;
  private batchItemCount = 0; // Track items within current batch for progress logging

  /**
   * Get the Stash client for the specified instance ID, or default if not specified.
   * This ensures sync operations target the correct Stash instance.
   */
  private getStashClient(stashInstanceId?: string) {
    if (stashInstanceId) {
      const client = stashInstanceManager.get(stashInstanceId);
      if (!client) {
        throw new Error(`Stash instance not found: ${stashInstanceId}`);
      }
      return client;
    }
    return stashInstanceManager.getDefault();
  }

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
   *
   * If stashInstanceId is provided, syncs only that instance.
   * If not provided, syncs ALL enabled instances.
   */
  async fullSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      throw new Error("Sync already in progress");
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.fullSyncAllInstances();
      }
      return await this.fullSyncInstance(stashInstanceId);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Full sync all enabled instances
   * Note: Assumes syncInProgress is already set by caller
   */
  private async fullSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(`Starting full sync for ${enabledInstances.length} instance(s)...`);
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Syncing instance: ${instance.name} (${instance.id})`);
      try {
        const results = await this.fullSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        logger.error(`Failed to sync instance ${instance.name}`, {
          instanceId: instance.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other instances
      }
    }

    return allResults;
  }

  /**
   * Full sync a single instance
   * Note: Assumes syncInProgress is already set by caller
   */
  private async fullSyncInstance(stashInstanceId: string): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting full sync...", { stashInstanceId });

      // Sync each entity type in order (dependencies first)
      // Tags must be synced first since other entities reference them via junction tables
      // Save state after each entity so restarts don't re-sync completed types
      let result: SyncResult;

      result = await this.syncTags(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("tag", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncStudios(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("studio", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncPerformers(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("performer", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncGroups(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("group", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncGalleries(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("gallery", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncScenes(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("scene", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncClips(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("clip", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      this.checkAbort();

      result = await this.syncImages(stashInstanceId, true);
      result.deleted = await this.cleanupDeletedEntities("image", stashInstanceId);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);

      // Compute inherited tags for scenes (must happen after scenes, performers, studios, groups are synced)
      logger.info("Computing inherited tags for scenes...");
      await sceneTagInheritanceService.computeInheritedTags();
      logger.info("Scene tag inheritance complete");

      // Apply gallery inheritance to images (must happen after images and galleries are synced)
      logger.info("Applying gallery inheritance to images...");
      await imageGalleryInheritanceService.applyGalleryInheritance();
      logger.info("Gallery inheritance complete");

      // Rebuild inherited image counts (must happen after gallery inheritance)
      logger.info("Rebuilding inherited image counts...");
      await entityImageCountService.rebuildAllImageCounts();
      logger.info("Inherited image counts rebuild complete");

      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      // Compute tag scene counts via performers
      await this.computeTagSceneCountsViaPerformers();

      // Recompute exclusions for all users after sync
      logger.info("Sync complete, recomputing user exclusions...");
      await exclusionComputationService.recomputeAllUsers();
      logger.info("User exclusions recomputed");

      const duration = Date.now() - startTime;
      logger.info("Full sync completed", {
        durationMs: duration,
        results: results.map((r) => ({
          type: r.entityType,
          synced: r.synced,
          deleted: r.deleted,
        })),
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

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.smartIncrementalSyncAllInstances();
      }
      return await this.smartIncrementalSyncInstance(stashInstanceId);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Smart incremental sync all enabled instances
   * Note: Assumes syncInProgress is already set by caller
   */
  private async smartIncrementalSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(`Starting smart incremental sync for ${enabledInstances.length} instance(s)...`);
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Smart sync instance: ${instance.name} (${instance.id})`);
      try {
        const results = await this.smartIncrementalSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        logger.error(`Failed to smart sync instance ${instance.name}`, {
          instanceId: instance.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other instances
      }
    }

    return allResults;
  }

  /**
   * Smart incremental sync a single instance
   * Note: Assumes syncInProgress is already set by caller
   */
  private async smartIncrementalSyncInstance(stashInstanceId: string): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting smart incremental sync...", { stashInstanceId });

      // Entity types in dependency order
      const entityTypes: EntityType[] = [
        "studio",
        "tag",
        "performer",
        "group",
        "gallery",
        "scene",
        "clip",
        "image",
      ];

      for (const entityType of entityTypes) {
        this.checkAbort();

        // Get sync state for this specific entity type
        const syncState = await this.getEntitySyncState(stashInstanceId, entityType);
        const lastSync = this.getMostRecentSyncTime(syncState);

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
            // lastSync is now a raw RFC3339 string
            logger.info(`${entityType}: No changes since ${lastSync}, skipping`);
            results.push({
              entityType,
              synced: 0,
              deleted: 0,
              durationMs: 0,
            });
          } else {
            logger.info(`${entityType}: ${changeCount} changes since ${lastSync}, syncing`);
            const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
            results.push(result);
            await this.saveSyncState(stashInstanceId, "incremental", result);
          }
        }
      }

      // Cleanup deleted entities (detect deletions/merges in Stash)
      logger.info("Checking for deleted entities...");
      let totalDeleted = 0;
      for (const entityType of entityTypes) {
        this.checkAbort();
        const deleted = await this.cleanupDeletedEntities(entityType, stashInstanceId);
        totalDeleted += deleted;
        // Update the result for this entity type with deleted count
        const result = results.find((r) => r.entityType === entityType);
        if (result) {
          result.deleted = deleted;
        }
      }
      if (totalDeleted > 0) {
        logger.info(`Cleanup complete: ${totalDeleted} entities marked as deleted`);
      }

      // Apply gallery inheritance if images or galleries were synced
      // (galleries may have new performers/tags that need to propagate to images)
      const imageResult = results.find((r) => r.entityType === "image");
      const galleryResult = results.find((r) => r.entityType === "gallery");
      if ((imageResult && imageResult.synced > 0) || (galleryResult && galleryResult.synced > 0)) {
        logger.info("Applying gallery inheritance after smart incremental sync...");
        await imageGalleryInheritanceService.applyGalleryInheritance();
        logger.info("Gallery inheritance complete");
      }

      // Compute inherited tags for scenes if scenes were updated
      const sceneResult = results.find((r) => r.entityType === "scene");
      if (sceneResult && sceneResult.synced > 0) {
        logger.info("Computing inherited tags for scenes after smart incremental sync...");
        await sceneTagInheritanceService.computeInheritedTags();
        logger.info("Scene tag inheritance complete");
      }

      // Rebuild inherited image counts (must happen after gallery inheritance)
      logger.info("Rebuilding inherited image counts...");
      await entityImageCountService.rebuildAllImageCounts();
      logger.info("Inherited image counts rebuild complete");

      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      // Compute tag scene counts via performers
      await this.computeTagSceneCountsViaPerformers();

      // Recompute exclusions for all users after sync
      logger.info("Sync complete, recomputing user exclusions...");
      await exclusionComputationService.recomputeAllUsers();
      logger.info("User exclusions recomputed");

      const duration = Date.now() - startTime;
      logger.info("Smart incremental sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced, deleted: r.deleted })),
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
    }
  }

  /**
   * Get sync state for a specific entity type
   */
  private async getEntitySyncState(
    stashInstanceId: string,
    entityType: EntityType
  ): Promise<{
    lastFullSyncTimestamp: string | null;
    lastIncrementalSyncTimestamp: string | null;
  } | null> {
    const syncState = await prisma.syncState.findFirst({
      where: {
        stashInstanceId: stashInstanceId || null,
        entityType,
      },
    });

    return syncState;
  }

  /**
   * Get the most recent sync timestamp from a sync state record.
   * Returns whichever is more recent: lastFullSyncTimestamp or lastIncrementalSyncTimestamp.
   * This ensures incremental syncs after a full sync use the correct "since" time.
   *
   * Returns the raw RFC3339 timestamp string from Stash, which we strip the timezone
   * from when querying.
   */
  private getMostRecentSyncTime(
    syncState: {
      lastFullSyncTimestamp: string | null;
      lastIncrementalSyncTimestamp: string | null;
    } | null
  ): string | null {
    if (!syncState) return null;

    return getMostRecentTimestamp(syncState.lastFullSyncTimestamp, syncState.lastIncrementalSyncTimestamp);
  }

  /**
   * Get count of entities updated since a given timestamp
   * Used to determine if we need to sync at all
   */
  private async getChangeCount(
    entityType: EntityType,
    since: string,
    stashInstanceId?: string
  ): Promise<number> {
    const stash = this.getStashClient(stashInstanceId);
    const filter = {
      updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(since) },
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
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
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
      case "clip":
        return this.syncClips(stashInstanceId, isFullSync, lastSyncTime);
      case "image":
        return this.syncImages(stashInstanceId, isFullSync, lastSyncTime);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  /**
   * Incremental sync - fetches only changed entities
   * Uses per-entity-type timestamps so each entity type syncs from its own last sync time
   */
  async incrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.syncInProgress) {
      logger.warn("Sync already in progress, skipping");
      return [];
    }

    this.syncInProgress = true;
    this.abortController = new AbortController();

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.incrementalSyncAllInstances();
      }
      return await this.incrementalSyncInstance(stashInstanceId);
    } finally {
      this.syncInProgress = false;
      this.abortController = null;
    }
  }

  /**
   * Incremental sync all enabled instances
   * Note: Assumes syncInProgress is already set by caller
   */
  private async incrementalSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(`Starting incremental sync for ${enabledInstances.length} instance(s)...`);
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Incremental sync instance: ${instance.name} (${instance.id})`);
      try {
        const results = await this.incrementalSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        logger.error(`Failed to incremental sync instance ${instance.name}`, {
          instanceId: instance.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other instances
      }
    }

    return allResults;
  }

  /**
   * Incremental sync a single instance
   * Note: Assumes syncInProgress is already set by caller
   */
  private async incrementalSyncInstance(stashInstanceId: string): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting incremental sync with per-entity timestamps...", { stashInstanceId });

      // Entity types in dependency order (tags first since others reference them)
      const entityTypes: EntityType[] = [
        "tag",
        "studio",
        "performer",
        "group",
        "gallery",
        "scene",
        "clip",
        "image",
      ];

      for (const entityType of entityTypes) {
        this.checkAbort();

        // Get THIS entity type's last sync timestamp
        const syncState = await this.getEntitySyncState(stashInstanceId, entityType);
        const lastSync = this.getMostRecentSyncTime(syncState);

        if (!lastSync) {
          // Never synced - do full sync for this entity type only
          logger.info(`${entityType}: No previous sync, syncing all`);
          const result = await this.syncEntityType(entityType, stashInstanceId, true);
          results.push(result);
          await this.saveSyncState(stashInstanceId, "full", result);
        } else {
          // Incremental sync using this entity's own timestamp
          // lastSync is now a raw RFC3339 string from Stash
          logger.info(`${entityType}: syncing changes since ${lastSync}`);
          const result = await this.syncEntityType(entityType, stashInstanceId, false, lastSync);
          results.push(result);
          await this.saveSyncState(stashInstanceId, "incremental", result);
        }
      }

      // Cleanup deleted entities (detect deletions/merges in Stash)
      logger.info("Checking for deleted entities...");
      let totalDeleted = 0;
      for (const entityType of entityTypes) {
        this.checkAbort();
        const deleted = await this.cleanupDeletedEntities(entityType, stashInstanceId);
        totalDeleted += deleted;
        // Update the result for this entity type with deleted count
        const result = results.find((r) => r.entityType === entityType);
        if (result) {
          result.deleted = deleted;
        }
      }
      if (totalDeleted > 0) {
        logger.info(`Cleanup complete: ${totalDeleted} entities marked as deleted`);
      }

      // Apply gallery inheritance if images or galleries were synced
      // (galleries may have new performers/tags that need to propagate to images)
      const imageResult = results.find((r) => r.entityType === "image");
      const galleryResult = results.find((r) => r.entityType === "gallery");
      if ((imageResult && imageResult.synced > 0) || (galleryResult && galleryResult.synced > 0)) {
        logger.info("Applying gallery inheritance after incremental sync...");
        await imageGalleryInheritanceService.applyGalleryInheritance();
        logger.info("Gallery inheritance complete");
      }

      // Compute inherited tags for scenes if scenes were updated
      const sceneResult = results.find((r) => r.entityType === "scene");
      if (sceneResult && sceneResult.synced > 0) {
        logger.info("Computing inherited tags for scenes after incremental sync...");
        await sceneTagInheritanceService.computeInheritedTags();
        logger.info("Scene tag inheritance complete");
      }

      // Rebuild inherited image counts (must happen after gallery inheritance)
      logger.info("Rebuilding inherited image counts...");
      await entityImageCountService.rebuildAllImageCounts();
      logger.info("Inherited image counts rebuild complete");

      logger.info("Rebuilding user stats after sync...");
      await userStatsService.rebuildAllStats();
      logger.info("User stats rebuild complete");

      // Compute tag scene counts via performers
      await this.computeTagSceneCountsViaPerformers();

      // Recompute exclusions for all users after sync
      logger.info("Sync complete, recomputing user exclusions...");
      await exclusionComputationService.recomputeAllUsers();
      logger.info("User exclusions recomputed");

      const duration = Date.now() - startTime;
      logger.info("Incremental sync completed", {
        durationMs: duration,
        results: results.map((r) => ({ type: r.entityType, synced: r.synced, deleted: r.deleted })),
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
    // Resolve instance ID - use first enabled instance if not specified
    const instanceId = stashInstanceId ?? this.getFirstEnabledInstanceId();
    if (!instanceId) {
      logger.warn("Cannot sync single entity: no enabled Stash instances");
      return;
    }

    logger.info("Single entity sync", { entityType, entityId, action, instanceId });

    if (action === "delete") {
      // Soft delete the entity
      await this.softDeleteEntity(entityType, entityId, instanceId);
      return;
    }

    // Fetch and upsert the entity
    const stash = this.getStashClient(instanceId);

    switch (entityType) {
      case "scene": {
        // Use findScenes with ids filter for single scene
        const result = await stash.findScenes({ ids: [entityId] });
        if (result.findScenes.scenes.length > 0) {
          await this.processScenesBatch(result.findScenes.scenes as Scene[], instanceId, 0, 1);
        }
        break;
      }
      case "performer": {
        const result = await stash.findPerformers({ ids: [entityId] });
        if (result.findPerformers.performers.length > 0) {
          await this.processPerformersBatch(
            result.findPerformers.performers as Performer[],
            instanceId
          );
        }
        break;
      }
      case "studio": {
        const result = await stash.findStudios({ ids: [entityId] });
        if (result.findStudios.studios.length > 0) {
          await this.processStudiosBatch(result.findStudios.studios as Studio[], instanceId);
        }
        break;
      }
      case "tag": {
        const result = await stash.findTags({ ids: [entityId] });
        if (result.findTags.tags.length > 0) {
          await this.processTagsBatch(result.findTags.tags as Tag[], instanceId);
        }
        break;
      }
      case "group": {
        const result = await stash.findGroup({ id: entityId });
        if (result.findGroup) {
          await this.processGroupsBatch([result.findGroup as Group], instanceId);
        }
        break;
      }
      case "gallery": {
        const result = await stash.findGallery({ id: entityId });
        if (result.findGallery) {
          await this.processGalleriesBatch([result.findGallery as Gallery], instanceId);
        }
        break;
      }
      case "image": {
        const result = await stash.findImages({ image_ids: [parseInt(entityId, 10)] });
        if (result.findImages.images.length > 0) {
          await this.processImagesBatch(result.findImages.images, instanceId);
        }
        break;
      }
    }
  }

  /**
   * Get the ID of the first enabled Stash instance
   */
  private getFirstEnabledInstanceId(): string | undefined {
    const enabledInstances = stashInstanceManager.getAllEnabled();
    return enabledInstances.length > 0 ? enabledInstances[0].id : undefined;
  }

  // ==================== Scene Sync ====================

  private async syncScenes(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing scenes...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
        // Use formatTimestampForStash to handle Stash's timezone quirks
        const sceneFilter = lastSyncTime
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
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

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(scenes as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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
    stashInstanceId: string,
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
    const instanceId = stashInstanceId;

    // Bulk delete all junction records for this batch
    // Uses sequential raw SQL in a transaction to avoid SQLite lock contention
    // and includes extended timeout for large libraries
    const sceneIdList = sceneIds.map((id) => `'${this.escape(id)}'`).join(",");
    const escapedInstanceId = this.escape(instanceId);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM ScenePerformer WHERE sceneId IN (${sceneIdList}) AND sceneInstanceId = '${escapedInstanceId}'`
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM SceneTag WHERE sceneId IN (${sceneIdList}) AND sceneInstanceId = '${escapedInstanceId}'`
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM SceneGroup WHERE sceneId IN (${sceneIdList}) AND sceneInstanceId = '${escapedInstanceId}'`
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM SceneGallery WHERE sceneId IN (${sceneIdList}) AND sceneInstanceId = '${escapedInstanceId}'`
        );
      },
      { timeout: 60000 } // 60 second timeout for large batches
    );

    // Build bulk scene upsert using raw SQL
    const sceneValues = validScenes
      .map((scene) => {
        const file = scene.files?.[0];
        const paths = scene.paths as any; // Cast to any to access optional chapters_vtt
        // Extract phashes from files
        const { phash, phashes } = extractPhashes(scene.files);

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
      ${this.escapeNullable(JSON.stringify(scene.captions || []))},
      ${this.escapeNullable(JSON.stringify(scene.sceneStreams || []))},
      ${scene.o_counter ?? 0},
      ${scene.play_count ?? 0},
      ${scene.play_duration ?? 0},
      ${scene.created_at ? `'${scene.created_at}'` : "NULL"},
      ${scene.updated_at ? `'${scene.updated_at}'` : "NULL"},
      datetime('now'),
      NULL,
      ${this.escapeNullable(phash)},
      ${this.escapeNullable(phashes)}
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashScene (
      id, stashInstanceId, title, code, date, studioId, rating100, duration,
      organized, details, director, urls, filePath, fileBitRate, fileFrameRate, fileWidth,
      fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
      pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption, captions,
      streams, oCounter, playCount, playDuration, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt, phash, phashes
    ) VALUES ${sceneValues}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
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
      captions = excluded.captions,
      streams = excluded.streams,
      oCounter = excluded.oCounter,
      playCount = excluded.playCount,
      playDuration = excluded.playDuration,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL,
      phash = excluded.phash,
      phashes = excluded.phashes
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
            `('${this.escape(scene.id)}', '${this.escape(instanceId)}', '${this.escape(p.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
      for (const t of scene.tags || []) {
        if (validateEntityId(t.id)) {
          tagRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
      for (const g of scene.groups || []) {
        const groupObj = (g as any).group || g;
        if (validateEntityId(groupObj.id)) {
          const index = (g as any).scene_index ?? "NULL";
          groupRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(instanceId)}', '${this.escape(groupObj.id)}', '${this.escape(instanceId)}', ${index})`
          );
        }
      }
      for (const g of scene.galleries || []) {
        if (validateEntityId(g.id)) {
          galleryRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(instanceId)}', '${this.escape(g.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
    }

    // Batch insert junction records
    const inserts = [];

    if (performerRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO ScenePerformer (sceneId, sceneInstanceId, performerId, performerInstanceId) VALUES ${performerRecords.join(",")}`
        )
      );
    }
    if (tagRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneTag (sceneId, sceneInstanceId, tagId, tagInstanceId) VALUES ${tagRecords.join(",")}`
        )
      );
    }
    if (groupRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneGroup (sceneId, sceneInstanceId, groupId, groupInstanceId, sceneIndex) VALUES ${groupRecords.join(",")}`
        )
      );
    }
    if (galleryRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO SceneGallery (sceneId, sceneInstanceId, galleryId, galleryInstanceId) VALUES ${galleryRecords.join(",")}`
        )
      );
    }

    await Promise.all(inserts);

  }

  /**
   * Cleanup entities that no longer exist in Stash.
   * Called during full sync after each entity type has been synced.
   *
   * Fetches all entity IDs from Stash using pagination and soft-deletes any
   * entities in Peek that are not present in Stash (due to deletion or merge).
   */
  private async cleanupDeletedEntities(entityType: EntityType, stashInstanceId: string): Promise<number> {
    const plural = ENTITY_PLURALS[entityType];
    logger.info(`Checking for deleted ${plural}...`);
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);

    // Larger page size for ID-only fetches (IDs are small strings)
    const CLEANUP_PAGE_SIZE = 5000;

    try {
      // Fetch all IDs from Stash using pagination
      const stashIds: string[] = [];
      let page = 1;
      let totalCount = 0;
      let fetchedCount = 0;

      while (true) {
        this.checkAbort();

        let pageIds: string[];
        let count: number;

        switch (entityType) {
          case "scene": {
            const result = await stash.findSceneIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findScenes.scenes.map((s) => s.id);
            count = result.findScenes.count;
            break;
          }
          case "performer": {
            const result = await stash.findPerformerIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findPerformers.performers.map((p) => p.id);
            count = result.findPerformers.count;
            break;
          }
          case "studio": {
            const result = await stash.findStudioIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findStudios.studios.map((s) => s.id);
            count = result.findStudios.count;
            break;
          }
          case "tag": {
            const result = await stash.findTagIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findTags.tags.map((t) => t.id);
            count = result.findTags.count;
            break;
          }
          case "group": {
            const result = await stash.findGroupIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findGroups.groups.map((g) => g.id);
            count = result.findGroups.count;
            break;
          }
          case "gallery": {
            const result = await stash.findGalleryIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findGalleries.galleries.map((g) => g.id);
            count = result.findGalleries.count;
            break;
          }
          case "image": {
            const result = await stash.findImageIDs({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findImages.images.map((i) => i.id);
            count = result.findImages.count;
            break;
          }
          case "clip": {
            const result = await stash.findSceneMarkers({ filter: { per_page: CLEANUP_PAGE_SIZE, page } });
            pageIds = result.findSceneMarkers.scene_markers.map((m) => m.id);
            count = result.findSceneMarkers.count;
            break;
          }
          default:
            logger.warn(`Unknown entity type for cleanup: ${entityType}`);
            return 0;
        }

        // Guard against missing count field (would cause infinite loop)
        if (typeof count !== "number") {
          throw new Error(`API response missing count field for ${entityType} cleanup`);
        }

        totalCount = count;
        stashIds.push(...pageIds);
        fetchedCount += pageIds.length;

        if (fetchedCount >= totalCount || pageIds.length === 0) {
          break;
        }
        page++;
      }

      logger.debug(`Found ${stashIds.length} ${plural} in Stash (fetched in ${page} pages)`);

      // Check for abort before proceeding with database updates
      this.checkAbort();

      // Soft delete all entities that exist in Peek but not in Stash
      const now = new Date();
      let deletedCount = 0;

      switch (entityType) {
        case "scene": {
          // For large libraries (100k+ scenes), we use a temp table approach to avoid:
          // 1. Loading all scene IDs into memory
          // 2. Exceeding SQLite's parameter limit (~32k)
          //
          // Strategy: Insert stashIds into temp table, then query scenes NOT IN temp table

          // Create temp table and populate with Stash IDs in batches
          await prisma.$executeRawUnsafe(`CREATE TEMP TABLE IF NOT EXISTS _stash_scene_ids (id TEXT PRIMARY KEY)`);
          await prisma.$executeRawUnsafe(`DELETE FROM _stash_scene_ids`);

          const BATCH_SIZE = 500;
          for (let i = 0; i < stashIds.length; i += BATCH_SIZE) {
            const batch = stashIds.slice(i, i + BATCH_SIZE);
            if (batch.length > 0) {
              const values = batch.map((id) => `('${id}')`).join(",");
              await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO _stash_scene_ids (id) VALUES ${values}`);
            }
          }

          // Find scenes to delete (in local DB but not in Stash) - only fetch what we need
          const instanceFilter = stashInstanceId ? `stashInstanceId = '${stashInstanceId}'` : `stashInstanceId IS NULL`;
          const scenesToDelete = await prisma.$queryRawUnsafe<Array<{ id: string; phash: string | null }>>(
            `SELECT id, phash FROM StashScene
             WHERE deletedAt IS NULL
             AND ${instanceFilter}
             AND id NOT IN (SELECT id FROM _stash_scene_ids)`
          );

          if (scenesToDelete.length > 0) {
            // Check for merges and reconcile user data before soft-deleting
            for (const scene of scenesToDelete) {
              if (scene.phash) {
                // Try to find a merge target
                const matches = await mergeReconciliationService.findPhashMatches(scene.id);
                if (matches.length > 0) {
                  const target = matches[0]; // Use the recommended match
                  logger.info(`Detected merge: scene ${scene.id} -> ${target.sceneId}`);
                  await mergeReconciliationService.reconcileScene(
                    scene.id,
                    target.sceneId,
                    scene.phash,
                    null // automatic
                  );
                }
              }
            }

            // Soft-delete in batches
            const deleteIds = scenesToDelete.map((s) => s.id);
            const instanceId = stashInstanceId;
            for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
              const batch = deleteIds.slice(i, i + BATCH_SIZE);
              await prisma.stashScene.updateMany({
                where: { id: { in: batch }, stashInstanceId: instanceId },
                data: { deletedAt: now },
              });
            }
            deletedCount = deleteIds.length;
          }

          // Clean up temp table
          await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS _stash_scene_ids`);
          break;
        }
        case "performer": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashPerformer.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "studio": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashStudio.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "tag": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashTag.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "group": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashGroup.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "gallery": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashGallery.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "image": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashImage.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
        case "clip": {
          const cleanupInstanceId = stashInstanceId;
          deletedCount = (await prisma.stashClip.updateMany({
            where: { deletedAt: null, stashInstanceId: cleanupInstanceId, id: { notIn: stashIds } },
            data: { deletedAt: now },
          })).count;
          break;
        }
      }

      if (deletedCount === 0) {
        logger.info(`No deleted ${plural} found`);
        return 0;
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        `Marked ${deletedCount} ${plural} as deleted in ${(durationMs / 1000).toFixed(1)}s`
      );

      return deletedCount;
    } catch (error) {
      logger.error(`Failed to cleanup deleted ${plural}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - cleanup is a best-effort operation
      return 0;
    }
  }

  // ==================== Performer Sync ====================

  private async syncPerformers(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing performers...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findPerformers({
          filter: { page, per_page: this.PAGE_SIZE },
          performer_filter: performerFilter as any,
        });

        const performers = result.findPerformers.performers;
        totalCount = result.findPerformers.count;

        if (performers.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(performers as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (performers.length === 0) return;

    // Validate IDs
    const validPerformers = performers.filter(p => validateEntityId(p.id));
    if (validPerformers.length === 0) return;

    const values = validPerformers
      .map((performer) => {
        // Serialize stash_ids array to JSON for deduplication
        const stashIds = (performer as any).stash_ids;
        const stashIdsJson = stashIds && stashIds.length > 0
          ? JSON.stringify(stashIds.map((s: { endpoint: string; stash_id: string }) => ({
              endpoint: s.endpoint,
              stash_id: s.stash_id,
            })))
          : null;

        return `(
      '${this.escape(performer.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(stashIdsJson)},
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
      id, stashInstanceId, stashIds, name, disambiguation, gender, birthdate, favorite,
      rating100, details, aliasList,
      country, ethnicity, hairColor, eyeColor, heightCm, weightKg, measurements, fakeTits,
      tattoos, piercings, careerLength, deathDate, url, imagePath,
      sceneCount, imageCount, galleryCount, groupCount,
      stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
      stashIds = excluded.stashIds,
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

    // Sync performer tags to PerformerTag junction table (batched for performance)
    const instanceId = stashInstanceId;

    // Collect all tag relationships for batch insert
    const tagInserts: { performerId: string; tagId: string }[] = [];
    for (const performer of validPerformers) {
      const performerTags = (performer as any).tags;
      if (performerTags && Array.isArray(performerTags) && performerTags.length > 0) {
        for (const tag of performerTags) {
          if (tag?.id && validateEntityId(tag.id)) {
            tagInserts.push({
              performerId: performer.id,
              tagId: tag.id,
            });
          }
        }
      }
    }

    // Bulk delete existing tags for all performers in this batch
    const performerIds = validPerformers.map((p) => `'${this.escape(p.id)}'`).join(",");
    await prisma.$executeRawUnsafe(
      `DELETE FROM PerformerTag WHERE performerId IN (${performerIds}) AND performerInstanceId = '${this.escape(instanceId)}'`
    );

    // Bulk insert all new tags
    if (tagInserts.length > 0) {
      const tagValues = tagInserts
        .map((t) => `('${this.escape(t.performerId)}', '${this.escape(instanceId)}', '${this.escape(t.tagId)}', '${this.escape(instanceId)}')`)
        .join(", ");

      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO PerformerTag (performerId, performerInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
      );
    }
  }

  // ==================== Studio Sync ====================

  private async syncStudios(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing studios...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findStudios({
          filter: { page, per_page: this.PAGE_SIZE },
          studio_filter: studioFilter as any,
        });

        const studios = result.findStudios.studios;
        totalCount = result.findStudios.count;

        if (studios.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(studios as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (studios.length === 0) return;

    // Validate IDs
    const validStudios = studios.filter(s => validateEntityId(s.id));
    if (validStudios.length === 0) return;

    const values = validStudios
      .map((studio) => {
        // Serialize stash_ids array to JSON for deduplication
        const stashIds = (studio as any).stash_ids;
        const stashIdsJson = stashIds && stashIds.length > 0
          ? JSON.stringify(stashIds.map((s: { endpoint: string; stash_id: string }) => ({
              endpoint: s.endpoint,
              stash_id: s.stash_id,
            })))
          : null;

        return `(
      '${this.escape(studio.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(stashIdsJson)},
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
      id, stashInstanceId, stashIds, name, parentId, favorite, rating100,
      sceneCount, imageCount, galleryCount, performerCount, groupCount,
      details, url, imagePath, stashCreatedAt,
      stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
      stashIds = excluded.stashIds,
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
    const instanceId = stashInstanceId;
    for (const studio of validStudios) {
      const studioTags = (studio as any).tags;
      if (studioTags && Array.isArray(studioTags) && studioTags.length > 0) {
        const studioId = studio.id;

        // Delete existing tags for this studio
        await prisma.$executeRawUnsafe(
          `DELETE FROM StudioTag WHERE studioId = '${this.escape(studioId)}' AND studioInstanceId = '${this.escape(instanceId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = studioTags.filter((t: any) => t?.id && validateEntityId(t.id));
        if (validTags.length > 0) {
          const tagValues = validTags
            .map((t: any) => `('${this.escape(studioId)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`)
            .join(", ");

          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO StudioTag (studioId, studioInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
          );
        }
      }
    }
  }

  // ==================== Tag Sync ====================

  private async syncTags(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing tags...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findTags({
          filter: { page, per_page: this.PAGE_SIZE },
          tag_filter: tagFilter as any,
        });

        const tags = result.findTags.tags;
        totalCount = result.findTags.count;

        if (tags.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(tags as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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

  private async processTagsBatch(tags: Tag[], stashInstanceId: string): Promise<void> {
    // Skip empty batches
    if (tags.length === 0) return;

    // Validate IDs
    const validTags = tags.filter(t => validateEntityId(t.id));
    if (validTags.length === 0) return;

    const values = validTags
      .map((tag) => {
        const parentIds = tag.parents?.map((p) => p.id) || [];
        const aliases = (tag as any).aliases || [];
        // Serialize stash_ids array to JSON for deduplication
        const stashIds = (tag as any).stash_ids;
        const stashIdsJson = stashIds && stashIds.length > 0
          ? JSON.stringify(stashIds.map((s: { endpoint: string; stash_id: string }) => ({
              endpoint: s.endpoint,
              stash_id: s.stash_id,
            })))
          : null;

        return `(
      '${this.escape(tag.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(stashIdsJson)},
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
      ${this.escapeNullable((tag as any).color)},
      ${tag.created_at ? `'${tag.created_at}'` : "NULL"},
      ${tag.updated_at ? `'${tag.updated_at}'` : "NULL"},
      datetime('now'),
      NULL
    )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
    INSERT INTO StashTag (
      id, stashInstanceId, stashIds, name, favorite,
      sceneCount, imageCount, galleryCount, performerCount, studioCount, groupCount, sceneMarkerCount,
      description, aliases, parentIds, imagePath, color, stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
      stashIds = excluded.stashIds,
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
      color = excluded.color,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
  }

  // ==================== Group Sync ====================

  private async syncGroups(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing groups...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findGroups({
          filter: { page, per_page: this.PAGE_SIZE },
          group_filter: groupFilter as any,
        });

        const groups = result.findGroups.groups;
        totalCount = result.findGroups.count;

        if (groups.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(groups as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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

  private async processGroupsBatch(groups: Group[], stashInstanceId: string): Promise<void> {
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
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
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
    const instanceId = stashInstanceId;
    for (const group of validGroups) {
      const groupTags = (group as any).tags;
      if (groupTags && Array.isArray(groupTags) && groupTags.length > 0) {
        const groupId = group.id;

        // Delete existing tags for this group
        await prisma.$executeRawUnsafe(
          `DELETE FROM GroupTag WHERE groupId = '${this.escape(groupId)}' AND groupInstanceId = '${this.escape(instanceId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = groupTags.filter((t: any) => t?.id && validateEntityId(t.id));
        if (validTags.length > 0) {
          const tagValues = validTags
            .map((t: any) => `('${this.escape(groupId)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`)
            .join(", ");

          await prisma.$executeRawUnsafe(
            `INSERT OR IGNORE INTO GroupTag (groupId, groupInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
          );
        }
      }
    }
  }

  // ==================== Gallery Sync ====================

  private async syncGalleries(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing galleries...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findGalleries({
          filter: { page, per_page: this.PAGE_SIZE },
          gallery_filter: galleryFilter as any,
        });

        const galleries = result.findGalleries.galleries;
        totalCount = result.findGalleries.count;

        if (galleries.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(galleries as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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
    stashInstanceId: string
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
        // Cover image ID for dimension lookup
        const coverImageId = (gallery as any).cover?.id || null;
        return `(
      '${this.escape(gallery.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(gallery.title)},
      ${this.escapeNullable(gallery.date)},
      ${gallery.studio?.id ? `'${this.escape(gallery.studio.id)}'` : "NULL"},
      ${gallery.rating100 ?? "NULL"},
      ${coverImageId ? `'${this.escape(coverImageId)}'` : "NULL"},
      ${gallery.image_count ?? 0},
      ${this.escapeNullable(gallery.details)},
      ${this.escapeNullable(gallery.url)},
      ${this.escapeNullable(gallery.code)},
      ${this.escapeNullable((gallery as any).photographer)},
      ${this.escapeNullable((gallery as any).urls ? JSON.stringify((gallery as any).urls) : null)},
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
      id, stashInstanceId, title, date, studioId, rating100, coverImageId, imageCount,
      details, url, code, photographer, urls, folderPath, fileBasename, coverPath, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      coverImageId = excluded.coverImageId,
      imageCount = excluded.imageCount,
      details = excluded.details,
      url = excluded.url,
      code = excluded.code,
      photographer = excluded.photographer,
      urls = excluded.urls,
      folderPath = excluded.folderPath,
      fileBasename = excluded.fileBasename,
      coverPath = excluded.coverPath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

    // Sync gallery performers (junction table)
    const instanceId = stashInstanceId;
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
      DELETE FROM GalleryPerformer WHERE galleryId IN (${galleryIds}) AND galleryInstanceId = '${this.escape(instanceId)}'
    `);

    // Insert new gallery-performer relationships
    if (performerInserts.length > 0) {
      const performerValues = performerInserts
        .map((p) => `('${this.escape(p.galleryId)}', '${this.escape(instanceId)}', '${this.escape(p.performerId)}', '${this.escape(instanceId)}')`)
        .join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO GalleryPerformer (galleryId, galleryInstanceId, performerId, performerInstanceId)
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
      DELETE FROM GalleryTag WHERE galleryId IN (${galleryIds}) AND galleryInstanceId = '${this.escape(instanceId)}'
    `);

    // Insert new gallery-tag relationships
    if (tagInserts.length > 0) {
      const tagValues = tagInserts
        .map((t) => `('${this.escape(t.galleryId)}', '${this.escape(instanceId)}', '${this.escape(t.tagId)}', '${this.escape(instanceId)}')`)
        .join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO GalleryTag (galleryId, galleryInstanceId, tagId, tagInstanceId)
        VALUES ${tagValues}
      `);
    }
  }

  // ==================== Image Sync ====================

  private async syncImages(
    stashInstanceId: string,
    isFullSync: boolean,
    lastSyncTime?: string
  ): Promise<SyncResult> {
    logger.info("Syncing images...");
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let page = 1;
    let totalSynced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

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
          ? { updated_at: { modifier: "GREATER_THAN", value: formatTimestampForStash(lastSyncTime) } }
          : undefined;

        const result = await stash.findImages({
          filter: { page, per_page: this.PAGE_SIZE },
          image_filter: imageFilter as any,
        });

        const images = result.findImages.images;
        totalCount = result.findImages.count;

        if (images.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(images as Array<{ updated_at?: string | null }>);
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

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
        maxUpdatedAt,
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

  /**
   * Sync clips (scene markers) from Stash
   */
  async syncClips(stashInstanceId: string, isFullSync = false, since?: string): Promise<SyncResult> {
    logger.info("Syncing clips...");
    const startTime = Date.now();
    const client = this.getStashClient(stashInstanceId);
    let synced = 0;
    let totalCount = 0;
    let maxUpdatedAt: string | undefined;

    this.emit("progress", {
      entityType: "clip",
      phase: "fetching",
      current: 0,
      total: 0,
    } as SyncProgress);

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        this.checkAbort();

        const filter: FindFilterType = {
          page,
          per_page: this.PAGE_SIZE,
          sort: "updated_at",
          direction: SortDirectionEnum.Asc,
        };

        const markerFilter: SceneMarkerFilterType = {};
        if (since && !isFullSync) {
          markerFilter.updated_at = {
            modifier: CriterionModifier.GreaterThan,
            value: formatTimestampForStash(since),
          };
        }

        const result = await client.findSceneMarkers({
          filter,
          scene_marker_filter: Object.keys(markerFilter).length > 0 ? markerFilter : undefined,
        });

        const markers = result.findSceneMarkers.scene_markers;
        totalCount = result.findSceneMarkers.count;

        if (markers.length === 0) {
          hasMore = false;
          break;
        }

        // Track max updated_at for next incremental sync
        const batchMax = getMaxUpdatedAt(markers);
        if (batchMax) {
          maxUpdatedAt = getMostRecentTimestamp(maxUpdatedAt || null, batchMax) || maxUpdatedAt;
        }

        // Build preview URLs for probing
        // Note: m.preview is already a full URL from Stash, just append API key
        const apiKey = stashInstanceManager.getApiKey();
        const previewUrls = markers.map((m) => `${m.preview}?apikey=${apiKey}`);

        // Probe previews in batch
        const probeResults = await clipPreviewProber.probeBatch(previewUrls);

        // Upsert clips
        const instanceId = stashInstanceId;
        for (let i = 0; i < markers.length; i++) {
          const marker = markers[i];
          const previewUrl = previewUrls[i];

          const clipData = {
            sceneId: marker.scene.id,
            sceneInstanceId: instanceId,
            title: marker.title || null,
            seconds: marker.seconds,
            endSeconds: marker.end_seconds || null,
            primaryTagId: marker.primary_tag.id,
            primaryTagInstanceId: instanceId,
            previewPath: marker.preview,
            screenshotPath: marker.screenshot,
            streamPath: marker.stream,
            isGenerated: probeResults.get(previewUrl) ?? false,
            generationCheckedAt: new Date(),
            stashCreatedAt: marker.created_at ? new Date(marker.created_at) : null,
            stashUpdatedAt: marker.updated_at ? new Date(marker.updated_at) : null,
            syncedAt: new Date(),
            deletedAt: null,
          };

          await prisma.stashClip.upsert({
            where: {
              id_stashInstanceId: {
                id: marker.id,
                stashInstanceId: instanceId,
              },
            },
            create: { id: marker.id, stashInstanceId: instanceId, ...clipData },
            update: clipData,
          });

          // Sync clip tags (junction table)
          await prisma.clipTag.deleteMany({
            where: {
              clipId: marker.id,
              clipInstanceId: instanceId,
            },
          });

          const tagIds = marker.tags.map((t) => t.id);
          if (tagIds.length > 0) {
            const tagValues = tagIds
              .map((tagId) => `('${this.escape(marker.id)}', '${this.escape(instanceId)}', '${this.escape(tagId)}', '${this.escape(instanceId)}')`)
              .join(", ");
            await prisma.$executeRawUnsafe(
              `INSERT OR IGNORE INTO ClipTag (clipId, clipInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
            );
          }
        }

        synced += markers.length;
        this.emit("progress", {
          entityType: "clip",
          phase: "processing",
          current: synced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(`Clips: ${synced}/${totalCount} (${Math.round((synced / totalCount) * 100)}%)`);

        if (synced >= totalCount) break;
        page++;
        hasMore = markers.length === this.PAGE_SIZE;
      }

      this.emit("progress", {
        entityType: "clip",
        phase: "complete",
        current: synced,
        total: synced,
      } as SyncProgress);

      const durationMs = Date.now() - startTime;
      logger.info(`Clips synced: ${synced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`);

      return {
        entityType: "clip",
        synced,
        deleted: 0,
        durationMs,
        maxUpdatedAt,
      };
    } catch (error) {
      this.emit("progress", {
        entityType: "clip",
        phase: "error",
        current: synced,
        total: totalCount,
        message: error instanceof Error ? error.message : String(error),
      } as SyncProgress);
      throw error;
    }
  }

  private async processImagesBatch(images: any[], stashInstanceId: string): Promise<void> {
    // Skip empty batches
    if (images.length === 0) return;

    // Validate IDs
    const validImages = images.filter((i: any) => validateEntityId(i.id));
    if (validImages.length === 0) return;

    const imageIds = validImages.map((i: any) => i.id);
    const instanceId = stashInstanceId;

    // Bulk delete junction records
    // Uses sequential raw SQL in a transaction to avoid SQLite lock contention
    // and includes extended timeout for large libraries
    const imageIdList = imageIds.map((id: string) => `'${this.escape(id)}'`).join(",");
    const escapedInstanceId = this.escape(instanceId);
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM ImagePerformer WHERE imageId IN (${imageIdList}) AND imageInstanceId = '${escapedInstanceId}'`
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM ImageTag WHERE imageId IN (${imageIdList}) AND imageInstanceId = '${escapedInstanceId}'`
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM ImageGallery WHERE imageId IN (${imageIdList}) AND imageInstanceId = '${escapedInstanceId}'`
        );
      },
      { timeout: 60000 } // 60 second timeout for large batches
    );

    // Build bulk image upsert
    const values = validImages.map((image: any) => {
      const visualFile = image.visual_files?.[0] || image.files?.[0];
      const paths = image.paths;
      return `(
        '${this.escape(image.id)}',
        ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
        ${this.escapeNullable(image.title)},
        ${this.escapeNullable(image.code)},
        ${this.escapeNullable(image.details)},
        ${this.escapeNullable(image.photographer)},
        ${this.escapeNullable(image.urls ? JSON.stringify(image.urls) : null)},
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
        id, stashInstanceId, title, code, details, photographer, urls, date, studioId, rating100, oCounter, organized,
        filePath, width, height, fileSize, pathThumbnail, pathPreview, pathImage,
        stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
      ) VALUES ${values}
      ON CONFLICT(id, stashInstanceId) DO UPDATE SET
        title = excluded.title,
        code = excluded.code,
        details = excluded.details,
        photographer = excluded.photographer,
        urls = excluded.urls,
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
          performerRecords.push(`('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(p.id)}', '${this.escape(instanceId)}')`);
        }
      }
      for (const t of image.tags || []) {
        if (validateEntityId(t.id)) {
          tagRecords.push(`('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`);
        }
      }
      for (const g of image.galleries || []) {
        if (validateEntityId(g.id)) {
          galleryRecords.push(`('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(g.id)}', '${this.escape(instanceId)}')`);
        }
      }
    }

    // Batch insert junction records
    const inserts = [];

    if (performerRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImagePerformer (imageId, imageInstanceId, performerId, performerInstanceId) VALUES ${performerRecords.join(',')}`
      ));
    }
    if (tagRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImageTag (imageId, imageInstanceId, tagId, tagInstanceId) VALUES ${tagRecords.join(',')}`
      ));
    }
    if (galleryRecords.length > 0) {
      inserts.push(prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ImageGallery (imageId, imageInstanceId, galleryId, galleryInstanceId) VALUES ${galleryRecords.join(',')}`
      ));
    }

    await Promise.all(inserts);
  }

  // ==================== Helper Methods ====================

  private checkAbort(): void {
    if (this.abortController?.signal.aborted) {
      throw new Error("Sync aborted");
    }
  }

  private async softDeleteEntity(entityType: EntityType, entityId: string, stashInstanceId: string): Promise<void> {
    const now = new Date();
    const instanceId = stashInstanceId;

    switch (entityType) {
      case "scene":
        await prisma.stashScene.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "performer":
        await prisma.stashPerformer.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "studio":
        await prisma.stashStudio.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "tag":
        await prisma.stashTag.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "group":
        await prisma.stashGroup.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "gallery":
        await prisma.stashGallery.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "image":
        await prisma.stashImage.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
      case "clip":
        await prisma.stashClip.update({
          where: { id_stashInstanceId: { id: entityId, stashInstanceId: instanceId } },
          data: { deletedAt: now },
        });
        break;
    }
  }

  /**
   * Save sync state for a single entity type immediately after sync completes.
   *
   * Uses the maxUpdatedAt from synced entities (if available) instead of the current time.
   * This prevents race conditions where entities added during sync would be missed.
   *
   * We store the raw RFC3339 timestamp string from Stash (with timezone info) as the source
   * of truth for sync queries. This avoids all timezone conversion bugs.
   *
   * When no entities are synced (result.synced === 0), we do NOT update the sync timestamp.
   * Without maxUpdatedAt from synced entities, we have no reliable timestamp to store.
   */
  private async saveSyncState(
    stashInstanceId: string,
    syncType: "full" | "incremental",
    result: SyncResult
  ): Promise<void> {
    const instanceId = stashInstanceId;

    // Actual time (real UTC) for display purposes
    const actualTime = new Date();

    // Build update data - only include sync timestamp if we have one
    const updateData: Record<string, unknown> = {
      lastSyncCount: result.synced,
      lastSyncDurationMs: result.durationMs,
      lastError: result.error ?? null,
    };

    // Only update timestamp fields if we have a valid timestamp from synced entities
    if (result.maxUpdatedAt) {
      if (syncType === "full") {
        // Store raw timestamp string (new field)
        updateData.lastFullSyncTimestamp = result.maxUpdatedAt;
        updateData.lastFullSyncActual = actualTime;
      } else {
        // Store raw timestamp string (new field)
        updateData.lastIncrementalSyncTimestamp = result.maxUpdatedAt;
        updateData.lastIncrementalSyncActual = actualTime;
      }
      // Only update totalEntities when we actually sync something
      updateData.totalEntities = result.synced;
    }

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
      // For new records, we need to include entityType and stashInstanceId
      await prisma.syncState.create({
        data: {
          stashInstanceId: instanceId,
          entityType: result.entityType,
          ...(result.maxUpdatedAt
            ? syncType === "full"
              ? { lastFullSyncTimestamp: result.maxUpdatedAt, lastFullSyncActual: actualTime }
              : { lastIncrementalSyncTimestamp: result.maxUpdatedAt, lastIncrementalSyncActual: actualTime }
            : {}),
          lastSyncCount: result.synced,
          lastSyncDurationMs: result.durationMs,
          lastError: result.error ?? null,
          totalEntities: result.synced,
        },
      });
    }
  }

  private async updateAllSyncStates(
    stashInstanceId: string,
    syncType: "full" | "incremental",
    results: SyncResult[],
    _totalDurationMs: number
  ): Promise<void> {
    const instanceId = stashInstanceId;

    for (const result of results) {
      // Actual time (real UTC) for display purposes
      const actualTime = new Date();

      // Find existing sync state
      const existing = await prisma.syncState.findFirst({
        where: {
          stashInstanceId: instanceId,
          entityType: result.entityType,
        },
      });

      // Build update data - only include sync timestamp if we have one
      const updateData: Record<string, unknown> = {
        lastSyncCount: result.synced,
        lastSyncDurationMs: result.durationMs,
        lastError: result.error ?? null,
      };

      // Only update timestamp fields if we have a valid timestamp from synced entities
      if (result.maxUpdatedAt) {
        if (syncType === "full") {
          updateData.lastFullSyncTimestamp = result.maxUpdatedAt;
          updateData.lastFullSyncActual = actualTime;
        } else {
          updateData.lastIncrementalSyncTimestamp = result.maxUpdatedAt;
          updateData.lastIncrementalSyncActual = actualTime;
        }
        // Only update totalEntities when we actually sync something
        updateData.totalEntities = result.synced;
      }

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
            ...(result.maxUpdatedAt
              ? syncType === "full"
                ? { lastFullSyncTimestamp: result.maxUpdatedAt, lastFullSyncActual: actualTime }
                : { lastIncrementalSyncTimestamp: result.maxUpdatedAt, lastIncrementalSyncActual: actualTime }
              : {}),
            lastSyncCount: result.synced,
            lastSyncDurationMs: result.durationMs,
            lastError: result.error ?? null,
            totalEntities: result.synced,
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

  /**
   * Re-probe clips that were synced before previews were generated.
   * Finds all clips with isGenerated=false and re-checks their preview URLs.
   * Updates any clips that now have valid previews.
   *
   * @param stashInstanceId - The instance ID to re-probe clips for
   * @returns Object with counts of checked and updated clips
   */
  async reProbeUngeneratedClips(stashInstanceId: string): Promise<{ checked: number; updated: number }> {
    logger.info("Re-probing ungenerated clips...", { stashInstanceId });
    const startTime = Date.now();

    // Find all clips with isGenerated=false for this instance
    const clips = await prisma.stashClip.findMany({
      where: {
        stashInstanceId,
        isGenerated: false,
        deletedAt: null,
      },
      select: { id: true, previewPath: true },
    });

    if (clips.length === 0) {
      logger.info("No ungenerated clips to re-probe");
      return { checked: 0, updated: 0 };
    }

    logger.info(`Found ${clips.length} ungenerated clips to re-probe`);

    // Build preview URLs with API key
    const apiKey = stashInstanceManager.getApiKey(stashInstanceId);
    const urlMap = new Map<string, string>();
    for (const clip of clips) {
      if (clip.previewPath) {
        const url = `${clip.previewPath}?apikey=${apiKey}`;
        urlMap.set(url, clip.id);
      }
    }

    // Probe in batches using ClipPreviewProber
    const results = await clipPreviewProber.probeBatch(Array.from(urlMap.keys()));

    // Update clips that are now generated
    let updated = 0;
    for (const [url, isGenerated] of results) {
      if (isGenerated) {
        const clipId = urlMap.get(url);
        if (clipId) {
          await prisma.stashClip.update({
            where: {
              id_stashInstanceId: {
                id: clipId,
                stashInstanceId,
              },
            },
            data: {
              isGenerated: true,
              generationCheckedAt: new Date(),
            },
          });
          updated++;
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Re-probe complete: ${updated}/${clips.length} clips now have previews (${duration}ms)`);

    return { checked: clips.length, updated };
  }

  /**
   * Compute sceneCountViaPerformers for all tags using SQL.
   * This counts scenes where a performer in the scene has this tag.
   * Called after sync completes to pre-compute the value for fast retrieval.
   */
  async computeTagSceneCountsViaPerformers(): Promise<void> {
    const startTime = Date.now();
    logger.info("Computing tag scene counts via performers...");

    try {
      // SQL query that:
      // 1. Finds all distinct scenes where a performer has a given tag
      // 2. Groups by tagId to get counts
      // 3. Updates all tags in one batch
      // Note: Joins include instanceId matching for multi-instance support
      await prisma.$executeRaw`
        UPDATE StashTag
        SET sceneCountViaPerformers = COALESCE((
          SELECT COUNT(DISTINCT sp.sceneId)
          FROM PerformerTag pt
          JOIN ScenePerformer sp ON sp.performerId = pt.performerId AND sp.performerInstanceId = pt.performerInstanceId
          JOIN StashScene s ON s.id = sp.sceneId AND s.stashInstanceId = sp.sceneInstanceId AND s.deletedAt IS NULL
          WHERE pt.tagId = StashTag.id AND pt.tagInstanceId = StashTag.stashInstanceId
        ), 0)
        WHERE StashTag.deletedAt IS NULL
      `;

      const duration = Date.now() - startTime;
      logger.info(`Tag scene counts via performers computed in ${duration}ms`);
    } catch (error) {
      logger.error("Failed to compute tag scene counts via performers", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Clear all cached entities for a specific Stash instance.
   * Used when an instance is deleted to clean up its cached data.
   *
   * Hard-deletes all entities with the given stashInstanceId.
   */
  async clearInstanceData(instanceId: string): Promise<void> {
    logger.info(`Clearing all cached data for instance ${instanceId}...`);
    const startTime = Date.now();

    try {
      // Delete in order to respect foreign key constraints
      // Junction tables first, then entities
      // Uses interactive transaction for extended timeout support
      await prisma.$transaction(
        async (tx) => {
          // Junction tables (depend on entity primary keys)
          await tx.$executeRaw`DELETE FROM SceneTag WHERE sceneId IN (SELECT id FROM StashScene WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM ScenePerformer WHERE sceneId IN (SELECT id FROM StashScene WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM SceneGroup WHERE sceneId IN (SELECT id FROM StashScene WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM SceneGallery WHERE sceneId IN (SELECT id FROM StashScene WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM GalleryTag WHERE galleryId IN (SELECT id FROM StashGallery WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM GalleryPerformer WHERE galleryId IN (SELECT id FROM StashGallery WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM ImageTag WHERE imageId IN (SELECT id FROM StashImage WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM ImagePerformer WHERE imageId IN (SELECT id FROM StashImage WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM ImageGallery WHERE imageId IN (SELECT id FROM StashImage WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM PerformerTag WHERE performerId IN (SELECT id FROM StashPerformer WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM GroupTag WHERE groupId IN (SELECT id FROM StashGroup WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM StudioTag WHERE studioId IN (SELECT id FROM StashStudio WHERE stashInstanceId = ${instanceId})`;
          await tx.$executeRaw`DELETE FROM ClipTag WHERE clipId IN (SELECT id FROM StashClip WHERE stashInstanceId = ${instanceId})`;

          // Entity tables
          await tx.$executeRaw`DELETE FROM StashClip WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashImage WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashGallery WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashScene WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashGroup WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashPerformer WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashStudio WHERE stashInstanceId = ${instanceId}`;
          await tx.$executeRaw`DELETE FROM StashTag WHERE stashInstanceId = ${instanceId}`;

          // Sync state for this instance
          await tx.syncState.deleteMany({ where: { stashInstanceId: instanceId } });
        },
        { timeout: 120000 } // 120 second timeout for clearing large instances
      );

      const duration = Date.now() - startTime;
      logger.info(`Cleared cached data for instance ${instanceId} in ${duration}ms`);
    } catch (error) {
      logger.error(`Failed to clear cached data for instance ${instanceId}`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}

// Export singleton instance
export const stashSyncService = new StashSyncService();
