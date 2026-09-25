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
import type { Prisma, PrismaClient } from "@prisma/client";
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
  MultiCriterionInput,
  TimestampCriterionInput,
} from "../graphql/generated/graphql.js";
import prisma from "../prisma/singleton.js";
import type {
  SyncEntityState,
  SyncEntityType,
  SyncJob,
  SyncStatusResponse,
} from "../types/api/sync.js";
import {
  checkpointWal,
  refreshPlannerStatistics,
} from "../utils/databaseMaintenance.js";
import { dbWrite, dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { summarizeStashStreams } from "../utils/sceneStreams.js";
import { logSyncFailure } from "../utils/syncLog.js";
import { clipPreviewProber } from "./ClipPreviewProber.js";
// Transform functions no longer needed - URLs transformed at read time
import {
  type ImageCountScope,
  entityImageCountService,
} from "./EntityImageCountService.js";
import {
  type RecomputeAllResult,
  exclusionComputationService,
} from "./ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
import { mergeReconciliationService } from "./MergeReconciliationService.js";
import { sceneTagInheritanceService } from "./SceneTagInheritanceService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import {
  type BatchChanges,
  type EntityRef,
  type IncomingEntity,
  type JunctionName,
  type RefScope,
  SCOPE_LIMIT,
  type StoredEntity,
  SyncChangeSet,
  detectChanges,
  distinctRefs,
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
  /**
   * Run the type's cleanup right after it (the full sync path), then fetch
   * by id what Stash lists and no page returned (`fetchMissedIds`).
   */
  withCleanup: boolean;
  /** Collects the ids the pages returned (a "full" type) */
  seen?: Set<string>;
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
  /**
   * Collects the ids the pages returned: a type fetched whole, for the
   * completeness check after its cleanup (`fetchMissedIds`)
   */
  seen?: Set<string>;
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
 * How far past this server's clock an updated_at still counts for the
 * watermark (clock skew between Peek and Stash). A later one, such as a
 * Stash JSON import with future dates, would make every incremental sync
 * ask for changes after it and see none until that date.
 */
const WATERMARK_MAX_SKEW_MS = 5 * 60 * 1000;

/** How many ids a log line names at most. */
const LOGGED_IDS = 20;

/** The entities a type's watermark left out as future-dated, for the log. */
interface FutureDated {
  count: number;
  /** The first LOGGED_IDS of them */
  ids: string[];
  /** The newest of their updated_at values */
  newest?: string;
}

/**
 * The newest of `current` and the `updated_at` values of `entities`, by
 * time: the watermark the next incremental sync starts from. Kept as Stash
 * wrote it, with its timezone. A value more than WATERMARK_MAX_SKEW_MS past
 * `now` is left out and counted in `future`.
 */
function newestUpdatedAt(
  current: string | undefined,
  entities: ReadonlyArray<{ id: string; updated_at?: string | null }>,
  future: FutureDated,
  now = Date.now()
): string | undefined {
  let newest = current;
  for (const { id, updated_at: updatedAt } of entities) {
    if (!updatedAt) continue;
    if (new Date(updatedAt).getTime() > now + WATERMARK_MAX_SKEW_MS) {
      future.count++;
      if (future.ids.length < LOGGED_IDS) future.ids.push(id);
      if (
        future.newest === undefined ||
        compareTimestamps(updatedAt, future.newest) > 0
      ) {
        future.newest = updatedAt;
      }
      continue;
    }
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
 * clips, whose `stashUpdatedAt` is stored as epoch milliseconds, as Prisma
 * stores a DateTime (processClipsBatch reads them through Prisma).
 */
async function readStored(
  db: Pick<PrismaClient, "$queryRawUnsafe">,
  table: Exclude<(typeof INSTANCE_CACHE_TABLES)[number], "StashClip">,
  stashInstanceId: string,
  ids: readonly string[],
  withStudio: boolean
): Promise<Map<string, StoredEntity>> {
  const rows = await db.$queryRawUnsafe<
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

/**
 * Each junction's near (the synced entity) and far columns, and a column of
 * its own when it has one (a scene's place in a group).
 */
const JUNCTION_COLUMNS: Record<
  JunctionName,
  {
    near: string;
    nearInstance: string;
    far: string;
    farInstance: string;
    extra?: string;
  }
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
    extra: "sceneIndex",
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

/**
 * One junction row to insert: the synced entity's id and the far side's,
 * both on the batch's instance, and the junction's own column if it has one
 * (a scene's place in a group, null when Stash has none).
 */
type JunctionRow = readonly [nearId: string, farId: string, extra?: unknown];

/**
 * Inserts a batch's junction rows on its transaction, bound as one JSON
 * parameter: one statement whatever the batch's size, and no string built
 * from the ids.
 */
async function insertJunctionRows(
  db: Pick<PrismaClient, "$executeRawUnsafe">,
  junction: JunctionName,
  rows: readonly JunctionRow[],
  instanceId: string
): Promise<void> {
  if (rows.length === 0) return;
  const { near, nearInstance, far, farInstance, extra } =
    JUNCTION_COLUMNS[junction];
  await db.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "${junction}" ("${near}", "${nearInstance}", "${far}", "${farInstance}"${extra ? `, "${extra}"` : ""})
     SELECT json_extract(j.value, '$[0]'), ?, json_extract(j.value, '$[1]'), ?${extra ? `, json_extract(j.value, '$[2]')` : ""}
     FROM json_each(?) j`,
    instanceId,
    instanceId,
    JSON.stringify(rows)
  );
}

/** One batch's writes, built before its transaction opens. */
interface BatchWrite {
  /** The unit's name in the writer queue's logs, "sync.<plural>" */
  label: string;
  type: EntityType;
  instanceId: string;
  /** The batch's entity ids: their junction rows are replaced */
  ids: readonly string[];
  /** Reads the batch's rows as stored before the write, for the change diff */
  readStored(tx: Prisma.TransactionClient): Promise<Map<string, StoredEntity>>;
  /** Writes the batch's rows */
  upsert(tx: Prisma.TransactionClient): Promise<unknown>;
  /** Each junction the batch rewrites, with its new rows */
  junctions: ReadonlyArray<readonly [JunctionName, readonly JunctionRow[]]>;
  /**
   * Recomputes the columns the rows derive from themselves and their new
   * junction rows, after the inserts (scenes: `refreshSceneDerivedColumns`)
   */
  refreshDerived?(tx: Prisma.TransactionClient): Promise<unknown>;
  /** The change diff, from the rows and links as they were before the write */
  detect(
    stored: Map<string, StoredEntity>,
    oldLinks: Partial<Record<JunctionName, Map<string, EntityRef[]>>>
  ): BatchChanges;
  /** The users the batch's changes are held from (`usersToHold`) */
  holdFrom: readonly number[];
}

/**
 * Writes one batch in one transaction, one statement after another on its
 * connection (item 42, SYNC-11): the rows' stored state, the old junction
 * rows (deleted and returned, for the change diff), the rows, the new
 * junction rows, the columns derived from them (`refreshDerived`, scenes'
 * sort columns), then the holds: once the diff says what changed, a
 * `pending` exclusion row per user of `holdFrom` for each changed entity and
 * what it links to (`holdForRecompute`), so a user with restrictions or
 * hidden items never sees a change before their recompute at the end of
 * the run. A failure rolls the whole batch back, holds included, so no row
 * keeps a new updated_at with its links gone: the type records the error,
 * its watermark stays, and the next sync writes the batch again. Everything
 * is built before the transaction opens, and no Stash request runs inside
 * it (a page's missing references are fetched first, `ensureReferenced`).
 * Returns the batch's changes.
 */
function writeBatch(batch: BatchWrite): Promise<BatchChanges> {
  return dbWriteTransaction(batch.label, async (tx) => {
    const stored = await batch.readStored(tx);
    const oldLinks: Partial<Record<JunctionName, Map<string, EntityRef[]>>> =
      {};
    for (const [junction] of batch.junctions) {
      oldLinks[junction] = await deleteJunctionRows(
        tx,
        junction,
        batch.ids,
        batch.instanceId
      );
    }
    await batch.upsert(tx);
    for (const [junction, rows] of batch.junctions) {
      await insertJunctionRows(tx, junction, rows, batch.instanceId);
    }
    await batch.refreshDerived?.(tx);
    const changes = batch.detect(stored, oldLinks);
    if (batch.holdFrom.length > 0) {
      await exclusionComputationService.holdForRecompute(
        tx,
        batch.type,
        batch.instanceId,
        changes,
        batch.holdFrom
      );
    }
    return changes;
  });
}

/**
 * The users the batches on `instanceId` hold their changes from: the
 * users with exclusion inputs whose scope holds the instance
 * (`usersWithExclusionInputs`), none while the instance is on its first
 * sync. Read once per run and instance (`run.holdUsers`), before the
 * batch's transaction opens.
 */
async function usersToHold(
  run: SyncRunContext,
  instanceId: string
): Promise<readonly number[]> {
  run.holdUsers ??= new Map();
  const cached = run.holdUsers.get(instanceId);
  if (cached) return cached;
  const users =
    await exclusionComputationService.usersWithExclusionInputs(instanceId);
  run.holdUsers.set(instanceId, users);
  return users;
}

// ==================== Referenced entities ====================

/**
 * The entities a page's rows point at, by type, on the page's instance: a
 * junction's far sides, a studio, a clip's scene and tags.
 */
export type BatchReferences = Partial<Record<EntityType, string[]>>;

/** The distinct safe ids among `refs` (a missing one is no reference). */
function idsOf(
  refs: ReadonlyArray<{ id: string } | null | undefined>
): string[] {
  const ids = new Set<string>();
  for (const ref of refs) {
    if (ref && validateEntityId(ref.id)) ids.add(ref.id);
  }
  return [...ids];
}

/**
 * Which of `refs` Peek holds no row for on `instanceId` (a soft-deleted row
 * is held): one statement over every type, each id list bound as one JSON
 * parameter and looked up by primary key.
 */
async function missingReferences(
  instanceId: string,
  refs: BatchReferences
): Promise<Map<EntityType, string[]>> {
  const selects: string[] = [];
  const params: string[] = [];
  for (const type of SYNC_ORDER) {
    const ids = refs[type] ?? [];
    if (ids.length === 0) continue;
    selects.push(
      `SELECT '${type}' AS type, j.value AS id FROM json_each(?) j
       WHERE NOT EXISTS (SELECT 1 FROM "${ENTITY_TABLES[type].table}" x
                         WHERE x."id" = j.value AND x."stashInstanceId" = ?)`
    );
    params.push(JSON.stringify(ids), instanceId);
  }
  const missing = new Map<EntityType, string[]>();
  if (selects.length === 0) return missing;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ type: EntityType; id: string }>
  >(selects.join("\nUNION ALL\n"), ...params);
  for (const { type, id } of rows) {
    const ids = missing.get(type) ?? [];
    ids.push(id);
    missing.set(type, ids);
  }
  return missing;
}

// ==================== Collection hierarchy ====================

/**
 * One link of Stash's collection hierarchy on one instance, a
 * `GroupRelation` row: a containing group, one of its sub-groups, the
 * sub-group's place in the containing group's list, and Stash's description
 * of the link ("Part 2").
 */
interface GroupLink {
  containingId: string;
  subId: string;
  orderIndex: number;
  description: string | null;
}

/** A link's key within its instance. */
function groupLinkKey(link: { containingId: string; subId: string }): string {
  return `${link.containingId}\0${link.subId}`;
}

/**
 * Deletes links of one instance, each by primary key. Binds a JSON array of
 * `[containingId, subId]` pairs, then the instance twice.
 */
const DELETE_GROUP_LINKS_SQL = `
  DELETE FROM "GroupRelation" WHERE rowid IN (
    SELECT r.rowid FROM json_each(?) j
    CROSS JOIN "GroupRelation" r
      ON r."containingId" = json_extract(j.value, '$[0]')
     AND r."containingInstanceId" = ?
     AND r."subId" = json_extract(j.value, '$[1]')
     AND r."subInstanceId" = ?
  )`;

/**
 * Writes links of one instance, a stored one taking its new place and
 * description. Binds the instance twice, then a JSON array of
 * `[containingId, subId, orderIndex, description]`. The `WHERE true` is
 * SQLite's: an upsert after a SELECT with a FROM needs a WHERE, or the
 * parser reads ON CONFLICT as a join constraint.
 */
const UPSERT_GROUP_LINKS_SQL = `
  INSERT INTO "GroupRelation" (
    "containingId", "containingInstanceId", "subId", "subInstanceId",
    "orderIndex", "description"
  )
  SELECT json_extract(j.value, '$[0]'), ?, json_extract(j.value, '$[1]'), ?,
         json_extract(j.value, '$[2]'), json_extract(j.value, '$[3]')
  FROM json_each(?) j
  WHERE true
  ON CONFLICT ("containingId", "containingInstanceId", "subId", "subInstanceId")
  DO UPDATE SET "orderIndex" = excluded."orderIndex",
                "description" = excluded."description"`;

// ==================== Entities linked to deleted ones ====================

/**
 * One way an entity of type `linked` points at one of type `source`:
 * through a junction whose near side it is, or through a column of its own
 * row, which names an entity on the row's instance.
 */
type LinkPath = { linked: EntityType; source: EntityType } & (
  | { junction: JunctionName }
  | { column: "studioId" | "primaryTagId" }
);

/**
 * The links Stash rewrites without moving the linking entity's updated_at
 * (item 42, SYNC-17): merging tags moves every link to the merged tag onto
 * the one kept (`TagStore.Merge` rewrites the join tables), a performer
 * merge the same, and deleting a studio clears it from its galleries,
 * scenes and images. An incremental page never returns those entities, so
 * after a cleanup soft-deletes the merged or deleted one, what linked to it
 * is fetched again (`refetchLinkedToDeleted`).
 */
const LINK_PATHS: readonly LinkPath[] = [
  { linked: "studio", source: "tag", junction: "StudioTag" },
  { linked: "performer", source: "tag", junction: "PerformerTag" },
  { linked: "group", source: "tag", junction: "GroupTag" },
  { linked: "gallery", source: "tag", junction: "GalleryTag" },
  { linked: "gallery", source: "performer", junction: "GalleryPerformer" },
  { linked: "gallery", source: "studio", column: "studioId" },
  { linked: "scene", source: "tag", junction: "SceneTag" },
  { linked: "scene", source: "performer", junction: "ScenePerformer" },
  { linked: "scene", source: "studio", column: "studioId" },
  { linked: "scene", source: "group", junction: "SceneGroup" },
  { linked: "clip", source: "tag", junction: "ClipTag" },
  { linked: "clip", source: "tag", column: "primaryTagId" },
  { linked: "image", source: "tag", junction: "ImageTag" },
  { linked: "image", source: "performer", junction: "ImagePerformer" },
  { linked: "image", source: "studio", column: "studioId" },
];

/**
 * How a gallery's scenes and images link to it: Peek writes both junctions
 * from the member's side (its own galleries), while adding images to a
 * gallery in Stash, removing them or editing its scenes from the gallery
 * moves only the gallery's updated_at (`refetchGalleryMembers`).
 */
const GALLERY_MEMBER_PATHS: readonly LinkPath[] = [
  { linked: "scene", source: "gallery", junction: "SceneGallery" },
  { linked: "image", source: "gallery", junction: "ImageGallery" },
];

/** The types a gallery's members are, in SYNC_ORDER. */
const GALLERY_MEMBER_TYPES = ["scene", "image"] as const;

/**
 * Stash's ids of the scenes or images in any of the galleries `galleries`
 * names (INCLUDES), one page of the ID-only operation.
 */
const GALLERY_MEMBER_ID_FETCHERS: Record<
  (typeof GALLERY_MEMBER_TYPES)[number],
  (
    stash: StashClient,
    galleries: MultiCriterionInput,
    filter: FindFilterType,
    signal: AbortSignal
  ) => Promise<StashIdPage>
> = {
  scene: async (stash, galleries, filter, signal) => {
    const { findScenes } = await stash.findSceneIDs(
      { filter, scene_filter: { galleries } },
      undefined,
      signal
    );
    return { ids: findScenes.scenes.map((s) => s.id), count: findScenes.count };
  },
  image: async (stash, galleries, filter, signal) => {
    const { findImages } = await stash.findImageIDs(
      { filter, image_filter: { galleries } },
      undefined,
      signal
    );
    return { ids: findImages.images.map((i) => i.id), count: findImages.count };
  },
};

/**
 * The live entities on `instanceId` that link to the given ones (`sources`,
 * ids by type) along `paths` (`LINK_PATHS` by default: what linked to the
 * entities a cleanup soft-deleted), by type in SYNC_ORDER. One statement
 * per linked type: each source's ids are bound as one JSON list that drives
 * the junction's reverse index (or the column's index), and each linked id
 * is then looked up by primary key.
 */
async function linkedTo(
  instanceId: string,
  sources: ReadonlyMap<EntityType, readonly string[]>,
  paths: readonly LinkPath[] = LINK_PATHS
): Promise<Map<EntityType, string[]>> {
  const linked = new Map<EntityType, string[]>();
  for (const type of SYNC_ORDER) {
    const { table } = ENTITY_TABLES[type];
    const arms: string[] = [];
    const params: string[] = [];
    for (const path of paths) {
      const ids = sources.get(path.source) ?? [];
      if (path.linked !== type || ids.length === 0) continue;
      if ("junction" in path) {
        const { near, far, farInstance } = JUNCTION_COLUMNS[path.junction];
        arms.push(
          `SELECT x."${near}" AS id FROM json_each(?) j
           CROSS JOIN "${path.junction}" x ON x."${far}" = j.value AND x."${farInstance}" = ?`
        );
      } else {
        // The + keeps the planner on the column's index: the instance's
        // matches every row of the instance
        arms.push(
          `SELECT x."id" AS id FROM json_each(?) j
           CROSS JOIN "${table}" x ON x."${path.column}" = j.value AND +x."stashInstanceId" = ?`
        );
      }
      params.push(JSON.stringify(ids), instanceId);
    }
    if (arms.length === 0) continue;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT l.id AS id FROM (${arms.join("\nUNION\n")}) l
       CROSS JOIN "${table}" e ON e."id" = l.id AND e."stashInstanceId" = ?
       WHERE e."deletedAt" IS NULL`,
      ...params,
      instanceId
    );
    const linkedIds = rows.map((row) => row.id);
    if (linkedIds.length > 0) linked.set(type, linkedIds);
  }
  return linked;
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
  /**
   * Every row a batch writes counts as changed (`detectChanges`'
   * `markChanged`): set on a refetch for a known link change, whose rows
   * come back with the same updated_at (`refetchLinkedToDeleted`)
   */
  markChanged?: boolean;
  /**
   * The instances whose full-mode type loop ran to the end in this run (a
   * type that failed counts): `runSync` records their last full pass once
   * the post-sync steps are done
   */
  fullPasses?: Set<string>;
  /**
   * The instances whose type loop ran to the end in this run, in any mode
   * (a type that failed counts): one on its first sync becomes visible once
   * the post-sync steps have computed its users' exclusions
   * (`markFirstSynced`)
   */
  synced?: Set<string>;
  /**
   * The users each instance's batches hold their changes from
   * (`usersWithExclusionInputs`), read once per run and instance by
   * `usersToHold`
   */
  holdUsers?: Map<string, readonly number[]>;
}

/**
 * How one entity type syncs: the Stash query that lists it a page at a time
 * (narrowed by `since` or `ids`), what a page references, and the writer of
 * one page. `paginate` runs the page loop for every type.
 */
export interface EntitySyncSpec<
  T extends { id: string; updated_at?: string | null },
> {
  type: EntityType;
  fetchPage(
    client: StashClient,
    q: SyncPageQuery
  ): Promise<{ items: T[]; count: number }>;
  /**
   * The entities a page's rows point at, of the types before this one in
   * SYNC_ORDER. A junction row, a gallery's or image's studio and a clip's
   * scene and primary tag have foreign keys, so `paginate` fetches the ones
   * Peek lacks before it writes the page (`ensureReferenced`).
   */
  references(items: T[]): BatchReferences;
  /** Writes one page in one transaction (`writeBatch`). */
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

/**
 * A sync page's FindFilterType, in updated_at order for every type: an
 * entity edited in Stash while a sync pages moves to the end, where a later
 * page fetches it again, instead of keeping its place on a page already
 * fetched.
 */
function pageFilter(q: SyncPageQuery): FindFilterType {
  return {
    page: q.page,
    per_page: q.perPage,
    sort: "updated_at",
    direction: SortDirectionEnum.Asc,
  };
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
 * Every synced type's spec. Each request carries the run's abort signal and
 * pages in updated_at order (`pageFilter`). Images narrow by Stash's
 * integer id list, the others by `ids`.
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
    references: () => ({}),
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
    references: (studios) => ({
      tag: idsOf(studios.flatMap((s) => s.tags)),
    }),
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
    references: (performers) => ({
      tag: idsOf(performers.flatMap((p) => p.tags)),
    }),
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
    references: (groups) => ({
      tag: idsOf(groups.flatMap((g) => g.tags)),
      studio: idsOf(groups.map((g) => g.studio)),
    }),
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
    references: (galleries) => ({
      tag: idsOf(galleries.flatMap((g) => g.tags)),
      studio: idsOf(galleries.map((g) => g.studio)),
      performer: idsOf(galleries.flatMap((g) => g.performers)),
    }),
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
    references: (scenes) => ({
      tag: idsOf(scenes.flatMap((s) => s.tags)),
      studio: idsOf(scenes.map((s) => s.studio)),
      performer: idsOf(scenes.flatMap((s) => s.performers)),
      group: idsOf(scenes.flatMap((s) => s.groups.map((g) => g.group))),
      gallery: idsOf(scenes.flatMap((s) => s.galleries)),
    }),
    processBatch: processScenesBatch,
  },
  clip: {
    type: "clip",
    async fetchPage(client, q) {
      const { findSceneMarkers } = await client.findSceneMarkers(
        {
          filter: pageFilter(q),
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
    references: (markers) => ({
      tag: idsOf(markers.flatMap((m) => [m.primary_tag, ...m.tags])),
      scene: idsOf(markers.map((m) => m.scene)),
    }),
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
    references: (images) => ({
      tag: idsOf(images.flatMap((i) => i.tags)),
      studio: idsOf(images.map((i) => i.studio)),
      performer: idsOf(images.flatMap((i) => i.performers)),
      gallery: idsOf(images.flatMap((i) => i.galleries)),
    }),
    processBatch: processImagesBatch,
  },
};

// ==================== Scene Sync ====================

/**
 * The scene columns derived from a scene's row and its junction rows, as the
 * SET list of an UPDATE of "StashScene" (item 67 (c), DB-07). The list sorts
 * and filters on them through its `(deletedAt, <column>, id)` indexes instead
 * of computing them for every scene on every request.
 *
 * - `titleSort`: the title the scene's card shows, `title ||
 *   getSceneFallbackTitle(filePath)` (`utils/titleUtils.ts`): its title, else
 *   its file name after the last `/` or `\`, the last extension stripped
 *   (the whole path when it ends in a separator; NULL without a path).
 *   lower() folds ASCII only (Prisma's SQLite has no ICU), exactly what
 *   COLLATE NOCASE compared, so a BINARY order on the stored value is the
 *   case-insensitive order of the displayed title, and the index needs no
 *   collation `schema.prisma` cannot declare. The file name part runs only
 *   for an untitled scene: COALESCE stops at the title. Read inside out:
 *   `path`; `name`, what follows the last separator (`rtrim` by every
 *   character but the separators leaves the directory part); `dot`, `name`
 *   up to its last `.`; `ext`, what follows it, stripped when non-empty and
 *   free of `/` (the regex `\.[^/.]+$`).
 * - `performerCount`, `tagCount`: the scene's `ScenePerformer` and `SceneTag`
 *   rows, as the count filters and sorts counted them (deleted far sides
 *   included).
 *
 * Migration `20260925001100_scene_sort_columns` backfills with a copy of
 * this text: change both together.
 */
export const SCENE_DERIVED_COLUMNS_SQL = `"titleSort" = lower(COALESCE(NULLIF("title", ''), (
    SELECT CASE WHEN dot <> '' AND ext <> '' AND instr(ext, '/') = 0
      THEN substr(name, 1, length(dot) - 1) ELSE name END
    FROM (SELECT name, dot, substr(name, length(dot) + 1) AS ext
      FROM (SELECT name, rtrim(name, replace(name, '.', '')) AS dot
        FROM (SELECT COALESCE(NULLIF(substr(path, length(rtrim(path, replace(replace(path, '/', ''), '\\', ''))) + 1), ''), path) AS name
          FROM (SELECT NULLIF("filePath", '') AS path))))))),
  "performerCount" = (SELECT COUNT(*) FROM "ScenePerformer" sp WHERE sp."sceneId" = "StashScene"."id" AND sp."sceneInstanceId" = "StashScene"."stashInstanceId"),
  "tagCount" = (SELECT COUNT(*) FROM "SceneTag" st WHERE st."sceneId" = "StashScene"."id" AND st."sceneInstanceId" = "StashScene"."stashInstanceId")`;

/**
 * Recomputes the derived columns (`SCENE_DERIVED_COLUMNS_SQL`) of a batch's
 * scenes on `instanceId`, on its transaction after its junction inserts, so
 * the counts are the junction rows as stored, whatever the inserts kept.
 * One bound statement; the primary key finds each scene.
 */
export async function refreshSceneDerivedColumns(
  db: Pick<PrismaClient, "$executeRawUnsafe">,
  sceneIds: readonly string[],
  instanceId: string
): Promise<void> {
  if (sceneIds.length === 0) return;
  await db.$executeRawUnsafe(
    `UPDATE "StashScene" SET ${SCENE_DERIVED_COLUMNS_SQL}
     WHERE "id" IN (SELECT value FROM json_each(?)) AND "stashInstanceId" = ?`,
    JSON.stringify(sceneIds),
    instanceId
  );
}

async function processScenesBatch(
  scenes: SyncScene[],
  stashInstanceId: string,
  run: SyncRunContext
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

  const upsertScenes = `
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
`;

  // Collect all junction records (validate related entity IDs too), and
  // each scene's new far sides for the change diff
  const performerRows: JunctionRow[] = [];
  const tagRows: JunctionRow[] = [];
  const groupRows: JunctionRow[] = [];
  const galleryRows: JunctionRow[] = [];
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
        performerRows.push([scene.id, p.id]);
      }
    }
    for (const t of scene.tags || []) {
      if (validateEntityId(t.id)) {
        links.SceneTag.push(t.id);
        tagRows.push([scene.id, t.id]);
      }
    }
    for (const g of scene.groups || []) {
      if (validateEntityId(g.group.id)) {
        links.SceneGroup.push(g.group.id);
        groupRows.push([scene.id, g.group.id, g.scene_index ?? null]);
      }
    }
    for (const g of scene.galleries || []) {
      if (validateEntityId(g.id)) {
        links.SceneGallery.push(g.id);
        galleryRows.push([scene.id, g.id]);
      }
    }
    incoming.push({
      id: scene.id,
      updatedAt: scene.updated_at,
      studioId: scene.studio?.id ?? null,
      links,
    });
  }

  return writeBatch({
    label: "sync.scenes",
    type: "scene",
    instanceId,
    ids: sceneIds,
    readStored: (tx) =>
      readStored(tx, "StashScene", instanceId, sceneIds, true),
    upsert: (tx) => tx.$executeRawUnsafe(upsertScenes),
    junctions: [
      ["ScenePerformer", performerRows],
      ["SceneTag", tagRows],
      ["SceneGroup", groupRows],
      ["SceneGallery", galleryRows],
    ],
    refreshDerived: (tx) =>
      refreshSceneDerivedColumns(tx, sceneIds, instanceId),
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming,
        oldLinks,
        compareStudio: true,
      }),
  });
}

