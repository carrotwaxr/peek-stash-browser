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
  reason: string;
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
   * Runs in a transaction - if any phase fails, previous exclusions are preserved.
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
   */
  private async doRecomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });

    // Use a longer timeout for large datasets (120 seconds)
    // The default 5-second timeout is too short for users with many entities
    await prisma.$transaction(async (tx) => {
      // Phase 1: Compute direct exclusions (restrictions + hidden)
      const directExclusions = await this.computeDirectExclusions(userId, tx);

      // Phase 2: Compute cascade exclusions
      const cascadeExclusions = await this.computeCascadeExclusions(userId, directExclusions, tx);

      // Phase 3: Compute empty exclusions
      // Empty exclusions need to consider direct + cascade exclusions already computed
      const emptyExclusions = await this.computeEmptyExclusions(
        userId,
        [...directExclusions, ...cascadeExclusions],
        tx
      );

      // Combine all exclusions and deduplicate
      // An entity can be excluded via multiple paths (e.g., cascade from performer + cascade from tag)
      // but we only need one record per (userId, entityType, entityId)
      const allExclusionsRaw = [...directExclusions, ...cascadeExclusions, ...emptyExclusions];
      const seen = new Set<string>();
      const allExclusions: ExclusionRecord[] = [];
      for (const excl of allExclusionsRaw) {
        const key = `${excl.entityType}:${excl.entityId}`;
        if (!seen.has(key)) {
          seen.add(key);
          allExclusions.push(excl);
        }
      }

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

      logger.info("ExclusionComputationService.recomputeForUser completed", {
        userId,
        totalExclusions: allExclusions.length,
      });
    }, {
      // Increase timeout to 120 seconds for large datasets
      // Default is 5 seconds which is too short for users with many entities
      timeout: 120000,
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

    // Add hidden entities to exclusions
    for (const hidden of hiddenEntities) {
      exclusions.push({
        userId,
        entityType: hidden.entityType,
        entityId: hidden.entityId,
        reason: "hidden",
      });
    }

    return exclusions;
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
    const seen = new Set<string>(); // Track "entityType:entityId" to avoid duplicates

    // Helper to add exclusion if not already seen
    const addCascade = (entityType: string, entityId: string) => {
      const key = `${entityType}:${entityId}`;
      if (!seen.has(key)) {
        seen.add(key);
        cascadeExclusions.push({
          userId,
          entityType,
          entityId,
          reason: "cascade",
        });
      }
    };

    // Group direct exclusions by entity type
    const excludedPerformers: string[] = [];
    const excludedStudios: string[] = [];
    const excludedTags: string[] = [];
    const excludedGroups: string[] = [];
    const excludedGalleries: string[] = [];

    for (const excl of directExclusions) {
      switch (excl.entityType) {
        case "performer":
          excludedPerformers.push(excl.entityId);
          break;
        case "studio":
          excludedStudios.push(excl.entityId);
          break;
        case "tag":
          excludedTags.push(excl.entityId);
          break;
        case "group":
          excludedGroups.push(excl.entityId);
          break;
        case "gallery":
          excludedGalleries.push(excl.entityId);
          break;
      }
    }

    // 1. Performer -> Scenes
    if (excludedPerformers.length > 0) {
      const scenePerformers = await tx.scenePerformer.findMany({
        where: { performerId: { in: excludedPerformers } },
        select: { sceneId: true },
      });
      for (const sp of scenePerformers) {
        addCascade("scene", sp.sceneId);
      }
    }

    // 2. Studio -> Scenes
    if (excludedStudios.length > 0) {
      const studioScenes = await tx.stashScene.findMany({
        where: {
          studioId: { in: excludedStudios },
          deletedAt: null,
        },
        select: { id: true },
      });
      for (const scene of studioScenes) {
        addCascade("scene", scene.id);
      }
    }

    // 3. Tag -> Scenes/Performers/Studios/Groups
    if (excludedTags.length > 0) {
      // 3a. Scenes with direct tag
      const sceneTagsResult = await tx.sceneTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { sceneId: true },
      });
      for (const st of sceneTagsResult) {
        addCascade("scene", st.sceneId);
      }

      // 3b. Scenes with inherited tag (via inheritedTagIds JSON column)
      // Batch all tags into a single query for efficiency
      if (excludedTags.length > 0) {
        // Build a query that checks if ANY of the excluded tags is in inheritedTagIds
        const tagList = excludedTags.map(t => `'${t}'`).join(",");
        const inheritedScenes = await (tx as any).$queryRaw`
          SELECT DISTINCT s.id FROM StashScene s
          WHERE s.deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(s.inheritedTagIds) je
            WHERE je.value IN (${Prisma.raw(tagList)})
          )
        ` as Array<{ id: string }>;

        for (const scene of inheritedScenes) {
          addCascade("scene", scene.id);
        }
      }

      // 3c. Performers with tag
      const performerTagsResult = await tx.performerTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { performerId: true },
      });
      for (const pt of performerTagsResult) {
        addCascade("performer", pt.performerId);
      }

      // 3d. Studios with tag
      const studioTagsResult = await tx.studioTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { studioId: true },
      });
      for (const st of studioTagsResult) {
        addCascade("studio", st.studioId);
      }

      // 3e. Groups with tag
      const groupTagsResult = await tx.groupTag.findMany({
        where: { tagId: { in: excludedTags } },
        select: { groupId: true },
      });
      for (const gt of groupTagsResult) {
        addCascade("group", gt.groupId);
      }
    }

    // 4. Group -> Scenes
    if (excludedGroups.length > 0) {
      const sceneGroups = await tx.sceneGroup.findMany({
        where: { groupId: { in: excludedGroups } },
        select: { sceneId: true },
      });
      for (const sg of sceneGroups) {
        addCascade("scene", sg.sceneId);
      }
    }

    // 5. Gallery -> Scenes/Images
    if (excludedGalleries.length > 0) {
      // 5a. Linked scenes
      const sceneGalleries = await tx.sceneGallery.findMany({
        where: { galleryId: { in: excludedGalleries } },
        select: { sceneId: true },
      });
      for (const sg of sceneGalleries) {
        addCascade("scene", sg.sceneId);
      }

      // 5b. Images in gallery
      const imageGalleries = await tx.imageGallery.findMany({
        where: { galleryId: { in: excludedGalleries } },
        select: { imageId: true },
      });
      for (const ig of imageGalleries) {
        addCascade("image", ig.imageId);
      }
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
   * Note: Since we delete and recreate all exclusions in the same transaction,
   * we need to check against the priorExclusions in-memory rather than querying
   * UserExcludedEntity (which will be empty during the transaction).
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

    // Build sets of already-excluded entity IDs by type
    // These will be used in temporary tables for SQL-based filtering
    const excludedSceneIds = new Set<string>();
    const excludedImageIds = new Set<string>();
    const excludedPerformerIds = new Set<string>();
    const excludedStudioIds = new Set<string>();
    const excludedGroupIds = new Set<string>();

    for (const excl of priorExclusions) {
      switch (excl.entityType) {
        case "scene":
          excludedSceneIds.add(excl.entityId);
          break;
        case "image":
          excludedImageIds.add(excl.entityId);
          break;
        case "performer":
          excludedPerformerIds.add(excl.entityId);
          break;
        case "studio":
          excludedStudioIds.add(excl.entityId);
          break;
        case "group":
          excludedGroupIds.add(excl.entityId);
          break;
      }
    }

    // 1. Empty galleries - galleries with 0 visible images
    // Use a temporary table to avoid loading all relationships into memory
    // Create temp table with excluded image IDs
    if (excludedImageIds.size > 0) {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_images (imageId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw(Prisma.raw(`
        DELETE FROM temp_excluded_images
      `));
      await (tx as any).$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_images (imageId) VALUES ${Array.from(excludedImageIds).map(id => `('${id}')`).join(',')}
      `));
    } else {
      // If no excluded images, create empty temp table
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_images (imageId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_images`;
    }

    // Query for empty galleries using temp table
    const emptyGalleries = await (tx as any).$queryRaw`
      SELECT g.id as galleryId
      FROM StashGallery g
      WHERE g.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ImageGallery ig
        JOIN StashImage i ON ig.imageId = i.id
        WHERE ig.galleryId = g.id
          AND i.deletedAt IS NULL
          AND i.id NOT IN (SELECT imageId FROM temp_excluded_images)
      )
    ` as Array<{ galleryId: string }>;

    for (const row of emptyGalleries) {
      emptyExclusions.push({
        userId,
        entityType: "gallery",
        entityId: row.galleryId,
        reason: "empty",
      });
    }

    // 2. Empty performers - performers with 0 visible scenes AND 0 visible images
    // Create temp tables for excluded entities
    if (excludedSceneIds.size > 0) {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_scenes (sceneId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_scenes`;
      await (tx as any).$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_scenes (sceneId) VALUES ${Array.from(excludedSceneIds).map(id => `('${id}')`).join(',')}
      `));
    } else {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_scenes (sceneId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_scenes`;
    }

    if (excludedPerformerIds.size > 0) {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_performers (performerId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_performers`;
      await (tx as any).$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_performers (performerId) VALUES ${Array.from(excludedPerformerIds).map(id => `('${id}')`).join(',')}
      `));
    } else {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_performers (performerId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_performers`;
    }

    // Query for empty performers
    const emptyPerformers = await (tx as any).$queryRaw`
      SELECT p.id as performerId
      FROM StashPerformer p
      WHERE p.deletedAt IS NULL
      AND p.id NOT IN (SELECT performerId FROM temp_excluded_performers)
      AND NOT EXISTS (
        SELECT 1 FROM ScenePerformer sp
        JOIN StashScene s ON sp.sceneId = s.id
        WHERE sp.performerId = p.id
          AND s.deletedAt IS NULL
          AND s.id NOT IN (SELECT sceneId FROM temp_excluded_scenes)
      )
      AND NOT EXISTS (
        SELECT 1 FROM ImagePerformer ip
        JOIN StashImage i ON ip.imageId = i.id
        WHERE ip.performerId = p.id
          AND i.deletedAt IS NULL
          AND i.id NOT IN (SELECT imageId FROM temp_excluded_images)
      )
    ` as Array<{ performerId: string }>;

    for (const row of emptyPerformers) {
      emptyExclusions.push({
        userId,
        entityType: "performer",
        entityId: row.performerId,
        reason: "empty",
      });
    }

    // 3. Empty studios - studios with 0 visible scenes AND 0 visible images
    if (excludedStudioIds.size > 0) {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_studios (studioId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_studios`;
      await (tx as any).$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_studios (studioId) VALUES ${Array.from(excludedStudioIds).map(id => `('${id}')`).join(',')}
      `));
    } else {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_studios (studioId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_studios`;
    }

    const emptyStudios = await (tx as any).$queryRaw`
      SELECT st.id as studioId
      FROM StashStudio st
      WHERE st.deletedAt IS NULL
      AND st.id NOT IN (SELECT studioId FROM temp_excluded_studios)
      AND NOT EXISTS (
        SELECT 1 FROM StashScene s
        WHERE s.studioId = st.id
          AND s.deletedAt IS NULL
          AND s.id NOT IN (SELECT sceneId FROM temp_excluded_scenes)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StashImage i
        WHERE i.studioId = st.id
          AND i.deletedAt IS NULL
          AND i.id NOT IN (SELECT imageId FROM temp_excluded_images)
      )
    ` as Array<{ studioId: string }>;

    for (const row of emptyStudios) {
      emptyExclusions.push({
        userId,
        entityType: "studio",
        entityId: row.studioId,
        reason: "empty",
      });
    }

    // 4. Empty groups - groups with 0 visible scenes
    if (excludedGroupIds.size > 0) {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_groups (groupId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_groups`;
      await (tx as any).$executeRaw(Prisma.raw(`
        INSERT INTO temp_excluded_groups (groupId) VALUES ${Array.from(excludedGroupIds).map(id => `('${id}')`).join(',')}
      `));
    } else {
      await (tx as any).$executeRaw`
        CREATE TEMP TABLE IF NOT EXISTS temp_excluded_groups (groupId TEXT PRIMARY KEY)
      `;
      await (tx as any).$executeRaw`DELETE FROM temp_excluded_groups`;
    }

    const emptyGroups = await (tx as any).$queryRaw`
      SELECT g.id as groupId
      FROM StashGroup g
      WHERE g.deletedAt IS NULL
      AND g.id NOT IN (SELECT groupId FROM temp_excluded_groups)
      AND NOT EXISTS (
        SELECT 1 FROM SceneGroup sg
        JOIN StashScene s ON sg.sceneId = s.id
        WHERE sg.groupId = g.id
          AND s.deletedAt IS NULL
          AND s.id NOT IN (SELECT sceneId FROM temp_excluded_scenes)
      )
    ` as Array<{ groupId: string }>;

    for (const row of emptyGroups) {
      emptyExclusions.push({
        userId,
        entityType: "group",
        entityId: row.groupId,
        reason: "empty",
      });
    }

    // 5. Empty tags - tags not attached to any visible scene, performer, studio, or group
    // BUT exclude parent/organizational tags (tags that have children) since they're used for hierarchy
    const emptyTags = await (tx as any).$queryRaw`
      SELECT t.id as tagId
      FROM StashTag t
      WHERE t.deletedAt IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM SceneTag st
        JOIN StashScene s ON st.sceneId = s.id
        WHERE st.tagId = t.id
          AND s.deletedAt IS NULL
          AND s.id NOT IN (SELECT sceneId FROM temp_excluded_scenes)
      )
      AND NOT EXISTS (
        SELECT 1 FROM PerformerTag pt
        JOIN StashPerformer p ON pt.performerId = p.id
        WHERE pt.tagId = t.id
          AND p.deletedAt IS NULL
          AND p.id NOT IN (SELECT performerId FROM temp_excluded_performers)
      )
      AND NOT EXISTS (
        SELECT 1 FROM StudioTag stt
        JOIN StashStudio stu ON stt.studioId = stu.id
        WHERE stt.tagId = t.id
          AND stu.deletedAt IS NULL
          AND stu.id NOT IN (SELECT studioId FROM temp_excluded_studios)
      )
      AND NOT EXISTS (
        SELECT 1 FROM GroupTag gt
        JOIN StashGroup g ON gt.groupId = g.id
        WHERE gt.tagId = t.id
          AND g.deletedAt IS NULL
          AND g.id NOT IN (SELECT groupId FROM temp_excluded_groups)
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
        reason: "empty",
      });
    }

    // Clean up temporary tables
    await (tx as any).$executeRaw`DROP TABLE IF EXISTS temp_excluded_images`;
    await (tx as any).$executeRaw`DROP TABLE IF EXISTS temp_excluded_scenes`;
    await (tx as any).$executeRaw`DROP TABLE IF EXISTS temp_excluded_performers`;
    await (tx as any).$executeRaw`DROP TABLE IF EXISTS temp_excluded_studios`;
    await (tx as any).$executeRaw`DROP TABLE IF EXISTS temp_excluded_groups`;

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
    const entityTypes = ["scene", "performer", "studio", "tag", "group", "gallery", "image"];

    for (const entityType of entityTypes) {
      const total = await this.getEntityCount(entityType, tx);
      const excluded = await tx.userExcludedEntity.count({
        where: { userId, entityType },
      });

      await tx.userEntityStats.upsert({
        where: { userId_entityType: { userId, entityType } },
        create: { userId, entityType, visibleCount: total - excluded },
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
    entityId: string
  ): Promise<void> {
    const startTime = Date.now();
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
    });

    await prisma.$transaction(async (tx) => {
      // Add the direct exclusion
      await tx.userExcludedEntity.upsert({
        where: {
          userId_entityType_entityId: { userId, entityType, entityId },
        },
        create: { userId, entityType, entityId, reason: "hidden" },
        update: { reason: "hidden" },
      });

      // Compute cascades for this specific entity
      await this.addCascadesForEntity(tx, userId, entityType, entityId);
    }, {
      timeout: 30000, // 30 seconds for hide operation
    });

    logger.info("ExclusionComputationService.addHiddenEntity complete", {
      userId,
      entityType,
      entityId,
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
    entityId: string
  ): Promise<void> {
    const cascadeExclusions: Prisma.UserExcludedEntityCreateManyInput[] = [];

    switch (entityType) {
      case "performer": {
        // Performer -> Scenes
        const scenePerformers = await tx.scenePerformer.findMany({
          where: { performerId: entityId },
          select: { sceneId: true },
        });
        for (const sp of scenePerformers) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sp.sceneId,
            reason: "cascade",
          });
        }
        break;
      }

      case "studio": {
        // Studio -> Scenes
        const studioScenes = await tx.stashScene.findMany({
          where: { studioId: entityId, deletedAt: null },
          select: { id: true },
        });
        for (const scene of studioScenes) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: scene.id,
            reason: "cascade",
          });
        }
        break;
      }

      case "tag": {
        // Tag -> Scenes (direct)
        const sceneTags = await tx.sceneTag.findMany({
          where: { tagId: entityId },
          select: { sceneId: true },
        });
        for (const st of sceneTags) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: st.sceneId,
            reason: "cascade",
          });
        }

        // Tag -> Scenes (inherited via inheritedTagIds JSON column)
        const inheritedScenes = await (tx as any).$queryRaw`
          SELECT id FROM StashScene
          WHERE deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(inheritedTagIds)
            WHERE json_each.value = ${entityId}
          )
        ` as Array<{ id: string }>;
        for (const scene of inheritedScenes) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: scene.id,
            reason: "cascade",
          });
        }

        // Tag -> Performers
        const performerTags = await tx.performerTag.findMany({
          where: { tagId: entityId },
          select: { performerId: true },
        });
        for (const pt of performerTags) {
          cascadeExclusions.push({
            userId,
            entityType: "performer",
            entityId: pt.performerId,
            reason: "cascade",
          });
        }

        // Tag -> Studios
        const studioTags = await tx.studioTag.findMany({
          where: { tagId: entityId },
          select: { studioId: true },
        });
        for (const st of studioTags) {
          cascadeExclusions.push({
            userId,
            entityType: "studio",
            entityId: st.studioId,
            reason: "cascade",
          });
        }

        // Tag -> Groups
        const groupTags = await tx.groupTag.findMany({
          where: { tagId: entityId },
          select: { groupId: true },
        });
        for (const gt of groupTags) {
          cascadeExclusions.push({
            userId,
            entityType: "group",
            entityId: gt.groupId,
            reason: "cascade",
          });
        }
        break;
      }

      case "group": {
        // Group -> Scenes
        const sceneGroups = await tx.sceneGroup.findMany({
          where: { groupId: entityId },
          select: { sceneId: true },
        });
        for (const sg of sceneGroups) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sg.sceneId,
            reason: "cascade",
          });
        }
        break;
      }

      case "gallery": {
        // Gallery -> Scenes
        const sceneGalleries = await tx.sceneGallery.findMany({
          where: { galleryId: entityId },
          select: { sceneId: true },
        });
        for (const sg of sceneGalleries) {
          cascadeExclusions.push({
            userId,
            entityType: "scene",
            entityId: sg.sceneId,
            reason: "cascade",
          });
        }

        // Gallery -> Images
        const imageGalleries = await tx.imageGallery.findMany({
          where: { galleryId: entityId },
          select: { imageId: true },
        });
        for (const ig of imageGalleries) {
          cascadeExclusions.push({
            userId,
            entityType: "image",
            entityId: ig.imageId,
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
              userId_entityType_entityId: {
                userId: exclusion.userId,
                entityType: exclusion.entityType,
                entityId: exclusion.entityId,
              },
            },
            create: exclusion,
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
    entityId: string
  ): Promise<void> {
    logger.info("ExclusionComputationService.removeHiddenEntity", {
      userId,
      entityType,
      entityId,
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
