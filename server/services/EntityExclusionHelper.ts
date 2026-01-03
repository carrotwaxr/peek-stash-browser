/**
 * EntityExclusionHelper
 *
 * Provides methods to filter entity arrays using pre-computed exclusions.
 * Used by entity controllers to filter out excluded entities.
 */

import prisma from "../prisma/singleton.js";

class EntityExclusionHelper {
  /**
   * Filter an array of entities by removing excluded ones.
   * Uses pre-computed UserExcludedEntity table for O(1) lookups.
   *
   * @param entities Array of entities with `id` property
   * @param userId User ID to check exclusions for (if undefined, returns all entities)
   * @param entityType Type of entity ('performer', 'studio', 'tag', 'group', 'gallery', 'image')
   * @returns Filtered array with excluded entities removed
   */
  async filterExcluded<T extends { id: string }>(
    entities: T[],
    userId: number | undefined,
    entityType: string
  ): Promise<T[]> {
    // Early return if no userId (e.g., unauthenticated) or empty array
    if (!userId || entities.length === 0) {
      return entities;
    }

    // Get all excluded entity IDs for this user and type
    const excludedRecords = await prisma.userExcludedEntity.findMany({
      where: {
        userId,
        entityType,
      },
      select: {
        entityId: true,
      },
    });

    const excludedIds = new Set(excludedRecords.map((r) => r.entityId));

    // Filter out excluded entities
    return entities.filter((entity) => !excludedIds.has(entity.id));
  }

  /**
   * Get excluded entity IDs for a user and entity type.
   * Useful when you need the Set for other operations.
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
