/**
 * ExclusionComputationService
 *
 * Computes and maintains the UserExcludedEntity table which stores
 * pre-computed exclusions for each user. This enables efficient
 * JOIN-based filtering instead of loading exclusions into memory.
 *
 * Exclusion sources:
 * - UserContentRestriction (admin restrictions) -> reason='restricted'
 * - UserHiddenEntity (user hidden items) -> reason='hidden'
 * - Cascades from hidden entities -> reason='cascade'
 * - Empty organizational entities -> reason='empty'
 */

import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Transaction client type for Prisma operations within transactions
 */
type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Maps plural entity types from UserContentRestriction to singular types
 * used in UserExcludedEntity
 */
const ENTITY_TYPE_MAP: Record<string, string> = {
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
  instanceId?: string;
  reason: string;
}

/** Source exclusion with entityId and instanceId for global/scoped split */
interface ScopedExclusion {
  entityId: string;
  instanceId: string;
}

/**
 * Split exclusions into global (empty instanceId → all instances) and
 * instance-scoped (non-empty instanceId → that instance only).
 */
function splitGlobalScoped(excluded: ScopedExclusion[]) {
  return {
    globalIds: excluded.filter(e => !e.instanceId).map(e => e.entityId),
    scoped: excluded.filter(e => e.instanceId),
  };
}

/**
 * Result of recomputing exclusions for all users.
 */
interface RecomputeAllResult {
  success: number;
  failed: number;
  errors: Array<{ userId: number; error: string }>;
}

class ExclusionComputationService {
  // Track pending recomputes to prevent race conditions
  private pendingRecomputes = new Map<number, Promise<void>>();

  /**
   * Full recompute for a user.
   * Computation runs in phases outside transactions; only the final
   * DELETE+INSERT swap is atomic. If the write phase fails, previous
   * exclusions are preserved.
   * Prevents concurrent recomputes for the same user.
   */
  async recomputeForUser(userId: number): Promise<void> {
    // If there's already a pending recompute for this user, wait for it
    const pending = this.pendingRecomputes.get(userId);
    if (pending) {
      logger.info("ExclusionComputationService.recomputeForUser already pending, waiting", { userId });
      await pending;
      return;
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
   * - Phases 1-2 (read-heavy computation) run outside any transaction
   * - Phase 3 (empty exclusions with temp tables) runs in its own transaction
   *   for connection affinity (temp tables are per-connection in SQLite)
   * - Only the final atomic swap (DELETE + INSERT + stats) runs in a short
   *   write transaction
   */
  private async doRecomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });
    const t0 = Date.now();

    // === COMPUTATION PHASE (outside transaction — read-heavy, no write locks) ===

    // Phase 1: Compute direct exclusions (reads UserContentRestriction + UserHiddenEntity)
    const directExclusions = await this.computeDirectExclusions(userId, prisma);
    const t1 = Date.now();

    // Phase 2: Compute cascade exclusions (reads junction tables)
    const cascadeExclusions = await this.computeCascadeExclusions(userId, directExclusions, prisma);
    const t2 = Date.now();

    // Phase 3: Compute empty exclusions (uses temp tables for performance)
    // No transaction needed: Prisma's SQLite driver uses connection_limit=1, so all queries
    // share the same connection and temp tables persist across sequential raw queries.
    // Avoiding a transaction here prevents holding a write lock during the 10-30s computation.
    const previousExclusions = [...directExclusions, ...cascadeExclusions];
    const emptyExclusions = await this.computeEmptyExclusions(userId, previousExclusions, prisma);
    const t3 = Date.now();

