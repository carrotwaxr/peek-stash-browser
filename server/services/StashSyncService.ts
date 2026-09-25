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
import {
  type StashClient,
  describeStashError,
} from "../graphql/StashClient.js";
import {
  CriterionModifier,
  SortDirectionEnum,
} from "../graphql/generated/graphql.js";
import type {
  FindFilterType,
  FindGalleriesQuery,
  FindGroupsQuery,
  FindImagesQuery,
  FindPerformersQuery,
  FindScenesCompactQuery,
  FindStudiosQuery,
  FindTagsQuery,
  GalleryFilterType,
  GroupFilterType,
  ImageFilterType,
  PerformerFilterType,
  SceneFilterType,
  SceneMarkerFilterType,
  StudioFilterType,
  TagFilterType,
} from "../graphql/generated/graphql.js";
import prisma from "../prisma/singleton.js";
import type {
  SyncEntityState,
  SyncJob,
  SyncStatusResponse,
} from "../types/api/sync.js";
import { dbWrite, dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { summarizeStashStreams } from "../utils/sceneStreams.js";
import { clipPreviewProber } from "./ClipPreviewProber.js";
// Transform functions no longer needed - URLs transformed at read time
import { entityImageCountService } from "./EntityImageCountService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
import { mergeReconciliationService } from "./MergeReconciliationService.js";
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { userStatsService } from "./UserStatsService.js";

// Type aliases for query-specific entity types returned by the GraphQL SDK.
// These carry the exact field sets from the queries (including fields like stash_ids, tags, etc.)
// that the generic Scene/Performer/etc. types from the full schema may represent differently.
type SyncScene = FindScenesCompactQuery["findScenes"]["scenes"][number];
type SyncPerformer =
  FindPerformersQuery["findPerformers"]["performers"][number];
type SyncStudio = FindStudiosQuery["findStudios"]["studios"][number];
type SyncTag = FindTagsQuery["findTags"]["tags"][number];
type SyncGroup = FindGroupsQuery["findGroups"]["groups"][number];
type SyncGallery = FindGalleriesQuery["findGalleries"]["galleries"][number];
type SyncImage = FindImagesQuery["findImages"]["images"][number];

/** Minimal tag reference shape used in junction table syncing */
interface TagRef {
  id: string;
  name?: string;
}

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

type EntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image"
  | "clip";

/**
 * The order every sync path takes, and its cleanups: a type before the ones
 * that reference it. Tags come first because junction rows such as
 * `StudioTag` have foreign keys to `StashTag`, which `INSERT OR IGNORE` does
 * not suppress; a gallery's or image's studio and a clip's scene and primary
 * tag are foreign keys too.
 */
const SYNC_ORDER: readonly EntityType[] = [
  "tag",
  "studio",
  "performer",
  "group",
  "gallery",
  "scene",
  "clip",
  "image",
];

/** What one type's sync reads besides the sync's own mode. */
interface RunEntityTypeOptions {
  /** A "full" type fetches everything; "incremental" what changed since. */
  syncType: "full" | "incremental";
  since?: string;
  /** Run the type's cleanup right after it (the full sync path). */
  withCleanup: boolean;
}

// Constants for sync configuration
const BATCH_SIZE = 500; // Number of entities to fetch per page

/** The lock is held: a sync or an instance deletion is running. */
export class SyncBusyError extends Error {
  constructor(readonly job: SyncJob) {
    super(
      job === "sync"
        ? "Sync already in progress"
        : "An instance's cached library is being removed"
    );
    this.name = "SyncBusyError";
  }
}

/**
 * The cached tables of an instance, in purge order: an entity before the
 * ones it references (a clip's scene and primary tag, an image's or
 * gallery's studio), so no foreign key action has to touch a row the purge
 * removes later anyway. Junction rows go by their ON DELETE CASCADE keys.
 */
const INSTANCE_CACHE_TABLES = [
  "StashClip",
  "StashImage",
  "StashGallery",
  "StashScene",
  "StashGroup",
  "StashPerformer",
  "StashStudio",
  "StashTag",
] as const;

/**
 * Rows per purge statement. One transaction for the whole prod library
 * (27k scenes, 261k images) held the write lock for 9.1 s; in 1,000-row
 * chunks the worst took 0.63 s and most under 0.17 s (about 9.5 s in all),
 * so user writes interleave with the purge (the writer rule's 1 s bound).
 */
const PURGE_CHUNK_ROWS = 1000;

/** The cached table of each entity type, and its plural for the logs. */
const ENTITY_TABLES: Record<
  EntityType,
  { table: (typeof INSTANCE_CACHE_TABLES)[number]; plural: string }
> = {
  scene: { table: "StashScene", plural: "scenes" },
  performer: { table: "StashPerformer", plural: "performers" },
  studio: { table: "StashStudio", plural: "studios" },
  tag: { table: "StashTag", plural: "tags" },
  group: { table: "StashGroup", plural: "groups" },
  gallery: { table: "StashGallery", plural: "galleries" },
  image: { table: "StashImage", plural: "images" },
  clip: { table: "StashClip", plural: "clips" },
};

/** One page of a type's ids from Stash, and Stash's own total. */
interface StashIdPage {
  ids: string[];
  count: number;
}

/**
 * The Stash query that lists each type's ids for cleanup: the ID-only
 * operations, and for clips the marker query, which has no ID-only form.
 */
const CLEANUP_ID_FETCHERS: Record<
  EntityType,
  (stash: StashClient, filter: FindFilterType) => Promise<StashIdPage>
> = {
  scene: async (stash, filter) => {
    const { findScenes } = await stash.findSceneIDs({ filter });
    return { ids: findScenes.scenes.map((s) => s.id), count: findScenes.count };
  },
  performer: async (stash, filter) => {
    const { findPerformers } = await stash.findPerformerIDs({ filter });
    return {
      ids: findPerformers.performers.map((p) => p.id),
      count: findPerformers.count,
    };
  },
  studio: async (stash, filter) => {
    const { findStudios } = await stash.findStudioIDs({ filter });
    return {
      ids: findStudios.studios.map((s) => s.id),
      count: findStudios.count,
    };
  },
  tag: async (stash, filter) => {
    const { findTags } = await stash.findTagIDs({ filter });
    return { ids: findTags.tags.map((t) => t.id), count: findTags.count };
  },
  group: async (stash, filter) => {
    const { findGroups } = await stash.findGroupIDs({ filter });
    return { ids: findGroups.groups.map((g) => g.id), count: findGroups.count };
  },
  gallery: async (stash, filter) => {
    const { findGalleries } = await stash.findGalleryIDs({ filter });
    return {
      ids: findGalleries.galleries.map((g) => g.id),
      count: findGalleries.count,
    };
  },
  image: async (stash, filter) => {
    const { findImages } = await stash.findImageIDs({ filter });
    return { ids: findImages.images.map((i) => i.id), count: findImages.count };
  },
  clip: async (stash, filter) => {
    const { findSceneMarkers } = await stash.findSceneMarkers({ filter });
    return {
      ids: findSceneMarkers.scene_markers.map((m) => m.id),
      count: findSceneMarkers.count,
    };
  },
};

/** Ids per cleanup page from Stash (ids are small, so more than a sync page). */
const CLEANUP_PAGE_SIZE = 5000;

/** Rows per soft-delete statement, each its own writer-queue unit. */
const CLEANUP_SOFT_DELETE_BATCH = 500;

/**
 * Cleanup safety: a cleanup that would soft-delete more than this share of a
 * type's live cached rows, and more than CLEANUP_MIN_GUARDED_DELETES of them,
 * is refused. A truncated or partial id list from Stash would otherwise hide
 * much of the library; soft-deletes are recoverable, but the guard stops it
 * before it happens.
 */
const MAX_CLEANUP_DELETE_RATIO = 0.5;

/**
 * Up to this many rows go without the ratio guard, so a small library (or a
 * type with few rows) can still lose most of them when Stash really did.
 */
const CLEANUP_MIN_GUARDED_DELETES = 50;

/**
 * What one type's cleanup did. `deleted` rows were soft-deleted, their ids in
 * `deletedIds`. `skipped` says why a guard refused, as the type's `lastError`
 * shows it: "Cleanup skipped: ..." when Stash's list is partial or empty,
 * "Cleanup refused: ..." when the ratio guard held back a mass deletion.
 * `error` is what failed. Either way nothing was soft-deleted. `stashIds` is
 * the whole id list Stash returned, present when the cleanup ran to the end.
 */
interface CleanupOutcome {
  deleted: number;
  deletedIds: string[];
  stashIds?: string[];
  skipped?: string;
  error?: string;
}

/** What a cleanup outcome adds to its type's `lastError`, if anything. */
function cleanupProblem(outcome: CleanupOutcome): string | undefined {
  if (outcome.skipped !== undefined) return outcome.skipped;
  if (outcome.error !== undefined) return `Cleanup failed: ${outcome.error}`;
  return undefined;
}

/** A type's problems this run, in the order they happened, as one text. */
function joinProblems(
  ...problems: Array<string | undefined>
): string | undefined {
  const present = problems.filter(
    (problem): problem is string => problem !== undefined && problem !== ""
  );
  return present.length > 0 ? present.join("; ") : undefined;
}

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
function getMostRecentTimestamp(
  a: string | null,
  b: string | null
): string | null {
  if (!a) return b;
  if (!b) return a;
  return compareTimestamps(a, b) >= 0 ? a : b;
}

/**
 * Get the max updated_at timestamp from a list of entities.
 * Returns the raw string from Stash (with timezone) to preserve accuracy.
 */
function getMaxUpdatedAt(
  entities: Array<{ updated_at?: string | null }>
): string | undefined {
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
function extractPhashes(
  files:
    | Array<{ fingerprints?: Array<{ type: string; value: string }> }>
    | undefined
): {
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
    phash: allPhashes[0] as string,
    phashes: allPhashes.length > 1 ? JSON.stringify(allPhashes) : null,
  };
}

class StashSyncService extends EventEmitter {
  /**
   * The lock: which job runs, if any. A sync, or an instance deletion (the
   * instance-row batch, then the purge of its cached library); neither runs
   * while the other does. Read it through isSyncing().
   */
  private activeJob: SyncJob | null = null;
  private readonly PAGE_SIZE = BATCH_SIZE;
  private abortController: AbortController | null = null;
  private batchItemCount = 0; // Track items within current batch for progress logging

  /**
   * Get the Stash client for the specified instance ID, or default if not specified.
   * This ensures sync operations target the correct Stash instance.
   * While a job holds the lock, the client follows its abort: abort() ends a
   * request in flight at once, rejecting with "Sync aborted".
   */
  private getStashClient(stashInstanceId?: string): StashClient {
    let client: StashClient;
    if (stashInstanceId) {
      const found = stashInstanceManager.get(stashInstanceId);
      if (!found) {
        throw new Error(`Stash instance not found: ${stashInstanceId}`);
      }
      client = found;
    } else {
      client = stashInstanceManager.getDefault();
    }
    return this.abortController
      ? client.withSignal(this.abortController.signal)
      : client;
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
   * Whether the service is busy: a sync or an instance deletion holds the
   * lock, so a new sync or deletion would be refused or skipped.
   */
  isSyncing(): boolean {
    return this.activeJob !== null;
  }

  /**
   * Abort the running job: a sync stops at its next check, an instance purge
   * between two chunks (the startup sweep removes the rest).
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info("Sync abort requested", { job: this.activeJob });
    }
  }

  /** Takes the lock for `job`, or throws SyncBusyError when it is held. */
  private acquire(job: SyncJob): void {
    if (this.activeJob !== null) {
      throw new SyncBusyError(this.activeJob);
    }
    this.activeJob = job;
    this.abortController = new AbortController();
  }

  private release(): void {
    this.activeJob = null;
    this.abortController = null;
  }

  /**
   * Full sync - fetches all entities from Stash
   * Used on first run or when incremental sync fails
   *
   * If stashInstanceId is provided, syncs only that instance.
   * If not provided, syncs ALL enabled instances.
   */
  async fullSync(stashInstanceId?: string): Promise<SyncResult[]> {
    this.acquire("sync");

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.fullSyncAllInstances();
      }
      return await this.fullSyncInstance(stashInstanceId);
    } finally {
      this.release();
    }
  }

  /**
   * Full sync all enabled instances
   * Note: the caller holds the lock (activeJob)
   */
  private async fullSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(
      `Starting full sync for ${enabledInstances.length} instance(s)...`
    );
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Syncing instance: ${instance.name} (${instance.id})`);
      try {
        const results = await this.fullSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        // An abort ends the whole run, not just this instance
        if (this.isAbort(error)) throw new Error("Sync aborted");
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
   * Note: the caller holds the lock (activeJob)
   */
  private async fullSyncInstance(
    stashInstanceId: string
  ): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting full sync...", { stashInstanceId });

      // Each type, then its cleanup; its state is saved at once, so a
      // restart does not sync completed types again. A type that fails is
      // recorded and the next one runs.
      for (const entityType of SYNC_ORDER) {
        this.checkAbort();
        results.push(
          await this.runEntityType(entityType, stashInstanceId, {
            syncType: "full",
            withCleanup: true,
          })
        );
      }

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
    if (this.activeJob !== null) {
      logger.warn("Sync already in progress, skipping", {
        job: this.activeJob,
      });
      return [];
    }

    this.acquire("sync");

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.smartIncrementalSyncAllInstances();
      }
      return await this.smartIncrementalSyncInstance(stashInstanceId);
    } finally {
      this.release();
    }
  }

  /**
   * Smart incremental sync all enabled instances
   * Note: the caller holds the lock (activeJob)
   */
  private async smartIncrementalSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(
      `Starting smart incremental sync for ${enabledInstances.length} instance(s)...`
    );
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Smart sync instance: ${instance.name} (${instance.id})`);
      try {
        const results = await this.smartIncrementalSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        // An abort ends the whole run, not just this instance
        if (this.isAbort(error)) throw new Error("Sync aborted");
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
   * Note: the caller holds the lock (activeJob)
   */
  private async smartIncrementalSyncInstance(
    stashInstanceId: string
  ): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting smart incremental sync...", { stashInstanceId });

      for (const entityType of SYNC_ORDER) {
        this.checkAbort();

        // Get sync state for this specific entity type
        const syncState = await this.getEntitySyncState(
          stashInstanceId,
          entityType
        );
        const lastSync = this.getMostRecentSyncTime(syncState);

        if (!lastSync) {
          // Never synced - do full sync for this entity type only
          logger.info(`${entityType}: No previous sync, syncing all`);
          results.push(
            await this.runEntityType(entityType, stashInstanceId, {
              syncType: "full",
              withCleanup: false,
            })
          );
          continue;
        }

        // Check how many entities changed since last sync
        const changeCount = await this.getChangeCount(
          entityType,
          lastSync,
          stashInstanceId
        );

        if (changeCount === 0) {
          // lastSync is now a raw RFC3339 string
          logger.info(`${entityType}: No changes since ${lastSync}, skipping`);
          results.push({
            entityType,
            synced: 0,
            deleted: 0,
            durationMs: 0,
          });
          // Nothing failed this run: clear an earlier run's error
          await this.recordEntityError(stashInstanceId, entityType, null);
        } else {
          logger.info(
            `${entityType}: ${changeCount} changes since ${lastSync}, syncing`
          );
          results.push(
            await this.runEntityType(entityType, stashInstanceId, {
              syncType: "incremental",
              since: lastSync,
              withCleanup: false,
            })
          );
        }
      }

      // Cleanup deleted entities (detect deletions/merges in Stash)
      await this.cleanupEveryType(stashInstanceId, results);

      // Apply gallery inheritance if images or galleries were synced
      // (galleries may have new performers/tags that need to propagate to images)
      const imageResult = results.find((r) => r.entityType === "image");
      const galleryResult = results.find((r) => r.entityType === "gallery");
      if (
        (imageResult && imageResult.synced > 0) ||
        (galleryResult && galleryResult.synced > 0)
      ) {
        logger.info(
          "Applying gallery inheritance after smart incremental sync..."
        );
        await imageGalleryInheritanceService.applyGalleryInheritance();
        logger.info("Gallery inheritance complete");
      }

      // Compute inherited tags for scenes if scenes were updated
      const sceneResult = results.find((r) => r.entityType === "scene");
      if (sceneResult && sceneResult.synced > 0) {
        logger.info(
          "Computing inherited tags for scenes after smart incremental sync..."
        );
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
    return prisma.syncState.findFirst({
      where: { stashInstanceId, entityType },
    });
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

    return getMostRecentTimestamp(
      syncState.lastFullSyncTimestamp,
      syncState.lastIncrementalSyncTimestamp
    );
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
    const updatedAtFilter = {
      updated_at: {
        modifier: CriterionModifier.GreaterThan,
        value: formatTimestampForStash(since),
      },
    };

    try {
      switch (entityType) {
        case "scene": {
          const result = await stash.findScenesCompact({
            filter: { page: 1, per_page: 0 },
            scene_filter: updatedAtFilter,
          });
          return result.findScenes.count;
        }
        case "performer": {
          const result = await stash.findPerformers({
            filter: { page: 1, per_page: 0 },
            performer_filter: updatedAtFilter,
          });
          return result.findPerformers.count;
        }
        case "studio": {
          const result = await stash.findStudios({
            filter: { page: 1, per_page: 0 },
            studio_filter: updatedAtFilter,
          });
          return result.findStudios.count;
        }
        case "tag": {
          const result = await stash.findTags({
            filter: { page: 1, per_page: 0 },
            tag_filter: updatedAtFilter,
          });
          return result.findTags.count;
        }
        case "group": {
          const result = await stash.findGroups({
            filter: { page: 1, per_page: 0 },
            group_filter: updatedAtFilter,
          });
          return result.findGroups.count;
        }
        case "gallery": {
          const result = await stash.findGalleries({
            filter: { page: 1, per_page: 0 },
            gallery_filter: updatedAtFilter,
          });
          return result.findGalleries.count;
        }
        case "image": {
          const result = await stash.findImages({
            filter: { page: 1, per_page: 0 },
            image_filter: updatedAtFilter,
          });
          return result.findImages.count;
        }
        // No change count for clips yet, so the startup smart sync skips them
        // once they have synced; the scheduled incremental sync still runs them
        case "clip":
        default:
          return 0;
      }
    } catch (error) {
      // An abort ends the sync; anything else is not this probe's to decide
      if (this.isAbort(error)) throw new Error("Sync aborted");
      logger.warn(`Failed to get change count for ${entityType}`, {
        error: describeStashError(error),
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
        throw new Error(`Unknown entity type: ${entityType as string}`);
    }
  }

  /**
   * Syncs one type and saves its SyncState, the cleanup in between when
   * `withCleanup` (the full sync path). A failure of the type, a Stash error
   * or a database one, becomes the result's `error` and the type's
   * `lastError`, and returns: the caller goes on to the next type. The
   * type's timestamps stay where they were (saveSyncState moves them only
   * with a `maxUpdatedAt`), so the next sync retries it from its old
   * "since". A cleanup that skips, refuses or fails adds its text after the
   * type's own error. An abort throws Error("Sync aborted") and saves
   * nothing.
   */
  private async runEntityType(
    entityType: EntityType,
    stashInstanceId: string,
    { syncType, since, withCleanup }: RunEntityTypeOptions
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let result: SyncResult;
    try {
      result = await this.syncEntityType(
        entityType,
        stashInstanceId,
        syncType === "full",
        since
      );
    } catch (error) {
      if (this.isAbort(error)) throw new Error("Sync aborted");
      const message = describeStashError(error);
      logger.error(`Failed to sync ${ENTITY_TABLES[entityType].plural}`, {
        stashInstanceId,
        entityType,
        error: message,
      });
      result = {
        entityType,
        synced: 0,
        deleted: 0,
        durationMs: Date.now() - startTime,
        error: message,
      };
    }

    if (withCleanup) {
      const outcome = await this.cleanupDeletedEntities(
        entityType,
        stashInstanceId
      );
      result.deleted = outcome.deleted;
      result.error = joinProblems(result.error, cleanupProblem(outcome));
    }

    await this.saveSyncState(stashInstanceId, syncType, result);
    return result;
  }

  /**
   * The incremental paths' cleanup, every type after all of them synced.
   * Each type's soft-deleted count goes into its result, and a cleanup that
   * skips, refuses or fails is added to the type's `lastError`.
   */
  private async cleanupEveryType(
    stashInstanceId: string,
    results: SyncResult[]
  ): Promise<void> {
    logger.info("Checking for deleted entities...");
    let totalDeleted = 0;
    for (const entityType of SYNC_ORDER) {
      this.checkAbort();
      const outcome = await this.cleanupDeletedEntities(
        entityType,
        stashInstanceId
      );
      totalDeleted += outcome.deleted;
      const result = results.find((r) => r.entityType === entityType);
      if (result) result.deleted = outcome.deleted;
      const problem = cleanupProblem(outcome);
      if (problem !== undefined) {
        const lastError = joinProblems(result?.error, problem) ?? problem;
        if (result) result.error = lastError;
        await this.recordEntityError(stashInstanceId, entityType, lastError);
      }
    }
    if (totalDeleted > 0) {
      logger.info(
        `Cleanup complete: ${totalDeleted} entities marked as deleted`
      );
    }
  }

  /**
   * Incremental sync - fetches only changed entities
   * Uses per-entity-type timestamps so each entity type syncs from its own last sync time
   */
  async incrementalSync(stashInstanceId?: string): Promise<SyncResult[]> {
    if (this.activeJob !== null) {
      logger.warn("Sync already in progress, skipping", {
        job: this.activeJob,
      });
      return [];
    }

    this.acquire("sync");

    try {
      // If no instance specified, sync all enabled instances
      if (!stashInstanceId) {
        return await this.incrementalSyncAllInstances();
      }
      return await this.incrementalSyncInstance(stashInstanceId);
    } finally {
      this.release();
    }
  }

  /**
   * Incremental sync all enabled instances
   * Note: the caller holds the lock (activeJob)
   */
  private async incrementalSyncAllInstances(): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();

    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    logger.info(
      `Starting incremental sync for ${enabledInstances.length} instance(s)...`
    );
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(
        `Incremental sync instance: ${instance.name} (${instance.id})`
      );
      try {
        const results = await this.incrementalSyncInstance(instance.id);
        allResults.push(...results);
      } catch (error) {
        // An abort ends the whole run, not just this instance
        if (this.isAbort(error)) throw new Error("Sync aborted");
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
   * Note: the caller holds the lock (activeJob)
   */
  private async incrementalSyncInstance(
    stashInstanceId: string
  ): Promise<SyncResult[]> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info("Starting incremental sync with per-entity timestamps...", {
        stashInstanceId,
      });

      for (const entityType of SYNC_ORDER) {
        this.checkAbort();

        // Get THIS entity type's last sync timestamp
        const syncState = await this.getEntitySyncState(
          stashInstanceId,
          entityType
        );
        const lastSync = this.getMostRecentSyncTime(syncState);

        if (!lastSync) {
          // Never synced - do full sync for this entity type only
          logger.info(`${entityType}: No previous sync, syncing all`);
        } else {
          // Incremental sync using this entity's own timestamp
          // lastSync is now a raw RFC3339 string from Stash
          logger.info(`${entityType}: syncing changes since ${lastSync}`);
        }
        results.push(
          await this.runEntityType(
            entityType,
            stashInstanceId,
            lastSync
              ? { syncType: "incremental", since: lastSync, withCleanup: false }
              : { syncType: "full", withCleanup: false }
          )
        );
      }

      // Cleanup deleted entities (detect deletions/merges in Stash)
      await this.cleanupEveryType(stashInstanceId, results);

      // Apply gallery inheritance if images or galleries were synced
      // (galleries may have new performers/tags that need to propagate to images)
      const imageResult = results.find((r) => r.entityType === "image");
      const galleryResult = results.find((r) => r.entityType === "gallery");
      if (
        (imageResult && imageResult.synced > 0) ||
        (galleryResult && galleryResult.synced > 0)
      ) {
        logger.info("Applying gallery inheritance after incremental sync...");
        await imageGalleryInheritanceService.applyGalleryInheritance();
        logger.info("Gallery inheritance complete");
      }

      // Compute inherited tags for scenes if scenes were updated
      const sceneResult = results.find((r) => r.entityType === "scene");
      if (sceneResult && sceneResult.synced > 0) {
        logger.info(
          "Computing inherited tags for scenes after incremental sync..."
        );
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
        logger.info("Incremental sync aborted by user");
      } else {
        logger.error("Incremental sync failed", { error: errorMsg });
      }

      throw error;
    }
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
        const sceneFilter: SceneFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        logger.debug(`Fetching scenes page ${page}...`);
        const fetchStart = Date.now();
        const result = await stash.findScenesCompact({
          filter: { page, per_page: this.PAGE_SIZE },
          scene_filter: sceneFilter,
        });
        logger.debug(`Fetched page ${page} in ${Date.now() - fetchStart}ms`);

        const scenes = result.findScenes.scenes;
        totalCount = result.findScenes.count;

        if (scenes.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          scenes as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        // Process batch with progress logging every 500 items
        await this.processScenesBatch(
          scenes,
          stashInstanceId,
          totalSynced,
          totalCount
        );

        totalSynced += scenes.length;
        this.emit("progress", {
          entityType: "scene",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        // Log batch completion at debug level
        logger.debug(
          `Scenes: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Scenes synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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
    scenes: SyncScene[],
    stashInstanceId: string,
    _batchStart: number,
    _totalCount: number
  ): Promise<void> {
    // Skip empty batches
    if (scenes.length === 0) return;

    // Validate all scene IDs for SQL safety (defense-in-depth)
    const invalidIds = scenes.filter((s) => !validateEntityId(s.id));
    if (invalidIds.length > 0) {
      logger.warn(`Skipping ${invalidIds.length} scenes with invalid IDs`);
    }
    const validScenes = scenes.filter((s) => validateEntityId(s.id));
    if (validScenes.length === 0) return;

    const sceneIds = validScenes.map((s) => s.id);
    const instanceId = stashInstanceId;

    // Bulk delete all junction records for this batch
    // Uses sequential raw SQL in a transaction to avoid SQLite lock contention
    // and includes extended timeout for large libraries
    const sceneIdList = sceneIds.map((id) => `'${this.escape(id)}'`).join(",");
    const escapedInstanceId = this.escape(instanceId);
    await dbWriteTransaction(
      "sync.scenes.junctions",
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
        const paths = scene.paths;
        // Stash may return extra fields (chapters_vtt, stream) not in the GraphQL query selection
        const pathsExtended = scene.paths as Record<string, unknown>;
        // Extract phashes from files
        const { phash, phashes } = extractPhashes(scene.files);
        // Stash's stream choices, read from its labels. The URLs carry the
        // Stash API key and are never stored.
        const streamOptions = summarizeStashStreams(
          (scene.sceneStreams ?? []).map((s) => s.label ?? "")
        );

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
      ${this.escapeNullable(pathsExtended?.chapters_vtt as string | undefined)},
      ${this.escapeNullable(pathsExtended?.stream as string | undefined)},
      ${this.escapeNullable(paths?.caption)},
      ${this.escapeNullable(JSON.stringify(scene.captions ?? []))},
      ${streamOptions.direct ? 1 : 0},
      ${streamOptions.mkv ? 1 : 0},
      ${this.escapeNullable(streamOptions.resolutions.join(","))},
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
      streamDirect, streamMkv, streamResolutions, oCounter, playCount, playDuration,
      stashCreatedAt, stashUpdatedAt,
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
      streamDirect = excluded.streamDirect,
      streamMkv = excluded.streamMkv,
      streamResolutions = excluded.streamResolutions,
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
        if (validateEntityId(g.group.id)) {
          const index = g.scene_index ?? "NULL";
          groupRecords.push(
            `('${this.escape(scene.id)}', '${this.escape(instanceId)}', '${this.escape(g.group.id)}', '${this.escape(instanceId)}', ${index})`
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
   * Safety guard against a bad or truncated keep-set hiding much of the
   * library. Returns true, and logs loudly, when more than
   * MAX_CLEANUP_DELETE_RATIO of the live cached rows would go and more than
   * CLEANUP_MIN_GUARDED_DELETES of them.
   *
   * This protects against any cause of a bad keep-set (a partial paginated
   * fetch, a transient Stash error), not one specific failure mode. The
   * keep-set size is in the log so a truncated fetch is easy to spot.
   */
  private exceedsCleanupDeleteThreshold(
    plural: string,
    keepSetSize: number,
    liveCount: number,
    toDeleteCount: number
  ): boolean {
    if (toDeleteCount <= CLEANUP_MIN_GUARDED_DELETES) return false;
    if (toDeleteCount <= MAX_CLEANUP_DELETE_RATIO * liveCount) return false;
    logger.error(
      `Cleanup safety: refusing to soft-delete ${toDeleteCount}/${liveCount} ${plural} ` +
        `(more than ${(MAX_CLEANUP_DELETE_RATIO * 100).toFixed(0)}% and more than ${CLEANUP_MIN_GUARDED_DELETES}). ` +
        `Stash returned only ${keepSetSize} ${plural} ID(s) - the list looks truncated or partial, ` +
        `so nothing was soft-deleted. The next sync checks again.`
    );
    return true;
  }

  /**
   * Soft-deletes cached rows of a type that Stash no longer returns (deleted
   * or merged there). Runs after each type's sync, in every sync mode.
   *
   * 1. Stash's whole id list, 5,000 a page. A page that comes back empty
   *    before Stash's own count is reached is a skip: the list is partial.
   * 2. The live cached rows of the instance. Zero ids from Stash while rows
   *    are cached is a skip.
   * 3. The delete set: one statement binding the whole list as one JSON
   *    parameter, so there is no TEMP table (which lives on one pooled
   *    connection, #526), no transaction and no bound-variable ceiling.
   * 4. The ratio guard (exceedsCleanupDeleteThreshold); a refusal is a skip.
   * 5. softDeleteMissing, 500 rows per writer-queue unit.
   * 6. Scenes: user data moves from merged scenes to their survivors
   *    (MergeReconciliationService.reconcileDeletedScenes). Scenes that left
   *    Stash together are soft-deleted by then, so none becomes another's
   *    target; each scene cleanup first catches up on scenes an earlier one
   *    soft-deleted but did not reconcile.
   *
   * An abort rethrows; any other failure returns `{ deleted: 0, error }`,
   * and a failure before step 5 soft-deletes nothing.
   */
  private async cleanupDeletedEntities(
    entityType: EntityType,
    stashInstanceId: string
  ): Promise<CleanupOutcome> {
    const { table, plural } = ENTITY_TABLES[entityType];
    logger.info(`Checking for deleted ${plural}...`);
    const startTime = Date.now();
    const skip = (reason: string): CleanupOutcome => {
      logger.warn(
        `Cleanup safety: ${reason}. Skipping ${plural} cleanup to prevent false deletions.`
      );
      return {
        deleted: 0,
        deletedIds: [],
        skipped: `Cleanup skipped: ${reason}`,
      };
    };

    try {
      const stash = this.getStashClient(stashInstanceId);

      // Merges a cleanup soft-deleted but stopped before reconciling
      if (entityType === "scene") {
        await mergeReconciliationService.reconcileRecentDeletions(
          stashInstanceId
        );
      }

      // 1. Stash's whole id list
      const fetchIds = CLEANUP_ID_FETCHERS[entityType];
      const stashIds: string[] = [];
      let count = 0;
      for (let page = 1; ; page++) {
        this.checkAbort();
        const result = await fetchIds(stash, {
          per_page: CLEANUP_PAGE_SIZE,
          page,
        });
        // A missing count would page forever
        if (!Number.isFinite(result.count)) {
          throw new Error(`Stash's ${plural} ID list came without a count`);
        }
        count = result.count;
        for (const id of result.ids) stashIds.push(id);
        if (stashIds.length >= count) break;
        if (result.ids.length === 0) {
          return skip(
            `Stash returned ${stashIds.length} of ${count} ${plural} (page ${page} was empty)`
          );
        }
      }
      logger.info(
        `Cleanup: found ${stashIds.length} ${plural} in Stash (total: ${count})`
      );
      this.checkAbort();

      // 2. Live cached rows
      const [live] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n FROM "${table}" WHERE "stashInstanceId" = ? AND "deletedAt" IS NULL`,
        stashInstanceId
      );
      const liveCount = Number(live?.n ?? 0);
      if (stashIds.length === 0 && liveCount > 0) {
        return skip(`Stash returned 0 ${plural} but ${liveCount} are cached`);
      }

      // 3. The delete set, over the whole keep-set at once
      const missing = await prisma.$queryRawUnsafe<
        Array<{ id: string; phash?: string | null }>
      >(
        `SELECT "id"${entityType === "scene" ? `, "phash"` : ""} FROM "${table}"
         WHERE "stashInstanceId" = ? AND "deletedAt" IS NULL
           AND "id" NOT IN (SELECT value FROM json_each(?))`,
        stashInstanceId,
        JSON.stringify(stashIds)
      );
      if (missing.length === 0) {
        logger.info(`No deleted ${plural} found`);
        return { deleted: 0, deletedIds: [], stashIds };
      }

      // 4. The ratio guard
      if (
        this.exceedsCleanupDeleteThreshold(
          plural,
          stashIds.length,
          liveCount,
          missing.length
        )
      ) {
        return {
          deleted: 0,
          deletedIds: [],
          skipped:
            `Cleanup refused: Stash no longer lists ${missing.length.toLocaleString("en-US")} ` +
            `of ${liveCount.toLocaleString("en-US")} ${plural} (more than half); ` +
            `apply the deletions from the sync status if this is intended`,
        };
      }
      this.checkAbort();

      // 5. Soft-delete
      const deletedIds = missing.map((row) => row.id);
      const deleted = await this.softDeleteMissing(
        entityType,
        stashInstanceId,
        deletedIds,
        new Date()
      );

      // 6. Merges, once every scene that left Stash is soft-deleted
      if (entityType === "scene") {
        await mergeReconciliationService.reconcileDeletedScenes(
          stashInstanceId,
          missing.map((row) => ({ id: row.id, phash: row.phash ?? null }))
        );
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        `Marked ${deleted} ${plural} as deleted in ${(durationMs / 1000).toFixed(1)}s`
      );
      return { deleted, deletedIds, stashIds };
    } catch (error) {
      if (error instanceof Error && error.message === "Sync aborted") {
        throw error;
      }
      // Kept in the type's lastError: never the query a Stash error embeds
      const message = describeStashError(error);
      logger.error(`Failed to cleanup deleted ${plural}`, { error: message });
      return { deleted: 0, deletedIds: [], error: message };
    }
  }

  /**
   * Soft-deletes `ids` of one type and instance, CLEANUP_SOFT_DELETE_BATCH
   * rows per writer-queue unit, and returns how many rows changed.
   * `deletedAt` is bound as epoch milliseconds, which is how Prisma stores a
   * DateTime in SQLite, so Prisma reads it back as `now`. A failure midway
   * leaves the batches already written soft-deleted, and the next cleanup
   * finds the rest again.
   */
  private async softDeleteMissing(
    entityType: EntityType,
    stashInstanceId: string,
    ids: string[],
    now: Date
  ): Promise<number> {
    const { table, plural } = ENTITY_TABLES[entityType];
    let changed = 0;
    for (let i = 0; i < ids.length; i += CLEANUP_SOFT_DELETE_BATCH) {
      const batch = JSON.stringify(ids.slice(i, i + CLEANUP_SOFT_DELETE_BATCH));
      changed += await dbWrite(`sync.cleanup.${plural}`, () =>
        prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "deletedAt" = ?
           WHERE "stashInstanceId" = ? AND "deletedAt" IS NULL
             AND "id" IN (SELECT value FROM json_each(?))`,
          now.getTime(),
          stashInstanceId,
          batch
        )
      );
    }
    return changed;
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

        const performerFilter: PerformerFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findPerformers({
          filter: { page, per_page: this.PAGE_SIZE },
          performer_filter: performerFilter,
        });

        const performers = result.findPerformers.performers;
        totalCount = result.findPerformers.count;

        if (performers.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          performers as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        await this.processPerformersBatch(performers, stashInstanceId);

        totalSynced += performers.length;
        this.emit("progress", {
          entityType: "performer",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(
          `Performers: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Performers synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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
    performers: SyncPerformer[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (performers.length === 0) return;

    // Validate IDs
    const validPerformers = performers.filter((p) => validateEntityId(p.id));
    if (validPerformers.length === 0) return;

    const values = validPerformers
      .map((performer) => {
        // Serialize stash_ids array to JSON for deduplication
        const stashIdsJson =
          performer.stash_ids.length > 0
            ? JSON.stringify(
                performer.stash_ids.map((s) => ({
                  endpoint: s.endpoint,
                  stash_id: s.stash_id,
                }))
              )
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
      ${performer.group_count ?? 0},
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
      if (performer.tags && performer.tags.length > 0) {
        for (const tag of performer.tags) {
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
    const performerIds = validPerformers
      .map((p) => `'${this.escape(p.id)}'`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `DELETE FROM PerformerTag WHERE performerId IN (${performerIds}) AND performerInstanceId = '${this.escape(instanceId)}'`
    );

    // Bulk insert all new tags
    if (tagInserts.length > 0) {
      const tagValues = tagInserts
        .map(
          (t) =>
            `('${this.escape(t.performerId)}', '${this.escape(instanceId)}', '${this.escape(t.tagId)}', '${this.escape(instanceId)}')`
        )
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

        const studioFilter: StudioFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findStudios({
          filter: { page, per_page: this.PAGE_SIZE },
          studio_filter: studioFilter,
        });

        const studios = result.findStudios.studios;
        totalCount = result.findStudios.count;

        if (studios.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          studios as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        await this.processStudiosBatch(studios, stashInstanceId);

        totalSynced += studios.length;
        this.emit("progress", {
          entityType: "studio",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(
          `Studios: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Studios synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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
    studios: SyncStudio[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (studios.length === 0) return;

    // Validate IDs
    const validStudios = studios.filter((s) => validateEntityId(s.id));
    if (validStudios.length === 0) return;

    const values = validStudios
      .map((studio) => {
        // Serialize stash_ids array to JSON for deduplication
        const stashIdsJson =
          studio.stash_ids.length > 0
            ? JSON.stringify(
                studio.stash_ids.map((s) => ({
                  endpoint: s.endpoint,
                  stash_id: s.stash_id,
                }))
              )
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
      ${studio.performer_count ?? 0},
      ${studio.group_count ?? 0},
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
      if (studio.tags && studio.tags.length > 0) {
        const studioId = studio.id;

        // Delete existing tags for this studio
        await prisma.$executeRawUnsafe(
          `DELETE FROM StudioTag WHERE studioId = '${this.escape(studioId)}' AND studioInstanceId = '${this.escape(instanceId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = studio.tags.filter(
          (t: TagRef) => t?.id && validateEntityId(t.id)
        );
        if (validTags.length > 0) {
          const tagValues = validTags
            .map(
              (t: TagRef) =>
                `('${this.escape(studioId)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`
            )
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

        const tagFilter: TagFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findTags({
          filter: { page, per_page: this.PAGE_SIZE },
          tag_filter: tagFilter,
        });

        const tags = result.findTags.tags;
        totalCount = result.findTags.count;

        if (tags.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          tags as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        await this.processTagsBatch(tags, stashInstanceId);

        totalSynced += tags.length;
        this.emit("progress", {
          entityType: "tag",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(
          `Tags: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Tags synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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

  private async processTagsBatch(
    tags: SyncTag[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (tags.length === 0) return;

    // Validate IDs
    const validTags = tags.filter((t) => validateEntityId(t.id));
    if (validTags.length === 0) return;

    const values = validTags
      .map((tag) => {
        const parentIds = tag.parents?.map((p) => p.id) || [];
        const aliases = tag.aliases || [];
        // Serialize stash_ids array to JSON for deduplication
        const stashIdsJson =
          tag.stash_ids.length > 0
            ? JSON.stringify(
                tag.stash_ids.map((s) => ({
                  endpoint: s.endpoint,
                  stash_id: s.stash_id,
                }))
              )
            : null;

        // "color" is not in the standard Stash GraphQL schema but may be added by plugins
        const tagRecord = tag as Record<string, unknown>;

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
      ${tag.studio_count ?? 0},
      ${tag.group_count ?? 0},
      ${tag.scene_marker_count ?? 0},
      ${this.escapeNullable(tag.description)},
      ${this.escapeNullable(JSON.stringify(aliases))},
      ${this.escapeNullable(JSON.stringify(parentIds))},
      ${this.escapeNullable(tag.image_path)},
      ${this.escapeNullable(tagRecord.color as string | undefined)},
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

        const groupFilter: GroupFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findGroups({
          filter: { page, per_page: this.PAGE_SIZE },
          group_filter: groupFilter,
        });

        const groups = result.findGroups.groups;
        totalCount = result.findGroups.count;

        if (groups.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          groups as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        await this.processGroupsBatch(groups, stashInstanceId);

        totalSynced += groups.length;
        this.emit("progress", {
          entityType: "group",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(
          `Groups: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Groups synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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

  private async processGroupsBatch(
    groups: SyncGroup[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (groups.length === 0) return;

    // Validate IDs
    const validGroups = groups.filter((g) => validateEntityId(g.id));
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
      ${group.performer_count ?? 0},
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
      if (group.tags && group.tags.length > 0) {
        const groupId = group.id;

        // Delete existing tags for this group
        await prisma.$executeRawUnsafe(
          `DELETE FROM GroupTag WHERE groupId = '${this.escape(groupId)}' AND groupInstanceId = '${this.escape(instanceId)}'`
        );

        // Insert new tags (filter to valid tag IDs)
        const validTags = group.tags.filter(
          (t: TagRef) => t?.id && validateEntityId(t.id)
        );
        if (validTags.length > 0) {
          const tagValues = validTags
            .map(
              (t: TagRef) =>
                `('${this.escape(groupId)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`
            )
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

        const galleryFilter: GalleryFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findGalleries({
          filter: { page, per_page: this.PAGE_SIZE },
          gallery_filter: galleryFilter,
        });

        const galleries = result.findGalleries.galleries;
        totalCount = result.findGalleries.count;

        if (galleries.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          galleries as Array<{ updated_at?: string | null }>
        );
        if (batchMax && (!maxUpdatedAt || batchMax > maxUpdatedAt)) {
          maxUpdatedAt = batchMax;
        }

        await this.processGalleriesBatch(galleries, stashInstanceId);

        totalSynced += galleries.length;
        this.emit("progress", {
          entityType: "gallery",
          phase: "processing",
          current: totalSynced,
          total: totalCount,
        } as SyncProgress);

        logger.debug(
          `Galleries: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Galleries synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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
    galleries: SyncGallery[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (galleries.length === 0) return;

    // Validate IDs
    const validGalleries = galleries.filter((g) => validateEntityId(g.id));
    if (validGalleries.length === 0) return;

    const values = validGalleries
      .map((gallery) => {
        const folder = gallery.folder;
        // Get first file's basename for zip gallery title fallback
        const fileBasename = gallery.files?.[0]?.basename || null;
        // Cover image ID for dimension lookup
        const coverImageId = gallery.cover?.id || null;
        // A gallery's studio is on the gallery's own Stash, so it takes the
        // gallery's instance (as does an image's, below)
        return `(
      '${this.escape(gallery.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${this.escapeNullable(gallery.title)},
      ${this.escapeNullable(gallery.date)},
      ${gallery.studio?.id ? `'${this.escape(gallery.studio.id)}'` : "NULL"},
      ${gallery.studio?.id ? `'${this.escape(stashInstanceId)}'` : "NULL"},
      ${gallery.rating100 ?? "NULL"},
      ${coverImageId ? `'${this.escape(coverImageId)}'` : "NULL"},
      ${gallery.image_count ?? 0},
      ${this.escapeNullable(gallery.details)},
      ${this.escapeNullable(gallery.urls?.[0])},
      ${this.escapeNullable(gallery.code)},
      ${this.escapeNullable(gallery.photographer)},
      ${this.escapeNullable(gallery.urls ? JSON.stringify(gallery.urls) : null)},
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
      id, stashInstanceId, title, date, studioId, studioInstanceId, rating100, coverImageId, imageCount,
      details, url, code, photographer, urls, folderPath, fileBasename, coverPath, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id, stashInstanceId) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      studioId = excluded.studioId,
      studioInstanceId = excluded.studioInstanceId,
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
    const galleryIds = validGalleries
      .map((g) => `'${this.escape(g.id)}'`)
      .join(",");
    await prisma.$executeRawUnsafe(`
      DELETE FROM GalleryPerformer WHERE galleryId IN (${galleryIds}) AND galleryInstanceId = '${this.escape(instanceId)}'
    `);

    // Insert new gallery-performer relationships
    if (performerInserts.length > 0) {
      const performerValues = performerInserts
        .map(
          (p) =>
            `('${this.escape(p.galleryId)}', '${this.escape(instanceId)}', '${this.escape(p.performerId)}', '${this.escape(instanceId)}')`
        )
        .join(",\n");

      await prisma.$executeRawUnsafe(`
        INSERT OR IGNORE INTO GalleryPerformer (galleryId, galleryInstanceId, performerId, performerInstanceId)
        VALUES ${performerValues}
      `);
    }

    // Sync gallery tags to GalleryTag junction table
    const tagInserts: { galleryId: string; tagId: string }[] = [];
    for (const gallery of validGalleries) {
      if (gallery.tags && gallery.tags.length > 0) {
        for (const tag of gallery.tags) {
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
        .map(
          (t) =>
            `('${this.escape(t.galleryId)}', '${this.escape(instanceId)}', '${this.escape(t.tagId)}', '${this.escape(instanceId)}')`
        )
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

        const imageFilter: ImageFilterType | undefined = lastSyncTime
          ? {
              updated_at: {
                modifier: CriterionModifier.GreaterThan,
                value: formatTimestampForStash(lastSyncTime),
              },
            }
          : undefined;

        const result = await stash.findImages({
          filter: { page, per_page: this.PAGE_SIZE },
          image_filter: imageFilter,
        });

        const images = result.findImages.images;
        totalCount = result.findImages.count;

        if (images.length === 0) break;

        // Track max updated_at for sync state
        const batchMax = getMaxUpdatedAt(
          images as Array<{ updated_at?: string | null }>
        );
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

        logger.debug(
          `Images: ${totalSynced}/${totalCount} (${Math.round((totalSynced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Images synced: ${totalSynced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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
  async syncClips(
    stashInstanceId: string,
    isFullSync = false,
    since?: string
  ): Promise<SyncResult> {
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
          scene_marker_filter:
            Object.keys(markerFilter).length > 0 ? markerFilter : undefined,
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
          maxUpdatedAt =
            getMostRecentTimestamp(maxUpdatedAt || null, batchMax) ||
            maxUpdatedAt;
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
          const marker = markers[i] as (typeof markers)[number];
          const previewUrl = previewUrls[i] as string;

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
            stashCreatedAt: marker.created_at
              ? new Date(marker.created_at)
              : null,
            stashUpdatedAt: marker.updated_at
              ? new Date(marker.updated_at)
              : null,
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
              .map(
                (tagId) =>
                  `('${this.escape(marker.id)}', '${this.escape(instanceId)}', '${this.escape(tagId)}', '${this.escape(instanceId)}')`
              )
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

        logger.debug(
          `Clips: ${synced}/${totalCount} (${Math.round((synced / totalCount) * 100)}%)`
        );

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
      logger.info(
        `Clips synced: ${synced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

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

  private async processImagesBatch(
    images: SyncImage[],
    stashInstanceId: string
  ): Promise<void> {
    // Skip empty batches
    if (images.length === 0) return;

    // Validate IDs
    const validImages = images.filter((i) => validateEntityId(i.id));
    if (validImages.length === 0) return;

    const imageIds = validImages.map((i) => i.id);
    const instanceId = stashInstanceId;

    // Bulk delete junction records
    // Uses sequential raw SQL in a transaction to avoid SQLite lock contention
    // and includes extended timeout for large libraries
    const imageIdList = imageIds.map((id) => `'${this.escape(id)}'`).join(",");
    const escapedInstanceId = this.escape(instanceId);
    await dbWriteTransaction(
      "sync.images.junctions",
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
    const values = validImages
      .map((image) => {
        const visualFile = image.files?.[0];
        const paths = image.paths;
        return `(
        '${this.escape(image.id)}',
        ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : "NULL"},
        ${this.escapeNullable(image.title)},
        ${this.escapeNullable(image.code)},
        ${this.escapeNullable(image.details)},
        ${this.escapeNullable(image.photographer)},
        ${this.escapeNullable(image.urls ? JSON.stringify(image.urls) : null)},
        ${this.escapeNullable(image.date)},
        ${image.studio?.id ? `'${this.escape(image.studio.id)}'` : "NULL"},
        ${image.studio?.id ? `'${this.escape(stashInstanceId)}'` : "NULL"},
        ${image.rating100 ?? "NULL"},
        ${image.o_counter ?? 0},
        ${image.organized ? 1 : 0},
        ${this.escapeNullable(visualFile?.path)},
        ${visualFile?.width ?? "NULL"},
        ${visualFile?.height ?? "NULL"},
        ${visualFile?.size ?? "NULL"},
        ${this.escapeNullable(paths?.thumbnail)},
        ${this.escapeNullable(paths?.preview)},
        ${this.escapeNullable(paths?.image)},
        ${image.created_at ? `'${image.created_at}'` : "NULL"},
        ${image.updated_at ? `'${image.updated_at}'` : "NULL"},
        datetime('now'),
        NULL
      )`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
      INSERT INTO StashImage (
        id, stashInstanceId, title, code, details, photographer, urls, date, studioId, studioInstanceId, rating100, oCounter, organized,
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
        studioInstanceId = excluded.studioInstanceId,
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
          performerRecords.push(
            `('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(p.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
      for (const t of image.tags || []) {
        if (validateEntityId(t.id)) {
          tagRecords.push(
            `('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(t.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
      for (const g of image.galleries || []) {
        if (validateEntityId(g.id)) {
          galleryRecords.push(
            `('${this.escape(image.id)}', '${this.escape(instanceId)}', '${this.escape(g.id)}', '${this.escape(instanceId)}')`
          );
        }
      }
    }

    // Batch insert junction records
    const inserts = [];

    if (performerRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO ImagePerformer (imageId, imageInstanceId, performerId, performerInstanceId) VALUES ${performerRecords.join(",")}`
        )
      );
    }
    if (tagRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO ImageTag (imageId, imageInstanceId, tagId, tagInstanceId) VALUES ${tagRecords.join(",")}`
        )
      );
    }
    if (galleryRecords.length > 0) {
      inserts.push(
        prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO ImageGallery (imageId, imageInstanceId, galleryId, galleryInstanceId) VALUES ${galleryRecords.join(",")}`
        )
      );
    }

    await Promise.all(inserts);
  }

  // ==================== Helper Methods ====================

  private checkAbort(): void {
    if (this.abortController?.signal.aborted) {
      throw new Error("Sync aborted");
    }
  }

  /**
   * Whether `error` ends the running job: its abort was requested, or the
   * error is the abort (checkAbort's, or a scoped Stash request's).
   */
  private isAbort(error: unknown): boolean {
    return (
      this.abortController?.signal.aborted === true ||
      (error instanceof Error && error.message === "Sync aborted")
    );
  }

  /**
   * Sets one type's `lastError` on its SyncState row: a cleanup's problem
   * after the type's own state was saved, or null when a smart sync skips an
   * unchanged type, so an earlier run's error does not linger. A type with
   * no row yet has nothing to update.
   */
  private async recordEntityError(
    stashInstanceId: string,
    entityType: EntityType,
    message: string | null
  ): Promise<void> {
    await prisma.syncState.updateMany({
      where: { stashInstanceId, entityType },
      data: { lastError: message },
    });
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
   * A type that failed has none either, so the next sync retries it from its old time.
   *
   * `lastError` is this run's problem with the type (runEntityType), or null when it
   * synced cleanly, so a type that recovers clears its earlier error.
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
              ? {
                  lastFullSyncTimestamp: result.maxUpdatedAt,
                  lastFullSyncActual: actualTime,
                }
              : {
                  lastIncrementalSyncTimestamp: result.maxUpdatedAt,
                  lastIncrementalSyncActual: actualTime,
                }
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
                ? {
                    lastFullSyncTimestamp: result.maxUpdatedAt,
                    lastFullSyncActual: actualTime,
                  }
                : {
                    lastIncrementalSyncTimestamp: result.maxUpdatedAt,
                    lastIncrementalSyncActual: actualTime,
                  }
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
   * Every configured instance, enabled or not, with its entity types'
   * `SyncState` rows in sync order; rows of an instance that is not
   * configured (a deleted one whose purge has not run) are left out. Names
   * and ids only: never an instance's address or API key.
   */
  async getSyncStatus(): Promise<SyncStatusResponse> {
    const instances = await prisma.stashInstance.findMany({
      select: { id: true, name: true, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    const rows = await prisma.syncState.findMany({
      where: { stashInstanceId: { in: instances.map((i) => i.id) } },
    });
    const settings = await prisma.syncSettings.findFirst();

    const order = (entityType: string) => {
      const index = SYNC_ORDER.findIndex((type) => type === entityType);
      return index === -1 ? SYNC_ORDER.length : index;
    };
    return {
      inProgress: this.activeJob === "sync",
      activeJob: this.activeJob,
      settings: {
        syncIntervalMinutes: settings?.syncIntervalMinutes ?? 60,
        enableScanSubscription: settings?.enableScanSubscription ?? true,
      },
      instances: instances.map((instance) => ({
        instanceId: instance.id,
        name: instance.name,
        enabled: instance.enabled,
        states: rows
          .filter((row) => row.stashInstanceId === instance.id)
          .sort((a, b) => order(a.entityType) - order(b.entityType))
          .map(
            (row): SyncEntityState => ({
              entityType: row.entityType,
              lastFullSyncTimestamp: row.lastFullSyncTimestamp,
              lastIncrementalSyncTimestamp: row.lastIncrementalSyncTimestamp,
              lastFullSyncActual: row.lastFullSyncActual?.toISOString() ?? null,
              lastIncrementalSyncActual:
                row.lastIncrementalSyncActual?.toISOString() ?? null,
              lastSyncCount: row.lastSyncCount,
              lastSyncDurationMs: row.lastSyncDurationMs,
              lastError: row.lastError,
              totalEntities: row.totalEntities,
            })
          ),
      })),
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
  async reProbeUngeneratedClips(
    stashInstanceId: string
  ): Promise<{ checked: number; updated: number }> {
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
    const results = await clipPreviewProber.probeBatch(
      Array.from(urlMap.keys())
    );

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
    logger.info(
      `Re-probe complete: ${updated}/${clips.length} clips now have previews (${duration}ms)`
    );

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
      await dbWrite(
        "sync.tagSceneCounts",
        () =>
          prisma.$executeRaw`
        UPDATE StashTag
        SET sceneCountViaPerformers = COALESCE((
          SELECT COUNT(DISTINCT sp.sceneId)
          FROM PerformerTag pt
          JOIN ScenePerformer sp ON sp.performerId = pt.performerId AND sp.performerInstanceId = pt.performerInstanceId
          JOIN StashScene s ON s.id = sp.sceneId AND s.stashInstanceId = sp.sceneInstanceId AND s.deletedAt IS NULL
          WHERE pt.tagId = StashTag.id AND pt.tagInstanceId = StashTag.stashInstanceId
        ), 0)
        WHERE StashTag.deletedAt IS NULL
      `
      );

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
   * Deletes a Stash instance and everything Peek keeps for it (item 18).
   *
   * Refused with SyncBusyError while a sync or another deletion holds the
   * lock. Then, in one batch: the instance row (its `UserStashInstance` rows
   * cascade), its `SyncState`, every user's own rows for it (history,
   * ratings and favorites, image views, playlist entries, hides, entity
   * downloads, merge records) and the derived per-user rows (stats and
   * rankings). Rows for every instance (`instanceId = ''`) stay. The
   * instance manager then reloads, so no later sync can reach it.
   *
   * It answers once that is done. The cached library goes afterwards,
   * still under the lock, in `purged` (which never rejects): its rows carry
   * an instance id that no longer exists, so a failure or an abort midway
   * leaves them to the startup sweep (`purgeUnknownInstanceCaches`).
   */
  async deleteInstance(instanceId: string): Promise<{ purged: Promise<void> }> {
    this.acquire("instance-delete");

    try {
      const own = { instanceId };
      await dbWriteBatch("instance.delete", [
        prisma.stashInstance.delete({ where: { id: instanceId } }),
        prisma.syncState.deleteMany({ where: { stashInstanceId: instanceId } }),
        // Every user's own rows for the instance (owner, 2026-09-24)
        prisma.watchHistory.deleteMany({ where: own }),
        prisma.sceneRating.deleteMany({ where: own }),
        prisma.performerRating.deleteMany({ where: own }),
        prisma.studioRating.deleteMany({ where: own }),
        prisma.tagRating.deleteMany({ where: own }),
        prisma.galleryRating.deleteMany({ where: own }),
        prisma.groupRating.deleteMany({ where: own }),
        prisma.imageRating.deleteMany({ where: own }),
        prisma.imageViewHistory.deleteMany({ where: own }),
        prisma.playlistItem.deleteMany({ where: own }),
        prisma.userHiddenEntity.deleteMany({ where: own }),
        prisma.download.deleteMany({ where: own }),
        prisma.mergeRecord.deleteMany({
          where: {
            OR: [
              { sourceInstanceId: instanceId },
              { targetInstanceId: instanceId },
            ],
          },
        }),
        // Derived rows; UserExcludedEntity has no instanceId index, so the
        // purge removes its rows in chunks instead
        prisma.userEntityStats.deleteMany({ where: own }),
        prisma.userPerformerStats.deleteMany({ where: own }),
        prisma.userStudioStats.deleteMany({ where: own }),
        prisma.userTagStats.deleteMany({ where: own }),
        prisma.userEntityRanking.deleteMany({ where: own }),
      ]);
      await stashInstanceManager.reload();
    } catch (error) {
      this.release();
      throw error;
    }

    logger.info("Deleted Stash instance; removing its cached library", {
      instanceId,
    });
    const purged = this.purgeInstanceCache(instanceId)
      .then(() => undefined)
      .catch((error: unknown) => {
        logger.error(
          "Removing a deleted instance's cached library failed; the next start finishes it",
          {
            instanceId,
            error: error instanceof Error ? error.message : String(error),
          }
        );
      })
      .finally(() => {
        this.release();
      });
    return { purged };
  }

  /**
   * Removes every cached row of an instance id: its exclusion rows, the
   * eight entity tables (junction rows cascade) and its `SyncState`, each in
   * chunks of PURGE_CHUNK_ROWS, one writer unit per chunk. Checks the abort
   * flag before every chunk and stops there; the rows left carry an unknown
   * instance id, which the startup sweep finds. The caller holds the lock.
   *
   * @returns the rows removed and whether it stopped early
   */
  private async purgeInstanceCache(
    instanceId: string
  ): Promise<{ rows: number; aborted: boolean }> {
    const startTime = Date.now();
    let rows = 0;
    const aborted = () => this.abortController?.signal.aborted === true;
    const stop = () => {
      logger.info(
        "Stopped removing an instance's cached library; the next start finishes it",
        { instanceId, rows }
      );
      return { rows, aborted: true };
    };

    // UserExcludedEntity first: no index on instanceId, so it walks the
    // table once by id instead of rescanning it for every chunk. Done
    // before the entity tables, a stop midway leaves entity rows for the
    // startup sweep to find.
    let afterId = 0;
    for (;;) {
      if (aborted()) return stop();
      const deleted = await dbWrite(
        "instance.purge.UserExcludedEntity",
        () =>
          prisma.$queryRaw<Array<{ id: number | bigint }>>`
          DELETE FROM "UserExcludedEntity"
          WHERE "id" IN (
            SELECT "id" FROM "UserExcludedEntity"
            WHERE "instanceId" = ${instanceId} AND "id" > ${afterId}
            ORDER BY "id" LIMIT ${PURGE_CHUNK_ROWS}
          )
          RETURNING "id"`
      );
      if (deleted.length === 0) break;
      rows += deleted.length;
      afterId = Math.max(...deleted.map((row) => Number(row.id)));
    }

    for (const table of INSTANCE_CACHE_TABLES) {
      // The table name comes from the closed list above; the id is bound
      const sql = `DELETE FROM "${table}" WHERE rowid IN (SELECT rowid FROM "${table}" WHERE "stashInstanceId" = ? LIMIT ${PURGE_CHUNK_ROWS})`;
      for (;;) {
        if (aborted()) return stop();
        const deleted = await dbWrite(`instance.purge.${table}`, () =>
          prisma.$executeRawUnsafe(sql, instanceId)
        );
        if (deleted === 0) break;
        rows += deleted;
      }
    }

    if (aborted()) return stop();
    rows += (
      await dbWrite("instance.purge.SyncState", () =>
        prisma.syncState.deleteMany({ where: { stashInstanceId: instanceId } })
      )
    ).count;

    logger.info("Removed an instance's cached library", {
      instanceId,
      rows,
      durationMs: Date.now() - startTime,
    });
    return { rows, aborted: false };
  }

  /**
   * The startup sweep: purges the cached rows of every instance id that has
   * no `StashInstance` row, left by a deletion that failed or was aborted
   * midway (or by an older version's). Called before the scheduler starts;
   * skipped, never guessing, when no instance exists at all or the lock is
   * held.
   *
   * @returns the instance ids it purged
   */
  async purgeUnknownInstanceCaches(): Promise<string[]> {
    if ((await prisma.stashInstance.count()) === 0) {
      logger.warn("No Stash instance exists; not sweeping the cache");
      return [];
    }
    if (this.activeJob !== null) {
      logger.warn("Busy; the cache sweep waits for the next start", {
        job: this.activeJob,
      });
      return [];
    }

    const purged: string[] = [];
    this.acquire("instance-delete");
    try {
      const unknown = new Set<string>();
      for (const table of [...INSTANCE_CACHE_TABLES, "SyncState"]) {
        // Served by each table's stashInstanceId index
        const found = await prisma.$queryRawUnsafe<
          Array<{ stashInstanceId: string }>
        >(
          `SELECT DISTINCT "stashInstanceId" FROM "${table}"
           WHERE "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance")`
        );
        for (const row of found) unknown.add(row.stashInstanceId);
      }

      for (const instanceId of unknown) {
        logger.info("Removing the cached library of a deleted instance", {
          instanceId,
        });
        const { aborted } = await this.purgeInstanceCache(instanceId);
        if (aborted) break;
        purged.push(instanceId);
      }
    } finally {
      this.release();
    }
    return purged;
  }
}

// Export singleton instance
export const stashSyncService = new StashSyncService();