// ==================== Performer Sync ====================

async function processPerformersBatch(
  performers: SyncPerformer[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (performers.length === 0) return noChanges();

  // Validate IDs
  const validPerformers = performers.filter((p) => validateEntityId(p.id));
  if (validPerformers.length === 0) return noChanges();

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

  // imageCount is set on insert only: it holds the count with gallery
  // inheritance (EntityImageCountService), which the post-sync steps rebuild
  // for what changed, and an update keeps it over Stash's direct count
  const upsertPerformers = `
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
    galleryCount = excluded.galleryCount,
    groupCount = excluded.groupCount,
    stashCreatedAt = excluded.stashCreatedAt,
    stashUpdatedAt = excluded.stashUpdatedAt,
    syncedAt = excluded.syncedAt,
    deletedAt = NULL
`;

  // Sync performer tags to PerformerTag junction table (batched for performance)
  const instanceId = stashInstanceId;
  const performerIds = validPerformers.map((p) => p.id);

  // Collect all tag relationships for batch insert, and each performer's
  // new tag set for the change diff
  const tagRows: JunctionRow[] = [];
  const incoming: IncomingEntity[] = [];
  for (const performer of validPerformers) {
    const tagIds: string[] = [];
    if (performer.tags && performer.tags.length > 0) {
      for (const tag of performer.tags) {
        if (tag?.id && validateEntityId(tag.id)) {
          tagIds.push(tag.id);
          tagRows.push([performer.id, tag.id]);
        }
      }
    }
    incoming.push({
      id: performer.id,
      updatedAt: performer.updated_at,
      links: { PerformerTag: tagIds },
    });
  }

  // Every performer of the batch loses its old tag rows (kept for the
  // change diff) and gets Stash's
  return writeBatch({
    label: "sync.performers",
    type: "performer",
    instanceId,
    ids: performerIds,
    readStored: (tx) =>
      readStored(tx, "StashPerformer", instanceId, performerIds, false),
    upsert: (tx) => tx.$executeRawUnsafe(upsertPerformers),
    junctions: [["PerformerTag", tagRows]],
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming,
        oldLinks,
        tagJunction: "PerformerTag",
      }),
  });
}