    // Combine all exclusions and deduplicate
    // An entity can be excluded via multiple paths (e.g., cascade from performer + cascade from tag)
    // but we only need one record per (userId, entityType, entityId)
    const allExclusionsRaw = [...directExclusions, ...cascadeExclusions, ...emptyExclusions];
    const seen = new Set<string>();
    const allExclusions: ExclusionRecord[] = [];
    for (const excl of allExclusionsRaw) {
      const key = `${excl.entityType}:${excl.entityId}:${excl.instanceId || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        allExclusions.push(excl);
      }
    }

    // === WRITE PHASE (short transaction — only the atomic swap) ===

    await prisma.$transaction(async (tx) => {
      // Delete existing exclusions for this user
      await tx.userExcludedEntity.deleteMany({
        where: { userId },
      });

      // Insert new exclusions if any exist
      if (allExclusions.length > 0) {
        await tx.userExcludedEntity.createMany({
          data: allExclusions,
        });
      }

      // Phase 4: Update entity stats
      await this.updateEntityStats(userId, tx);
    }, {
      timeout: 30000,
    });
    const t4 = Date.now();

    logger.info("ExclusionComputationService.recomputeForUser completed", {
      userId,
      totalExclusions: allExclusions.length,
      timing: {
        directMs: t1 - t0,
        cascadeMs: t2 - t1,
        emptyMs: t3 - t2,
        writeMs: t4 - t3,
        totalMs: t4 - t0,
      },
    });
  }

  /**
   * Recompute exclusions for all users.
   * Called after Stash sync completes.
   * @returns Result with success/failure counts and error details
   */
  async recomputeAllUsers(): Promise<RecomputeAllResult> {
    logger.info("ExclusionComputationService.recomputeAllUsers starting");

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ userId: number; error: string }>,
    };

    for (const user of users) {
      try {
        await this.recomputeForUser(user.id);
        result.success++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to recompute exclusions for user", {
          userId: user.id,
          error: errorMessage,
        });
        result.failed++;
        result.errors.push({ userId: user.id, error: errorMessage });
        // Continue with other users even if one fails
      }
    }

    logger.info("ExclusionComputationService.recomputeAllUsers completed", {
      userCount: users.length,
      success: result.success,
      failed: result.failed,
    });

    return result;
  }

  /**
   * Compute direct exclusions from UserContentRestriction and UserHiddenEntity.
   * @returns Array of exclusion records to insert
   */
  private async computeDirectExclusions(
    userId: number,
    tx: TransactionClient
  ): Promise<ExclusionRecord[]> {
    const exclusions: ExclusionRecord[] = [];

    // Get user's content restrictions
    const restrictions = await tx.userContentRestriction.findMany({
      where: { userId },
    });

    // Process each restriction
    for (const restriction of restrictions) {
      const entityIds: string[] = JSON.parse(restriction.entityIds);
      const singularType = ENTITY_TYPE_MAP[restriction.entityType] || restriction.entityType;

      if (restriction.mode === "EXCLUDE") {
        // EXCLUDE mode: directly exclude these entities
        for (const entityId of entityIds) {
          exclusions.push({
            userId,
            entityType: singularType,
            entityId,
            reason: "restricted",
          });
        }
      } else if (restriction.mode === "INCLUDE") {
        // INCLUDE mode: exclude everything NOT in the list
        const allEntityIds = await this.getAllEntityIds(restriction.entityType, tx);
        const includeSet = new Set(entityIds);

        for (const entityId of allEntityIds) {
          if (!includeSet.has(entityId)) {
            exclusions.push({
              userId,
              entityType: singularType,
              entityId,
              reason: "restricted",
            });
          }
        }
      }
    }

    // Get user's hidden entities
    const hiddenEntities = await tx.userHiddenEntity.findMany({
      where: { userId },
    });

    // Add hidden entities to exclusions (with instanceId for multi-instance scoping)
    for (const hidden of hiddenEntities) {
      exclusions.push({
        userId,
        entityType: hidden.entityType,
        entityId: hidden.entityId,
        instanceId: hidden.instanceId || "",
        reason: "hidden",
      });
    }

    return exclusions;
  }

  /**
   * Helper: cascade exclusions via a junction table, handling global/scoped split.
   *
   * Global exclusions (empty instanceId) query by source ID only.
   * Scoped exclusions query by source ID + instance ID, propagating
   * the target's instanceId to the cascade record.
   */
  private async cascadeViaJunction(
    excluded: ScopedExclusion[],
    tx: TransactionClient,
    junctionDelegate: { findMany: (args: { where: Record<string, unknown>; select: Record<string, boolean> }) => Promise<Record<string, string>[]> },
    sourceIdField: string,
    sourceInstanceField: string,
    targetIdField: string,
    targetInstanceField: string,
    targetEntityType: string,
    addCascade: (type: string, id: string, instanceId?: string) => void,
  ): Promise<void> {
    const { globalIds, scoped } = splitGlobalScoped(excluded);

    if (globalIds.length > 0) {
      const results = await junctionDelegate.findMany({
        where: { [sourceIdField]: { in: globalIds } },
        select: { [targetIdField]: true },
      });
      for (const r of results) addCascade(targetEntityType, r[targetIdField]);
    }
    if (scoped.length > 0) {
      const results = await junctionDelegate.findMany({
        where: {
          OR: scoped.map(e => ({
            [sourceIdField]: e.entityId,
            [sourceInstanceField]: e.instanceId,
          })),
        },
        select: { [targetIdField]: true, [targetInstanceField]: true },
      });
      for (const r of results) addCascade(targetEntityType, r[targetIdField], r[targetInstanceField]);
    }
  }

  /**
   * Compute cascade exclusions based on direct exclusions.
   * When an entity is excluded, related entities should also be cascade-excluded.
   *
   * Cascade rules:
   * - Performer -> Scenes: All scenes with the performer
   * - Studio -> Scenes: All scenes from the studio
   * - Tag -> Scenes/Performers/Studios/Groups: Entities tagged with the tag (direct + inherited)
   * - Group -> Scenes: All scenes in the group
   * - Gallery -> Scenes/Images: Linked scenes and images in the gallery
   *
   * @returns Array of cascade exclusion records to insert
   */
  private async computeCascadeExclusions(
    userId: number,
    directExclusions: ExclusionRecord[],
    tx: TransactionClient
  ): Promise<ExclusionRecord[]> {
    const cascadeExclusions: ExclusionRecord[] = [];
    const seen = new Set<string>();

    // Helper to add cascade exclusion if not already seen (with optional instance scoping)
    const addCascade = (entityType: string, entityId: string, instanceId?: string) => {
      const key = `${entityType}:${entityId}:${instanceId || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        cascadeExclusions.push({
          userId,
          entityType,
          entityId,
          instanceId: instanceId || '',
          reason: "cascade",
        });
      }
    };

