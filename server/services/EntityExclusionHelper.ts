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
   * @param entities Array of entities with `id` property
   * @param userId User ID to check exclusions for
   * @param entityType Type of entity ('performer', 'studio', 'tag', 'group', 'gallery', 'image')
   * @returns Filtered array with excluded entities removed
   */
  async filterExcluded<T extends { id: string }>(
    entities: T[],
    userId: number,
    entityType: string
  ): Promise<T[]> {
    if (entities.length === 0) {
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
   */
  async getExcludedIds(
    userId: number,
    entityType: string
  ): Promise<Set<string>> {
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
