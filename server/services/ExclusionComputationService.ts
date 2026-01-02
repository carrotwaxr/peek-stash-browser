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

      // Phase 2: Compute cascade exclusions (later task)
      // const cascadeExclusions = await this.computeCascadeExclusions(userId, directExclusions, tx);

      // Phase 3: Compute empty exclusions (later task)
      // const emptyExclusions = await this.computeEmptyExclusions(userId, tx);

      // Combine all exclusions
      const allExclusions = [...directExclusions];

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
    tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
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