    // Group direct exclusions by entity type, preserving instanceId for scoping
    // Global exclusions (empty instanceId from UserContentRestriction) cascade to all instances
    // Scoped exclusions (non-empty instanceId from UserHiddenEntity) cascade only within that instance
    const excludedPerformers: Array<{ entityId: string; instanceId: string }> = [];
    const excludedStudios: Array<{ entityId: string; instanceId: string }> = [];
    const excludedTags: Array<{ entityId: string; instanceId: string }> = [];
    const excludedGroups: Array<{ entityId: string; instanceId: string }> = [];
    const excludedGalleries: Array<{ entityId: string; instanceId: string }> = [];

    for (const excl of directExclusions) {
      const ref = { entityId: excl.entityId, instanceId: excl.instanceId || '' };
      switch (excl.entityType) {
        case "performer":
          excludedPerformers.push(ref);
          break;
        case "studio":
          excludedStudios.push(ref);
          break;
        case "tag":
          excludedTags.push(ref);
          break;
        case "group":
          excludedGroups.push(ref);
          break;
        case "gallery":
          excludedGalleries.push(ref);
          break;
      }
    }

    // 1. Performer -> Scenes
    if (excludedPerformers.length > 0) {
      await this.cascadeViaJunction(
        excludedPerformers, tx, tx.scenePerformer,
        "performerId", "performerInstanceId",
        "sceneId", "sceneInstanceId",
        "scene", addCascade
      );
    }

    // 2. Studio -> Scenes (direct column, not junction table — needs deletedAt filter)
    if (excludedStudios.length > 0) {
      const { globalIds, scoped } = splitGlobalScoped(excludedStudios);

      if (globalIds.length > 0) {
        const scenes = await tx.stashScene.findMany({
          where: { studioId: { in: globalIds }, deletedAt: null },
          select: { id: true },
        });
        for (const s of scenes) addCascade("scene", s.id);
      }
      if (scoped.length > 0) {
        const scenes = await tx.stashScene.findMany({
          where: {
            OR: scoped.map(e => ({
              studioId: e.entityId,
              stashInstanceId: e.instanceId,
            })),
            deletedAt: null,
          },
          select: { id: true, stashInstanceId: true },
        });
        for (const s of scenes) addCascade("scene", s.id, s.stashInstanceId);
      }
    }

    // 3. Tag -> Scenes/Performers/Studios/Groups
    if (excludedTags.length > 0) {
      const { globalIds, scoped } = splitGlobalScoped(excludedTags);

      // 3a. Scenes with direct tag
      await this.cascadeViaJunction(
        excludedTags, tx, tx.sceneTag,
        "tagId", "tagInstanceId",
        "sceneId", "sceneInstanceId",
        "scene", addCascade
      );

      // 3b. Scenes with inherited tag (via inheritedTagIds JSON column — raw SQL required)
      if (globalIds.length > 0) {
        const tagList = globalIds.map(t => `'${t}'`).join(",");
        const inheritedScenes = await tx.$queryRaw`
          SELECT DISTINCT s.id FROM StashScene s
          WHERE s.deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(s.inheritedTagIds) je
            WHERE je.value IN (${Prisma.raw(tagList)})
          )
        ` as Array<{ id: string }>;
        for (const s of inheritedScenes) addCascade("scene", s.id);
      }
      if (scoped.length > 0) {
        const scopedByInstance = new Map<string, string[]>();
        for (const st of scoped) {
          const list = scopedByInstance.get(st.instanceId) || [];
          list.push(st.entityId);
          scopedByInstance.set(st.instanceId, list);
        }
        for (const [instId, tagIds] of scopedByInstance) {
          const tagList = tagIds.map(t => `'${t}'`).join(",");
          const inheritedScenes = await tx.$queryRaw`
            SELECT DISTINCT s.id FROM StashScene s
            WHERE s.deletedAt IS NULL
            AND s.stashInstanceId = ${instId}
            AND EXISTS (
              SELECT 1 FROM json_each(s.inheritedTagIds) je
              WHERE je.value IN (${Prisma.raw(tagList)})
            )
          ` as Array<{ id: string }>;
          for (const s of inheritedScenes) addCascade("scene", s.id, instId);
        }
      }

      // 3c. Performers with tag
      await this.cascadeViaJunction(
        excludedTags, tx, tx.performerTag,
        "tagId", "tagInstanceId",
        "performerId", "performerInstanceId",
        "performer", addCascade
      );

      // 3d. Studios with tag
      await this.cascadeViaJunction(
        excludedTags, tx, tx.studioTag,
        "tagId", "tagInstanceId",
        "studioId", "studioInstanceId",
        "studio", addCascade
      );

      // 3e. Groups with tag
      await this.cascadeViaJunction(
        excludedTags, tx, tx.groupTag,
        "tagId", "tagInstanceId",
        "groupId", "groupInstanceId",
        "group", addCascade
      );
    }

