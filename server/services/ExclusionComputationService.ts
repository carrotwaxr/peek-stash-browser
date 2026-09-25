/**
 * ExclusionComputationService
 *
 * Computes and maintains the UserExcludedEntity table which stores
 * pre-computed exclusions for each user. This enables efficient
 * JOIN-based filtering instead of loading exclusions into memory.
 *
 * Exclusion sources:
 * - UserContentRestriction (admin restrictions) -> reason='restricted'
 *   (EXCLUDE closures, INCLUDE inversion and the content rules)
 * - UserHiddenEntity (user hidden items) -> reason='hidden'
 *   (the stored row, its descendants and its per-instance copies)
 * - Cascades from EXCLUDE closures and hides -> reason='cascade'
 * - Empty organizational entities -> reason='empty'
 *
 * The compute is raw SQL end to end (item 13). Listed and hidden ids are
 * user-written: they are bound as JSON, never spliced into SQL text. Every
 * closure and exclusion set is loaded once into a TEMP table with a primary
 * key on (id, inst), so each membership test is an indexed lookup. TEMP
 * tables live on one connection, so the compute runs on the single-connection
 * compute client (prisma/computeClient.ts), one recompute at a time, inside a
 * deferred BEGIN: a read snapshot that takes no write lock, where a Prisma
 * interactive transaction (BEGIN IMMEDIATE) would hold the database write lock
 * for the whole compute.
 *
 * The write phase is set-based on the same connection: the deduplicated rows
 * go into the TEMP table _peek_result (bound as JSON, 20,000 rows per
 * statement, no main-database lock), then one short BEGIN IMMEDIATE deletes
 * the user's rows and inserts the new ones with INSERT ... SELECT (the
 * `exclusions.swap` writer unit), and the stats follow in one batch on the
 * main client. On a 180k-row user the lock is held for well under a second,
 * where a createMany of the same rows held it for over three.
 *
 * Who exclusions apply to lives in exclusionPolicy.ts: an admin's rows hold
 * only their own hides and cascades, so no read path needs a role check.
 *
 * Reason precedence. UserExcludedEntity holds one row per (user, type, id,
 * instance); when an entity qualifies several ways, the first reason in this
 * order is stored:
 *   1. restricted: EXCLUDE closures and INCLUDE inversion (direct)
 *   2. cascade: cascades of those EXCLUDE closures
 *   3. restricted: content rules
 *   4. empty: entities the user's hides cover that are empty under the
 *      restrictions alone
 *   5. hidden: the user's hides, their descendants and per-instance copies
 *   6. cascade: cascades of the hides
 *   7. empty: empty under every exclusion
 * Rows 1 to 4 are exactly what a recompute with no hides would store for
 * these keys, so a row whose reason is 'hidden' marks an entity the user
 * would see if they had hidden nothing. EntityAccessService reads that for
 * the Hidden Items list. addHiddenEntity keeps it true between recomputes by
 * never overwriting an existing row.
 */
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import type { PrismaClient } from "@prisma/client";
import {
  disconnectComputeClient,
  readSnapshot,
  withComputeConnection,
} from "../prisma/computeClient.js";
import prisma from "../prisma/singleton.js";
import type { SyncEntityType } from "../types/api/sync.js";
import { dbWrite, dbWriteBatch } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import type { BatchChanges } from "./SyncChangeSet.js";
import {
  buildInstanceFilterClause,
  getUserInstanceScope,
  getUsersSelecting,
} from "./UserInstanceService.js";
import {
  RESTRICTABLE_ENTITY_TYPES,
  type RestrictableEntityType,
  restrictionsApplyTo,
} from "./exclusionPolicy.js";

/**
 * The client the compute and write helpers run on: the compute client
 * (prisma/computeClient.ts) or a write transaction's client.
 */
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Maps plural entity types from UserContentRestriction to singular types
 * used in UserExcludedEntity
 */
const ENTITY_TYPE_MAP: Record<RestrictableEntityType, ResolvableType> = {
  tags: "tag",
  studios: "studio",
  groups: "group",
  galleries: "gallery",
};

/**
 * Represents an exclusion to be inserted
 */
interface ExclusionRecord {
  userId: number;
  entityType: string;
  entityId: string;
  instanceId: string;
  reason: string;
}

/** An entity reference as stored: "" means every instance (input only). */
type Ref = { id: string; instanceId: string };
/** A reference looked up in the entity table: instanceId is always real. */
type ResolvedRef = { id: string; instanceId: string };

/** One restrictable type's rules after resolution (Rule 2). */
interface RestrictionRule {
  entityType: RestrictableEntityType;
  /** Closure of the Show-only list; null when the type has no INCLUDE row. */
  include: ResolvedRef[] | null;
  /** Closure of the Always-hide list; [] when the type has no EXCLUDE row. */
  exclude: ResolvedRef[];
  /** OR of the type's rows' flags. */
  restrictEmpty: boolean;
}

/** Entities whose exclusion propagates along EDGES. */
interface CascadeSource {
  entityType: string;
  refs: ResolvedRef[];
}

/** Entity types a listed or hidden id can be looked up as. */
type ResolvableType =
  | "tag"
  | "studio"
  | "group"
  | "gallery"
  | "performer"
  | "scene"
  | "image";

const RESOLVE_TABLE: Record<ResolvableType, string> = {
  tag: "StashTag",
  studio: "StashStudio",
  group: "StashGroup",
  gallery: "StashGallery",
  performer: "StashPerformer",
  scene: "StashScene",
  image: "StashImage",
};

function isResolvableType(entityType: string): entityType is ResolvableType {
  return Object.prototype.hasOwnProperty.call(RESOLVE_TABLE, entityType);
}

function isRestrictableType(
  entityType: string
): entityType is RestrictableEntityType {
  return (RESTRICTABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}

/**
 * TEMP tables (per connection, dropped at the end of each compute).
 * _peek_refs holds the closure the current queries join against; the
 * _peek_ex_* tables hold the exclusions the empty phase probes; _peek_result
 * holds the rows the write phase swaps or merges into UserExcludedEntity.
 */
const REFS_TABLE = "_peek_refs";
const EXCLUSION_SET_TABLES = {
  scene: "_peek_ex_scene",
  image: "_peek_ex_image",
  performer: "_peek_ex_performer",
  studio: "_peek_ex_studio",
  group: "_peek_ex_group",
  gallery: "_peek_ex_gallery",
} as const;
type ExclusionSetType = keyof typeof EXCLUSION_SET_TABLES;
const RESULT_TABLE = "_peek_result";
const TEMP_TABLES = [
  REFS_TABLE,
  ...Object.values(EXCLUSION_SET_TABLES),
  RESULT_TABLE,
];

/** Rows per _peek_result fill statement (about 1.5 MB of JSON each). */
const RESULT_CHUNK = 20_000;

/**
 * Copy _peek_result into the user's rows. OR IGNORE: a row already stored
 * for a key keeps its reason (a `pending` hold the swap kept, or, for a hide,
 * whatever the last recompute stored). computedAt is bound as Prisma stores
 * DateTime in SQLite, epoch milliseconds.
 */
const INSERT_FROM_RESULT_SQL = `INSERT OR IGNORE INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt) SELECT ?, entityType, entityId, instanceId, reason, ? FROM ${RESULT_TABLE}`;

/**
 * Remove the user's rows before the swap, except `pending` holds written
 * since the snapshot began: a sync batch wrote them for changes this
 * snapshot may not have seen, and the end-of-sync recompute, whose snapshot
 * starts after every batch, is the one that clears them.
 */
const DELETE_BEFORE_SWAP_SQL = `DELETE FROM UserExcludedEntity WHERE userId = ? AND NOT (reason = 'pending' AND computedAt >= ?)`;

/**
 * A hold (C18): one `pending` row per user of the JSON list `u` for each
 * id of the JSON list `j`, of one entity type on one instance, written by a
 * sync batch on its own transaction. OR IGNORE keeps an existing row's
 * reason. Binds entityType, instanceId, computedAt (epoch milliseconds, as
 * Prisma stores DateTime and DELETE_BEFORE_SWAP_SQL compares), ids, users.
 */
const HOLD_IDS_SQL = `INSERT OR IGNORE INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt)
  SELECT CAST(u.value AS INTEGER), ?, j.value, ?, 'pending', ?
  FROM json_each(?) j CROSS JOIN json_each(?) u`;

/** The head every hold along an edge shares: binds the target entityType. */
const HOLD_EDGE_HEAD = `INSERT OR IGNORE INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt)
  SELECT CAST(u.value AS INTEGER), ?, `;

/** The client a hold is written on: the sync batch's transaction. */
type HoldClient = Pick<PrismaClient, "$executeRawUnsafe">;

/**
 * The types whose changed entities hold their first-order content along
 * EDGES: a tag moved under a hidden parent, a studio or group whose tags
 * changed, a gallery that gained images. A performer's own change reaches
 * its scenes only through its tags (the scene edges of `tagSetChanged`).
 */
const HELD_SOURCES: ReadonlySet<SyncEntityType> = new Set([
  "tag",
  "studio",
  "group",
  "gallery",
]);

const STATS_ENTITY_TYPES = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
] as const;