// ==================== Studio Sync ====================

async function processStudiosBatch(
  studios: SyncStudio[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (studios.length === 0) return noChanges();

  // Validate IDs
  const validStudios = studios.filter((s) => validateEntityId(s.id));
  if (validStudios.length === 0) return noChanges();

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

  // imageCount is set on insert only: it holds the count with gallery
  // inheritance (EntityImageCountService), which the post-sync steps rebuild
  // for what changed, and an update keeps it over Stash's direct count
  const upsertStudios = `
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
`;

  // Sync studio tags to the StudioTag junction table: every studio of the
  // batch is rewritten, so one whose tags were all removed in Stash loses
  // its rows
  const instanceId = stashInstanceId;
  const studioIds = validStudios.map((s) => s.id);
  const tagRows: JunctionRow[] = [];
  const incoming: IncomingEntity[] = [];
  for (const studio of validStudios) {
    const tagIds = (studio.tags ?? [])
      .filter((t: TagRef) => t?.id && validateEntityId(t.id))
      .map((t: TagRef) => t.id);
    for (const tagId of tagIds) tagRows.push([studio.id, tagId]);
    incoming.push({
      id: studio.id,
      updatedAt: studio.updated_at,
      links: { StudioTag: tagIds },
    });
  }

  return writeBatch({
    label: "sync.studios",
    type: "studio",
    instanceId,
    ids: studioIds,
    readStored: (tx) =>
      readStored(tx, "StashStudio", instanceId, studioIds, false),
    upsert: (tx) => tx.$executeRawUnsafe(upsertStudios),
    junctions: [["StudioTag", tagRows]],
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming,
        oldLinks,
        tagJunction: "StudioTag",
      }),
  });
}