    // 4. Group -> Scenes
    if (excludedGroups.length > 0) {
      await this.cascadeViaJunction(
        excludedGroups, tx, tx.sceneGroup,
        "groupId", "groupInstanceId",
        "sceneId", "sceneInstanceId",
        "scene", addCascade
      );
    }

    // 5. Gallery -> Scenes/Images
    if (excludedGalleries.length > 0) {
      // 5a. Linked scenes
      await this.cascadeViaJunction(
        excludedGalleries, tx, tx.sceneGallery,
        "galleryId", "galleryInstanceId",
        "sceneId", "sceneInstanceId",
        "scene", addCascade
      );

      // 5b. Images in gallery
      await this.cascadeViaJunction(
        excludedGalleries, tx, tx.imageGallery,
        "galleryId", "galleryInstanceId",
        "imageId", "imageInstanceId",
        "image", addCascade
      );
    }

    return cascadeExclusions;
  }

  /**
   * Compute empty exclusions for organizational entities.
   * An entity is "empty" if it has no visible content after direct and cascade exclusions.
   *
   * Empty rules:
   * - Galleries: 0 visible images
   * - Performers: 0 visible scenes AND 0 visible images
   * - Studios: 0 visible scenes AND 0 visible images
   * - Groups: 0 visible scenes
   * - Tags: not attached to any visible scene, performer, studio, or group
   *
   * Note: We check against priorExclusions in-memory rather than querying
   * UserExcludedEntity because new exclusions haven't been written yet
   * (they are being computed), so the DB still contains the old set.
   *
   * @param userId - User ID
   * @param priorExclusions - Direct + cascade exclusions already computed
   * @param tx - Transaction client
   * @returns Array of empty exclusion records
   */
  private async computeEmptyExclusions(
    userId: number,
    priorExclusions: ExclusionRecord[],
    tx: TransactionClient
  ): Promise<ExclusionRecord[]> {
    const emptyExclusions: ExclusionRecord[] = [];

    // Track excluded entities with instanceId for multi-instance-aware temp tables
    const excludedScenes: Array<{ entityId: string; instanceId: string }> = [];
    const excludedImages: Array<{ entityId: string; instanceId: string }> = [];
    const excludedPerformers: Array<{ entityId: string; instanceId: string }> = [];
    const excludedStudios: Array<{ entityId: string; instanceId: string }> = [];
    const excludedGroups: Array<{ entityId: string; instanceId: string }> = [];

    for (const excl of priorExclusions) {
      const ref = { entityId: excl.entityId, instanceId: excl.instanceId || '' };
      switch (excl.entityType) {
        case "scene":
          excludedScenes.push(ref);
          break;
        case "image":
          excludedImages.push(ref);
          break;
        case "performer":
          excludedPerformers.push(ref);
          break;
        case "studio":
          excludedStudios.push(ref);
          break;
        case "group":
          excludedGroups.push(ref);
          break;
      }
    }

    // 1. Empty galleries - galleries with 0 visible images
    // Use a temporary table to avoid loading all relationships into memory
    // Create temp table with excluded image IDs
    await tx.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS temp_excluded_images (imageId TEXT, instanceId TEXT DEFAULT '', PRIMARY KEY (imageId, instanceId))
    `;
    await tx.$executeRaw`DELETE FROM temp_excluded_images`;
    if (excludedImages.length > 0) {
      await tx.$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_images (imageId, instanceId) VALUES ${excludedImages.map(e => `('${e.entityId}','${e.instanceId}')`).join(',')}
      `));
    }

    // Query for empty galleries using temp table
    const emptyGalleries = await tx.$queryRaw`
      SELECT g.id as galleryId
      FROM StashGallery g
      WHERE g.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage i ON ig.imageId = i.id AND ig.imageInstanceId = i.stashInstanceId
        WHERE ig.galleryId = g.id AND ig.galleryInstanceId = g.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_images te
            WHERE te.imageId = i.id
            AND (te.instanceId = '' OR te.instanceId = i.stashInstanceId)
          )
      )
    ` as Array<{ galleryId: string }>;

    for (const row of emptyGalleries) {
      emptyExclusions.push({
        userId,
        entityType: "gallery",
        entityId: row.galleryId,
        instanceId: "",
        reason: "empty",
      });
    }

    // 2. Empty performers - performers with 0 visible scenes AND 0 visible images
    // Create temp tables for excluded entities
    await tx.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS temp_excluded_scenes (sceneId TEXT, instanceId TEXT DEFAULT '', PRIMARY KEY (sceneId, instanceId))
    `;
    await tx.$executeRaw`DELETE FROM temp_excluded_scenes`;
    if (excludedScenes.length > 0) {
      await tx.$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_scenes (sceneId, instanceId) VALUES ${excludedScenes.map(e => `('${e.entityId}','${e.instanceId}')`).join(',')}
      `));
    }

    await tx.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS temp_excluded_performers (performerId TEXT, instanceId TEXT DEFAULT '', PRIMARY KEY (performerId, instanceId))
    `;
    await tx.$executeRaw`DELETE FROM temp_excluded_performers`;
    if (excludedPerformers.length > 0) {
      await tx.$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_performers (performerId, instanceId) VALUES ${excludedPerformers.map(e => `('${e.entityId}','${e.instanceId}')`).join(',')}
      `));
    }

    // Query for empty performers
    const emptyPerformers = await tx.$queryRaw`
      SELECT p.id as performerId
      FROM StashPerformer p
      WHERE p.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM temp_excluded_performers te
        WHERE te.performerId = p.id
        AND (te.instanceId = '' OR te.instanceId = p.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN StashScene s ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        WHERE sp.performerId = p.id AND sp.performerInstanceId = p.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_scenes te
            WHERE te.sceneId = s.id
            AND (te.instanceId = '' OR te.instanceId = s.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImagePerformer ip
        JOIN StashImage i ON ip.imageId = i.id AND ip.imageInstanceId = i.stashInstanceId
        WHERE ip.performerId = p.id AND ip.performerInstanceId = p.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_images te
            WHERE te.imageId = i.id
            AND (te.instanceId = '' OR te.instanceId = i.stashInstanceId)
          )
      )
    ` as Array<{ performerId: string }>;

    for (const row of emptyPerformers) {
      emptyExclusions.push({
        userId,
        entityType: "performer",
        entityId: row.performerId,
        instanceId: "",
        reason: "empty",
      });
    }

    // 3. Empty studios - studios with 0 visible scenes AND 0 visible images
    await tx.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS temp_excluded_studios (studioId TEXT, instanceId TEXT DEFAULT '', PRIMARY KEY (studioId, instanceId))
    `;
    await tx.$executeRaw`DELETE FROM temp_excluded_studios`;
    if (excludedStudios.length > 0) {
      await tx.$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_studios (studioId, instanceId) VALUES ${excludedStudios.map(e => `('${e.entityId}','${e.instanceId}')`).join(',')}
      `));
    }

    const emptyStudios = await tx.$queryRaw`
      SELECT st.id as studioId
      FROM StashStudio st
      WHERE st.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM temp_excluded_studios te
        WHERE te.studioId = st.id
        AND (te.instanceId = '' OR te.instanceId = st.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashScene s
        WHERE s.studioId = st.id
          AND s.stashInstanceId = st.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_scenes te
            WHERE te.sceneId = s.id
            AND (te.instanceId = '' OR te.instanceId = s.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashImage i
        WHERE i.studioId = st.id
          AND i.stashInstanceId = st.stashInstanceId
          AND i.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_images te
            WHERE te.imageId = i.id
            AND (te.instanceId = '' OR te.instanceId = i.stashInstanceId)
          )
      )
    ` as Array<{ studioId: string }>;

    for (const row of emptyStudios) {
      emptyExclusions.push({
        userId,
        entityType: "studio",
        entityId: row.studioId,
        instanceId: "",
        reason: "empty",
      });
    }

    // 4. Empty groups - groups with 0 visible scenes
    await tx.$executeRaw`
      CREATE TEMP TABLE IF NOT EXISTS temp_excluded_groups (groupId TEXT, instanceId TEXT DEFAULT '', PRIMARY KEY (groupId, instanceId))
    `;
    await tx.$executeRaw`DELETE FROM temp_excluded_groups`;
    if (excludedGroups.length > 0) {
      await tx.$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_groups (groupId, instanceId) VALUES ${excludedGroups.map(e => `('${e.entityId}','${e.instanceId}')`).join(',')}
      `));
    }

    const emptyGroups = await tx.$queryRaw`
      SELECT g.id as groupId
      FROM StashGroup g
      WHERE g.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM temp_excluded_groups te
        WHERE te.groupId = g.id
        AND (te.instanceId = '' OR te.instanceId = g.stashInstanceId)
      )
      AND NOT EXISTS (
        SELECT 1 FROM SceneGroup sg
        JOIN StashScene s ON sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId
        WHERE sg.groupId = g.id AND sg.groupInstanceId = g.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_scenes te
            WHERE te.sceneId = s.id
            AND (te.instanceId = '' OR te.instanceId = s.stashInstanceId)
          )
      )
    ` as Array<{ groupId: string }>;

    for (const row of emptyGroups) {
      emptyExclusions.push({
        userId,
        entityType: "group",
        entityId: row.groupId,
        instanceId: "",
        reason: "empty",
      });
    }

    // 5. Empty tags - tags not attached to any visible scene, performer, studio, or group
    // BUT exclude parent/organizational tags (tags that have children) since they're used for hierarchy
    const emptyTags = await tx.$queryRaw`
      SELECT t.id as tagId
      FROM StashTag t
      WHERE t.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN StashScene s ON st.sceneId = s.id AND st.sceneInstanceId = s.stashInstanceId
        WHERE st.tagId = t.id AND st.tagInstanceId = t.stashInstanceId
          AND s.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_scenes te
            WHERE te.sceneId = s.id
            AND (te.instanceId = '' OR te.instanceId = s.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM PerformerTag pt
        JOIN StashPerformer p ON pt.performerId = p.id AND pt.performerInstanceId = p.stashInstanceId
        WHERE pt.tagId = t.id AND pt.tagInstanceId = t.stashInstanceId
          AND p.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_performers te
            WHERE te.performerId = p.id
            AND (te.instanceId = '' OR te.instanceId = p.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM StudioTag stt
        JOIN StashStudio stu ON stt.studioId = stu.id AND stt.studioInstanceId = stu.stashInstanceId
        WHERE stt.tagId = t.id AND stt.tagInstanceId = t.stashInstanceId
          AND stu.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_studios te
            WHERE te.studioId = stu.id
            AND (te.instanceId = '' OR te.instanceId = stu.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM GroupTag gt
        JOIN StashGroup g ON gt.groupId = g.id AND gt.groupInstanceId = g.stashInstanceId
        WHERE gt.tagId = t.id AND gt.tagInstanceId = t.stashInstanceId
          AND g.deletedAt IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM temp_excluded_groups te
            WHERE te.groupId = g.id
            AND (te.instanceId = '' OR te.instanceId = g.stashInstanceId)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashTag child
        WHERE child.deletedAt IS NULL
          AND child.parentIds LIKE '%"' || t.id || '"%'
      )
    ` as Array<{ tagId: string }>;

    for (const row of emptyTags) {
      emptyExclusions.push({
        userId,
        entityType: "tag",
        entityId: row.tagId,
        instanceId: "",
        reason: "empty",
      });
    }

    // Clean up temporary tables
    await tx.$executeRaw`DROP TABLE IF EXISTS temp_excluded_images`;
    await tx.$executeRaw`DROP TABLE IF EXISTS temp_excluded_scenes`;
    await tx.$executeRaw`DROP TABLE IF EXISTS temp_excluded_performers`;
    await tx.$executeRaw`DROP TABLE IF EXISTS temp_excluded_studios`;
    await tx.$executeRaw`DROP TABLE IF EXISTS temp_excluded_groups`;

    return emptyExclusions;
  }

  /**
   * Update visible entity counts for the user.
   * Called at the end of recomputeForUser after all exclusions are computed.
   */
  private async updateEntityStats(
    userId: number,
    tx: TransactionClient
  ): Promise<void> {
    const entityTypes = ["scene", "performer", "studio", "tag", "group", "gallery", "image", "clip"];

    for (const entityType of entityTypes) {
      const total = await this.getEntityCount(entityType, tx);
      const excluded = await tx.userExcludedEntity.count({
        where: { userId, entityType },
      });

      await tx.userEntityStats.upsert({
        where: { userId_entityType_instanceId: { userId, entityType, instanceId: "" } },
        create: { userId, entityType, instanceId: "", visibleCount: total - excluded },
        update: { visibleCount: total - excluded },
      });
    }

    logger.debug("updateEntityStats complete", { userId });
  }

  /**
   * Get total count of entities of a given type.
   */
  private async getEntityCount(
    entityType: string,
    tx: TransactionClient
  ): Promise<number> {
    switch (entityType) {
      case "scene":
        return tx.stashScene.count({ where: { deletedAt: null } });
      case "performer":
        return tx.stashPerformer.count({ where: { deletedAt: null } });
      case "studio":
        return tx.stashStudio.count({ where: { deletedAt: null } });
      case "tag":
        return tx.stashTag.count({ where: { deletedAt: null } });
      case "group":
        return tx.stashGroup.count({ where: { deletedAt: null } });
      case "gallery":
        return tx.stashGallery.count({ where: { deletedAt: null } });
      case "image":
        return tx.stashImage.count({ where: { deletedAt: null } });
      case "clip":
        return tx.stashClip.count({ where: { deletedAt: null } });
      default:
        return 0;
    }
  }

  /**
   * Get all entity IDs for a given entity type from the database.
   * Used for INCLUDE mode inversion.
   */
  private async getAllEntityIds(
    entityType: string,
    tx: TransactionClient
  ): Promise<string[]> {
    switch (entityType) {
      case "tags": {
        const tags = await tx.stashTag.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        return tags.map((t) => t.id);
      }
      case "studios": {
        const studios = await tx.stashStudio.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        return studios.map((s) => s.id);
      }
      case "groups": {
        const groups = await tx.stashGroup.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        return groups.map((g) => g.id);
      }
      case "galleries": {
        const galleries = await tx.stashGallery.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        return galleries.map((g) => g.id);
      }
      default:
        logger.warn("Unknown entity type for getAllEntityIds", { entityType });
        return [];
    }
  }

  /**
   * Incremental update when user hides an entity.
   * Synchronous - user waits for completion.
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

    await prisma.$transaction(async (tx) => {
      // Add the direct exclusion
      await tx.userExcludedEntity.upsert({
        where: {
          userId_entityType_entityId_instanceId: { userId, entityType, entityId, instanceId },
        },
        create: { userId, entityType, entityId, instanceId, reason: "hidden" },
        update: { reason: "hidden" },
      });

      // Compute cascades for this specific entity (scoped to instance when provided)
      await this.addCascadesForEntity(tx, userId, entityType, entityId, instanceId || undefined);
    }, {
      timeout: 30000, // 30 seconds for hide operation
    });

    logger.info("ExclusionComputationService.addHiddenEntity complete", {
      userId,
      entityType,
      entityId,
      instanceId,
      durationMs: Date.now() - startTime,
    });
  }

  /**
   * Compute and add cascade exclusions for a single entity.
   * Similar logic to computeCascadeExclusions but for a single entity.
   */
  private async addCascadesForEntity(
    tx: TransactionClient,
    userId: number,
    entityType: string,
    entityId: string,
    instanceId?: string
  ): Promise<void> {
    const cascadeExclusions: Prisma.UserExcludedEntityCreateManyInput[] = [];

    switch (entityType) {
      case "performer": {
        // Performer -> Scenes
        const where = instanceId
          ? { performerId: entityId, performerInstanceId: instanceId }
          : { performerId: entityId };
        const scenePerformers = await tx.scenePerformer.findMany({
          where,
          select: { sceneId: true, sceneInstanceId: true },
        });
        for (const sp of scenePerformers) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sp.sceneId,
            instanceId: instanceId ? sp.sceneInstanceId : "",
            reason: "cascade",
          });
        }
        break;
      }

      case "studio": {
        // Studio -> Scenes
        const where = instanceId
          ? { studioId: entityId, stashInstanceId: instanceId, deletedAt: null }
          : { studioId: entityId, deletedAt: null };
        const studioScenes = await tx.stashScene.findMany({
          where,
          select: { id: true, stashInstanceId: true },
        });
        for (const scene of studioScenes) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: scene.id,
            instanceId: instanceId ? scene.stashInstanceId : "",
            reason: "cascade",
          });
        }
        break;
      }

      case "tag": {
        // Tag -> Scenes (direct)
        const tagWhere = instanceId
          ? { tagId: entityId, tagInstanceId: instanceId }
          : { tagId: entityId };
        const sceneTags = await tx.sceneTag.findMany({
          where: tagWhere,
          select: { sceneId: true, sceneInstanceId: true },
        });
        for (const st of sceneTags) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: st.sceneId,
            instanceId: instanceId ? st.sceneInstanceId : "",
            reason: "cascade",
          });
        }

        // Tag -> Scenes (inherited via inheritedTagIds JSON column)
        const inheritedScenes = instanceId
          ? await tx.$queryRawUnsafe(
              `SELECT id FROM StashScene WHERE deletedAt IS NULL AND stashInstanceId = ? AND EXISTS (SELECT 1 FROM json_each(inheritedTagIds) WHERE json_each.value = ?)`,
              instanceId, entityId
            ) as Array<{ id: string }>
          : await tx.$queryRawUnsafe(
              `SELECT id FROM StashScene WHERE deletedAt IS NULL AND EXISTS (SELECT 1 FROM json_each(inheritedTagIds) WHERE json_each.value = ?)`,
              entityId
            ) as Array<{ id: string }>;
        for (const scene of inheritedScenes) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: scene.id,
            instanceId: instanceId || "",
            reason: "cascade",
          });
        }

        // Tag -> Performers
        const perfTagWhere = instanceId
          ? { tagId: entityId, tagInstanceId: instanceId }
          : { tagId: entityId };
        const performerTags = await tx.performerTag.findMany({
          where: perfTagWhere,
          select: { performerId: true, performerInstanceId: true },
        });
        for (const pt of performerTags) {
          cascadeExclusions.push({
            userId,
            entityType: "performer",
            entityId: pt.performerId,
            instanceId: instanceId ? pt.performerInstanceId : "",
            reason: "cascade",
          });
        }

        // Tag -> Studios
        const studioTagWhere = instanceId
          ? { tagId: entityId, tagInstanceId: instanceId }
          : { tagId: entityId };
        const studioTags = await tx.studioTag.findMany({
          where: studioTagWhere,
          select: { studioId: true, studioInstanceId: true },
        });
        for (const st of studioTags) {
          cascadeExclusions.push({
            userId,
            entityType: "studio",
            entityId: st.studioId,
            instanceId: instanceId ? st.studioInstanceId : "",
            reason: "cascade",
          });
        }

        // Tag -> Groups
        const groupTagWhere = instanceId
          ? { tagId: entityId, tagInstanceId: instanceId }
          : { tagId: entityId };
        const groupTags = await tx.groupTag.findMany({
          where: groupTagWhere,
          select: { groupId: true, groupInstanceId: true },
        });
        for (const gt of groupTags) {
          cascadeExclusions.push({
            userId,
            entityType: "group",
            entityId: gt.groupId,
            instanceId: instanceId ? gt.groupInstanceId : "",
            reason: "cascade",
          });
        }
        break;
      }

      case "group": {
        // Group -> Scenes
        const where = instanceId
          ? { groupId: entityId, groupInstanceId: instanceId }
          : { groupId: entityId };
        const sceneGroups = await tx.sceneGroup.findMany({
          where,
          select: { sceneId: true, sceneInstanceId: true },
        });
        for (const sg of sceneGroups) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sg.sceneId,
            instanceId: instanceId ? sg.sceneInstanceId : "",
            reason: "cascade",
          });
        }
        break;
      }

      case "gallery": {
        // Gallery -> Scenes
        const gallerySceneWhere = instanceId
          ? { galleryId: entityId, galleryInstanceId: instanceId }
          : { galleryId: entityId };
        const sceneGalleries = await tx.sceneGallery.findMany({
          where: gallerySceneWhere,
          select: { sceneId: true, sceneInstanceId: true },
        });
        for (const sg of sceneGalleries) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sg.sceneId,
            instanceId: instanceId ? sg.sceneInstanceId : "",
            reason: "cascade",
          });
        }

        // Gallery -> Images
        const galleryImageWhere = instanceId
          ? { galleryId: entityId, galleryInstanceId: instanceId }
          : { galleryId: entityId };
        const imageGalleries = await tx.imageGallery.findMany({
          where: galleryImageWhere,
          select: { imageId: true, imageInstanceId: true },
        });
        for (const ig of imageGalleries) {
          cascadeExclusions.push({
            userId,
            entityType: "image",
            entityId: ig.imageId,
            instanceId: instanceId ? ig.imageInstanceId : "",
            reason: "cascade",
          });
        }
        break;
      }
    }

    // Insert cascade exclusions if any
    // SQLite doesn't support skipDuplicates, so we use individual upserts
    if (cascadeExclusions.length > 0) {
      await Promise.all(
        cascadeExclusions.map((exclusion) =>
          tx.userExcludedEntity.upsert({
            where: {
              userId_entityType_entityId_instanceId: {
                userId: exclusion.userId,
                entityType: exclusion.entityType,
                entityId: exclusion.entityId,
                instanceId: exclusion.instanceId || "",
              },
            },
            create: { ...exclusion, instanceId: exclusion.instanceId || "" },
            update: {}, // No update needed - just ensure it exists
          })
        )
      );
    }
  }

  /**
   * Handle user unhiding an entity.
   * Queues async recompute since cascades need recalculation.
   */
  async removeHiddenEntity(
    userId: number,
    entityType: string,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
      instanceId,
    });

    // Queue async recompute - the unhide might affect cascade exclusions
    // that need to be recalculated based on remaining hidden entities
    setImmediate(() => {
      this.recomputeForUser(userId).catch((err) => {
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
