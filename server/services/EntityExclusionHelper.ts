/**
 * EntityExclusionHelper
 *
 * Provides methods to filter entity arrays using pre-computed exclusions.
 * Used by entity controllers to filter out excluded entities.
 *
 * Supports both global exclusions (empty instanceId → applies to all instances)
 * and instance-scoped exclusions (specific instanceId → applies only to that instance).
 */

import prisma from "../prisma/singleton.js";

class EntityExclusionHelper {
  /**
   * Filter an array of entities by removing excluded ones.
   * Uses pre-computed UserExcludedEntity table for O(1) lookups.
   *
   * Handles both global and instance-scoped exclusions:
   * - Global exclusions (instanceId = '') exclude the entity from ALL instances
   * - Scoped exclusions (instanceId = 'X') exclude only from that specific instance
   *
   * @param entities Array of entities with `id` property (and optional `instanceId`)
   * @param userId User ID to check exclusions for (if undefined, returns all entities)
   * @param entityType Type of entity ('performer', 'studio', 'tag', 'group', 'gallery', 'image')
   * @returns Filtered array with excluded entities removed
   */
  async filterExcluded<T extends { id: string; instanceId?: string }>(
    entities: T[],
    userId: number | undefined,
    entityType: string
  ): Promise<T[]> {
    // Early return if no userId (e.g., unauthenticated) or empty array
    if (!userId || entities.length === 0) {
      return entities;
    }

    // Get all excluded entity records for this user and type (including instanceId)
    const excludedRecords = await prisma.userExcludedEntity.findMany({
      where: {
        userId,
        entityType,
      },
      select: {
        entityId: true,
        instanceId: true,
      },
    });

    // Build lookup structures for global and scoped exclusions
    const globalExcludedIds = new Set<string>();
    const scopedExclusions = new Set<string>();

    for (const r of excludedRecords) {
      if (!r.instanceId) {
        // Global exclusion: applies to all instances
        globalExcludedIds.add(r.entityId);
      } else {
        // Scoped exclusion: applies only to specific instance
        scopedExclusions.add(`${r.entityId}:${r.instanceId}`);
      }
    }

    // Filter out excluded entities
    return entities.filter((entity) => {
      // Check global exclusion first
      if (globalExcludedIds.has(entity.id)) {
        return false;
      }
      // Check instance-scoped exclusion (if entity has instanceId)
      if (entity.instanceId && scopedExclusions.has(`${entity.id}:${entity.instanceId}`)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get excluded entity IDs for a user and entity type.
   * Useful when you need the Set for other operations.
   *
   * Note: Returns a flat Set of entity IDs (both global and scoped).
   * For instance-aware filtering, use filterExcluded() instead.
   *
   * @param userId User ID to check exclusions for (if undefined, returns empty Set)
   * @param entityType Type of entity
   * @returns Set of excluded entity IDs
   */
  async getExcludedIds(
    userId: number | undefined,
    entityType: string
  ): Promise<Set<string>> {
    if (!userId) {
      return new Set();
    }
    const records = await prisma.userExcludedEntity.findMany({
      where: {
        userId,
        entityType,
      },
      select: {
        entityId: true,
      },
    });

    return new Set(records.map((r) => r.entityId));
  }
}

export const entityExclusionHelper = new EntityExclusionHelper();
