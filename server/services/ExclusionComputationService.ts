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

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

class ExclusionComputationService {
  /**
   * Full recompute for a user.
   * Runs in a transaction - if any phase fails, previous exclusions are preserved.
   */
  async recomputeForUser(userId: number): Promise<void> {
    logger.info("ExclusionComputationService.recomputeForUser starting", { userId });
    // Implementation in next task
  }

  /**
   * Recompute exclusions for all users.
   * Called after Stash sync completes.
   */
  async recomputeAllUsers(): Promise<void> {
    logger.info("ExclusionComputationService.recomputeAllUsers starting");
    // Implementation in next task
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