/**
 * Cascade edges (Rule 3), first order only: a performer excluded through a
 * tag does not cascade further. Table and column names are constants here,
 * never request data.
 */
type Edge =
  | {
      kind: "junction";
      source: ResolvableType;
      target: string;
      junction: string;
      srcId: string;
      srcInst: string;
      targetId: string;
      targetInst: string;
    }
  | {
      kind: "column";
      source: ResolvableType;
      target: string;
      table: string;
      col: string;
      instCol: string;
    }
  | { kind: "inherited"; source: "tag"; target: "scene" };

const junctionEdge = (
  source: ResolvableType,
  target: string,
  junction: string,
  src: string,
  tgt: string
): Edge => ({
  kind: "junction",
  source,
  target,
  junction,
  srcId: `${src}Id`,
  srcInst: `${src}InstanceId`,
  targetId: `${tgt}Id`,
  targetInst: `${tgt}InstanceId`,
});

const EDGES: Edge[] = [
  junctionEdge("performer", "scene", "ScenePerformer", "performer", "scene"),
  junctionEdge(
    "performer",
    "gallery",
    "GalleryPerformer",
    "performer",
    "gallery"
  ),
  junctionEdge("performer", "image", "ImagePerformer", "performer", "image"),
  {
    kind: "column",
    source: "studio",
    target: "scene",
    table: "StashScene",
    col: "studioId",
    instCol: "x.stashInstanceId",
  },
  {
    kind: "column",
    source: "studio",
    target: "gallery",
    table: "StashGallery",
    col: "studioId",
    instCol: "x.studioInstanceId",
  },
  {
    kind: "column",
    source: "studio",
    target: "image",
    table: "StashImage",
    col: "studioId",
    instCol: "x.studioInstanceId",
  },
  junctionEdge("tag", "scene", "SceneTag", "tag", "scene"),
  { kind: "inherited", source: "tag", target: "scene" },
  junctionEdge("tag", "performer", "PerformerTag", "tag", "performer"),
  junctionEdge("tag", "studio", "StudioTag", "tag", "studio"),
  junctionEdge("tag", "group", "GroupTag", "tag", "group"),
  junctionEdge("tag", "gallery", "GalleryTag", "tag", "gallery"),
  junctionEdge("tag", "image", "ImageTag", "tag", "image"),
  junctionEdge("tag", "clip", "ClipTag", "tag", "clip"),
  {
    kind: "column",
    source: "tag",
    target: "clip",
    table: "StashClip",
    col: "primaryTagId",
    instCol: "x.primaryTagInstanceId",
  },
  junctionEdge("group", "scene", "SceneGroup", "group", "scene"),
  junctionEdge("gallery", "scene", "SceneGallery", "gallery", "scene"),
  junctionEdge("gallery", "image", "ImageGallery", "gallery", "image"),
];

/**
 * Content rules (Rules 4 and 5): which content tables a restrictable type
 * links to, and through which columns.
 */
type ContentRule =
  | {
      kind: "junction";
      target: string;
      table: string;
      junction: string;
      xId: string;
      xInst: string;
      itemId: string;
      itemInst: string;
    }
  | { kind: "tagScene" }
  | { kind: "studio"; target: string; table: string; instCol: string };

const contentJunction = (
  target: string,
  table: string,
  junction: string,
  x: string,
  item: string
): ContentRule => ({
  kind: "junction",
  target,
  table,
  junction,
  xId: `${x}Id`,
  xInst: `${x}InstanceId`,
  itemId: `${item}Id`,
  itemInst: `${item}InstanceId`,
});

const CONTENT_RULES: Record<RestrictableEntityType, ContentRule[]> = {
  groups: [
    contentJunction("scene", "StashScene", "SceneGroup", "scene", "group"),
  ],
  tags: [
    { kind: "tagScene" },
    contentJunction("gallery", "StashGallery", "GalleryTag", "gallery", "tag"),
    contentJunction("image", "StashImage", "ImageTag", "image", "tag"),
  ],
  studios: [
    {
      kind: "studio",
      target: "scene",
      table: "StashScene",
      instCol: "x.stashInstanceId",
    },
    {
      kind: "studio",
      target: "gallery",
      table: "StashGallery",
      instCol: "x.studioInstanceId",
    },
    {
      kind: "studio",
      target: "image",
      table: "StashImage",
      instCol: "x.studioInstanceId",
    },
  ],
  galleries: [
    contentJunction("scene", "StashScene", "SceneGallery", "scene", "gallery"),
    contentJunction("image", "StashImage", "ImageGallery", "image", "gallery"),
  ],
};

/**
 * Parse a composite key and normalize instanceId to empty string (not undefined)
 * for the resolution logic that relies on truthiness.
 */
function parseCompositeKey(key: string): Ref {
  const { id, instanceId } = parseEntityRef(key);
  return { id, instanceId: instanceId ?? "" };
}

/** Parse a stored entityIds JSON column; a malformed column restricts nothing. */
function parseStoredIds(entityIds: string): Ref[] {
  try {
    const parsed: unknown = JSON.parse(entityIds);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string | number => {
        return typeof v === "string" || typeof v === "number";
      })
      .map((v) => parseCompositeKey(String(v)));
  } catch {
    return [];
  }
}

/** The JSON shape every temp-table fill binds: [{ id, iid }]. */
function refsJson(refs: ResolvedRef[]): string {
  return JSON.stringify(refs.map((r) => ({ id: r.id, iid: r.instanceId })));
}

function refKey(ref: Ref): string {
  return `${ref.id}\0${ref.instanceId}`;
}

/**
 * Result of recomputing exclusions for a set of users.
 */
export interface RecomputeAllResult {
  success: number;
  failed: number;
  errors: Array<{ userId: number; error: string }>;
}

class ExclusionComputationService {
  // Track pending recomputes to prevent race conditions
  private pendingRecomputes = new Map<number, Promise<void>>();
  // Track whether another recompute is needed after the current one finishes
  private recomputeQueued = new Set<number>();

  /**
   * Full recompute for a user.
   * Computation runs on the single-connection compute client in a read
   * snapshot that takes no write lock; only the final DELETE+INSERT swap
   * holds it, briefly.
   * If the write phase fails, previous exclusions are preserved.
   * Prevents concurrent recomputes for the same user.
   *
   * Coalescing: when N callers arrive concurrently for the same user,
   * at most 2 recomputes occur, the currently-running one plus one
   * queued recompute that picks up all pending state changes.
   */
  async recomputeForUser(userId: number): Promise<void> {
    // If there's already a pending recompute for this user, wait for it to finish
    // then re-run to pick up any state changes that occurred while waiting
    // (e.g., admin saved new restrictions while a sync-triggered recompute was running)
    const pending = this.pendingRecomputes.get(userId);
    if (pending) {
      // Mark that a recompute is needed after the current one
      this.recomputeQueued.add(userId);
      logger.info(
        "ExclusionComputationService.recomputeForUser already pending, waiting then re-running",
        { userId }
      );
      try {
        await pending;
      } catch {
        /* ignore - we'll recompute anyway */
      }

      // After the pending recompute finished, check if another caller already
      // consumed the queued flag and started a new recompute. If so, just
      // await that one instead of starting yet another.
      if (!this.recomputeQueued.has(userId)) {
        const newPending = this.pendingRecomputes.get(userId);
        if (newPending) {
          await newPending;
        }
        return;
      }
      // We're the one to consume the queue flag and start the recompute
      this.recomputeQueued.delete(userId);
      // Fall through to start the recompute
    }

    const recomputePromise = this.doRecomputeForUser(userId);
    this.pendingRecomputes.set(userId, recomputePromise);

    try {
      await recomputePromise;
    } finally {
      this.pendingRecomputes.delete(userId);
    }
  }

