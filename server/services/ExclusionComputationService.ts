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
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { stashCacheManager } from "./StashCacheManager.js";

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

class ExclusionComputationService {
  /**
   * Full recompute for a user.
   * Runs in a transaction - if any phase fails, previous exclusions are preserved.
   */
  async recomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });

    await prisma.$transaction(async (tx) => {
      // Phase 1: Compute direct exclusions (restrictions + hidden)
      const directExclusions = await this.computeDirectExclusions(userId, tx);

      // Phase 2: Compute cascade exclusions
      const cascadeExclusions = await this.computeCascadeExclusions(userId, directExclusions, tx);

      // Phase 3: Compute empty exclusions (later task)
      // const emptyExclusions = await this.computeEmptyExclusions(userId, tx);

      // Combine all exclusions
      const allExclusions = [...directExclusions, ...cascadeExclusions];

      // Delete existing exclusions for this user
      await tx.userExcludedEntity.deleteMany({
        where: { userId },
      });

      // Insert new exclusions if any exist
      if (allExclusions.length > 0) {
        await tx.userExcludedEntity.createMany({
          data: allExclusions,
          skipDuplicates: true,
        });
      }

      logger.info("ExclusionComputationService.recomputeForUser completed", {
        userId,
        totalExclusions: allExclusions.length,
      });
    });
  }

  /**
   * Recompute exclusions for all users.
   * Called after Stash sync completes.
   */
  async recomputeAllUsers(): Promise<void> {
    logger.info("ExclusionComputationService.recomputeAllUsers starting");

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    for (const user of users) {
      try {
        await this.recomputeForUser(user.id);
      } catch (error) {
        logger.error("Failed to recompute exclusions for user", {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other users even if one fails
      }
    }

    logger.info("ExclusionComputationService.recomputeAllUsers completed", {
      userCount: users.length,
    });
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
        const allEntityIds = this.getAllEntityIds(restriction.entityType);
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
      // Use raw SQL for JSON array querying
      for (const tagId of excludedTags) {
        const inheritedScenes = await (tx as any).$queryRaw`
          SELECT id FROM StashScene
          WHERE deletedAt IS NULL
          AND EXISTS (
            SELECT 1 FROM json_each(inheritedTagIds)
            WHERE json_each.value = ${tagId}
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
   * Get all entity IDs for a given entity type from the cache.
   * Used for INCLUDE mode inversion.
   */
  private getAllEntityIds(entityType: string): string[] {
    switch (entityType) {
      case "tags":
        return stashCacheManager.getAllTags().map((t) => t.id);
      case "studios":
        return stashCacheManager.getAllStudios().map((s) => s.id);
      case "groups":
        return stashCacheManager.getAllGroups().map((g) => g.id);
      case "galleries":
        return stashCacheManager.getAllGalleries().map((g) => g.id);
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
    logger.info("ExclusionComputationService.addHiddenEntity", {
      userId,
      entityType,
      entityId,
    });
    // Implementation in later task
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
    // Implementation in later task
  }
}

export const exclusionComputationService = new ExclusionComputationService();