// ==================== Tag Sync ====================

async function processTagsBatch(
  tags: SyncTag[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (tags.length === 0) return noChanges();

  // Validate IDs
  const validTags = tags.filter((t) => validateEntityId(t.id));
  if (validTags.length === 0) return noChanges();

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

  // imageCount is set on insert only: it holds the count with gallery
  // inheritance (EntityImageCountService), which the post-sync steps rebuild
  // for what changed, and an update keeps it over Stash's direct count
  const upsertTags = `
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
`;

  // Tags have no junction of their own: a parent change moves the tag's
  // updated_at
  const tagIds = validTags.map((t) => t.id);
  return writeBatch({
    label: "sync.tags",
    type: "tag",
    instanceId: stashInstanceId,
    ids: tagIds,
    readStored: (tx) =>
      readStored(tx, "StashTag", stashInstanceId, tagIds, false),
    upsert: (tx) => tx.$executeRawUnsafe(upsertTags),
    junctions: [],
    holdFrom: await usersToHold(run, stashInstanceId),
    detect: (stored) =>
      detectChanges({
        instanceId: stashInstanceId,
        stored,
        markChanged: run.markChanged,
        incoming: validTags.map((tag) => ({
          id: tag.id,
          updatedAt: tag.updated_at,
        })),
      }),
  });
}

// ==================== Group Sync ====================

async function processGroupsBatch(
  groups: SyncGroup[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (groups.length === 0) return noChanges();

  // Validate IDs
  const validGroups = groups.filter((g) => validateEntityId(g.id));
  if (validGroups.length === 0) return noChanges();

  const values = validGroups
    .map((group) => {
      // 0 is written as NULL below, as no duration
      const duration = group.duration ?? null;
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

  const upsertGroups = `
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
`;

  // Sync group tags to the GroupTag junction table: every group of the batch
  // is rewritten, so one whose tags were all removed in Stash loses its rows
  const instanceId = stashInstanceId;
  const groupIds = validGroups.map((g) => g.id);
  const tagRows: JunctionRow[] = [];
  const incoming: IncomingEntity[] = [];
  for (const group of validGroups) {
    const tagIds = (group.tags ?? [])
      .filter((t: TagRef) => t?.id && validateEntityId(t.id))
      .map((t: TagRef) => t.id);
    for (const tagId of tagIds) tagRows.push([group.id, tagId]);
    incoming.push({
      id: group.id,
      updatedAt: group.updated_at,
      links: { GroupTag: tagIds },
    });
  }

  return writeBatch({
    label: "sync.groups",
    type: "group",
    instanceId,
    ids: groupIds,
    readStored: (tx) =>
      readStored(tx, "StashGroup", instanceId, groupIds, false),
    upsert: (tx) => tx.$executeRawUnsafe(upsertGroups),
    junctions: [["GroupTag", tagRows]],
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming,
        oldLinks,
        tagJunction: "GroupTag",
      }),
  });
}

// ==================== Gallery Sync ====================

async function processGalleriesBatch(
  galleries: SyncGallery[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (galleries.length === 0) return noChanges();

  // Validate IDs
  const validGalleries = galleries.filter((g) => validateEntityId(g.id));
  if (validGalleries.length === 0) return noChanges();

  const values = validGalleries
    .map((gallery) => {
      const folder = gallery.folder;
      // Get first file's basename for zip gallery title fallback
      const fileBasename = gallery.files?.[0]?.basename ?? null;
      // Cover image ID for dimension lookup
      const coverImageId = gallery.cover?.id ?? null;
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

  const upsertGalleries = `
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
`;

  // The gallery performers and tags (junction tables), keeping each
  // gallery's new far sides for the change diff
  const instanceId = stashInstanceId;
  const galleryIds = validGalleries.map((g) => g.id);
  const linksOf = new Map(
    validGalleries.map((g) => [
      g.id,
      { GalleryPerformer: [] as string[], GalleryTag: [] as string[] },
    ])
  );
  const performerRows: JunctionRow[] = [];
  const tagRows: JunctionRow[] = [];
  for (const gallery of validGalleries) {
    if (gallery.performers && gallery.performers.length > 0) {
      for (const performer of gallery.performers) {
        if (validateEntityId(performer.id)) {
          linksOf.get(gallery.id)?.GalleryPerformer.push(performer.id);
          performerRows.push([gallery.id, performer.id]);
        }
      }
    }
    if (gallery.tags && gallery.tags.length > 0) {
      for (const tag of gallery.tags) {
        if (tag?.id && validateEntityId(tag.id)) {
          linksOf.get(gallery.id)?.GalleryTag.push(tag.id);
          tagRows.push([gallery.id, tag.id]);
        }
      }
    }
  }

  return writeBatch({
    label: "sync.galleries",
    type: "gallery",
    instanceId,
    ids: galleryIds,
    readStored: (tx) =>
      readStored(tx, "StashGallery", instanceId, galleryIds, true),
    upsert: (tx) => tx.$executeRawUnsafe(upsertGalleries),
    junctions: [
      ["GalleryPerformer", performerRows],
      ["GalleryTag", tagRows],
    ],
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming: validGalleries.map((gallery) => ({
          id: gallery.id,
          updatedAt: gallery.updated_at,
          studioId: gallery.studio?.id ?? null,
          links: linksOf.get(gallery.id),
        })),
        oldLinks,
        compareStudio: true,
      }),
  });
}

// ==================== Image Sync ====================

async function processImagesBatch(
  images: SyncImage[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  // Skip empty batches
  if (images.length === 0) return noChanges();

  // Validate IDs
  const validImages = images.filter((i) => validateEntityId(i.id));
  if (validImages.length === 0) return noChanges();

  const imageIds = validImages.map((i) => i.id);
  const instanceId = stashInstanceId;

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

  const upsertImages = `
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
  `;

  // Collect junction records (validate related entity IDs too), and each
  // image's new far sides for the change diff
  const performerRows: JunctionRow[] = [];
  const tagRows: JunctionRow[] = [];
  const galleryRows: JunctionRow[] = [];
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
        performerRows.push([image.id, p.id]);
      }
    }
    for (const t of image.tags || []) {
      if (validateEntityId(t.id)) {
        links.ImageTag.push(t.id);
        tagRows.push([image.id, t.id]);
      }
    }
    for (const g of image.galleries || []) {
      if (validateEntityId(g.id)) {
        links.ImageGallery.push(g.id);
        galleryRows.push([image.id, g.id]);
      }
    }
    incoming.push({
      id: image.id,
      updatedAt: image.updated_at,
      studioId: image.studio?.id ?? null,
      links,
    });
  }

  return writeBatch({
    label: "sync.images",
    type: "image",
    instanceId,
    ids: imageIds,
    readStored: (tx) =>
      readStored(tx, "StashImage", instanceId, imageIds, true),
    upsert: (tx) => tx.$executeRawUnsafe(upsertImages),
    junctions: [
      ["ImagePerformer", performerRows],
      ["ImageTag", tagRows],
      ["ImageGallery", galleryRows],
    ],
    holdFrom: await usersToHold(run, instanceId),
    // An image's junction rows and studio are not compared: gallery
    // inheritance writes into them (lead decision, 2026-09-24)
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming,
        oldLinks,
        compareLinks: false,
        compareStudio: false,
      }),
  });
}

// ==================== Clip Sync ====================

/**
 * Writes one page of clips (scene markers) and their tags in one
 * transaction of four statements whatever the page's size (item 42), each
 * bound as one JSON parameter: the stored clips are read, the old ClipTag
 * rows go (`DELETE ... RETURNING`, for the change diff), the clips are
 * upserted, and their tags inserted. Each preview is probed first, with the
 * page's own instance's API key, to record whether Stash has generated it:
 * a request, so before the transaction opens. Timestamps are stored as
 * epoch milliseconds, as Prisma stores a DateTime.
 */