  /**
   * Internal recompute implementation.
   *
   * Structured to minimize SQLite write lock time:
   * - Phases 1-4 (resolve, direct, cascade, content rules, empty) run in a
   *   readSnapshot on the compute connection: they only read the main
   *   database and write TEMP tables, so they take no main-database write
   *   lock.
   * - The deduplicated rows are filled into _peek_result on the same
   *   connection (fillResult), still without the lock.
   * - Only the swap (swapResult: DELETE + INSERT ... SELECT) holds the write
   *   lock, as the `exclusions.swap` unit of the writer queue, and the stats
   *   batch follows outside it.
   */
  private async doRecomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", {
      userId,
    });
    const t0 = Date.now();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      logger.warn(
        "ExclusionComputationService.recomputeForUser: no such user",
        {
          userId,
        }
      );
      return;
    }
    // Rule 7: restriction rows stay inert for admins; hides still apply.
    const applyRestrictions = restrictionsApplyTo(user.role);

    // The user's instance scope bounds every phase. It keeps an instance on
    // its first sync, which nobody sees yet, so its rows exist before it
    // shows; a failed read fails the recompute and keeps the stored rows
    const allowedInstanceIds = await getUserInstanceScope(userId);

    const written = await withComputeConnection(async (db) => {
      // The swap keeps `pending` holds written from here on. Taken before the
      // BEGIN, so no hold for a change the snapshot cannot see slips in
      // between.
      const snapshotStartedAt = Date.now();

      // === COMPUTATION PHASE (read snapshot, no write lock) ===
      const computed = await readSnapshot(db, async () => {
        const rules = applyRestrictions
          ? await this.loadRules(userId, db, allowedInstanceIds)
          : [];
        const hidden = await this.loadHidden(userId, db);

        // Phase 1: direct exclusions (EXCLUDE closures, INCLUDE inversion, hides)
        const direct = await this.computeDirectExclusions(
          userId,
          db,
          allowedInstanceIds,
          rules,
          hidden
        );
        const t1 = Date.now();

        // Phase 2: cascades from EXCLUDE closures and hides only, each source
        // apart so the stored reason says where a row came from
        const restrictionCascade = await this.computeCascadeExclusions(
          userId,
          direct.restrictionSources,
          db,
          allowedInstanceIds
        );
        const hideCascade = await this.computeCascadeExclusions(
          userId,
          direct.hideSources,
          db,
          allowedInstanceIds
        );
        const t2 = Date.now();

        // Phase 3: content rules (INCLUDE admission, restrictEmpty)
        const content = await this.computeContentRuleExclusions(
          userId,
          rules,
          db,
          allowedInstanceIds
        );
        const t3 = Date.now();

        // Phase 4: empty organizational entities (skipped for admins, Q2).
        // First under the restrictions alone, only for the entities the hides
        // cover; then under every exclusion, as the lists apply it.
        let emptyUnderRestrictions: ExclusionRecord[] = [];
        let empty: ExclusionRecord[] = [];
        if (applyRestrictions) {
          await this.loadExclusionSets(
            db,
            [...direct.restricted, ...restrictionCascade, ...content],
            allowedInstanceIds,
            { append: false }
          );
          emptyUnderRestrictions = await this.computeEmptyExclusions(
            userId,
            db,
            allowedInstanceIds,
            direct.hideSources
          );
          await this.loadExclusionSets(
            db,
            [...direct.hidden, ...hideCascade],
            allowedInstanceIds,
            { append: true }
          );
          empty = await this.computeEmptyExclusions(
            userId,
            db,
            allowedInstanceIds
          );
        }
        const t4 = Date.now();

        return {
          direct,
          restrictionCascade,
          hideCascade,
          content,
          emptyUnderRestrictions,
          empty,
          t1,
          t2,
          t3,
          t4,
        };
      });
      const {
        direct,
        restrictionCascade,
        hideCascade,
        content,
        emptyUnderRestrictions,
        empty,
        t1,
        t2,
        t3,
        t4,
      } = computed;

      // Combine all exclusions and deduplicate. An entity can qualify through
      // several paths; the first reason in the order of "Reason precedence"
      // (file header) is the one stored. The key includes the instance.
      const allExclusionsRaw = [
        ...direct.restricted,
        ...restrictionCascade,
        ...content,
        ...emptyUnderRestrictions,
        ...direct.hidden,
        ...hideCascade,
        ...empty,
      ];
      const seen = new Set<string>();
      const allExclusions: ExclusionRecord[] = [];
      for (const excl of allExclusionsRaw) {
        const key = `${excl.entityType}:${excl.entityId}:${excl.instanceId || ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          allExclusions.push(excl);
        }
      }

      // === WRITE PHASE (fill without the lock, then one short swap) ===
      let swapMs = 0;
      let t5 = t4;
      try {
        await this.fillResult(db, allExclusions);
        t5 = Date.now();
        await dbWrite("exclusions.swap", async () => {
          const started = Date.now();
          await this.swapResult(db, userId, snapshotStartedAt);
          swapMs = Date.now() - started;
        });
      } finally {
        await this.cleanupTempTables(db);
      }
      const t6 = Date.now();

      return {
        totalExclusions: allExclusions.length,
        phaseCounts: {
          restricted: direct.restricted.length,
          hidden: direct.hidden.length,
          restrictionCascade: restrictionCascade.length,
          hideCascade: hideCascade.length,
          content: content.length,
          emptyUnderRestrictions: emptyUnderRestrictions.length,
          empty: empty.length,
        },
        timing: {
          directMs: t1 - t0,
          cascadeMs: t2 - t1,
          contentMs: t3 - t2,
          emptyMs: t4 - t3,
          fillMs: t5 - t4,
          swapMs,
          swapQueuedMs: t6 - t5 - swapMs,
        },
      };
    }, "exclusions.recompute");

    // Phase 5: entity stats, outside the swap
    const t7 = Date.now();
    await this.updateEntityStats(userId, allowedInstanceIds);
    const t8 = Date.now();

    logger.info("ExclusionComputationService.recomputeForUser completed", {
      userId,
      applyRestrictions,
      totalExclusions: written.totalExclusions,
      instanceCount: allowedInstanceIds.length,
      phaseCounts: written.phaseCounts,
      timing: {
        ...written.timing,
        statsMs: t8 - t7,
        totalMs: t8 - t0,
      },
    });
  }

  /**
   * Recompute exclusions for all users: a full sync (every step whole
   * library), saving restrictions from the admin pages, and the data
   * migrations. An incremental sync recomputes only the users a changed
   * instance affects (recomputeUsersForInstances).
   * @returns Result with success/failure counts and error details
   */
  async recomputeAllUsers(): Promise<RecomputeAllResult> {
    const users = await prisma.user.findMany({
      select: { id: true },
    });
    return this.recomputeUsers(
      users.map((u) => u.id),
      "recomputeAllUsers"
    );
  }

  /**
   * Recompute the users a sync's changes affect: every user whose instance
   * scope (enabled instances, narrowed by the user's selection) holds one
   * of `instanceIds`, plus every user with a `pending` hold, whatever they
   * can see. A restriction's outputs and a non-admin's empty-entity phase
   * depend on the whole library of the user's scope, so a change on an
   * instance can alter any of its users; skipping the users who cannot see
   * it, and skipping no-op syncs, is where the time goes.
   */
  async recomputeUsersForInstances(
    instanceIds: string[]
  ): Promise<RecomputeAllResult> {
    const wanted = new Set(instanceIds);
    const pending = new Set(await this.usersWithPendingHolds());
    const users = await prisma.user.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const targets: number[] = [];
    for (const { id } of users) {
      if (pending.has(id)) {
        targets.push(id);
        continue;
      }
      if (wanted.size === 0) continue;
      const scope = await getUserInstanceScope(id);
      if (scope.some((instanceId) => wanted.has(instanceId))) {
        targets.push(id);
      }
    }
    return this.recomputeUsers(targets, "recomputeUsersForInstances", {
      instanceIds,
      pending: pending.size,
    });
  }

  /**
   * The users with a `pending` hold: a sync batch wrote rows for a changed
   * entity that their next recompute replaces (C18). They are recomputed
   * at the end of every sync, even one that found nothing.
   */
  async usersWithPendingHolds(): Promise<number[]> {
    const rows = await prisma.userExcludedEntity.findMany({
      where: { reason: "pending" },
      select: { userId: true },
      distinct: ["userId"],
    });
    return rows.map((row) => row.userId);
  }

  // ─── Holds during sync (C18) ───

  /**
   * The users a sync batch on `instanceId` holds its changes from: the
   * non-admins with a restriction row (restrictions never apply to admins)
   * and everyone with a hidden item, admins included, among the users whose
   * scope holds the instance (`getUsersSelecting`: a selection naming it,
   * or one naming no other enabled instance, none at all included). None while
   * the instance is disabled or still on its first sync: nobody sees it yet
   * (C17), so there is nothing to hold. The sync reads it once per run and
   * instance, before any batch transaction opens.
   */
  async usersWithExclusionInputs(instanceId: string): Promise<number[]> {
    const instance = await prisma.stashInstance.findUnique({
      where: { id: instanceId },
      select: { enabled: true, firstSyncedAt: true },
    });
    if (!instance?.enabled || instance.firstSyncedAt === null) return [];
    const selecting = await getUsersSelecting(instanceId);
    if (selecting.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: selecting } },
      select: {
        id: true,
        role: true,
        contentRestrictions: { select: { id: true }, take: 1 },
        hiddenEntities: { select: { id: true }, take: 1 },
      },
      orderBy: { id: "asc" },
    });
    return users
      .filter(
        (user) =>
          (restrictionsApplyTo(user.role) &&
            user.contentRestrictions.length > 0) ||
          user.hiddenEntities.length > 0
      )
      .map((user) => user.id);
  }

  /**
   * Hold a sync batch's changes from `userIds` until their recompute
   * (item 42, invariant 3): a `pending` row per user for every changed
   * entity of the batch; for a changed tag, studio, group or gallery, for
   * the content it links to along the first-order EDGES (HELD_SOURCES); and
   * for a performer, studio or group whose tag set changed, for its scenes
   * along the scene edges (ScenePerformer, StashScene.studioId, SceneGroup),
   * which inherit its tags. Written on the batch's transaction, so a hold
   * rolls back with its batch and costs no lock of its own. A `pending` row
   * excludes like any other until the recompute's swap replaces it
   * (DELETE_BEFORE_SWAP_SQL keeps only holds newer than its snapshot).
   *
   * Residual: content reached only through the closure of a changed
   * hierarchy (a grandchild tag's scenes) shows until the same sync's
   * recompute, seconds later. Returns the rows written.
   */
  async holdForRecompute(
    tx: HoldClient,
    entityType: SyncEntityType,
    instanceId: string,
    changes: BatchChanges,
    userIds: readonly number[]
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const users = JSON.stringify(userIds);
    const now = Date.now();
    let written = 0;

    const changed = changes.changed.map((ref) => ref.id);
    if (changed.length > 0) {
      const ids = JSON.stringify(changed);
      written += await tx.$executeRawUnsafe(
        HOLD_IDS_SQL,
        entityType,
        instanceId,
        now,
        ids,
        users
      );
      if (HELD_SOURCES.has(entityType)) {
        for (const edge of EDGES) {
          if (edge.source !== entityType) continue;
          written += await this.holdAlongEdge(
            tx,
            edge,
            instanceId,
            ids,
            users,
            now
          );
        }
      }
    }

    if (changes.tagSetChanged.length > 0) {
      const ids = JSON.stringify(changes.tagSetChanged.map((ref) => ref.id));
      for (const edge of EDGES) {
        if (edge.source !== entityType || edge.target !== "scene") continue;
        written += await this.holdAlongEdge(
          tx,
          edge,
          instanceId,
          ids,
          users,
          now
        );
      }
    }
    return written;
  }

  /**
   * One hold along `edge`: a `pending` row per user of `usersJson` for
   * every target on `instanceId` linked to one of the sources in `idsJson`.
   * The same three shapes as `edgeQuery`, driven from the bound id list
   * (`json_each(?) j CROSS JOIN ...`, so each source is looked up by its
   * junction's or column's index); the inherited-tag shape scans the
   * instance's scenes with the ids as one IN list (107 ms for 500 tags on
   * the prod copy).
   */
  private holdAlongEdge(
    tx: HoldClient,
    edge: Edge,
    instanceId: string,
    idsJson: string,
    usersJson: string,
    now: number
  ): Promise<number> {
    switch (edge.kind) {
      case "junction":
        return tx.$executeRawUnsafe(
          `${HOLD_EDGE_HEAD}x.${edge.targetId}, x.${edge.targetInst}, 'pending', ?
           FROM json_each(?) j
           CROSS JOIN ${edge.junction} x ON x.${edge.srcId} = j.value AND x.${edge.srcInst} = ?
           CROSS JOIN json_each(?) u`,
          edge.target,
          now,
          idsJson,
          instanceId,
          usersJson
        );
      case "column":
        // The + keeps the planner on the column's index: the instance's
        // value matches every row of the instance
        return tx.$executeRawUnsafe(
          `${HOLD_EDGE_HEAD}x.id, x.stashInstanceId, 'pending', ?
           FROM json_each(?) j
           CROSS JOIN ${edge.table} x ON x.${edge.col} = j.value AND +${edge.instCol} = ?
           CROSS JOIN json_each(?) u
           WHERE x.deletedAt IS NULL`,
          edge.target,
          now,
          idsJson,
          instanceId,
          usersJson
        );
      case "inherited":
        return tx.$executeRawUnsafe(
          `${HOLD_EDGE_HEAD}s.id, s.stashInstanceId, 'pending', ?
           FROM StashScene s
           CROSS JOIN json_each(?) u
           WHERE s.stashInstanceId = ? AND s.deletedAt IS NULL
             AND EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]')) it
                         WHERE it.value IN (SELECT value FROM json_each(?)))`,
          edge.target,
          now,
          usersJson,
          instanceId,
          idsJson
        );
    }
  }

  /**
   * Recompute the given users one after another; a failure is logged and
   * counted, and the next user still runs. `what` names the caller in the
   * two log lines, with `context`.
   */
  async recomputeUsers(
    userIds: number[],
    what = "recomputeUsers",
    context: Record<string, unknown> = {}
  ): Promise<RecomputeAllResult> {
    logger.info(`ExclusionComputationService.${what} starting`, {
      ...context,
      userCount: userIds.length,
    });

    const result: RecomputeAllResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const userId of userIds) {
      try {
        await this.recomputeForUser(userId);
        result.success++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Failed to recompute exclusions for user", {
          userId,
          error: errorMessage,
        });
        result.failed++;
        result.errors.push({ userId, error: errorMessage });
        // Continue with other users even if one fails
      }
    }

    logger.info(`ExclusionComputationService.${what} completed`, {
      ...context,
      userCount: userIds.length,
      success: result.success,
      failed: result.failed,
    });

    return result;
  }

  // ─── Compute connection, TEMP tables and the write phase ───

  /**
   * Fill _peek_result with the rows to store, bound as JSON in chunks of
   * RESULT_CHUNK, on the compute connection outside any transaction (each
   * statement is its own, and touches only the TEMP database). The table's
   * primary key with OR IGNORE keeps the first row per key, the same
   * first-reason-wins the callers' dedup applies.
   */
  private async fillResult(
    db: TransactionClient,
    records: ExclusionRecord[]
  ): Promise<void> {
    await db.$executeRawUnsafe(
      `CREATE TEMP TABLE IF NOT EXISTS ${RESULT_TABLE} (entityType TEXT NOT NULL, entityId TEXT NOT NULL, instanceId TEXT NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (entityType, entityId, instanceId)) WITHOUT ROWID`
    );
    await db.$executeRawUnsafe(`DELETE FROM ${RESULT_TABLE}`);
    for (let i = 0; i < records.length; i += RESULT_CHUNK) {
      const chunk = records.slice(i, i + RESULT_CHUNK).map((r) => ({
        t: r.entityType,
        id: r.entityId,
        iid: r.instanceId,
        r: r.reason,
      }));
      await db.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ${RESULT_TABLE} (entityType, entityId, instanceId, reason) SELECT json_extract(value, '$.t'), json_extract(value, '$.id'), json_extract(value, '$.iid'), json_extract(value, '$.r') FROM json_each(?)`,
        JSON.stringify(chunk)
      );
    }
  }

  /**
   * The swap: replace the user's rows with _peek_result inside one short
   * BEGIN IMMEDIATE on the compute connection (the TEMP table lives there).
   * `pending` holds written since `snapshotStartedAt` survive the DELETE and
   * win the INSERT OR IGNORE. On any failure after the BEGIN the transaction
   * is rolled back, so the user's old rows stay, and the error rethrown: a
   * busy failure is retried by dbWrite with _peek_result still filled. A
   * BEGIN that fails (busy) throws with nothing to roll back.
   */
  private async swapResult(
    db: TransactionClient,
    userId: number,
    snapshotStartedAt: number
  ): Promise<void> {
    await db.$executeRawUnsafe("BEGIN IMMEDIATE");
    try {
      await db.$executeRawUnsafe(
        DELETE_BEFORE_SWAP_SQL,
        userId,
        snapshotStartedAt
      );
      await db.$executeRawUnsafe(INSERT_FROM_RESULT_SQL, userId, Date.now());
      await db.$executeRawUnsafe("COMMIT");
    } catch (error) {
      await this.rollbackSwap(db);
      throw error;
    }
  }

  /**
   * The merge (hides): add the rows of _peek_result the user lacks, one
   * statement, autocommit. An existing row keeps its reason.
   */
  private async mergeResult(
    db: TransactionClient,
    userId: number
  ): Promise<void> {
    await db.$executeRawUnsafe(INSERT_FROM_RESULT_SQL, userId, Date.now());
  }

  /**
   * End a failed swap. If the ROLLBACK itself fails the connection may still
   * hold the write transaction: disconnect it so the next compute opens a
   * fresh one. Never throws, so the swap's own error is the one reported.
   */
  private async rollbackSwap(db: TransactionClient): Promise<void> {
    try {
      await db.$executeRawUnsafe("ROLLBACK");
    } catch (error) {
      logger.warn(
        "ExclusionComputationService: could not roll back the swap, reconnecting the compute client",
        { error: error instanceof Error ? error.message : String(error) }
      );
      await disconnectComputeClient();
    }
  }

  /**
   * Drop the TEMP tables at the end of a compute. Never throws: a table left
   * behind is emptied by the next compute's CREATE IF NOT EXISTS + DELETE,
   * and the compute's own error is the one reported.
   */
  private async cleanupTempTables(db: TransactionClient): Promise<void> {
    try {
      await this.dropTempTables(db);
    } catch (error) {
      logger.warn(
        "ExclusionComputationService: could not drop the TEMP tables",
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  private async createTempSet(
    tx: TransactionClient,
    table: string
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `CREATE TEMP TABLE IF NOT EXISTS ${table} (id TEXT NOT NULL, inst TEXT NOT NULL, PRIMARY KEY (id, inst)) WITHOUT ROWID`
    );
    await tx.$executeRawUnsafe(`DELETE FROM ${table}`);
  }

  /** One INSERT ... SELECT FROM json_each(?) per set; ids are bound, never spliced. */
  private async fillTempSet(
    tx: TransactionClient,
    table: string,
    refs: ResolvedRef[]
  ): Promise<void> {
    if (refs.length === 0) return;
    await tx.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ${table} (id, inst) SELECT json_extract(value, '$.id'), json_extract(value, '$.iid') FROM json_each(?)`,
      refsJson(refs)
    );
  }

  /** Load a closure into _peek_refs for the queries that follow. */
  private async fillRefs(
    tx: TransactionClient,
    refs: ResolvedRef[]
  ): Promise<void> {
    await this.createTempSet(tx, REFS_TABLE);
    await this.fillTempSet(tx, REFS_TABLE, refs);
  }

  private async dropTempTables(tx: TransactionClient): Promise<void> {
    for (const table of TEMP_TABLES) {
      await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  // ─── Resolution (Rules 2 and 8) ───

  /**
   * Look the refs up in the entity table on the allowed instances. A bare id
   * resolves to one ref per allowed instance where the entity exists; an id
   * that exists nowhere yields nothing. With `descendants`, tags expand
   * through StashTag.parentIds and studios through StashStudio.parentId to
   * every descendant on the same instance (one recursive CTE; UNION
   * deduplicates the DAG and terminates on cycles). Parents are not covered.
   *
   * The anchors drive from the bound JSON into the table's primary key
   * (CROSS JOIN pins that order), never a scan of the table per bound id.
   */
  private async resolveRefs(
    entityType: ResolvableType,
    refs: Ref[],
    tx: TransactionClient,
    allowedInstanceIds: string[],
    { descendants }: { descendants: boolean }
  ): Promise<ResolvedRef[]> {
    if (refs.length === 0 || allowedInstanceIds.length === 0) return [];

    const table = RESOLVE_TABLE[entityType];
    const bare = refs.filter((r) => !r.instanceId).map((r) => r.id);
    const scoped = refs
      .filter((r) => r.instanceId)
      .map((r) => ({ id: r.id, iid: r.instanceId }));
    const inst = buildInstanceFilterClause(
      allowedInstanceIds,
      "t.stashInstanceId"
    );

    const anchor = `
      SELECT t.id, t.stashInstanceId FROM json_each(?) g
      CROSS JOIN ${table} t ON t.id = g.value
      WHERE t.deletedAt IS NULL AND ${inst.sql}
      UNION
      SELECT t.id, t.stashInstanceId FROM json_each(?) sc
      CROSS JOIN ${table} t ON t.id = json_extract(sc.value, '$.id') AND t.stashInstanceId = json_extract(sc.value, '$.iid')
      WHERE t.deletedAt IS NULL AND ${inst.sql}`;
    const params = [
      JSON.stringify(bare),
      ...inst.params,
      JSON.stringify(scoped),
      ...inst.params,
    ];

    const expand =
      descendants && (entityType === "tag" || entityType === "studio");
    let sql: string;
    if (expand) {
      const step =
        entityType === "tag"
          ? `SELECT c.id, c.stashInstanceId FROM StashTag c
             JOIN listed p ON c.stashInstanceId = p.inst
             JOIN json_each(COALESCE(c.parentIds, '[]')) je ON je.value = p.id
             WHERE c.deletedAt IS NULL`
          : `SELECT c.id, c.stashInstanceId FROM StashStudio c
             JOIN listed p ON c.parentId = p.id AND c.stashInstanceId = p.inst
             WHERE c.deletedAt IS NULL`;
      sql = `WITH RECURSIVE listed(id, inst) AS (${anchor}
      UNION
      ${step}
      )
      SELECT id, inst AS instanceId FROM listed`;
    } else {
      sql = `WITH listed(id, inst) AS (${anchor}
      )
      SELECT id, inst AS instanceId FROM listed`;
    }

    return await tx.$queryRawUnsafe<ResolvedRef[]>(sql, ...params);
  }

  /**
   * Read the user's restriction rows, group them per type (Rule 1: one
   * INCLUDE and one EXCLUDE row per type, restrictEmpty ORed) and resolve
   * each list to its closure.
   */
  private async loadRules(
    userId: number,
    tx: TransactionClient,
    allowedInstanceIds: string[]
  ): Promise<RestrictionRule[]> {
    const rows = await tx.userContentRestriction.findMany({
      where: { userId },
    });

    logger.debug("loadRules: found restrictions", {
      userId,
      restrictionCount: rows.length,
      types: rows.map((r) => `${r.entityType}:${r.mode}`),
    });

    const byType = new Map<
      RestrictableEntityType,
      { include: Ref[] | null; exclude: Ref[]; restrictEmpty: boolean }
    >();
    for (const row of rows) {
      if (!isRestrictableType(row.entityType)) {
        logger.warn("loadRules: unknown restriction entity type", {
          userId,
          entityType: row.entityType,
        });
        continue;
      }
      if (row.mode !== "INCLUDE" && row.mode !== "EXCLUDE") {
        logger.warn("loadRules: unknown restriction mode", {
          userId,
          mode: row.mode,
        });
        continue;
      }
      const entry = byType.get(row.entityType) ?? {
        include: null,
        exclude: [],
        restrictEmpty: false,
      };
      const refs = parseStoredIds(row.entityIds);
      if (row.mode === "INCLUDE") {
        entry.include = [...(entry.include ?? []), ...refs];
      } else {
        entry.exclude.push(...refs);
      }
      entry.restrictEmpty = entry.restrictEmpty || row.restrictEmpty;
      byType.set(row.entityType, entry);
    }

    const rules: RestrictionRule[] = [];
    for (const [entityType, entry] of byType) {
      const singular = ENTITY_TYPE_MAP[entityType];
      rules.push({
        entityType,
        include:
          entry.include === null
            ? null
            : await this.resolveRefs(
                singular,
                entry.include,
                tx,
                allowedInstanceIds,
                {
                  descendants: true,
                }
              ),
        exclude: await this.resolveRefs(
          singular,
          entry.exclude,
          tx,
          allowedInstanceIds,
          { descendants: true }
        ),
        restrictEmpty: entry.restrictEmpty,
      });
    }
    return rules;
  }

  /** UserHiddenEntity rows as Refs, grouped by entity type. */
  private async loadHidden(
    userId: number,
    tx: TransactionClient
  ): Promise<Map<string, Ref[]>> {
    const rows = await tx.userHiddenEntity.findMany({ where: { userId } });
    const byType = new Map<string, Ref[]>();
    for (const row of rows) {
      const list = byType.get(row.entityType) ?? [];
      list.push({ id: row.entityId, instanceId: row.instanceId || "" });
      byType.set(row.entityType, list);
    }
    return byType;
  }

  /**
   * The one definition of what a hide covers, shared by the full recompute
   * and addHiddenEntity. Each stored hide becomes a `hidden` record exactly
   * as stored (instance "" stays ""). The hides resolve on the allowed
   * instances, expanding tags and studios to their descendants; every
   * resolved ref other than a stored hide itself becomes another `hidden`
   * record (descendants, and the per-instance copies of a "" hide). The
   * resolved refs are the cascade source.
   */
  private async expandHides(
    userId: number,
    entityType: string,
    hides: Ref[],
    tx: TransactionClient,
    allowedInstanceIds: string[]
  ): Promise<{ records: ExclusionRecord[]; refs: ResolvedRef[] }> {
    const records: ExclusionRecord[] = hides.map((h) => ({
      userId,
      entityType,
      entityId: h.id,
      instanceId: h.instanceId,
      reason: "hidden",
    }));
    if (!isResolvableType(entityType)) {
      return { records, refs: [] };
    }

    const refs = await this.resolveRefs(
      entityType,
      hides,
      tx,
      allowedInstanceIds,
      { descendants: true }
    );
    const stored = new Set(hides.map(refKey));
    for (const ref of refs) {
      if (stored.has(refKey(ref))) continue;
      records.push({
        userId,
        entityType,
        entityId: ref.id,
        instanceId: ref.instanceId,
        reason: "hidden",
      });
    }
    return { records, refs };
  }

  // ─── Phase 1: direct exclusions ───

  /**
   * Compute direct exclusions from the resolved rules and the hidden rows.
   * - Each EXCLUDE closure -> `restricted` rows, and a restriction source.
   * - Each INCLUDE closure -> inversion in SQL: every entity of the type on
   *   an allowed instance that is not in the closure gets a `restricted`
   *   row. Inverted rows are NOT cascade sources (Rule 4).
   * - Hides -> `hidden` rows through expandHides, and a hide source (the
   *   resolved refs: every key a `hidden` row covers).
   */
  private async computeDirectExclusions(
    userId: number,
    tx: TransactionClient,
    allowedInstanceIds: string[],
    rules: RestrictionRule[],
    hidden: Map<string, Ref[]>
  ): Promise<{
    restricted: ExclusionRecord[];
    hidden: ExclusionRecord[];
    restrictionSources: CascadeSource[];
    hideSources: CascadeSource[];
  }> {
    const records: ExclusionRecord[] = [];
    const cascadeSources: CascadeSource[] = [];

    for (const rule of rules) {
      const singular = ENTITY_TYPE_MAP[rule.entityType];

      for (const ref of rule.exclude) {
        records.push({
          userId,
          entityType: singular,
          entityId: ref.id,
          instanceId: ref.instanceId,
          reason: "restricted",
        });
      }
      if (rule.exclude.length > 0) {
        cascadeSources.push({ entityType: singular, refs: rule.exclude });
      }

      if (rule.include !== null) {
        const table = RESOLVE_TABLE[singular];
        const inst = buildInstanceFilterClause(
          allowedInstanceIds,
          "t.stashInstanceId"
        );
        await this.fillRefs(tx, rule.include);
        const inverted = await tx.$queryRawUnsafe<ResolvedRef[]>(
          `SELECT t.id, t.stashInstanceId AS instanceId
           FROM ${table} t
           WHERE t.deletedAt IS NULL AND ${inst.sql}
             AND NOT EXISTS (SELECT 1 FROM ${REFS_TABLE} r WHERE r.id = t.id AND r.inst = t.stashInstanceId)`,
          ...inst.params
        );
        for (const row of inverted) {
          records.push({
            userId,
            entityType: singular,
            entityId: row.id,
            instanceId: row.instanceId,
            reason: "restricted",
          });
        }
      }
    }

    const hiddenRecords: ExclusionRecord[] = [];
    const hideSources: CascadeSource[] = [];
    for (const [entityType, hides] of hidden) {
      const { records: expanded, refs } = await this.expandHides(
        userId,
        entityType,
        hides,
        tx,
        allowedInstanceIds
      );
      hiddenRecords.push(...expanded);
      if (refs.length > 0) {
        hideSources.push({ entityType, refs });
      }
    }

    return {
      restricted: records,
      hidden: hiddenRecords,
      restrictionSources: cascadeSources,
      hideSources,
    };
  }

  // ─── Phase 2: cascades ───

  private edgeQuery(
    edge: Edge,
    allowedInstanceIds: string[]
  ): { sql: string; params: string[] } {
    switch (edge.kind) {
      case "junction": {
        const inst = buildInstanceFilterClause(
          allowedInstanceIds,
          `j.${edge.targetInst}`
        );
        return {
          sql: `SELECT DISTINCT j.${edge.targetId} AS id, j.${edge.targetInst} AS instanceId
            FROM ${edge.junction} j
            JOIN ${REFS_TABLE} r ON r.id = j.${edge.srcId} AND r.inst = j.${edge.srcInst}
            WHERE ${inst.sql}`,
          params: inst.params,
        };
      }
      case "column": {
        const inst = buildInstanceFilterClause(
          allowedInstanceIds,
          "x.stashInstanceId"
        );
        return {
          sql: `SELECT x.id, x.stashInstanceId AS instanceId
            FROM ${edge.table} x
            JOIN ${REFS_TABLE} r ON r.id = x.${edge.col} AND r.inst = ${edge.instCol}
            WHERE x.deletedAt IS NULL AND ${inst.sql}`,
          params: inst.params,
        };
      }
      case "inherited": {
        const inst = buildInstanceFilterClause(
          allowedInstanceIds,
          "s.stashInstanceId"
        );
        return {
          sql: `SELECT s.id, s.stashInstanceId AS instanceId
            FROM StashScene s
            WHERE s.deletedAt IS NULL AND ${inst.sql}
              AND EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]')) it
                          JOIN ${REFS_TABLE} r ON r.id = it.value AND r.inst = s.stashInstanceId)`,
          params: inst.params,
        };
      }
    }
  }

  /**
   * Compute cascade exclusions from the cascade sources (EXCLUDE closures
   * and hides), one query per edge and source type, through EDGES.
   *
   * @returns Array of cascade exclusion records to insert
   */
  private async computeCascadeExclusions(
    userId: number,
    sources: CascadeSource[],
    tx: TransactionClient,
    allowedInstanceIds: string[]
  ): Promise<ExclusionRecord[]> {
    const cascadeExclusions: ExclusionRecord[] = [];
    const seen = new Set<string>();

    // Helper to add cascade exclusion if not already seen
    const addCascade = (
      entityType: string,
      entityId: string,
      instanceId: string
    ) => {
      const key = `${entityType}:${entityId}:${instanceId || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        cascadeExclusions.push({
          userId,
          entityType,
          entityId,
          instanceId: instanceId || "",
          reason: "cascade",
        });
      }
    };

    // Merge the sources per entity type so each edge runs once per type
    const refsByType = new Map<string, Map<string, ResolvedRef>>();
    for (const source of sources) {
      const merged =
        refsByType.get(source.entityType) ?? new Map<string, ResolvedRef>();
      for (const ref of source.refs) merged.set(refKey(ref), ref);
      refsByType.set(source.entityType, merged);
    }

    for (const [entityType, merged] of refsByType) {
      const edges = EDGES.filter((e) => e.source === entityType);
      if (edges.length === 0 || merged.size === 0) continue;

      await this.fillRefs(tx, [...merged.values()]);
      for (const edge of edges) {
        const { sql, params } = this.edgeQuery(edge, allowedInstanceIds);
        const rows = await tx.$queryRawUnsafe<ResolvedRef[]>(sql, ...params);
        for (const row of rows) addCascade(edge.target, row.id, row.instanceId);
      }
    }

    return cascadeExclusions;
  }

  // ─── Phase 3: content rules ───

  /**
   * One content-rule query. `include`: content with no item of the type in
   * the closure (loaded in _peek_refs) is hidden, unless it has no item at
   * all and restrictEmpty is off. `empty`: content with no item of the type
   * is hidden (EXCLUDE-only rows with restrictEmpty).
   */
  private contentRuleQuery(
    rule: ContentRule,
    mode: "include" | "empty",
    restrictEmpty: boolean,
    allowedInstanceIds: string[]
  ): { sql: string; params: Array<string | number>; target: string } {
    const flag = restrictEmpty ? 1 : 0;

    if (rule.kind === "tagScene") {
      const inst = buildInstanceFilterClause(
        allowedInstanceIds,
        "s.stashInstanceId"
      );
      const head = `SELECT s.id, s.stashInstanceId AS instanceId
        FROM StashScene s
        WHERE s.deletedAt IS NULL AND ${inst.sql}`;
      if (mode === "include") {
        return {
          target: "scene",
          sql: `${head}
          AND NOT EXISTS (SELECT 1 FROM SceneTag st JOIN ${REFS_TABLE} r ON r.id = st.tagId AND r.inst = st.tagInstanceId
                          WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId)
          AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]')) it
                          JOIN ${REFS_TABLE} r ON r.id = it.value AND r.inst = s.stashInstanceId)
          AND (? = 1
               OR EXISTS (SELECT 1 FROM SceneTag st2 WHERE st2.sceneId = s.id AND st2.sceneInstanceId = s.stashInstanceId)
               OR EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]'))))`,
          params: [...inst.params, flag],
        };
      }
      return {
        target: "scene",
        sql: `${head}
        AND NOT EXISTS (SELECT 1 FROM SceneTag st WHERE st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId)
        AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(s.inheritedTagIds, '[]')))`,
        params: [...inst.params],
      };
    }

    const inst = buildInstanceFilterClause(
      allowedInstanceIds,
      "x.stashInstanceId"
    );
    const head = `SELECT x.id, x.stashInstanceId AS instanceId
      FROM ${rule.table} x
      WHERE x.deletedAt IS NULL AND ${inst.sql}`;

    if (rule.kind === "junction") {
      if (mode === "include") {
        return {
          target: rule.target,
          sql: `${head}
          AND NOT EXISTS (SELECT 1 FROM ${rule.junction} j JOIN ${REFS_TABLE} r ON r.id = j.${rule.itemId} AND r.inst = j.${rule.itemInst}
                          WHERE j.${rule.xId} = x.id AND j.${rule.xInst} = x.stashInstanceId)
          AND (? = 1 OR EXISTS (SELECT 1 FROM ${rule.junction} j2 WHERE j2.${rule.xId} = x.id AND j2.${rule.xInst} = x.stashInstanceId))`,
          params: [...inst.params, flag],
        };
      }
      return {
        target: rule.target,
        sql: `${head}
        AND NOT EXISTS (SELECT 1 FROM ${rule.junction} j WHERE j.${rule.xId} = x.id AND j.${rule.xInst} = x.stashInstanceId)`,
        params: [...inst.params],
      };
    }

    // Studio column shape. The `x.studioId IS NULL OR` guard matters:
    // NOT EXISTS is fine with NULL but NOT (NULL IN ...) is NULL, so
    // studio-less rows are decided by the flag alone.
    if (mode === "include") {
      return {
        target: rule.target,
        sql: `${head}
        AND (x.studioId IS NULL OR NOT EXISTS (SELECT 1 FROM ${REFS_TABLE} r WHERE r.id = x.studioId AND r.inst = ${rule.instCol}))
        AND (? = 1 OR x.studioId IS NOT NULL)`,
        params: [...inst.params, flag],
      };
    }
    return {
      target: rule.target,
      sql: `${head}
      AND x.studioId IS NULL`,
      params: [...inst.params],
    };
  }

  /**
   * Content rules (Rules 4 and 5). For each rule, for each content table
   * the type links to, one query; rows become `restricted` records with the
   * row's instance. INCLUDE rules bind their closure through _peek_refs;
   * EXCLUDE-only rules with restrictEmpty hide content with no item of the
   * type. Organising entities are never hidden here (Q1).
   */
  private async computeContentRuleExclusions(
    userId: number,
    rules: RestrictionRule[],
    tx: TransactionClient,
    allowedInstanceIds: string[]
  ): Promise<ExclusionRecord[]> {
    const records: ExclusionRecord[] = [];

    for (const rule of rules) {
      let mode: "include" | "empty";
      if (rule.include !== null) {
        await this.fillRefs(tx, rule.include);
        mode = "include";
      } else if (rule.restrictEmpty) {
        mode = "empty";
      } else {
        continue;
      }

      for (const contentRule of CONTENT_RULES[rule.entityType]) {
        const { sql, params, target } = this.contentRuleQuery(
          contentRule,
          mode,
          rule.restrictEmpty,
          allowedInstanceIds
        );
        const rows = await tx.$queryRawUnsafe<ResolvedRef[]>(sql, ...params);
        for (const row of rows) {
          records.push({
            userId,
            entityType: target,
            entityId: row.id,
            instanceId: row.instanceId,
            reason: "restricted",
          });
        }
      }
    }

    return records;
  }

  // ─── Phase 4: empty organisational entities ───

  /**
   * Load exclusion records into the _peek_ex_* TEMP tables (one INSERT per
   * set) that the empty queries probe, so every visibility probe is a
   * primary-key lookup. A "" instance (a stored hide) applies to every
   * allowed instance. With append, the rows join the sets an earlier load
   * created. The sets are loaded from the in-memory records rather than
   * UserExcludedEntity because the new rows haven't been written yet.
   */
  private async loadExclusionSets(
    tx: TransactionClient,
    records: ExclusionRecord[],
    allowedInstanceIds: string[],
    { append }: { append: boolean }
  ): Promise<void> {
    const sets: Record<ExclusionSetType, Map<string, ResolvedRef>> = {
      scene: new Map(),
      image: new Map(),
      performer: new Map(),
      studio: new Map(),
      group: new Map(),
      gallery: new Map(),
    };
    for (const excl of records) {
      if (!Object.prototype.hasOwnProperty.call(sets, excl.entityType))
        continue;
      const set = sets[excl.entityType as ExclusionSetType];
      const instances = excl.instanceId
        ? [excl.instanceId]
        : allowedInstanceIds;
      for (const instanceId of instances) {
        const ref = { id: excl.entityId, instanceId };
        set.set(refKey(ref), ref);
      }
    }
    for (const type of Object.keys(sets) as ExclusionSetType[]) {
      if (!append) await this.createTempSet(tx, EXCLUSION_SET_TABLES[type]);
      await this.fillTempSet(tx, EXCLUSION_SET_TABLES[type], [
        ...sets[type].values(),
      ]);
    }
  }

  /**
   * Compute empty exclusions for organizational entities against the
   * exclusions loadExclusionSets loaded. An entity is "empty" if it has no
   * visible content after those exclusions.
   *
   * Empty rules:
   * - Galleries: 0 visible images
   * - Performers: 0 visible scenes AND 0 visible images
   * - Studios: 0 visible scenes AND 0 visible images
   * - Groups: 0 visible scenes
   * - Tags: not attached to any visible scene, performer, studio, group,
   *   gallery or image, and no live child tag on the same instance
   *
   * With `only`, each query runs just for the listed refs of its type,
   * driving from _peek_refs into the entity's primary key, and a type with
   * no listed refs is skipped.
   *
   * @param userId - User ID
   * @param tx - Transaction client
   * @param only - Restrict the check to these refs
   * @returns Array of empty exclusion records
   */
  private async computeEmptyExclusions(
    userId: number,
    tx: TransactionClient,
    allowedInstanceIds: string[],
    only?: CascadeSource[]
  ): Promise<ExclusionRecord[]> {
    const emptyExclusions: ExclusionRecord[] = [];
    const ex = EXCLUSION_SET_TABLES;

    const onlyByType = new Map<string, Map<string, ResolvedRef>>();
    for (const source of only ?? []) {
      const merged =
        onlyByType.get(source.entityType) ?? new Map<string, ResolvedRef>();
      for (const ref of source.refs) merged.set(refKey(ref), ref);
      onlyByType.set(source.entityType, merged);
    }
    /** The FROM for one query, or null to skip it. Fills _peek_refs. */
    const fromFor = async (
      entityType: string,
      table: string,
      alias: string
    ): Promise<string | null> => {
      if (!only) return `${table} ${alias}`;
      const refs = onlyByType.get(entityType);
      if (!refs || refs.size === 0) return null;
      await this.fillRefs(tx, [...refs.values()]);
      return `${REFS_TABLE} o CROSS JOIN ${table} AS ${alias} ON ${alias}.id = o.id AND ${alias}.stashInstanceId = o.inst`;
    };

    // 1. Empty galleries - galleries with 0 visible images
    const galFilter = buildInstanceFilterClause(
      allowedInstanceIds,
      "g.stashInstanceId"
    );
    const galFrom = await fromFor("gallery", "StashGallery", "g");
    const emptyGalleries = !galFrom
      ? []
      : await tx.$queryRawUnsafe<
          Array<{ galleryId: string; instanceId: string }>
        >(
          `
      SELECT g.id AS galleryId, g.stashInstanceId AS instanceId
      FROM ${galFrom}
      WHERE g.deletedAt IS NULL
      AND ${galFilter.sql}
      AND NOT EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage i ON ig.imageId = i.id AND ig.imageInstanceId = i.stashInstanceId
        WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.image} e WHERE e.id = i.id AND e.inst = i.stashInstanceId)
      )
    `,
          ...galFilter.params
        );

    for (const row of emptyGalleries) {
      emptyExclusions.push({
        userId,
        entityType: "gallery",
        entityId: row.galleryId,
        instanceId: row.instanceId ?? "",
        reason: "empty",
      });
    }

    // 2. Empty performers - performers with 0 visible scenes AND 0 visible images
    const perfFilter = buildInstanceFilterClause(
      allowedInstanceIds,
      "p.stashInstanceId"
    );
    const perfFrom = await fromFor("performer", "StashPerformer", "p");
    const emptyPerformers = !perfFrom
      ? []
      : await tx.$queryRawUnsafe<
          Array<{ performerId: string; instanceId: string }>
        >(
          `
      SELECT p.id AS performerId, p.stashInstanceId AS instanceId
      FROM ${perfFrom}
      WHERE p.deletedAt IS NULL
      AND ${perfFilter.sql}
      AND NOT EXISTS (SELECT 1 FROM ${ex.performer} e WHERE e.id = p.id AND e.inst = p.stashInstanceId)
      AND NOT EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN StashScene s ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        WHERE sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.scene} e WHERE e.id = s.id AND e.inst = s.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImagePerformer ip
        JOIN StashImage i ON ip.imageId = i.id AND ip.imageInstanceId = i.stashInstanceId
        WHERE ip.performerId = p.id AND ip.performerInstanceId = p.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.image} e WHERE e.id = i.id AND e.inst = i.stashInstanceId)
      )
    `,
          ...perfFilter.params
        );

    for (const row of emptyPerformers) {
      emptyExclusions.push({
        userId,
        entityType: "performer",
        entityId: row.performerId,
        instanceId: row.instanceId ?? "",
        reason: "empty",
      });
    }

    // 3. Empty studios - studios with 0 visible scenes AND 0 visible images.
    // The unary + on the instance equality keeps the planner off the
    // stashInstanceId indexes (a scan of every scene and image per studio)
    // and on the studioId indexes.
    const stuFilter = buildInstanceFilterClause(
      allowedInstanceIds,
      "st.stashInstanceId"
    );
    const stuFrom = await fromFor("studio", "StashStudio", "st");
    const emptyStudios = !stuFrom
      ? []
      : await tx.$queryRawUnsafe<
          Array<{ studioId: string; instanceId: string }>
        >(
          `
      SELECT st.id AS studioId, st.stashInstanceId AS instanceId
      FROM ${stuFrom}
      WHERE st.deletedAt IS NULL
      AND ${stuFilter.sql}
      AND NOT EXISTS (SELECT 1 FROM ${ex.studio} e WHERE e.id = st.id AND e.inst = st.stashInstanceId)
      AND NOT EXISTS (
        SELECT 1 FROM StashScene s
        WHERE s.studioId = st.id
          AND +s.stashInstanceId = st.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.scene} e WHERE e.id = s.id AND e.inst = s.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashImage i
        WHERE i.studioId = st.id
          AND +i.stashInstanceId = st.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.image} e WHERE e.id = i.id AND e.inst = i.stashInstanceId)
      )
    `,
          ...stuFilter.params
        );

    for (const row of emptyStudios) {
      emptyExclusions.push({
        userId,
        entityType: "studio",
        entityId: row.studioId,
        instanceId: row.instanceId ?? "",
        reason: "empty",
      });
    }

    // 4. Empty groups - groups with 0 visible scenes
    const grpFilter = buildInstanceFilterClause(
      allowedInstanceIds,
      "g.stashInstanceId"
    );
    const grpFrom = await fromFor("group", "StashGroup", "g");
    const emptyGroups = !grpFrom
      ? []
      : await tx.$queryRawUnsafe<
          Array<{ groupId: string; instanceId: string }>
        >(
          `
      SELECT g.id AS groupId, g.stashInstanceId AS instanceId
      FROM ${grpFrom}
      WHERE g.deletedAt IS NULL
      AND ${grpFilter.sql}
      AND NOT EXISTS (SELECT 1 FROM ${ex.group} e WHERE e.id = g.id AND e.inst = g.stashInstanceId)
      AND NOT EXISTS (
        SELECT 1 FROM SceneGroup sg
        JOIN StashScene s ON sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId
        WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.scene} e WHERE e.id = s.id AND e.inst = s.stashInstanceId)
      )
    `,
          ...grpFilter.params
        );

    for (const row of emptyGroups) {
      emptyExclusions.push({
        userId,
        entityType: "group",
        entityId: row.groupId,
        instanceId: row.instanceId ?? "",
        reason: "empty",
      });
    }

    // 5. Empty tags - tags not attached to any visible scene, performer,
    // studio, group, gallery or image (Q8). Parent tags are exempt through a
    // live child on the tag's own instance (a child on another instance is
    // a different tag that happens to share the id).
    const tagFilter = buildInstanceFilterClause(
      allowedInstanceIds,
      "t.stashInstanceId"
    );
    const tagFrom = await fromFor("tag", "StashTag", "t");
    const emptyTags = !tagFrom
      ? []
      : await tx.$queryRawUnsafe<Array<{ tagId: string; instanceId: string }>>(
          `
      SELECT t.id AS tagId, t.stashInstanceId AS instanceId
      FROM ${tagFrom}
      WHERE t.deletedAt IS NULL
      AND ${tagFilter.sql}
      AND NOT EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN StashScene s ON st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId
        WHERE st.tagId = t.id AND st.tagInstanceId = t.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.scene} e WHERE e.id = s.id AND e.inst = s.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM PerformerTag pt
        JOIN StashPerformer p ON pt.performerId = p.id AND pt.performerInstanceId = p.stashInstanceId
        WHERE pt.tagId = t.id AND pt.tagInstanceId = t.stashInstanceId
          AND p.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.performer} e WHERE e.id = p.id AND e.inst = p.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StudioTag stt
        JOIN StashStudio stu ON stt.studioId = stu.id AND stt.studioInstanceId = stu.stashInstanceId
        WHERE stt.tagId = t.id AND stt.tagInstanceId = t.stashInstanceId
          AND stu.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.studio} e WHERE e.id = stu.id AND e.inst = stu.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM GroupTag grt
        JOIN StashGroup g ON grt.groupId = g.id AND grt.groupInstanceId = g.stashInstanceId
        WHERE grt.tagId = t.id AND grt.tagInstanceId = t.stashInstanceId
          AND g.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.group} e WHERE e.id = g.id AND e.inst = g.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM GalleryTag gt
        JOIN StashGallery gal ON gt.galleryId = gal.id AND gt.galleryInstanceId = gal.stashInstanceId
        WHERE gt.tagId = t.id AND gt.tagInstanceId = t.stashInstanceId
          AND gal.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.gallery} e WHERE e.id = gal.id AND e.inst = gal.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImageTag it
        JOIN StashImage i ON it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId
        WHERE it.tagId = t.id AND it.tagInstanceId = t.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (SELECT 1 FROM ${ex.image} e WHERE e.id = i.id AND e.inst = i.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashTag child
        JOIN json_each(COALESCE(child.parentIds, '[]')) cp ON cp.value = t.id
        WHERE child.deletedAt IS NULL
          AND child.stashInstanceId = t.stashInstanceId
      )
    `,
          ...tagFilter.params
        );

    for (const row of emptyTags) {
      emptyExclusions.push({
        userId,
        entityType: "tag",
        entityId: row.tagId,
        instanceId: row.instanceId ?? "",
        reason: "empty",
      });
    }

    return emptyExclusions;
  }

  /**
   * Update visible entity counts for the user, after the swap has committed:
   * the 8 entity counts and 8 excluded counts are read on the main client
   * outside any unit, then the 8 upserts go in as one batch.
   */
  private async updateEntityStats(
    userId: number,
    allowedInstanceIds: string[]
  ): Promise<void> {
    const visible: Array<{ entityType: string; visibleCount: number }> = [];
    for (const entityType of STATS_ENTITY_TYPES) {
      const total = await this.getEntityCount(entityType, allowedInstanceIds);
      const excluded = await prisma.userExcludedEntity.count({
        where: { userId, entityType },
      });
      visible.push({ entityType, visibleCount: total - excluded });
    }

    await dbWriteBatch(
      "exclusions.stats",
      visible.map(({ entityType, visibleCount }) =>
        prisma.userEntityStats.upsert({
          where: {
            userId_entityType_instanceId: {
              userId,
              entityType,
              instanceId: "",
            },
          },
          create: { userId, entityType, instanceId: "", visibleCount },
          update: { visibleCount },
        })
      )
    );

    logger.debug("updateEntityStats complete", { userId });
  }

  /**
   * Get total count of entities of a given type.
   */
  private async getEntityCount(
    entityType: (typeof STATS_ENTITY_TYPES)[number],
    allowedInstanceIds: string[]
  ): Promise<number> {
    const where = {
      deletedAt: null,
      stashInstanceId: { in: allowedInstanceIds },
    };
    switch (entityType) {
      case "scene":
        return prisma.stashScene.count({ where });
      case "performer":
        return prisma.stashPerformer.count({ where });
      case "studio":
        return prisma.stashStudio.count({ where });
      case "tag":
        return prisma.stashTag.count({ where });
      case "group":
        return prisma.stashGroup.count({ where });
      case "gallery":
        return prisma.stashGallery.count({ where });
      case "image":
        return prisma.stashImage.count({ where });
      case "clip":
        return prisma.stashClip.count({ where });
    }
  }

  /**
   * Incremental update when user hides an entity.
   * Synchronous - user waits for completion.
   * Writes the stored `hidden` row, the rows the hide expands to
   * (descendants, per-instance copies) and the cascades, through the same
   * expandHides and computeCascadeExclusions the full recompute uses, on the
   * same path: a read snapshot on the compute connection, the rows filled
   * into _peek_result, then one INSERT OR IGNORE ... SELECT as the
   * `exclusions.hide` unit. Skips the empty phase and the stats update.
   *
   * The merge only fills missing rows: an existing row keeps its reason, so
   * a restriction already stored for a key is never rewritten as `hidden`
   * (Reason precedence, file header). A hide that arrives during a recompute
   * waits for the compute connection and merges after the swap, so it is
   * never lost under it.
   */
  async addHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
      instanceId,
    });

    // The scope, as the full recompute uses: an instance on its first sync
    // gets the hide's rows before it shows
    const allowedInstanceIds = await getUserInstanceScope(userId);

    await withComputeConnection(async (db) => {
      try {
        // The stored row, its descendants and per-instance copies, and the
        // cascades of every resolved ref
        const records = await readSnapshot(db, async () => {
          const { records: hiddenRecords, refs } = await this.expandHides(
            userId,
            entityType,
            [{ id: entityId, instanceId }],
            db,
            allowedInstanceIds
          );
          const cascades = await this.computeCascadeExclusions(
            userId,
            [{ entityType, refs }],
            db,
            allowedInstanceIds
          );
          return [...hiddenRecords, ...cascades];
        });
        await this.fillResult(db, records);
        await dbWrite("exclusions.hide", () => this.mergeResult(db, userId));
      } finally {
        await this.cleanupTempTables(db);
      }
    }, "exclusions.addHidden");

    logger.info("ExclusionComputationService.addHiddenEntity complete", {
      userId,
      entityType,
      entityId,
      instanceId,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Handle user unhiding an entity.
   * Queues async recompute since cascades need recalculation.
   */
  removeHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string,
    instanceId: string = ""
  ): void {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
      instanceId,
    });

    // Queue async recompute - the unhide might affect cascade exclusions
    // that need to be recalculated based on remaining hidden entities
    setImmediate(() => {
      this.recomputeForUser(userId).catch((err: unknown) => {
        logger.error("Failed to recompute exclusions after unhide", {
          userId,
          entityType,
          entityId,
          error: err,
        });
      });
    });
  }
}

export const exclusionComputationService = new ExclusionComputationService();
