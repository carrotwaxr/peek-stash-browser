/**
 * Stash Sync Service
 *
 * Handles syncing entities from Stash to the local SQLite cache: a full sync
 * (every entity), an incremental sync (what changed since each type's last
 * sync) and a smart incremental sync (a type only when Stash counts changes
 * to it), one instance or every enabled one (`runSync`, `syncInstance`).
 *
 * Key features:
 * - One page loop for every entity type (`paginate`, 500 a page), reading
 *   the type's spec in `ENTITY_SYNC`: its Stash query and its batch writer
 * - Incremental sync via updated_at timestamps
 * - Junction table management for many-to-many relationships
 * - Progress events for UI feedback
 * - Soft delete for removed entities
 */
import type { PrismaClient } from "@prisma/client";
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
  FindSceneMarkersQuery,
  FindScenesCompactQuery,
  FindStudiosQuery,
  FindTagsQuery,
  TimestampCriterionInput,
} from "../graphql/generated/graphql.js";
import prisma from "../prisma/singleton.js";
import type {
  SyncEntityState,
  SyncEntityType,
  SyncJob,
  SyncStatusResponse,
} from "../types/api/sync.js";
import { dbWrite, dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { summarizeStashStreams } from "../utils/sceneStreams.js";
import { logSyncFailure } from "../utils/syncLog.js";
import { clipPreviewProber } from "./ClipPreviewProber.js";
// Transform functions no longer needed - URLs transformed at read time
import { entityImageCountService } from "./EntityImageCountService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
import { mergeReconciliationService } from "./MergeReconciliationService.js";
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import {
  type BatchChanges,
  type EntityRef,
  type IncomingEntity,
  type JunctionName,
  type StoredEntity,
  SyncChangeSet,
  detectChanges,
  linksByNearId,
  noChanges,
} from "./SyncChangeSet.js";
import { getUsersSelecting } from "./UserInstanceService.js";
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
type SyncClip =
  FindSceneMarkersQuery["findSceneMarkers"]["scene_markers"][number];

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

type EntityType = SyncEntityType;

/**
 * The order every sync path takes, and its cleanups: a type before the ones
 * that reference it. Tags come first because junction rows such as
 * `StudioTag` have foreign keys to `StashTag`, which `INSERT OR IGNORE` does
 * not suppress; a gallery's or image's studio and a clip's scene and primary
 * tag are foreign keys too.
 */
export const SYNC_ORDER: readonly EntityType[] = [
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

/**
 * How a sync picks what to fetch: every entity ("full", each type cleaned up
 * right after it), what changed since each type's last sync
 * ("incremental"), or that only for the types Stash counts changes to
 * ("smart", the startup path).
 */
type SyncMode = "full" | "incremental" | "smart";

/** Each mode's name in the logs. */
const SYNC_MODE_NAMES: Record<SyncMode, { name: string; title: string }> = {
  full: { name: "full sync", title: "Full sync" },
  incremental: { name: "incremental sync", title: "Incremental sync" },
  smart: { name: "smart incremental sync", title: "Smart incremental sync" },
};

/** What one type's page loop fetches besides every entity. */
interface PaginateOptions {
  /** Only entities updated after this Stash timestamp */
  since?: string;
  /** Only these ids, fetched a page of ids at a time */
  ids?: string[];
}

// Constants for sync configuration
const BATCH_SIZE = 500; // Number of entities to fetch per page

/**
 * A queued full sync of every enabled instance (`fullSync()` with no id, as
 * an empty id also means)
 */
const ALL_INSTANCES = "";

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

/** How one cleanup runs. */
interface CleanupOptions {
  /**
   * Skip the ratio guard: an admin's "Apply deletions" after a cleanup
   * refused a mass deletion. The partial and empty list guards still apply.
   */
  ignoreRatioGuard?: boolean;
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
 * The newest of `current` and the `updated_at` values of `entities`, by
 * time: the watermark the next incremental sync starts from. Kept as Stash
 * wrote it, with its timezone.
 */
function newestUpdatedAt(
  current: string | undefined,
  entities: ReadonlyArray<{ updated_at?: string | null }>
): string | undefined {
  let newest = current;
  for (const { updated_at: updatedAt } of entities) {
    if (!updatedAt) continue;
    if (newest === undefined || compareTimestamps(updatedAt, newest) > 0) {
      newest = updatedAt;
    }
  }
  return newest;
}

/** `items` in runs of `size` (none for an empty list). */
function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** A sync's abort, once `signal` has fired. */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Sync aborted");
}

/** "scenes" to "Scenes", for the logs. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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

/** Escape a string for SQL, handling quotes */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Escape a nullable string for SQL: 'value' or NULL */
function escapeSqlNullable(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${escapeSql(value)}'`;
}

// ==================== Change detection helpers ====================

/**
 * What a batch's rows looked like before it wrote them, by id, for the
 * change diff (SyncChangeSet): one statement over the batch's ids. Sync
 * stores `stashUpdatedAt` as the text Stash sent, in a column declared
 * DateTime, which Prisma's raw reads would parse into a Date; the CAST
 * returns the text, so it compares equal to what Stash sends again. Not for
 * clips, whose `stashUpdatedAt` Prisma writes (processClipsBatch reads them
 * through Prisma).
 */
async function readStored(
  table: Exclude<(typeof INSTANCE_CACHE_TABLES)[number], "StashClip">,
  stashInstanceId: string,
  ids: readonly string[],
  withStudio: boolean
): Promise<Map<string, StoredEntity>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      stashUpdatedAt: string | null;
      deleted: bigint | number;
      studioId?: string | null;
    }>
  >(
    `SELECT "id", CAST("stashUpdatedAt" AS TEXT) AS stashUpdatedAt,
            "deletedAt" IS NOT NULL AS deleted${withStudio ? `, "studioId"` : ""}
     FROM "${table}"
     WHERE "stashInstanceId" = ? AND "id" IN (SELECT value FROM json_each(?))`,
    stashInstanceId,
    JSON.stringify(ids)
  );
  return new Map(
    rows.map((row) => [
      row.id,
      {
        updatedAt: row.stashUpdatedAt,
        deleted: Number(row.deleted) === 1,
        ...(withStudio ? { studioId: row.studioId ?? null } : {}),
      },
    ])
  );
}

/** Each junction's near (the synced entity) and far columns. */
const JUNCTION_COLUMNS: Record<
  JunctionName,
  { near: string; nearInstance: string; far: string; farInstance: string }