async function processClipsBatch(
  markers: SyncClip[],
  stashInstanceId: string,
  run: SyncRunContext
): Promise<BatchChanges> {
  if (markers.length === 0) return noChanges();

  const instanceId = stashInstanceId;

  // m.preview is already a full URL from Stash; the probe authenticates with
  // this instance's key (another instance's key is refused, and the clip
  // would be stored as not generated)
  const { apiKey } = stashInstanceManager.getCredentials(instanceId);
  const previewUrls = markers.map((m) => `${m.preview}?apikey=${apiKey}`);
  const probeResults = await clipPreviewProber.probeBatch(previewUrls);

  const markerIds = markers.map((m) => m.id);

  const epochMs = (timestamp: string | null | undefined): number | null =>
    timestamp ? new Date(timestamp).getTime() : null;
  const now = Date.now();
  const clips = markers.map((marker, i) => ({
    id: marker.id,
    sceneId: marker.scene.id,
    title: marker.title || null,
    seconds: marker.seconds,
    // Stash sends null for an unset end; 0 is a real one
    endSeconds: marker.end_seconds ?? null,
    primaryTagId: marker.primary_tag.id,
    previewPath: marker.preview,
    screenshotPath: marker.screenshot,
    streamPath: marker.stream,
    isGenerated: probeResults.get(previewUrls[i] as string) ? 1 : 0,
    stashCreatedAt: epochMs(marker.created_at),
    stashUpdatedAt: epochMs(marker.updated_at),
  }));

  const upsertClips = (tx: Prisma.TransactionClient) =>
    tx.$executeRawUnsafe(
      `INSERT INTO "StashClip" (
         "id", "stashInstanceId", "sceneId", "sceneInstanceId", "title",
         "seconds", "endSeconds", "primaryTagId", "primaryTagInstanceId",
         "previewPath", "screenshotPath", "streamPath", "isGenerated",
         "generationCheckedAt", "stashCreatedAt", "stashUpdatedAt",
         "syncedAt", "deletedAt"
       )
       SELECT
         json_extract(j.value, '$.id'), ?, json_extract(j.value, '$.sceneId'), ?,
         json_extract(j.value, '$.title'), json_extract(j.value, '$.seconds'),
         json_extract(j.value, '$.endSeconds'),
         json_extract(j.value, '$.primaryTagId'), ?,
         json_extract(j.value, '$.previewPath'),
         json_extract(j.value, '$.screenshotPath'),
         json_extract(j.value, '$.streamPath'),
         json_extract(j.value, '$.isGenerated'), ?,
         json_extract(j.value, '$.stashCreatedAt'),
         json_extract(j.value, '$.stashUpdatedAt'), ?, NULL
       FROM json_each(?) j
       WHERE true
       ON CONFLICT("id", "stashInstanceId") DO UPDATE SET
         "sceneId" = excluded."sceneId",
         "sceneInstanceId" = excluded."sceneInstanceId",
         "title" = excluded."title",
         "seconds" = excluded."seconds",
         "endSeconds" = excluded."endSeconds",
         "primaryTagId" = excluded."primaryTagId",
         "primaryTagInstanceId" = excluded."primaryTagInstanceId",
         "previewPath" = excluded."previewPath",
         "screenshotPath" = excluded."screenshotPath",
         "streamPath" = excluded."streamPath",
         "isGenerated" = excluded."isGenerated",
         "generationCheckedAt" = excluded."generationCheckedAt",
         "stashCreatedAt" = excluded."stashCreatedAt",
         "stashUpdatedAt" = excluded."stashUpdatedAt",
         "syncedAt" = excluded."syncedAt",
         "deletedAt" = NULL`,
      instanceId,
      instanceId,
      instanceId,
      now,
      now,
      JSON.stringify(clips)
    );

  // What the batch's clips looked like before the write, for the change
  // diff: stashUpdatedAt is a DateTime here, compared as epoch milliseconds
  const readStoredClips = async (tx: Prisma.TransactionClient) => {
    const rows = await tx.stashClip.findMany({
      where: { stashInstanceId: instanceId, id: { in: markerIds } },
      select: { id: true, stashUpdatedAt: true, deletedAt: true },
    });
    return new Map<string, StoredEntity>(
      rows.map((row) => [
        row.id,
        {
          updatedAt: row.stashUpdatedAt?.getTime() ?? null,
          deleted: row.deletedAt !== null,
        },
      ])
    );
  };

  // The clips' tags, as [clipId, tagId] pairs, replacing their old rows
  const clipTags: JunctionRow[] = markers.flatMap((marker) =>
    marker.tags.map((tag) => [marker.id, tag.id] as const)
  );

  return writeBatch({
    label: "sync.clips",
    type: "clip",
    instanceId,
    ids: markerIds,
    readStored: readStoredClips,
    upsert: upsertClips,
    junctions: [["ClipTag", clipTags]],
    holdFrom: await usersToHold(run, instanceId),
    detect: (stored, oldLinks) =>
      detectChanges({
        instanceId,
        stored,
        markChanged: run.markChanged,
        incoming: markers.map((marker) => ({
          id: marker.id,
          updatedAt: epochMs(marker.updated_at),
          links: { ClipTag: marker.tags.map((t) => t.id) },
        })),
        oldLinks,
      }),
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
    return {
      signal: this.abortController.signal,
      changes: this.takeChanges(),
      fullPasses: new Set(),
      synced: new Set(),
      holdUsers: new Map(),
    };
  }

  /**
   * One sync run in `mode`: the instance given, or every enabled instance in
   * turn, then the post-sync steps once for what the whole run changed. An
   * instance that fails is logged and the next one syncs; an abort ends the
   * whole run, and its changes carry into the next run. A full run then
   * records the last full pass of each instance whose type loop ran to the
   * end (`recordFullPasses`); an abort or a failure before that records
   * none, so the daily pass is still due. An instance on its first sync
   * becomes visible within the steps, once its users' exclusions are
   * computed. The caller holds the lock.
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
      await this.runPostSyncSteps(run.changes, {
        full: mode === "full",
        synced: run.synced,
      });
      await this.recordFullPasses(run.fullPasses);
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
   * cleanups (on the full path each type's runs right after it). A type
   * fetched whole is then completed from Stash's id list, which its cleanup
   * reads: what no page returned is fetched by id (`fetchMissedIds`). On
   * the incremental paths, what linked to the entities the cleanups
   * soft-deleted is then fetched again (`refetchLinkedToDeleted`): a merge
   * or deletion in Stash rewrites those links without moving updated_at;
   * then the scenes and images of the galleries that changed or went
   * (`refetchGalleryMembers`): a gallery's members edited from the gallery
   * move only its updated_at. Last, in every mode, the collection hierarchy
   * (`syncGroupRelations`), a failure of which joins the group type's
   * `lastError`. Each type's state is saved at once, so a
   * restart does not sync completed types again; a type that fails is
   * recorded and the next one runs. What changed goes into the run's change set; the post-sync steps
   * run once per run, after every instance (runSync). The caller holds the
   * lock.
   */
  private async syncInstance(
    stashInstanceId: string,
    mode: SyncMode,
    run: SyncRunContext
  ): Promise<SyncResult[]> {
    const { name, title } = SYNC_MODE_NAMES[mode];
    const startTime = Date.now();
    const results: SyncResult[] = [];
    // The ids the pages of each type fetched whole returned, for the
    // completeness check after the cleanups of the incremental paths
    const seenIds = new Map<EntityType, Set<string>>();

    try {
      logger.info(`Starting ${name}...`, { stashInstanceId });

      for (const entityType of SYNC_ORDER) {
        this.checkAbort();
        results.push(
          await this.syncEntityType(
            entityType,
            stashInstanceId,
            mode,
            run,
            seenIds
          )
        );
      }
      // Every type was tried (a failed one keeps its lastError and its
      // watermark): the full pass counts once the run's steps are done, and
      // an instance on its first sync shows once they computed its users'
      // exclusions
      if (mode === "full") run.fullPasses?.add(stashInstanceId);
      run.synced?.add(stashInstanceId);

      // Cleanup deleted entities (detect deletions/merges in Stash), then
      // what linked to them, then the members of the galleries that changed
      // or went. The full path fetched every type after a cleaned-up one
      // whole, scenes and images after galleries, so it needs no refetch
      if (mode !== "full") {
        const deleted = await this.cleanupEveryType(
          stashInstanceId,
          results,
          run,
          seenIds
        );
        await this.refetchLinkedToDeleted(
          stashInstanceId,
          deleted,
          results,
          run
        );
        await this.refetchGalleryMembers(
          stashInstanceId,
          results,
          run,
          seenIds
        );
      }

      // The collection hierarchy, in every mode: Stash's sub-group edits
      // move no updated_at. A failure is the group type's, and the sync
      // goes on
      try {
        await this.syncGroupRelations(stashInstanceId, run);
      } catch (error) {
        if (this.isAbort(error)) throw new Error("Sync aborted");
        const message = describeStashError(error);
        logger.error("Failed to sync the collection hierarchy", {
          stashInstanceId,
          error: message,
        });
        const problem = `Could not sync the collection hierarchy: ${message}`;
        const result = results.find((r) => r.entityType === "group");
        const lastError = joinProblems(result?.error, problem) ?? problem;
        if (result) result.error = lastError;
        await this.recordEntityError(stashInstanceId, "group", lastError);
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
   * One type of one instance in `mode`. The full path fetches every entity,
   * cleans the type up and fetches what no page returned. The others fetch
   * what changed since the type's last sync (everything when it never
   * synced, its page ids then kept in `seenIds` for the completeness check
   * after the cleanups); the smart path first asks Stash how many changed
   * and skips the type at none, clearing an earlier run's error.
   */
  private async syncEntityType(
    entityType: EntityType,
    stashInstanceId: string,
    mode: SyncMode,
    run: SyncRunContext,
    seenIds: Map<EntityType, Set<string>>
  ): Promise<SyncResult> {
    if (mode === "full") {
      return this.runEntityType(
        entityType,
        stashInstanceId,
        { syncType: "full", withCleanup: true, seen: new Set() },
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
      const seen = new Set<string>();
      seenIds.set(entityType, seen);
      return this.runEntityType(
        entityType,
        stashInstanceId,
        { syncType: "full", withCleanup: false, seen },
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
   * decides, with each instance of the run still on its first sync
   * (`synced` without `firstSyncedAt`) counted as a change:
   * - images written, even unchanged (their junction rows were rewritten
   *   from Stash), re-apply gallery inheritance, as do changed galleries,
   *   for those images and the changed galleries' images
   *   (`galleryInheritanceScope`);
   * - nothing changed and no user holds `pending` rows: no other step runs;
   * - scene tag inheritance for the scenes the changes reach
   *   (`sceneTagInheritanceScope`), when there are any;
   * - any change: the image counts of the performers, studios and tags the
   *   changes reach (`imageCountScope`), user stats and tag counts, then
   *   the exclusion recompute of the users who can see a changed instance,
   *   plus those with pending holds.
   * User stats and tag counts stay whole library (1.3 s and 0.04 s on the
   * prod copy, and the stats depend on watch history as well as the
   * library).
   *
   * Then the run's instances on their first sync become visible
   * (`markFirstSynced`), each once no recompute of a user who can see it
   * failed. One whose content matches what Peek holds (a URL changed to the
   * same Stash) still recomputes its users, so it does not stay hidden.
   *
   * Last, unless the steps were skipped: `PRAGMA optimize`
   * (`refreshPlannerStatistics`) and a best-effort WAL checkpoint, each its
   * own writer-queue unit. A skipped run changed no table's size, and the
   * daily full pass runs them anyway.
   */
  private async runPostSyncSteps(
    changes: SyncChangeSet,
    { full, synced }: { full: boolean; synced?: ReadonlySet<string> }
  ): Promise<void> {
    const firstSyncs = await this.instancesOnFirstSync(synced);
    let recomputed: RecomputeAllResult | null = null;
    if (full) {
      logger.info("Full sync: running every post-sync step");
      await this.computeSceneTagInheritance();
      await this.applyGalleryInheritance("all");
      await this.rebuildCounts("all");
      logger.info("Sync complete, recomputing user exclusions...");
      recomputed = await exclusionComputationService.recomputeAllUsers();
      logger.info("User exclusions recomputed");
    } else {
      const wroteImages = !changes.written("image").isEmpty();
      if (wroteImages || !changes.changed("gallery").isEmpty()) {
        const images = await this.galleryInheritanceScope(changes);
        if (images === "all" || images.length > 0) {
          await this.applyGalleryInheritance(images);
        }
      }

      if (changes.isEmpty() && firstSyncs.length > 0) {
        logger.info(
          "nothing changed; recomputing the users of the instances on their first sync",
          { instances: firstSyncs }
        );
        recomputed =
          await exclusionComputationService.recomputeUsersForInstances(
            firstSyncs
          );
      } else if (changes.isEmpty()) {
        const pending =
          await exclusionComputationService.usersWithPendingHolds();
        if (pending.length === 0) {
          logger.info(
            wroteImages
              ? "nothing changed; only gallery inheritance re-applied to the rewritten images"
              : "nothing changed, post-sync steps skipped"
          );
          // Nothing grew or shrank, so no statistics are due, and the WAL
          // holds little more than the sync states
          if (!wroteImages) return;
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
        await this.rebuildCounts(await this.imageCountScope(changes));
        const instances = [...new Set([...changes.instances(), ...firstSyncs])];
        logger.info(
          "Sync complete, recomputing the exclusions of the users on the changed instances...",
          {
            instances,
          }
        );
        recomputed =
          await exclusionComputationService.recomputeUsersForInstances(
            instances
          );
        logger.info("User exclusions recomputed");
      }
    }
    if (recomputed !== null) {
      await this.markFirstSynced(firstSyncs, recomputed);
    }
    // Last, after the recompute: statistics for the tables the run and its
    // steps grew or shrank, then the WAL they filled emptied into the
    // database file. Each is its own unit, and a failure is only logged
    await refreshPlannerStatistics("sync.optimize");
    await dbWrite("sync.checkpoint", checkpointWal);
  }

  /**
   * The instances of `synced` still on their first sync (no
   * `firstSyncedAt`): hidden from everyone until this run's recompute.
   */
  private async instancesOnFirstSync(
    synced: ReadonlySet<string> | undefined
  ): Promise<string[]> {
    if (!synced || synced.size === 0) return [];
    const rows = await prisma.stashInstance.findMany({
      where: { id: { in: [...synced] }, firstSyncedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Makes `instanceIds` visible (`firstSyncedAt` = now) once `recomputed`
   * holds no failure of a user whose scope covers the instance
   * (`getUsersSelecting`: a selection naming it, or one naming no other
   * enabled instance): that user would otherwise see it without
   * their exclusions. Such an instance stays hidden, its users are logged,
   * and the next sync, which counts it as a change again, retries.
   */
  private async markFirstSynced(
    instanceIds: string[],
    recomputed: RecomputeAllResult
  ): Promise<void> {
    if (instanceIds.length === 0) return;
    const failed = new Set(recomputed.errors.map((e) => e.userId));
    const ready: string[] = [];
    for (const instanceId of instanceIds) {
      const blocking =
        failed.size === 0
          ? []
          : (await getUsersSelecting(instanceId)).filter((id) =>
              failed.has(id)
            );
      if (blocking.length === 0) {
        ready.push(instanceId);
      } else {
        logger.warn(
          "The instance stays hidden: the exclusions of users who can see it failed to compute; the next sync retries",
          { instanceId, userIds: blocking }
        );
      }
    }
    if (ready.length === 0) return;
    await dbWrite("sync.firstSynced", () =>
      prisma.stashInstance.updateMany({
        where: { id: { in: ready }, firstSyncedAt: null },
        data: { firstSyncedAt: new Date() },
      })
    );
    logger.info("First sync finished: the instances are visible", {
      instanceIds: ready,
    });
  }

  /**
   * Records now as the last full pass of `instanceIds`
   * (`StashInstance.lastFullPassAt`), which the daily full pass reads
   * (SyncScheduler).
   */
  private async recordFullPasses(
    instanceIds: ReadonlySet<string> | undefined
  ): Promise<void> {
    if (!instanceIds || instanceIds.size === 0) return;
    const ids = [...instanceIds];
    await dbWrite("sync.fullPass", () =>
      prisma.stashInstance.updateMany({
        where: { id: { in: ids } },
        data: { lastFullPassAt: new Date() },
      })
    );
    logger.info("Full pass recorded", { instanceIds: ids });
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

  /**
   * The images gallery inheritance re-applies to: every image written this
   * run, changed or not (the upsert and the junction rewrite dropped what
   * it had inherited), and the images of every changed gallery (it may
   * have gained a performer, tag, studio or field to hand down). "all"
   * when either kind is past the change set's limit.
   */
  private async galleryInheritanceScope(
    changes: SyncChangeSet
  ): Promise<EntityRef[] | "all"> {
    const written = changes.written("image");
    const galleries = changes.changed("gallery");
    if (written.whole || galleries.whole) return "all";
    return distinctRefs([
      ...written.refs,
      ...(await imageGalleryInheritanceService.imagesInGalleries(
        galleries.refs
      )),
    ]);
  }

  /**
   * The performers, studios and tags whose inherited image counts a run's
   * changes reach:
   * - performers: the old and new far sides of changed images'
   *   `ImagePerformer` and changed galleries' `GalleryPerformer` rows;
   * - studios: the old and new studios of changed images and galleries;
   * - tags: the same through `ImageTag` and `GalleryTag`;
   * - the performers, tags and studio of every gallery a changed image
   *   joined or left (`ImageGallery`'s far sides), and of every image and
   *   gallery the run soft-deleted, with the soft-deleted images' galleries
   *   (read from their stored rows, `countedThrough`);
   * - every changed performer, studio and tag itself: a new or returning
   *   row holds Stash's direct count, or the count it had when deleted.
   * "all" when one of those kinds is past the change set's limit.
   */
  private async imageCountScope(
    changes: SyncChangeSet
  ): Promise<ImageCountScope | "all"> {
    const direct = {
      performers: [
        changes.farSides("ImagePerformer"),
        changes.farSides("GalleryPerformer"),
        changes.changed("performer"),
      ],
      studios: [changes.studios(), changes.changed("studio")],
      tags: [
        changes.farSides("ImageTag"),
        changes.farSides("GalleryTag"),
        changes.changed("tag"),
      ],
    };
    const images = changes.deleted("image");
    const galleries = [
      changes.farSides("ImageGallery"),
      changes.deleted("gallery"),
    ];
    if (
      images.whole ||
      galleries.some((scope) => scope.whole) ||
      Object.values(direct).some((scopes) => scopes.some((s) => s.whole))
    ) {
      return "all";
    }

    const through = await entityImageCountService.countedThrough({
      images: images.refs,
      galleries: galleries.flatMap((scope) => scope.refs),
    });
    const refsOf = (scopes: RefScope[], more: readonly EntityRef[]) =>
      distinctRefs([...scopes.flatMap((scope) => scope.refs), ...more]);
    return {
      performers: refsOf(direct.performers, through.performers),
      studios: refsOf(direct.studios, through.studios),
      tags: refsOf(direct.tags, through.tags),
    };
  }

  /**
   * Gallery inheritance for every image or the given ones (after images
   * and galleries). The service logs how many.
   */
  private async applyGalleryInheritance(
    images: EntityRef[] | "all"
  ): Promise<void> {
    await imageGalleryInheritanceService.applyGalleryInheritance(images);
    logger.info("Gallery inheritance complete");
  }

  /**
   * The image counts for `imageCounts` (after gallery inheritance), user
   * stats and tag counts.
   */
  private async rebuildCounts(
    imageCounts: ImageCountScope | "all"
  ): Promise<void> {
    await entityImageCountService.rebuildAllImageCounts(imageCounts);
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
   * ends at Stash's count or on an empty page. Pages come in updated_at
   * order, so an entity edited in Stash meanwhile moves to the end and is
   * fetched again. The run's abort is checked before every page and ends a
   * request in flight. The result carries the newest updated_at seen, the
   * type's next watermark, leaving out (and logging) values more than
   * WATERMARK_MAX_SKEW_MS in the future.
   */
  private async paginate(
    entityType: EntityType,
    stashInstanceId: string,
    { since, ids, seen }: PaginateOptions,
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
    const future: FutureDated = { count: 0, ids: [] };

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
          maxUpdatedAt = newestUpdatedAt(maxUpdatedAt, items, future);
          if (seen) for (const item of items) seen.add(item.id);

          // What the page points at and Peek lacks goes first, while no
          // transaction is open; then the page, in one transaction
          await this.ensureReferenced(
            entityType,
            stashInstanceId,
            spec.references(items),
            run
          );
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

      if (future.count > 0) {
        logger.warn(
          `${future.count} ${plural} carry an updated_at more than ${WATERMARK_MAX_SKEW_MS / 60_000} minutes ahead of this server's clock: ` +
            `they are synced, but the next sync starts from the newest time that is not, so it fetches them again until then`,
          { instanceId: stashInstanceId, ...future }
        );
      }

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

  /**
   * Fetches by id, and writes in their own batches, the entities a page of
   * `entityType` references that Peek holds no row for: created in Stash
   * after their own type's pages ran, or of a type whose sync failed. A
   * junction row, a gallery's or image's studio and a clip's scene and
   * primary tag have foreign keys, so without them the page's batch would
   * fail and roll back. It runs before the page's transaction opens, so no
   * Stash request waits inside one; the fetched entities' own references
   * are ensured the same way (references point only at earlier types in
   * SYNC_ORDER), and they join the run's change set as new. An id Stash no
   * longer has is not fetched, and the page's batch then fails on it, to be
   * written again by the next sync.
   */
  private async ensureReferenced(
    entityType: EntityType,
    stashInstanceId: string,
    refs: BatchReferences,
    run: SyncRunContext
  ): Promise<void> {
    const missing = await missingReferences(stashInstanceId, refs);
    for (const type of SYNC_ORDER) {
      const ids = missing.get(type);
      if (!ids) continue;
      logger.info(
        `Fetching ${ids.length} ${ENTITY_TABLES[type].plural} that ${ENTITY_TABLES[entityType].plural} reference and Peek has not synced yet`,
        { instanceId: stashInstanceId, ids: ids.slice(0, 20) }
      );
      await this.paginate(type, stashInstanceId, { ids }, run);
    }
  }

  /** Emits a `progress` event for how a type goes (nothing listens today). */
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
   * type's own error, and so does a failed fetch of what no page returned
   * (`fetchMissedIds`, after the cleanup). An abort throws
   * Error("Sync aborted") and saves nothing.
   */
  private async runEntityType(
    entityType: EntityType,
    stashInstanceId: string,
    { syncType, since, withCleanup, seen }: RunEntityTypeOptions,
    run: SyncRunContext
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let result: SyncResult;
    // Every page came back and was written
    let fetched = true;
    try {
      result = await this.paginate(
        entityType,
        stashInstanceId,
        { since: syncType === "full" ? undefined : since, seen },
        run
      );
    } catch (error) {
      if (this.isAbort(error)) throw new Error("Sync aborted");
      fetched = false;
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
      const missed =
        seen && result.error === undefined
          ? await this.fetchMissedIds(
              entityType,
              stashInstanceId,
              seen,
              outcome.stashIds,
              run
            )
          : undefined;
      result.synced += missed?.fetched ?? 0;
      result.error = joinProblems(
        result.error,
        cleanupProblem(outcome),
        missed?.problem
      );
    }

    await this.saveSyncState(stashInstanceId, syncType, result, fetched);
    return result;
  }

  /**
   * The completeness check of a type fetched whole: the ids in Stash's list
   * (`stashIds`, which its cleanup read) that no page returned (`seen`) are
   * fetched by id and written, into the run's change set like any page.
   * Paging by offset skips an entity whenever one on a page already fetched
   * is edited in Stash (it moves to the end of the updated_at order, and
   * the rest move up a place), and an entity created after the last page
   * was asked for is on none. Nothing is compared when the cleanup did not
   * read the whole list. The pages' watermark stays: what is fetched here is
   * older than it, or newer and fetched again by the next sync. A failure
   * becomes the returned `problem`, for the type's `lastError`; an abort
   * throws.
   */
  private async fetchMissedIds(
    entityType: EntityType,
    stashInstanceId: string,
    seen: ReadonlySet<string>,
    stashIds: readonly string[] | undefined,
    run: SyncRunContext
  ): Promise<{ fetched: number; problem?: string }> {
    const missed = (stashIds ?? []).filter((id) => !seen.has(id));
    if (missed.length === 0) return { fetched: 0 };
    const { plural } = ENTITY_TABLES[entityType];
    logger.info(
      `Fetching ${missed.length} ${plural} that Stash lists and no page returned`,
      { instanceId: stashInstanceId, ids: missed.slice(0, LOGGED_IDS) }
    );
    try {
      const { synced } = await this.paginate(
        entityType,
        stashInstanceId,
        { ids: missed },
        run
      );
      return { fetched: synced };
    } catch (error) {
      if (this.isAbort(error)) throw new Error("Sync aborted");
      const message = describeStashError(error);
      logger.error(`Failed to fetch the ${plural} no page returned`, {
        stashInstanceId,
        entityType,
        error: message,
      });
      return {
        fetched: 0,
        problem: `Could not fetch ${missed.length.toLocaleString("en-US")} ${plural} the pages missed: ${message}`,
      };
    }
  }

  /**
   * The incremental paths' cleanup, every type after all of them synced.
   * Each type's soft-deleted count goes into its result and its rows into
   * the run's change set, and a cleanup that skips, refuses or fails is
   * added to the type's `lastError`. A type fetched whole this run (never
   * synced before, its page ids in `seenIds`) that synced cleanly then gets
   * what no page returned (`fetchMissedIds`), a failure of which is added
   * too. Returns the ids each type's cleanup soft-deleted (all it tried,
   * after a failure midway), for `refetchLinkedToDeleted`.
   */
  private async cleanupEveryType(
    stashInstanceId: string,
    results: SyncResult[],
    run: SyncRunContext,
    seenIds: ReadonlyMap<EntityType, ReadonlySet<string>>
  ): Promise<Map<EntityType, string[]>> {
    logger.info("Checking for deleted entities...");
    let totalDeleted = 0;
    const deleted = new Map<EntityType, string[]>();
    for (const entityType of SYNC_ORDER) {
      this.checkAbort();
      const outcome = await this.cleanupDeletedEntities(
        entityType,
        stashInstanceId
      );
      run.changes.addDeleted(entityType, stashInstanceId, outcome.deletedIds);
      if (outcome.deletedIds.length > 0) {
        deleted.set(entityType, outcome.deletedIds);
      }
      totalDeleted += outcome.deleted;
      const result = results.find((r) => r.entityType === entityType);
      if (result) result.deleted = outcome.deleted;
      const seen = seenIds.get(entityType);
      const missed =
        seen && result?.error === undefined
          ? await this.fetchMissedIds(
              entityType,
              stashInstanceId,
              seen,
              outcome.stashIds,
              run
            )
          : undefined;
      if (result) result.synced += missed?.fetched ?? 0;
      const problem = joinProblems(cleanupProblem(outcome), missed?.problem);
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
    return deleted;
  }

  /**
   * What linked to the entities a cleanup soft-deleted (`deleted`, ids by
   * type) is fetched again by id (item 42, SYNC-17). Stash's tag and
   * performer merges move every link to the merged entity onto the one kept,
   * and deleting a studio clears it from its entities, without moving the
   * linking entities' updated_at, so no incremental page returns them. Along
   * `LINK_PATHS`: a tag leads to the studios, performers, groups, galleries,
   * scenes, clips (their tags and primary tag) and images carrying it; a
   * performer to its galleries, scenes and images; a studio to its
   * galleries, scenes and images; a group to its scenes. Each type's live
   * linked ids are paged in by id (`paginate`, 500 a request) in SYNC_ORDER,
   * into the change set as changed (`markChanged`: they come back with the
   * same updated_at, and an image's links are not diffed), so the post-sync
   * steps and the exclusion recompute cover them. A type whose refetch fails
   * keeps its old links until the daily full pass: the failure is added to
   * its result's error and its `lastError`. An abort throws.
   */
  private async refetchLinkedToDeleted(
    stashInstanceId: string,
    deleted: ReadonlyMap<EntityType, readonly string[]>,
    results: SyncResult[],
    run: SyncRunContext
  ): Promise<void> {
    if (deleted.size === 0) return;
    const linked = await linkedTo(stashInstanceId, deleted);
    const refetch: SyncRunContext = { ...run, markChanged: true };
    for (const [entityType, ids] of linked) {
      this.checkAbort();
      const { plural } = ENTITY_TABLES[entityType];
      const result = results.find((r) => r.entityType === entityType);
      logger.info(
        `Fetching ${ids.length} ${plural} that linked to what Stash deleted or merged`,
        { instanceId: stashInstanceId, ids: ids.slice(0, LOGGED_IDS) }
      );
      try {
        const { synced } = await this.paginate(
          entityType,
          stashInstanceId,
          { ids },
          refetch
        );
        if (result) result.synced += synced;
      } catch (error) {
        if (this.isAbort(error)) throw new Error("Sync aborted");
        const message = describeStashError(error);
        logger.error(
          `Failed to refetch the ${plural} that linked to what Stash deleted or merged`,
          { stashInstanceId, entityType, error: message }
        );
        const problem = `Could not refetch ${ids.length.toLocaleString("en-US")} ${plural} that linked to what Stash deleted or merged: ${message}`;
        const lastError = joinProblems(result?.error, problem) ?? problem;
        if (result) result.error = lastError;
        await this.recordEntityError(stashInstanceId, entityType, lastError);
      }
    }
  }

  /**
   * The scenes and images of the galleries the run changed or soft-deleted
   * on `stashInstanceId` are fetched again by id (item 42, SYNC-18). Adding
   * images to a gallery in Stash, removing them, and editing its scenes from
   * the gallery move only the gallery's updated_at, and deleting a gallery
   * moves nothing, while Peek writes `ImageGallery` and `SceneGallery` from
   * the member's side; and an image keeps what it inherited from a gallery
   * (inheritance fills only what is empty). So both the members Peek links
   * to those galleries (the ones that left, and a deleted gallery's) and the
   * ones Stash lists in the changed galleries (`galleries` INCLUDES: the
   * ones that joined) are paged in by id (`paginate`, 500 a request), into
   * the change set as changed (`markChanged`): their links are rewritten
   * from Stash, and the post-sync steps put back what they inherit and
   * recount what they link to. A type fetched whole this run (`fetchedWhole`,
   * a never-synced type's page ids) is skipped: its rows are Stash's
   * already. Past the change set's limit, which galleries changed on this
   * instance is no longer known, so both types are fetched whole again. A
   * type whose refetch fails keeps its old links until a full sync: the
   * failure is added to its result's error and its `lastError`. An abort
   * throws.
   */
  private async refetchGalleryMembers(
    stashInstanceId: string,
    results: SyncResult[],
    run: SyncRunContext,
    fetchedWhole: ReadonlyMap<EntityType, unknown> = new Map()
  ): Promise<void> {
    const changed = run.changes.changed("gallery");
    const deleted = run.changes.deleted("gallery");
    const onInstance = (scope: RefScope) =>
      scope.refs
        .filter((ref) => ref.instanceId === stashInstanceId)
        .map((ref) => ref.id);
    const whole = changed.whole || deleted.whole;
    const live = onInstance(changed);
    const gone = onInstance(deleted);
    if (!whole && live.length === 0 && gone.length === 0) return;

    const linked = whole
      ? new Map<EntityType, string[]>()
      : await linkedTo(
          stashInstanceId,
          new Map([["gallery", [...live, ...gone]]]),
          GALLERY_MEMBER_PATHS
        );
    const refetch: SyncRunContext = { ...run, markChanged: true };
    for (const entityType of GALLERY_MEMBER_TYPES) {
      if (fetchedWhole.has(entityType)) continue;
      this.checkAbort();
      const { plural } = ENTITY_TABLES[entityType];
      const result = results.find((r) => r.entityType === entityType);
      try {
        let ids: string[] | undefined;
        if (whole) {
          logger.info(
            `More than ${SCOPE_LIMIT.toLocaleString("en-US")} galleries changed or went this run: fetching every one of this instance's ${plural} again`,
            { instanceId: stashInstanceId }
          );
        } else {
          // Deleted galleries are gone from Stash: only the changed ones
          // can list members
          const listed =
            live.length > 0
              ? await this.galleryMembersInStash(
                  entityType,
                  stashInstanceId,
                  live,
                  run
                )
              : [];
          ids = [...new Set([...(linked.get(entityType) ?? []), ...listed])];
          if (ids.length === 0) continue;
          logger.info(
            `Fetching ${ids.length} ${plural} in or out of galleries that Stash changed or deleted`,
            { instanceId: stashInstanceId, ids: ids.slice(0, LOGGED_IDS) }
          );
        }
        const { synced } = await this.paginate(
          entityType,
          stashInstanceId,
          { ids },
          refetch
        );
        if (result) result.synced += synced;
      } catch (error) {
        if (this.isAbort(error)) throw new Error("Sync aborted");
        const message = describeStashError(error);
        logger.error(
          `Failed to refetch the ${plural} of galleries Stash changed or deleted`,
          { stashInstanceId, entityType, error: message }
        );
        const problem = `Could not refetch the ${plural} of galleries Stash changed or deleted: ${message}`;
        const lastError = joinProblems(result?.error, problem) ?? problem;
        if (result) result.error = lastError;
        await this.recordEntityError(stashInstanceId, entityType, lastError);
      }
    }
  }

  /**
   * The collection hierarchy of one instance (item 58): the groups each
   * group contains, in Stash's order, with Stash's description of each
   * link. Stash's sub-group edits (adding, removing or reordering
   * sub-groups, a link's description) move no group's updated_at, so every
   * sync runs this, whatever its mode: one request lists every group's
   * sub-groups (FindGroupRelations, per_page -1; 178 groups on the owner's
   * library, a few MB at 10,000). A link is read from its containing side
   * alone: it is in exactly one `sub_groups` list, which Stash returns in
   * its order_index order, so the list position is the order. The links are
   * diffed in memory against the instance's `GroupRelation` rows, and only
   * the differences are deleted and upserted, in one short transaction; no
   * difference, no write. A link to a group Peek holds no row for on the
   * instance (created in Stash after this run's group pages, or its type
   * failed) is skipped and logged, since the foreign keys would fail the
   * transaction; a later sync writes it. Nothing here enters the run's
   * change set: nothing downstream reads the hierarchy. A failure throws,
   * for the caller to record, and so does an abort.
   */
  private async syncGroupRelations(
    stashInstanceId: string,
    run: SyncRunContext
  ): Promise<void> {
    const stash = this.getStashClient(stashInstanceId);
    const { findGroups } = await stash.findGroupRelations(
      { filter: { per_page: -1 } },
      undefined,
      run.signal
    );
    throwIfAborted(run.signal);

    const listed = new Map<string, GroupLink>();
    for (const group of findGroups.groups) {
      if (!validateEntityId(group.id)) continue;
      group.sub_groups.forEach((link, orderIndex) => {
        const entry: GroupLink = {
          containingId: group.id,
          subId: link.group.id,
          orderIndex,
          description: link.description ?? null,
        };
        const key = groupLinkKey(entry);
        if (validateEntityId(entry.subId) && !listed.has(key)) {
          listed.set(key, entry);
        }
      });
    }

    const groupIds = new Set<string>();
    for (const link of listed.values()) {
      groupIds.add(link.containingId);
      groupIds.add(link.subId);
    }
    const missing = new Set(
      (await missingReferences(stashInstanceId, { group: [...groupIds] })).get(
        "group"
      ) ?? []
    );
    const links = [...listed.values()].filter(
      (link) => !missing.has(link.containingId) && !missing.has(link.subId)
    );
    if (links.length < listed.size) {
      logger.warn(
        `Skipped ${listed.size - links.length} collection hierarchy links to groups Peek holds no row for yet; a later sync adds them`,
        {
          instanceId: stashInstanceId,
          groupIds: [...missing].slice(0, LOGGED_IDS),
        }
      );
    }

    const stored = await prisma.groupRelation.findMany({
      where: {
        containingInstanceId: stashInstanceId,
        subInstanceId: stashInstanceId,
      },
      select: {
        containingId: true,
        subId: true,
        orderIndex: true,
        description: true,
      },
    });
    const wanted = new Set(links.map(groupLinkKey));
    const storedByKey = new Map(stored.map((row) => [groupLinkKey(row), row]));
    const removed = stored.filter((row) => !wanted.has(groupLinkKey(row)));
    const upserted = links.filter((link) => {
      const row = storedByKey.get(groupLinkKey(link));
      return (
        row === undefined ||
        row.orderIndex !== link.orderIndex ||
        row.description !== link.description
      );
    });
    if (removed.length === 0 && upserted.length === 0) return;
    throwIfAborted(run.signal);

    await dbWriteTransaction("sync.groupRelations", async (tx) => {
      if (removed.length > 0) {
        await tx.$executeRawUnsafe(
          DELETE_GROUP_LINKS_SQL,
          JSON.stringify(removed.map((row) => [row.containingId, row.subId])),
          stashInstanceId,
          stashInstanceId
        );
      }
      if (upserted.length > 0) {
        await tx.$executeRawUnsafe(
          UPSERT_GROUP_LINKS_SQL,
          stashInstanceId,
          stashInstanceId,
          JSON.stringify(
            upserted.map((link) => [
              link.containingId,
              link.subId,
              link.orderIndex,
              link.description,
            ])
          )
        );
      }
    });
    const added = upserted.filter(
      (link) => !storedByKey.has(groupLinkKey(link))
    ).length;
    logger.info("Collection hierarchy updated", {
      instanceId: stashInstanceId,
      added,
      changed: upserted.length - added,
      removed: removed.length,
    });
  }

  /**
   * Stash's ids of the scenes or images in any of `galleryIds` (the
   * `galleries` criterion, INCLUDES), 500 galleries a request and 5,000 ids
   * a page. The list stops at Stash's count or at an empty page.
   */
  private async galleryMembersInStash(
    entityType: (typeof GALLERY_MEMBER_TYPES)[number],
    stashInstanceId: string,
    galleryIds: readonly string[],
    run: SyncRunContext
  ): Promise<string[]> {
    const stash = this.getStashClient(stashInstanceId);
    const fetchIds = GALLERY_MEMBER_ID_FETCHERS[entityType];
    const ids: string[] = [];
    for (const value of chunksOf(galleryIds, BATCH_SIZE)) {
      const galleries = { value, modifier: CriterionModifier.Includes };
      let listed = 0;
      for (let page = 1; ; page++) {
        throwIfAborted(run.signal);
        const result = await fetchIds(
          stash,
          galleries,
          { page, per_page: CLEANUP_PAGE_SIZE },
          run.signal
        );
        for (const id of result.ids) ids.push(id);
        listed += result.ids.length;
        if (result.ids.length === 0 || listed >= result.count) break;
      }
    }
    return ids;
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

  /**
   * runCleanup's work; the caller holds the lock. What linked to the rows it
   * soft-deleted is fetched again, and the members of the galleries it
   * soft-deleted or that refetch changed, as after a sync's cleanups.
   */
  private async cleanupAndRecord(
    entityType: EntityType,
    stashInstanceId: string,
    options: CleanupOptions
  ): Promise<CleanupOutcome> {
    const run = this.runContext();
    const { changes } = run;
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
      await this.refetchLinkedToDeleted(
        stashInstanceId,
        new Map([[entityType, outcome.deletedIds]]),
        [],
        run
      );
      await this.refetchGalleryMembers(stashInstanceId, [], run);
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
   * `lastFullSyncActual` is when the type was last fetched whole (the sync status's
   * "last full sync"): written whenever a "full" type's pages all came back and were
   * written (`fetched`), even when Stash holds none of the type. A cleanup's skip or
   * refusal does not undo it: the type's rows were all fetched. The daily full pass
   * reads the instance's own `lastFullPassAt` (`recordFullPasses`), not this.
   *
   * `lastError` is this run's problem with the type (runEntityType), or null when it
   * synced cleanly, so a type that recovers clears its earlier error.
   */
  private async saveSyncState(
    stashInstanceId: string,
    syncType: "full" | "incremental",
    result: SyncResult,
    fetched: boolean
  ): Promise<void> {
    const instanceId = stashInstanceId;

    // Actual time (real UTC) for display purposes
    const actualTime = new Date();
    const fetchedWhole = syncType === "full" && fetched;

    // Build update data - only include sync timestamp if we have one
    const updateData: Record<string, unknown> = {
      lastSyncCount: result.synced,
      lastSyncDurationMs: result.durationMs,
      lastError: result.error ?? null,
      ...(fetchedWhole ? { lastFullSyncActual: actualTime } : {}),
    };

    // Only update timestamp fields if we have a valid timestamp from synced entities
    if (result.maxUpdatedAt) {
      if (syncType === "full") {
        // Store raw timestamp string (new field)
        updateData.lastFullSyncTimestamp = result.maxUpdatedAt;
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
              ? { lastFullSyncTimestamp: result.maxUpdatedAt }
              : {
                  lastIncrementalSyncTimestamp: result.maxUpdatedAt,
                  lastIncrementalSyncActual: actualTime,
                }
            : {}),
          ...(fetchedWhole ? { lastFullSyncActual: actualTime } : {}),
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
      select: { id: true, name: true, enabled: true, firstSyncedAt: true },
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
        firstSyncedAt: instance.firstSyncedAt?.toISOString() ?? null,
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
   * A soft-deleted performer counts for nothing: Stash deleted or merged it,
   * and its links go when the scenes are fetched again.
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
          JOIN StashPerformer p ON p.id = pt.performerId AND p.stashInstanceId = pt.performerInstanceId AND p.deletedAt IS NULL
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
   * (`getUsersSelecting`: a selection naming it, or one naming no other
   * enabled instance, read before the batch removes
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