> = {
  ScenePerformer: {
    near: "sceneId",
    nearInstance: "sceneInstanceId",
    far: "performerId",
    farInstance: "performerInstanceId",
  },
  SceneTag: {
    near: "sceneId",
    nearInstance: "sceneInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  SceneGroup: {
    near: "sceneId",
    nearInstance: "sceneInstanceId",
    far: "groupId",
    farInstance: "groupInstanceId",
  },
  SceneGallery: {
    near: "sceneId",
    nearInstance: "sceneInstanceId",
    far: "galleryId",
    farInstance: "galleryInstanceId",
  },
  PerformerTag: {
    near: "performerId",
    nearInstance: "performerInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  StudioTag: {
    near: "studioId",
    nearInstance: "studioInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  GroupTag: {
    near: "groupId",
    nearInstance: "groupInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  GalleryPerformer: {
    near: "galleryId",
    nearInstance: "galleryInstanceId",
    far: "performerId",
    farInstance: "performerInstanceId",
  },
  GalleryTag: {
    near: "galleryId",
    nearInstance: "galleryInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  ImagePerformer: {
    near: "imageId",
    nearInstance: "imageInstanceId",
    far: "performerId",
    farInstance: "performerInstanceId",
  },
  ImageTag: {
    near: "imageId",
    nearInstance: "imageInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
  ImageGallery: {
    near: "imageId",
    nearInstance: "imageInstanceId",
    far: "galleryId",
    farInstance: "galleryInstanceId",
  },
  ClipTag: {
    near: "clipId",
    nearInstance: "clipInstanceId",
    far: "tagId",
    farInstance: "tagInstanceId",
  },
};

/**
 * Deletes the junction rows of `nearIds` on `instanceId` and returns them by
 * near id: the old far sides the change diff compares with the new ones.
 * SQLite's `DELETE ... RETURNING` (Prisma's engine runs 3.46.0), on the main
 * client or the batch's transaction.
 */
async function deleteJunctionRows(
  db: Pick<PrismaClient, "$queryRawUnsafe">,
  junction: JunctionName,
  nearIds: readonly string[],
  instanceId: string
): Promise<Map<string, EntityRef[]>> {
  const { near, nearInstance, far, farInstance } = JUNCTION_COLUMNS[junction];
  const rows = await db.$queryRawUnsafe<
    Array<{ nearId: string; farId: string; farInstanceId: string }>
  >(
    `DELETE FROM "${junction}"
     WHERE "${near}" IN (SELECT value FROM json_each(?)) AND "${nearInstance}" = ?
     RETURNING "${near}" AS nearId, "${far}" AS farId, "${farInstance}" AS farInstanceId`,
    JSON.stringify(nearIds),
    instanceId
  );
  return linksByNearId(rows);
}

// ==================== Entity sync specs ====================

/** One page request of a type's sync. */
export interface SyncPageQuery {
  page: number;
  /** 0 asks only for Stash's count (the smart sync's change probe) */
  perPage: number;
  /** Only entities updated after this Stash timestamp */
  since?: string;
  /** Only these ids (a page of them at most) */
  ids?: string[];
  /** The run's abort signal: it ends the request in flight */
  signal: AbortSignal;
}

/** What one sync run hands to every page and batch of it. */
export interface SyncRunContext {
  /** Fires on abort(): the run stops between pages, a request in flight ends */
  signal: AbortSignal;
  /** What the run has changed so far, across its instances (SyncChangeSet) */
  changes: SyncChangeSet;
}

/**
 * How one entity type syncs: the Stash query that lists it a page at a time
 * (narrowed by `since` or `ids`), and the writer of one page. `paginate` runs
 * the page loop for every type.
 */
export interface EntitySyncSpec<
  T extends { id: string; updated_at?: string | null },
> {
  type: EntityType;
  fetchPage(
    client: StashClient,
    q: SyncPageQuery
  ): Promise<{ items: T[]; count: number }>;
  processBatch(
    items: T[],
    instanceId: string,
    run: SyncRunContext
  ): Promise<BatchChanges>;
}

/** Each type's entity as its sync query returns it. */
interface SyncEntities {
  scene: SyncScene;
  performer: SyncPerformer;
  studio: SyncStudio;
  tag: SyncTag;
  group: SyncGroup;
  gallery: SyncGallery;
  image: SyncImage;
  clip: SyncClip;
}

export type SyncEntityOf<K extends EntityType> = SyncEntities[K];

/** A sync page's FindFilterType. */
function pageFilter(q: SyncPageQuery): FindFilterType {
  return { page: q.page, per_page: q.perPage };
}

/**
 * An incremental page's updated_at criterion, in the form Stash reads
 * (formatTimestampForStash); none without `since`.
 */
function updatedSince(
  since: string | undefined
): { updated_at: TimestampCriterionInput } | undefined {
  return since
    ? {
        updated_at: {
          modifier: CriterionModifier.GreaterThan,
          value: formatTimestampForStash(since),
        },
      }
    : undefined;
}

/**
 * Every synced type's spec. Each request carries the run's abort signal.
 * Images narrow by Stash's integer id list, the others by `ids`; clips page
 * in updated_at order.
 */
export const ENTITY_SYNC: {
  readonly [K in EntityType]: EntitySyncSpec<SyncEntityOf<K>>;
} = {
  tag: {
    type: "tag",
    async fetchPage(client, q) {
      const { findTags } = await client.findTags(
        {
          filter: pageFilter(q),
          ids: q.ids,
          tag_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findTags.tags, count: findTags.count };
    },
    processBatch: processTagsBatch,
  },
  studio: {
    type: "studio",
    async fetchPage(client, q) {
      const { findStudios } = await client.findStudios(
        {
          filter: pageFilter(q),
          ids: q.ids,
          studio_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findStudios.studios, count: findStudios.count };
    },
    processBatch: processStudiosBatch,
  },
  performer: {
    type: "performer",
    async fetchPage(client, q) {
      const { findPerformers } = await client.findPerformers(
        {
          filter: pageFilter(q),
          ids: q.ids,
          performer_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findPerformers.performers, count: findPerformers.count };
    },
    processBatch: processPerformersBatch,
  },
  group: {
    type: "group",
    async fetchPage(client, q) {
      const { findGroups } = await client.findGroups(
        {
          filter: pageFilter(q),
          ids: q.ids,
          group_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findGroups.groups, count: findGroups.count };
    },
    processBatch: processGroupsBatch,
  },
  gallery: {
    type: "gallery",
    async fetchPage(client, q) {
      const { findGalleries } = await client.findGalleries(
        {
          filter: pageFilter(q),
          ids: q.ids,
          gallery_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findGalleries.galleries, count: findGalleries.count };
    },
    processBatch: processGalleriesBatch,
  },
  scene: {
    type: "scene",
    async fetchPage(client, q) {
      const { findScenes } = await client.findScenesCompact(
        {
          filter: pageFilter(q),
          ids: q.ids,
          scene_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findScenes.scenes, count: findScenes.count };
    },
    processBatch: processScenesBatch,
  },
  clip: {
    type: "clip",
    async fetchPage(client, q) {
      const { findSceneMarkers } = await client.findSceneMarkers(
        {
          filter: {
            ...pageFilter(q),
            sort: "updated_at",
            direction: SortDirectionEnum.Asc,
          },
          ids: q.ids,
          scene_marker_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return {
        items: findSceneMarkers.scene_markers,
        count: findSceneMarkers.count,
      };
    },
    processBatch: processClipsBatch,
  },
  image: {
    type: "image",
    async fetchPage(client, q) {
      const { findImages } = await client.findImages(
        {
          filter: pageFilter(q),
          image_ids: q.ids?.map((id) => Number(id)),
          image_filter: updatedSince(q.since),
        },
        undefined,
        q.signal
      );
      return { items: findImages.images, count: findImages.count };
    },
    processBatch: processImagesBatch,
  },
};

// ==================== Scene Sync ====================

async function processScenesBatch(
  scenes: SyncScene[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (scenes.length === 0) return noChanges();

  // Validate all scene IDs for SQL safety (defense-in-depth)
  const invalidIds = scenes.filter((s) => !validateEntityId(s.id));
  if (invalidIds.length > 0) {
    logger.warn(`Skipping ${invalidIds.length} scenes with invalid IDs`);
  }
  const validScenes = scenes.filter((s) => validateEntityId(s.id));
  if (validScenes.length === 0) return noChanges();

  const sceneIds = validScenes.map((s) => s.id);
  const instanceId = stashInstanceId;

  // What the batch's scenes looked like before the write, for the change diff
  const stored = await readStored("StashScene", instanceId, sceneIds, true);

  // Bulk delete all junction records for this batch, keeping the rows for
  // the change diff. Uses sequential raw SQL in a transaction to avoid
  // SQLite lock contention and includes extended timeout for large libraries
  const oldLinks: Partial<Record<JunctionName, Map<string, EntityRef[]>>> = {};
  await dbWriteTransaction(
    "sync.scenes.junctions",
    async (tx) => {
      for (const junction of [
        "ScenePerformer",
        "SceneTag",
        "SceneGroup",
        "SceneGallery",
      ] as const) {
        oldLinks[junction] = await deleteJunctionRows(
          tx,
          junction,
          sceneIds,
          instanceId
        );
      }
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
    '${escapeSql(scene.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(scene.title)},
    ${escapeSqlNullable(scene.code)},
    ${escapeSqlNullable(scene.date)},
    ${scene.studio?.id ? `'${escapeSql(scene.studio.id)}'` : "NULL"},
    ${scene.rating100 ?? "NULL"},
    ${file?.duration ? Math.round(file.duration) : "NULL"},
    ${scene.organized ? 1 : 0},
    ${escapeSqlNullable(scene.details)},
    ${escapeSqlNullable(scene.director)},
    ${escapeSqlNullable(JSON.stringify(scene.urls || []))},
    ${escapeSqlNullable(file?.path)},
    ${file?.bit_rate ?? "NULL"},
    ${file?.frame_rate ?? "NULL"},
    ${file?.width ?? "NULL"},
    ${file?.height ?? "NULL"},
    ${escapeSqlNullable(file?.video_codec)},
    ${escapeSqlNullable(file?.audio_codec)},
    ${file?.size ?? "NULL"},
    ${escapeSqlNullable(paths?.screenshot)},
    ${escapeSqlNullable(paths?.preview)},
    ${escapeSqlNullable(paths?.sprite)},
    ${escapeSqlNullable(paths?.vtt)},
    ${escapeSqlNullable(pathsExtended?.chapters_vtt as string | undefined)},
    ${escapeSqlNullable(pathsExtended?.stream as string | undefined)},
    ${escapeSqlNullable(paths?.caption)},
    ${escapeSqlNullable(JSON.stringify(scene.captions ?? []))},
    ${streamOptions.direct ? 1 : 0},
    ${streamOptions.mkv ? 1 : 0},
    ${escapeSqlNullable(streamOptions.resolutions.join(","))},
    ${scene.o_counter ?? 0},
    ${scene.play_count ?? 0},
    ${scene.play_duration ?? 0},
    ${scene.created_at ? `'${scene.created_at}'` : "NULL"},
    ${scene.updated_at ? `'${scene.updated_at}'` : "NULL"},
    datetime('now'),
    NULL,
    ${escapeSqlNullable(phash)},
    ${escapeSqlNullable(phashes)}
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

  // Collect all junction records (validate related entity IDs too), and
  // each scene's new far sides for the change diff
  const performerRecords: string[] = [];
  const tagRecords: string[] = [];
  const groupRecords: string[] = [];
  const galleryRecords: string[] = [];
  const incoming: IncomingEntity[] = [];

  for (const scene of validScenes) {
    const links = {
      ScenePerformer: [] as string[],
      SceneTag: [] as string[],
      SceneGroup: [] as string[],
      SceneGallery: [] as string[],
    };
    for (const p of scene.performers || []) {
      if (validateEntityId(p.id)) {
        links.ScenePerformer.push(p.id);
        performerRecords.push(
          `('${escapeSql(scene.id)}', '${escapeSql(instanceId)}', '${escapeSql(p.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    for (const t of scene.tags || []) {
      if (validateEntityId(t.id)) {
        links.SceneTag.push(t.id);
        tagRecords.push(
          `('${escapeSql(scene.id)}', '${escapeSql(instanceId)}', '${escapeSql(t.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    for (const g of scene.groups || []) {
      if (validateEntityId(g.group.id)) {
        links.SceneGroup.push(g.group.id);
        const index = g.scene_index ?? "NULL";
        groupRecords.push(
          `('${escapeSql(scene.id)}', '${escapeSql(instanceId)}', '${escapeSql(g.group.id)}', '${escapeSql(instanceId)}', ${index})`
        );
      }
    }
    for (const g of scene.galleries || []) {
      if (validateEntityId(g.id)) {
        links.SceneGallery.push(g.id);
        galleryRecords.push(
          `('${escapeSql(scene.id)}', '${escapeSql(instanceId)}', '${escapeSql(g.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    incoming.push({
      id: scene.id,
      updatedAt: scene.updated_at,
      studioId: scene.studio?.id ?? null,
      links,
    });
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

  return detectChanges({
    instanceId,
    stored,
    incoming,
    oldLinks,
    compareStudio: true,
  });
}

// ==================== Performer Sync ====================

async function processPerformersBatch(
  performers: SyncPerformer[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (performers.length === 0) return noChanges();

  // Validate IDs
  const validPerformers = performers.filter((p) => validateEntityId(p.id));
  if (validPerformers.length === 0) return noChanges();

  // What the batch's performers looked like before the write
  const stored = await readStored(
    "StashPerformer",
    stashInstanceId,
    validPerformers.map((p) => p.id),
    false
  );

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
    '${escapeSql(performer.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(stashIdsJson)},
    ${escapeSqlNullable(performer.name)},
    ${escapeSqlNullable(performer.disambiguation)},
    ${escapeSqlNullable(performer.gender)},
    ${escapeSqlNullable(performer.birthdate)},
    ${performer.favorite ? 1 : 0},
    ${performer.rating100 ?? "NULL"},
    ${escapeSqlNullable(performer.details)},
    ${escapeSqlNullable(JSON.stringify(performer.alias_list || []))},
    ${escapeSqlNullable(performer.country)},
    ${escapeSqlNullable(performer.ethnicity)},
    ${escapeSqlNullable(performer.hair_color)},
    ${escapeSqlNullable(performer.eye_color)},
    ${performer.height_cm ?? "NULL"},
    ${performer.weight ?? "NULL"},
    ${escapeSqlNullable(performer.measurements)},
    ${escapeSqlNullable(performer.fake_tits)},
    ${escapeSqlNullable(performer.tattoos)},
    ${escapeSqlNullable(performer.piercings)},
    ${escapeSqlNullable(performer.career_length)},
    ${escapeSqlNullable(performer.death_date)},
    ${escapeSqlNullable(performer.url)},
    ${escapeSqlNullable(performer.image_path)},
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

  // Collect all tag relationships for batch insert, and each performer's
  // new tag set for the change diff
  const tagInserts: { performerId: string; tagId: string }[] = [];
  const incoming: IncomingEntity[] = [];
  for (const performer of validPerformers) {
    const tagIds: string[] = [];
    if (performer.tags && performer.tags.length > 0) {
      for (const tag of performer.tags) {
        if (tag?.id && validateEntityId(tag.id)) {
          tagIds.push(tag.id);
          tagInserts.push({
            performerId: performer.id,
            tagId: tag.id,
          });
        }
      }
    }
    incoming.push({
      id: performer.id,
      updatedAt: performer.updated_at,
      links: { PerformerTag: tagIds },
    });
  }

  // Bulk delete existing tags for all performers in this batch, keeping
  // the rows for the change diff
  const oldLinks = {
    PerformerTag: await deleteJunctionRows(
      prisma,
      "PerformerTag",
      validPerformers.map((p) => p.id),
      instanceId
    ),
  };

  // Bulk insert all new tags
  if (tagInserts.length > 0) {
    const tagValues = tagInserts
      .map(
        (t) =>
          `('${escapeSql(t.performerId)}', '${escapeSql(instanceId)}', '${escapeSql(t.tagId)}', '${escapeSql(instanceId)}')`
      )
      .join(", ");

    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO PerformerTag (performerId, performerInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
    );
  }

  return detectChanges({
    instanceId,
    stored,
    incoming,
    oldLinks,
    tagJunction: "PerformerTag",
  });
}

// ==================== Studio Sync ====================

async function processStudiosBatch(
  studios: SyncStudio[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (studios.length === 0) return noChanges();

  // Validate IDs
  const validStudios = studios.filter((s) => validateEntityId(s.id));
  if (validStudios.length === 0) return noChanges();

  // What the batch's studios looked like before the write
  const stored = await readStored(
    "StashStudio",
    stashInstanceId,
    validStudios.map((s) => s.id),
    false
  );

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
    '${escapeSql(studio.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(stashIdsJson)},
    ${escapeSqlNullable(studio.name)},
    ${studio.parent_studio?.id ? `'${escapeSql(studio.parent_studio.id)}'` : "NULL"},
    ${studio.favorite ? 1 : 0},
    ${studio.rating100 ?? "NULL"},
    ${studio.scene_count ?? 0},
    ${studio.image_count ?? 0},
    ${studio.gallery_count ?? 0},
    ${studio.performer_count ?? 0},
    ${studio.group_count ?? 0},
    ${escapeSqlNullable(studio.details)},
    ${escapeSqlNullable(studio.url)},
    ${escapeSqlNullable(studio.image_path)},
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
  const oldLinks = { StudioTag: new Map<string, EntityRef[]>() };
  const incoming: IncomingEntity[] = [];
  for (const studio of validStudios) {
    const entity: IncomingEntity = {
      id: studio.id,
      updatedAt: studio.updated_at,
    };
    incoming.push(entity);
    if (studio.tags && studio.tags.length > 0) {
      const studioId = studio.id;

      // Delete existing tags for this studio, keeping the rows for the
      // change diff
      for (const [nearId, refs] of await deleteJunctionRows(
        prisma,
        "StudioTag",
        [studioId],
        instanceId
      )) {
        oldLinks.StudioTag.set(nearId, refs);
      }

      // Insert new tags (filter to valid tag IDs)
      const validTags = studio.tags.filter(
        (t: TagRef) => t?.id && validateEntityId(t.id)
      );
      entity.links = { StudioTag: validTags.map((t: TagRef) => t.id) };
      if (validTags.length > 0) {
        const tagValues = validTags
          .map(
            (t: TagRef) =>
              `('${escapeSql(studioId)}', '${escapeSql(instanceId)}', '${escapeSql(t.id)}', '${escapeSql(instanceId)}')`
          )
          .join(", ");

        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO StudioTag (studioId, studioInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
        );
      }
    }
  }

  return detectChanges({
    instanceId,
    stored,
    incoming,
    oldLinks,
    tagJunction: "StudioTag",
  });
}

// ==================== Tag Sync ====================

async function processTagsBatch(
  tags: SyncTag[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (tags.length === 0) return noChanges();

  // Validate IDs
  const validTags = tags.filter((t) => validateEntityId(t.id));
  if (validTags.length === 0) return noChanges();

  // What the batch's tags looked like before the write (tags have no
  // junction of their own: a parent change moves the tag's updated_at)
  const stored = await readStored(
    "StashTag",
    stashInstanceId,
    validTags.map((t) => t.id),
    false
  );

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
    '${escapeSql(tag.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(stashIdsJson)},
    ${escapeSqlNullable(tag.name)},
    ${tag.favorite ? 1 : 0},
    ${tag.scene_count ?? 0},
    ${tag.image_count ?? 0},
    ${tag.gallery_count ?? 0},
    ${tag.performer_count ?? 0},
    ${tag.studio_count ?? 0},
    ${tag.group_count ?? 0},
    ${tag.scene_marker_count ?? 0},
    ${escapeSqlNullable(tag.description)},
    ${escapeSqlNullable(JSON.stringify(aliases))},
    ${escapeSqlNullable(JSON.stringify(parentIds))},
    ${escapeSqlNullable(tag.image_path)},
    ${escapeSqlNullable(tagRecord.color as string | undefined)},
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

  return detectChanges({
    instanceId: stashInstanceId,
    stored,
    incoming: validTags.map((tag) => ({
      id: tag.id,
      updatedAt: tag.updated_at,
    })),
  });
}

// ==================== Group Sync ====================

async function processGroupsBatch(
  groups: SyncGroup[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (groups.length === 0) return noChanges();

  // Validate IDs
  const validGroups = groups.filter((g) => validateEntityId(g.id));
  if (validGroups.length === 0) return noChanges();

  // What the batch's groups looked like before the write
  const stored = await readStored(
    "StashGroup",
    stashInstanceId,
    validGroups.map((g) => g.id),
    false
  );

  const values = validGroups
    .map((group) => {
      const duration = group.duration || null;
      const urls = group.urls || [];
      return `(
    '${escapeSql(group.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(group.name)},
    ${escapeSqlNullable(group.date)},
    ${group.studio?.id ? `'${escapeSql(group.studio.id)}'` : "NULL"},
    ${group.rating100 ?? "NULL"},
    ${duration ? Math.round(duration) : "NULL"},
    ${group.scene_count ?? 0},
    ${group.performer_count ?? 0},
    ${escapeSqlNullable(group.director)},
    ${escapeSqlNullable(group.synopsis)},
    ${escapeSqlNullable(JSON.stringify(urls))},
    ${escapeSqlNullable(group.front_image_path)},
    ${escapeSqlNullable(group.back_image_path)},
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
  const oldLinks = { GroupTag: new Map<string, EntityRef[]>() };
  const incoming: IncomingEntity[] = [];
  for (const group of validGroups) {
    const entity: IncomingEntity = {
      id: group.id,
      updatedAt: group.updated_at,
    };
    incoming.push(entity);
    if (group.tags && group.tags.length > 0) {
      const groupId = group.id;

      // Delete existing tags for this group, keeping the rows for the
      // change diff
      for (const [nearId, refs] of await deleteJunctionRows(
        prisma,
        "GroupTag",
        [groupId],
        instanceId
      )) {
        oldLinks.GroupTag.set(nearId, refs);
      }

      // Insert new tags (filter to valid tag IDs)
      const validTags = group.tags.filter(
        (t: TagRef) => t?.id && validateEntityId(t.id)
      );
      entity.links = { GroupTag: validTags.map((t: TagRef) => t.id) };
      if (validTags.length > 0) {
        const tagValues = validTags
          .map(
            (t: TagRef) =>
              `('${escapeSql(groupId)}', '${escapeSql(instanceId)}', '${escapeSql(t.id)}', '${escapeSql(instanceId)}')`
          )
          .join(", ");

        await prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO GroupTag (groupId, groupInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
        );
      }
    }
  }

  return detectChanges({
    instanceId,
    stored,
    incoming,
    oldLinks,
    tagJunction: "GroupTag",
  });
}

// ==================== Gallery Sync ====================

async function processGalleriesBatch(
  galleries: SyncGallery[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (galleries.length === 0) return noChanges();

  // Validate IDs
  const validGalleries = galleries.filter((g) => validateEntityId(g.id));
  if (validGalleries.length === 0) return noChanges();

  // What the batch's galleries looked like before the write
  const stored = await readStored(
    "StashGallery",
    stashInstanceId,
    validGalleries.map((g) => g.id),
    true
  );

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
    '${escapeSql(gallery.id)}',
    ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${escapeSqlNullable(gallery.title)},
    ${escapeSqlNullable(gallery.date)},
    ${gallery.studio?.id ? `'${escapeSql(gallery.studio.id)}'` : "NULL"},
    ${gallery.studio?.id ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
    ${gallery.rating100 ?? "NULL"},
    ${coverImageId ? `'${escapeSql(coverImageId)}'` : "NULL"},
    ${gallery.image_count ?? 0},
    ${escapeSqlNullable(gallery.details)},
    ${escapeSqlNullable(gallery.urls?.[0])},
    ${escapeSqlNullable(gallery.code)},
    ${escapeSqlNullable(gallery.photographer)},
    ${escapeSqlNullable(gallery.urls ? JSON.stringify(gallery.urls) : null)},
    ${escapeSqlNullable(folder?.path)},
    ${escapeSqlNullable(fileBasename)},
    ${escapeSqlNullable(gallery.paths?.cover)},
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

  // Sync gallery performers (junction table), keeping each gallery's new
  // far sides for the change diff
  const instanceId = stashInstanceId;
  const galleryIds = validGalleries.map((g) => g.id);
  const linksOf = new Map(
    validGalleries.map((g) => [
      g.id,
      { GalleryPerformer: [] as string[], GalleryTag: [] as string[] },
    ])
  );
  const performerInserts: { galleryId: string; performerId: string }[] = [];
  for (const gallery of validGalleries) {
    if (gallery.performers && gallery.performers.length > 0) {
      for (const performer of gallery.performers) {
        if (validateEntityId(performer.id)) {
          linksOf.get(gallery.id)?.GalleryPerformer.push(performer.id);
          performerInserts.push({
            galleryId: gallery.id,
            performerId: performer.id,
          });
        }
      }
    }
  }

  // Delete existing gallery-performer relationships for these galleries,
  // keeping the rows for the change diff
  const oldLinks: Partial<Record<JunctionName, Map<string, EntityRef[]>>> = {};
  oldLinks.GalleryPerformer = await deleteJunctionRows(
    prisma,
    "GalleryPerformer",
    galleryIds,
    instanceId
  );

  // Insert new gallery-performer relationships
  if (performerInserts.length > 0) {
    const performerValues = performerInserts
      .map(
        (p) =>
          `('${escapeSql(p.galleryId)}', '${escapeSql(instanceId)}', '${escapeSql(p.performerId)}', '${escapeSql(instanceId)}')`
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
          linksOf.get(gallery.id)?.GalleryTag.push(tag.id);
          tagInserts.push({
            galleryId: gallery.id,
            tagId: tag.id,
          });
        }
      }
    }
  }

  // Delete existing gallery-tag relationships for these galleries, keeping
  // the rows for the change diff
  oldLinks.GalleryTag = await deleteJunctionRows(
    prisma,
    "GalleryTag",
    galleryIds,
    instanceId
  );

  // Insert new gallery-tag relationships
  if (tagInserts.length > 0) {
    const tagValues = tagInserts
      .map(
        (t) =>
          `('${escapeSql(t.galleryId)}', '${escapeSql(instanceId)}', '${escapeSql(t.tagId)}', '${escapeSql(instanceId)}')`
      )
      .join(",\n");

    await prisma.$executeRawUnsafe(`
      INSERT OR IGNORE INTO GalleryTag (galleryId, galleryInstanceId, tagId, tagInstanceId)
      VALUES ${tagValues}
    `);
  }

  return detectChanges({
    instanceId,
    stored,
    incoming: validGalleries.map((gallery) => ({
      id: gallery.id,
      updatedAt: gallery.updated_at,
      studioId: gallery.studio?.id ?? null,
      links: linksOf.get(gallery.id),
    })),
    oldLinks,
    compareStudio: true,
  });
}

// ==================== Image Sync ====================

async function processImagesBatch(
  images: SyncImage[],
  stashInstanceId: string
): Promise<BatchChanges> {
  // Skip empty batches
  if (images.length === 0) return noChanges();

  // Validate IDs
  const validImages = images.filter((i) => validateEntityId(i.id));
  if (validImages.length === 0) return noChanges();

  const imageIds = validImages.map((i) => i.id);
  const instanceId = stashInstanceId;

  // What the batch's images looked like before the write
  const stored = await readStored("StashImage", instanceId, imageIds, true);

  // Bulk delete junction records, keeping the rows for the change diff.
  // Uses sequential raw SQL in a transaction to avoid SQLite lock contention
  // and includes extended timeout for large libraries
  const oldLinks: Partial<Record<JunctionName, Map<string, EntityRef[]>>> = {};
  await dbWriteTransaction(
    "sync.images.junctions",
    async (tx) => {
      for (const junction of [
        "ImagePerformer",
        "ImageTag",
        "ImageGallery",
      ] as const) {
        oldLinks[junction] = await deleteJunctionRows(
          tx,
          junction,
          imageIds,
          instanceId
        );
      }
    },
    { timeout: 60000 } // 60 second timeout for large batches
  );

  // Build bulk image upsert
  const values = validImages
    .map((image) => {
      const visualFile = image.files?.[0];
      const paths = image.paths;
      return `(
      '${escapeSql(image.id)}',
      ${stashInstanceId ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
      ${escapeSqlNullable(image.title)},
      ${escapeSqlNullable(image.code)},
      ${escapeSqlNullable(image.details)},
      ${escapeSqlNullable(image.photographer)},
      ${escapeSqlNullable(image.urls ? JSON.stringify(image.urls) : null)},
      ${escapeSqlNullable(image.date)},
      ${image.studio?.id ? `'${escapeSql(image.studio.id)}'` : "NULL"},
      ${image.studio?.id ? `'${escapeSql(stashInstanceId)}'` : "NULL"},
      ${image.rating100 ?? "NULL"},
      ${image.o_counter ?? 0},
      ${image.organized ? 1 : 0},
      ${escapeSqlNullable(visualFile?.path)},
      ${visualFile?.width ?? "NULL"},
      ${visualFile?.height ?? "NULL"},
      ${visualFile?.size ?? "NULL"},
      ${escapeSqlNullable(paths?.thumbnail)},
      ${escapeSqlNullable(paths?.preview)},
      ${escapeSqlNullable(paths?.image)},
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

  // Collect junction records (validate related entity IDs too), and each
  // image's new far sides for the change diff
  const performerRecords: string[] = [];
  const tagRecords: string[] = [];
  const galleryRecords: string[] = [];
  const incoming: IncomingEntity[] = [];

  for (const image of validImages) {
    const links = {
      ImagePerformer: [] as string[],
      ImageTag: [] as string[],
      ImageGallery: [] as string[],
    };
    for (const p of image.performers || []) {
      if (validateEntityId(p.id)) {
        links.ImagePerformer.push(p.id);
        performerRecords.push(
          `('${escapeSql(image.id)}', '${escapeSql(instanceId)}', '${escapeSql(p.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    for (const t of image.tags || []) {
      if (validateEntityId(t.id)) {
        links.ImageTag.push(t.id);
        tagRecords.push(
          `('${escapeSql(image.id)}', '${escapeSql(instanceId)}', '${escapeSql(t.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    for (const g of image.galleries || []) {
      if (validateEntityId(g.id)) {
        links.ImageGallery.push(g.id);
        galleryRecords.push(
          `('${escapeSql(image.id)}', '${escapeSql(instanceId)}', '${escapeSql(g.id)}', '${escapeSql(instanceId)}')`
        );
      }
    }
    incoming.push({
      id: image.id,
      updatedAt: image.updated_at,
      studioId: image.studio?.id ?? null,
      links,
    });
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

  // An image's junction rows and studio are not compared: gallery
  // inheritance writes into them (lead decision, 2026-09-24)
  return detectChanges({
    instanceId,
    stored,
    incoming,
    oldLinks,
    compareLinks: false,
    compareStudio: false,
  });
}

// ==================== Clip Sync ====================

/**
 * Writes one page of clips (scene markers) and their tags. Each preview is
 * probed first, to record whether Stash has generated it.
 */
async function processClipsBatch(
  markers: SyncClip[],
  stashInstanceId: string
): Promise<BatchChanges> {
  if (markers.length === 0) return noChanges();

  // Build preview URLs for probing
  // Note: m.preview is already a full URL from Stash, just append API key
  const apiKey = stashInstanceManager.getApiKey();
  const previewUrls = markers.map((m) => `${m.preview}?apikey=${apiKey}`);

  // Probe previews in batch
  const probeResults = await clipPreviewProber.probeBatch(previewUrls);

  const instanceId = stashInstanceId;
  const markerIds = markers.map((m) => m.id);

  // What the batch's clips looked like before the write, for the change
  // diff: stashUpdatedAt is a DateTime here, compared as epoch milliseconds
  const storedRows = await prisma.stashClip.findMany({
    where: { stashInstanceId: instanceId, id: { in: markerIds } },
    select: { id: true, stashUpdatedAt: true, deletedAt: true },
  });
  const stored = new Map<string, StoredEntity>(
    storedRows.map((row) => [
      row.id,
      {
        updatedAt: row.stashUpdatedAt?.getTime() ?? null,
        deleted: row.deletedAt !== null,
      },
    ])
  );

  // Delete the batch's clip tags, keeping the rows for the change diff
  const oldLinks = {
    ClipTag: await deleteJunctionRows(prisma, "ClipTag", markerIds, instanceId),
  };

  // Upsert clips
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

    // Sync clip tags (junction table); the old rows went above
    const tagIds = marker.tags.map((t) => t.id);
    if (tagIds.length > 0) {
      const tagValues = tagIds
        .map(
          (tagId) =>
            `('${escapeSql(marker.id)}', '${escapeSql(instanceId)}', '${escapeSql(tagId)}', '${escapeSql(instanceId)}')`
        )
        .join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ClipTag (clipId, clipInstanceId, tagId, tagInstanceId) VALUES ${tagValues}`
      );
    }
  }

  return detectChanges({
    instanceId,
    stored,
    incoming: markers.map((marker) => ({
      id: marker.id,
      updatedAt: marker.updated_at
        ? new Date(marker.updated_at).getTime()
        : null,
      links: { ClipTag: marker.tags.map((t) => t.id) },
    })),
    oldLinks,
  });
}

class StashSyncService extends EventEmitter {
  /**
   * The lock: which job runs, if any. A sync, or an instance deletion (the
   * instance-row batch, then the purge of its cached library); neither runs
   * while the other does. Read it through isSyncing().
   */
  private activeJob: SyncJob | null = null;
  /**
   * Full syncs asked for while the lock was held (an instance added or
   * re-pointed during a sync): instance ids, or ALL_INSTANCES. release()
   * starts them one at a time; abort() drops them.
   */
  private readonly queuedFullSyncs = new Set<string>();
  /** whenIdle() callers, resolved when a release leaves the lock free. */
  private readonly idleWaiters: Array<() => void> = [];
  private abortController: AbortController | null = null;
  /**
   * The change set of a run that ended before its post-sync steps (an
   * abort, or a failure): the next run takes it over, so the steps still
   * cover what that run wrote. Lost with the process; the daily full pass
   * is the catch-all.
   */
  private carriedChanges: SyncChangeSet | null = null;

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
   * Whether the service is busy: a sync or an instance deletion holds the
   * lock, so a new sync or deletion would be refused or skipped.
   */
  isSyncing(): boolean {
    return this.activeJob !== null;
  }

  /**
   * Abort the running job: a sync stops at its next check, an instance purge
   * between two chunks (the startup sweep removes the rest). Queued full
   * syncs are dropped, so nothing starts after it. Calling it again while
   * the job winds down only drops the queue again.
   */
  abort(): void {
    this.queuedFullSyncs.clear();
    if (this.abortController && !this.abortController.signal.aborted) {
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

  /**
   * Frees the lock, then starts the next queued full sync, if any. When
   * none starts, the service is idle and whenIdle() resolves.
   */
  private release(): void {
    this.activeJob = null;
    this.abortController = null;
    this.drainQueuedFullSyncs();
    if (!this.isSyncing()) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }

  /**
   * Resolves once no job holds the lock: at once when none does, otherwise
   * when a job's release starts no queued sync. The shutdown calls abort()
   * first, which drops the queue, so it waits only for the running job.
   */
  whenIdle(): Promise<void> {
    if (this.activeJob === null) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  /**
   * A full sync of one instance, or of every enabled instance without an id,
   * as soon as the lock is free: now when nothing runs ("started"), otherwise
   * once the running job ends ("queued"). For a change that has already been
   * saved (an instance added or re-pointed), where refusing would lose the
   * sync. Runs in the background; a failure is logged.
   */
  queueFullSync(stashInstanceId?: string): "started" | "queued" {
    if (this.activeJob !== null) {
      this.queuedFullSyncs.add(stashInstanceId ?? ALL_INSTANCES);
      logger.info("Busy; the full sync starts when the running job ends", {
        job: this.activeJob,
        instanceId: stashInstanceId ?? "all",
      });
      return "queued";
    }
    this.startFullSync(stashInstanceId);
    return "started";
  }

  /**
   * Starts one queued full sync once the lock is free: every instance first,
   * which covers the instances queued one by one, so they are dropped;
   * otherwise the one queued earliest. The rest wait for its release.
   */
  private drainQueuedFullSyncs(): void {
    if (this.activeJob !== null) return;
    if (this.queuedFullSyncs.has(ALL_INSTANCES)) {
      this.queuedFullSyncs.clear();
      this.startFullSync();
      return;
    }
    const [next] = this.queuedFullSyncs;
    if (next === undefined) return;
    this.queuedFullSyncs.delete(next);
    this.startFullSync(next);
  }

  /** fullSync in the background; the caller has checked the lock is free. */
  private startFullSync(stashInstanceId?: string): void {
    this.fullSync(stashInstanceId).catch((error: unknown) => {
      logSyncFailure("Background full sync failed", error, {
        instanceId: stashInstanceId ?? "all",
      });
    });
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
      return await this.runSync("full", stashInstanceId);
    } finally {
      this.release();
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
      return await this.runSync("smart", stashInstanceId);
    } finally {
      this.release();
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
      return await this.runSync("incremental", stashInstanceId);
    } finally {
      this.release();
    }
  }

  /**
   * The change set a run starts with: the one an earlier run left behind
   * (its post-sync steps never ran), else a fresh one.
   */
  private takeChanges(): SyncChangeSet {
    const changes = this.carriedChanges ?? new SyncChangeSet();
    this.carriedChanges = null;
    return changes;
  }

  /** The running job's context. The caller holds the lock. */
  private runContext(): SyncRunContext {
    if (this.abortController === null) {
      throw new Error("A sync runs only while it holds the lock");
    }
    return { signal: this.abortController.signal, changes: this.takeChanges() };
  }

  /**
   * One sync run in `mode`: the instance given, or every enabled instance in
   * turn, then the post-sync steps once for what the whole run changed. An
   * instance that fails is logged and the next one syncs; an abort ends the
   * whole run, and its changes carry into the next run. The caller holds the
   * lock.
   */
  private async runSync(
    mode: SyncMode,
    stashInstanceId?: string
  ): Promise<SyncResult[]> {
    const run = this.runContext();
    try {
      const results = stashInstanceId
        ? await this.syncInstance(stashInstanceId, mode, run)
        : await this.syncEveryInstance(mode, run);
      await this.runPostSyncSteps(run.changes, { full: mode === "full" });
      return results;
    } catch (error) {
      // What this run wrote still needs its post-sync steps
      this.carriedChanges = run.changes;
      throw error;
    }
  }

  /** runSync over every enabled instance. */
  private async syncEveryInstance(
    mode: SyncMode,
    run: SyncRunContext
  ): Promise<SyncResult[]> {
    const enabledInstances = stashInstanceManager.getAllEnabled();
    if (enabledInstances.length === 0) {
      logger.warn("No enabled Stash instances to sync");
      return [];
    }

    const { name } = SYNC_MODE_NAMES[mode];
    logger.info(
      `Starting ${name} for ${enabledInstances.length} instance(s)...`
    );
    const allResults: SyncResult[] = [];

    for (const instance of enabledInstances) {
      logger.info(`Syncing instance: ${instance.name} (${instance.id})`, {
        mode,
      });
      try {
        const results = await this.syncInstance(instance.id, mode, run);
        allResults.push(...results);
      } catch (error) {
        // An abort ends the whole run, not just this instance
        if (this.isAbort(error)) throw new Error("Sync aborted");
        logger.error(`Failed to sync instance ${instance.name}`, {
          instanceId: instance.id,
          mode,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other instances
      }
    }

    return allResults;
  }

  /**
   * Syncs one instance in `mode`: every type in SYNC_ORDER, then the
   * cleanups (on the full path each type's runs right after it). Each
   * type's state is saved at once, so a restart does not sync completed
   * types again; a type that fails is recorded and the next one runs. What
   * changed goes into the run's change set; the post-sync steps run once
   * per run, after every instance (runSync). The caller holds the lock.
   */
  private async syncInstance(
    stashInstanceId: string,
    mode: SyncMode,
    run: SyncRunContext
  ): Promise<SyncResult[]> {
    const { name, title } = SYNC_MODE_NAMES[mode];
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      logger.info(`Starting ${name}...`, { stashInstanceId });

      for (const entityType of SYNC_ORDER) {
        this.checkAbort();
        results.push(
          await this.syncEntityType(entityType, stashInstanceId, mode, run)
        );
      }

      // Cleanup deleted entities (detect deletions/merges in Stash)
      if (mode !== "full") {
        await this.cleanupEveryType(stashInstanceId, results, run);
      }

      const duration = Date.now() - startTime;
      logger.info(`${title} completed`, {
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
        logger.info(`${title} aborted by user`);
      } else {
        logger.error(`${title} failed`, { error: errorMsg });
      }

      throw error;
    }
  }

  /**
   * One type of one instance in `mode`. The full path fetches every entity
   * and cleans the type up. The others fetch what changed since the type's
   * last sync (everything when it never synced); the smart path first asks
   * Stash how many changed and skips the type at none, clearing an earlier
   * run's error.
   */
  private async syncEntityType(
    entityType: EntityType,
    stashInstanceId: string,
    mode: SyncMode,
    run: SyncRunContext
  ): Promise<SyncResult> {
    if (mode === "full") {
      return this.runEntityType(
        entityType,
        stashInstanceId,
        { syncType: "full", withCleanup: true },
        run
      );
    }

    const syncState = await this.getEntitySyncState(
      stashInstanceId,
      entityType
    );
    const lastSync = this.getMostRecentSyncTime(syncState);

    if (!lastSync) {
      // Never synced - do full sync for this entity type only
      logger.info(`${entityType}: No previous sync, syncing all`);
      return this.runEntityType(
        entityType,
        stashInstanceId,
        { syncType: "full", withCleanup: false },
        run
      );
    }

    if (mode === "smart") {
      // Check how many entities changed since last sync
      const changeCount = await this.getChangeCount(
        entityType,
        lastSync,
        stashInstanceId,
        run
      );
      if (changeCount === 0) {
        // lastSync is a raw RFC3339 string
        logger.info(`${entityType}: No changes since ${lastSync}, skipping`);
        // Nothing failed this run: clear an earlier run's error
        await this.recordEntityError(stashInstanceId, entityType, null);
        return { entityType, synced: 0, deleted: 0, durationMs: 0 };
      }
      logger.info(
        `${entityType}: ${changeCount} changes since ${lastSync}, syncing`
      );
    } else {
      // Incremental sync using this entity's own timestamp
      logger.info(`${entityType}: syncing changes since ${lastSync}`);
    }

    return this.runEntityType(
      entityType,
      stashInstanceId,
      { syncType: "incremental", since: lastSync, withCleanup: false },
      run
    );
  }

  /**
   * The steps after every instance of a run, once. A full pass runs every
   * step whole library and recomputes every user: it is the catch-all for
   * links Stash edits without moving updated_at. Otherwise the change set
   * decides:
   * - images written, even unchanged (their junction rows were rewritten
   *   from Stash), re-apply gallery inheritance, as do changed galleries;
   * - nothing changed and no user holds `pending` rows: no other step runs;
   * - scene tag inheritance for the scenes the changes reach
   *   (`sceneTagInheritanceScope`), when there are any;
   * - any change: the image counts, user stats and tag counts, then the
   *   exclusion recompute of the users who can see a changed instance,
   *   plus those with pending holds.
   * Gallery inheritance and the image counts are whole library still (C5
   * scopes them to the change set); user stats and tag counts stay whole
   * library (1.3 s and 0.04 s on the prod copy, and the stats depend on
   * watch history as well as the library).
   */
  private async runPostSyncSteps(
    changes: SyncChangeSet,
    { full }: { full: boolean }
  ): Promise<void> {
    if (full) {
      logger.info("Full sync: running every post-sync step");
      await this.computeSceneTagInheritance();
      await this.applyGalleryInheritance();
      await this.rebuildCounts();
      logger.info("Sync complete, recomputing user exclusions...");
      await exclusionComputationService.recomputeAllUsers();
      logger.info("User exclusions recomputed");
    } else {
      const wroteImages = !changes.written("image").isEmpty();
      if (
        wroteImages ||
        !changes.changed("gallery").isEmpty() ||
        !changes.changed("image").isEmpty()
      ) {
        await this.applyGalleryInheritance();
      }

      if (changes.isEmpty()) {
        const pending =
          await exclusionComputationService.usersWithPendingHolds();
        if (pending.length === 0) {
          logger.info(
            wroteImages
              ? "nothing changed; only gallery inheritance re-applied to the rewritten images"
              : "nothing changed, post-sync steps skipped"
          );
        } else {
          logger.info(
            "nothing changed; recomputing the users with pending holds",
            {
              users: pending.length,
            }
          );
          await exclusionComputationService.recomputeUsersForInstances([]);
        }
      } else {
        const scope = await this.sceneTagInheritanceScope(changes);
        if (scope === "all" || scope.length > 0) {
          await this.computeSceneTagInheritance(scope);
        }
        await this.rebuildCounts();
        const instances = changes.instances();
        logger.info(
          "Sync complete, recomputing the exclusions of the users on the changed instances...",
          {
            instances,
          }
        );
        await exclusionComputationService.recomputeUsersForInstances(instances);
        logger.info("User exclusions recomputed");
      }
    }
    // D8: PRAGMA optimize goes here, at the end of every run's steps
  }

  /**
   * Scene tag inheritance for `scope`, every live scene by default (after
   * scenes, performers, studios and groups).
   */
  private async computeSceneTagInheritance(
    scope: EntityRef[] | "all" = "all"
  ): Promise<void> {
    logger.info(
      scope === "all"
        ? "Computing inherited tags for scenes..."
        : `Computing inherited tags for ${scope.length} scenes...`
    );
    await sceneTagInheritanceService.computeInheritedTags(scope);
    logger.info("Scene tag inheritance complete");
  }

  /**
   * The scenes whose inherited tags a run's changes reach: the changed
   * scenes, and the scenes of every performer, studio and group whose tag
   * set changed or that was soft-deleted (one statement per source type).
   * "all" when one of those kinds is past the change set's limit; empty
   * when the changes reach no scene.
   */
  private async sceneTagInheritanceScope(
    changes: SyncChangeSet
  ): Promise<EntityRef[] | "all"> {
    const scenes = changes.changed("scene");
    const sources = (["performer", "studio", "group"] as const).map((type) => ({
      type,
      scopes: [changes.tagSetChanged(type), changes.deleted(type)],
    }));
    if (
      scenes.whole ||
      sources.some(({ scopes }) => scopes.some((scope) => scope.whole))
    ) {
      return "all";
    }

    // Each scene once, however many of its sources changed
    const byKey = new Map<string, EntityRef>();
    const add = (refs: readonly EntityRef[]) => {
      for (const ref of refs) byKey.set(`${ref.id}\0${ref.instanceId}`, ref);
    };
    add(scenes.refs);
    for (const { type, scopes } of sources) {
      const sourceRefs = scopes.flatMap((scope) => scope.refs);
      if (sourceRefs.length === 0) continue;
      add(
        await sceneTagInheritanceService.scenesInheritingFrom(type, sourceRefs)
      );
    }
    return Array.from(byKey.values());
  }

  /** Gallery inheritance, whole library (after images and galleries). */
  private async applyGalleryInheritance(): Promise<void> {
    logger.info("Applying gallery inheritance to images...");
    await imageGalleryInheritanceService.applyGalleryInheritance();
    logger.info("Gallery inheritance complete");
  }

  /** The image counts (after gallery inheritance), user stats and tag counts. */
  private async rebuildCounts(): Promise<void> {
    logger.info("Rebuilding inherited image counts...");
    await entityImageCountService.rebuildAllImageCounts();
    logger.info("Inherited image counts rebuild complete");

    logger.info("Rebuilding user stats after sync...");
    await userStatsService.rebuildAllStats();
    logger.info("User stats rebuild complete");

    await this.computeTagSceneCountsViaPerformers();
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
   * How many entities of a type Stash has updated since `since`: the type's
   * spec asked for a page of 0, which returns only the count. The smart sync
   * skips a type that has none. A failed probe counts as a change; an abort
   * ends the sync.
   */
  private async getChangeCount(
    entityType: EntityType,
    since: string,
    stashInstanceId: string,
    run: SyncRunContext
  ): Promise<number> {
    const stash = this.getStashClient(stashInstanceId);
    // No change count for clips yet, so the startup smart sync skips them
    // once they have synced; the scheduled incremental sync still runs them
    if (entityType === "clip") return 0;

    try {
      const { count } = await ENTITY_SYNC[entityType].fetchPage(stash, {
        page: 1,
        perPage: 0,
        since,
        signal: run.signal,
      });
      return count;
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
   * Syncs one type of one instance page by page: every entity, those Stash
   * updated after `since`, or only `ids` (a page of ids per request; none
   * for an empty list, which Stash would read as no list). Each page is
   * written by the type's spec before the next is asked for, and the loop
   * ends at Stash's count or on an empty page. The run's abort is checked
   * before every page and ends a request in flight. The result carries the
   * newest updated_at seen, the type's next watermark.
   */
  private async paginate(
    entityType: EntityType,
    stashInstanceId: string,
    { since, ids }: PaginateOptions,
    run: SyncRunContext
  ): Promise<SyncResult> {
    // Widened to every type's entity: the pages it fetches are the ones its
    // own processBatch writes
    const spec: EntitySyncSpec<SyncEntityOf<EntityType>> =
      ENTITY_SYNC[entityType];
    const { plural } = ENTITY_TABLES[entityType];
    logger.info(`Syncing ${plural}...`);
    const startTime = Date.now();
    const stash = this.getStashClient(stashInstanceId);
    let synced = 0;
    let total = 0;
    let maxUpdatedAt: string | undefined;

    this.emitProgress({ entityType, phase: "fetching", current: 0, total: 0 });

    try {
      const idChunks =
        ids === undefined ? [undefined] : chunksOf(ids, BATCH_SIZE);
      for (const idChunk of idChunks) {
        let fetched = 0;
        for (let page = 1; ; page++) {
          throwIfAborted(run.signal);

          const fetchStart = Date.now();
          const { items, count } = await spec.fetchPage(stash, {
            page,
            perPage: BATCH_SIZE,
            since,
            ids: idChunk,
            signal: run.signal,
          });
          logger.debug(
            `Fetched ${plural} page ${page} in ${Date.now() - fetchStart}ms`
          );
          total = ids === undefined ? count : ids.length;

          if (items.length === 0) break;

          // Track max updated_at for sync state
          maxUpdatedAt = newestUpdatedAt(maxUpdatedAt, items);

          run.changes.addBatch(
            entityType,
            await spec.processBatch(items, stashInstanceId, run)
          );

          fetched += items.length;
          synced += items.length;
          this.emitProgress({
            entityType,
            phase: "processing",
            current: synced,
            total,
          });
          logger.debug(
            `${capitalize(plural)}: ${synced}/${total} (${Math.round((synced / total) * 100)}%)`
          );

          if (fetched >= count) break;
        }
      }

      this.emitProgress({
        entityType,
        phase: "complete",
        current: synced,
        total: synced,
      });

      const durationMs = Date.now() - startTime;
      logger.info(
        `${capitalize(plural)} synced: ${synced.toLocaleString()} in ${(durationMs / 1000).toFixed(1)}s`
      );

      return {
        entityType,
        synced,
        deleted: 0,
        durationMs,
        maxUpdatedAt,
      };
    } catch (error) {
      this.emitProgress({
        entityType,
        phase: "error",
        current: synced,
        total,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Tells progress listeners (SyncScheduler.onProgress) how a type goes. */
  private emitProgress(progress: SyncProgress): void {
    this.emit("progress", progress);
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
    { syncType, since, withCleanup }: RunEntityTypeOptions,
    run: SyncRunContext
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let result: SyncResult;
    try {
      result = await this.paginate(
        entityType,
        stashInstanceId,
        { since: syncType === "full" ? undefined : since },
        run
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
      run.changes.addDeleted(entityType, stashInstanceId, outcome.deletedIds);
      result.deleted = outcome.deleted;
      result.error = joinProblems(result.error, cleanupProblem(outcome));
    }

    await this.saveSyncState(stashInstanceId, syncType, result);
    return result;
  }

  /**
   * The incremental paths' cleanup, every type after all of them synced.
   * Each type's soft-deleted count goes into its result and its rows into
   * the run's change set, and a cleanup that skips, refuses or fails is
   * added to the type's `lastError`.
   */
  private async cleanupEveryType(
    stashInstanceId: string,
    results: SyncResult[],
    run: SyncRunContext
  ): Promise<void> {
    logger.info("Checking for deleted entities...");
    let totalDeleted = 0;
    for (const entityType of SYNC_ORDER) {
      this.checkAbort();
      const outcome = await this.cleanupDeletedEntities(
        entityType,
        stashInstanceId
      );
      run.changes.addDeleted(entityType, stashInstanceId, outcome.deletedIds);
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
   *    `ignoreRatioGuard` (an admin's "Apply deletions") passes it by; the
   *    guards of steps 1 and 2 stay.
   * 5. softDeleteMissing, 500 rows per writer-queue unit.
   * 6. Scenes: user data moves from merged scenes to their survivors
   *    (MergeReconciliationService.reconcileDeletedScenes). Scenes that left
   *    Stash together are soft-deleted by then, so none becomes another's
   *    target; each scene cleanup first catches up on scenes an earlier one
   *    soft-deleted but did not reconcile.
   *
   * An abort rethrows; any other failure returns the `error`. A failure
   * before step 5 soft-deletes nothing (`deleted` 0, no `deletedIds`); one
   * at or after it returns the rows soft-deleted so far in `deleted` and
   * the whole delete set in `deletedIds`, so the run's change set covers
   * every row that may have gone.
   */
  private async cleanupDeletedEntities(
    entityType: EntityType,
    stashInstanceId: string,
    { ignoreRatioGuard = false }: CleanupOptions = {}
  ): Promise<CleanupOutcome> {
    const { table, plural } = ENTITY_TABLES[entityType];
    logger.info(`Checking for deleted ${plural}...`);
    const startTime = Date.now();
    // Set once the soft-delete starts: what a failure after that leaves
    const progress = { attempted: [] as string[], changed: 0 };
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

      // 4. The ratio guard, unless an admin applies the deletions
      if (ignoreRatioGuard) {
        logger.warn(
          `Cleanup: soft-deleting ${missing.length}/${liveCount} ${plural} without the ratio guard (applied by an admin)`,
          { stashInstanceId }
        );
      } else if (
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
      progress.attempted = deletedIds;
      const deleted = await this.softDeleteMissing(
        entityType,
        stashInstanceId,
        deletedIds,
        new Date(),
        progress
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
      return {
        deleted: progress.changed,
        deletedIds: progress.attempted,
        error: message,
      };
    }
  }

  /**
   * Soft-deletes `ids` of one type and instance, CLEANUP_SOFT_DELETE_BATCH
   * rows per writer-queue unit, and returns how many rows changed (also
   * kept up to date in `progress.changed`, for a failure midway).
   * `deletedAt` is bound as epoch milliseconds, which is how Prisma stores a
   * DateTime in SQLite, so Prisma reads it back as `now`. A failure midway
   * leaves the batches already written soft-deleted, and the next cleanup
   * finds the rest again.
   */
  private async softDeleteMissing(
    entityType: EntityType,
    stashInstanceId: string,
    ids: string[],
    now: Date,
    progress: { changed: number } = { changed: 0 }
  ): Promise<number> {
    const { table, plural } = ENTITY_TABLES[entityType];
    for (let i = 0; i < ids.length; i += CLEANUP_SOFT_DELETE_BATCH) {
      const batch = JSON.stringify(ids.slice(i, i + CLEANUP_SOFT_DELETE_BATCH));
      progress.changed += await dbWrite(`sync.cleanup.${plural}`, () =>
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
    return progress.changed;
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
   * One type's cleanup on one instance, outside a sync: the sync status's
   * "Apply deletions" (POST /api/sync/cleanup) runs it with
   * `ignoreRatioGuard` after a cleanup refused a mass deletion.
   *
   * Takes the lock as a sync at once, and throws SyncBusyError when a sync
   * or an instance deletion holds it. The returned promise is the cleanup:
   * its outcome replaces the type's `lastError` (null when it ran clean, the
   * skip or failure otherwise), the post-sync steps run for what it
   * soft-deleted, then the lock is released. Abort stops it like a sync,
   * rejecting with "Sync aborted" and recording nothing.
   */
  runCleanup(
    entityType: EntityType,
    stashInstanceId: string,
    options: CleanupOptions = {}
  ): Promise<CleanupOutcome> {
    this.acquire("sync");
    return this.cleanupAndRecord(entityType, stashInstanceId, options).finally(
      () => this.release()
    );
  }

  /** runCleanup's work; the caller holds the lock. */
  private async cleanupAndRecord(
    entityType: EntityType,
    stashInstanceId: string,
    options: CleanupOptions
  ): Promise<CleanupOutcome> {
    const changes = this.takeChanges();
    try {
      const outcome = await this.cleanupDeletedEntities(
        entityType,
        stashInstanceId,
        options
      );
      changes.addDeleted(entityType, stashInstanceId, outcome.deletedIds);
      await this.recordEntityError(
        stashInstanceId,
        entityType,
        cleanupProblem(outcome) ?? null
      );
      logger.info("Cleanup run by an admin finished", {
        stashInstanceId,
        entityType,
        deleted: outcome.deleted,
        problem: cleanupProblem(outcome) ?? null,
      });
      await this.runPostSyncSteps(changes, { full: false });
      return outcome;
    } catch (error) {
      this.carriedChanges = changes;
      throw error;
    }
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
   * It answers once that is done. Afterwards, still under the lock, in
   * `purged` (which never rejects): the users whose scope held the instance
   * (no selection, or a selection naming it, read before the batch removes
   * the selections) are recomputed, since their library changed, and then
   * the cached library goes. Its rows carry an instance id that no longer
   * exists, so a failure or an abort midway leaves them to the startup
   * sweep (`purgeUnknownInstanceCaches`).
   */
  async deleteInstance(instanceId: string): Promise<{ purged: Promise<void> }> {
    this.acquire("instance-delete");

    let affectedUsers: number[];
    try {
      affectedUsers = await getUsersSelecting(instanceId);
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
    const purged = exclusionComputationService
      .recomputeUsers(affectedUsers, "recomputeUsersAfterInstanceDelete", {
        instanceId,
      })
      .then(() => this.purgeInstanceCache(instanceId))
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
        // A sync queued for the instance before it went has nothing to fetch
        this.queuedFullSyncs.delete(instanceId);
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
