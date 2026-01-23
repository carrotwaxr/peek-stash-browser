/**
 * DeduplicationService
 *
 * Handles detection and resolution of duplicate entities across Stash instances.
 * Uses stash_ids (StashDB identifiers) to match entities that exist in multiple instances.
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

interface StashId {
  endpoint: string;
  stash_id: string;
}

interface DuplicateGroup<T> {
  /** The stash_id that links these entities */
  stashId: StashId;
  /** Entities that share this stash_id */
  entities: T[];
  /** The primary entity (from instance with lowest priority) */
  primary: T;
}

interface EntityWithStashIds {
  id: string;
  stashInstanceId: string | null;
  stashIds: string | null;
  name?: string | null;
}

interface DeduplicationStats {
  entityType: "performer" | "studio" | "tag";
  totalEntities: number;
  entitiesWithStashIds: number;
  duplicateGroups: number;
  uniqueStashIds: number;
}

class DeduplicationService {
  /**
   * Parse stashIds JSON string into array of StashId objects
   */
  private parseStashIds(stashIdsJson: string | null): StashId[] {
    if (!stashIdsJson) return [];
    try {
      const parsed = JSON.parse(stashIdsJson);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (s: any) => s && typeof s.endpoint === "string" && typeof s.stash_id === "string"
      );
    } catch {
      return [];
    }
  }

  /**
   * Create a unique key for a stash_id for use in Maps
   */
  private stashIdKey(stashId: StashId): string {
    return `${stashId.endpoint}|${stashId.stash_id}`;
  }

  /**
   * Get instance priority by ID (lower number = higher priority)
   * Falls back to 0 if instance not found
   */
  private async getInstancePriority(instanceId: string | null): Promise<number> {
    if (!instanceId) return 999; // Entities without instance have lowest priority

    const instance = await prisma.stashInstance.findUnique({
      where: { id: instanceId },
      select: { priority: true },
    });

    return instance?.priority ?? 999;
  }

  /**
   * Find duplicate performers across instances
   */
  async findDuplicatePerformers(): Promise<DuplicateGroup<EntityWithStashIds>[]> {
    const performers = await prisma.stashPerformer.findMany({
      where: {
        deletedAt: null,
        stashIds: { not: null },
      },
      select: {
        id: true,
        stashInstanceId: true,
        stashIds: true,
        name: true,
      },
    });

    return this.findDuplicates(performers);
  }

  /**
   * Find duplicate studios across instances
   */
  async findDuplicateStudios(): Promise<DuplicateGroup<EntityWithStashIds>[]> {
    const studios = await prisma.stashStudio.findMany({
      where: {
        deletedAt: null,
        stashIds: { not: null },
      },
      select: {
        id: true,
        stashInstanceId: true,
        stashIds: true,
        name: true,
      },
    });

    return this.findDuplicates(studios);
  }

  /**
   * Find duplicate tags across instances
   */
  async findDuplicateTags(): Promise<DuplicateGroup<EntityWithStashIds>[]> {
    const tags = await prisma.stashTag.findMany({
      where: {
        deletedAt: null,
        stashIds: { not: null },
      },
      select: {
        id: true,
        stashInstanceId: true,
        stashIds: true,
        name: true,
      },
    });

    return this.findDuplicates(tags);
  }

  /**
   * Generic duplicate finder for any entity type with stashIds
   */
  private async findDuplicates(
    entities: EntityWithStashIds[]
  ): Promise<DuplicateGroup<EntityWithStashIds>[]> {
    // Build a map of stash_id -> entities
    const stashIdMap = new Map<string, EntityWithStashIds[]>();

    for (const entity of entities) {
      const stashIds = this.parseStashIds(entity.stashIds);
      for (const stashId of stashIds) {
        const key = this.stashIdKey(stashId);
        const existing = stashIdMap.get(key) || [];
        existing.push(entity);
        stashIdMap.set(key, existing);
      }
    }

    // Find groups with multiple entities (duplicates)
    const duplicateGroups: DuplicateGroup<EntityWithStashIds>[] = [];

    for (const [key, groupEntities] of stashIdMap.entries()) {
      // Only consider groups from different instances as duplicates
      const instanceIds = new Set(groupEntities.map((e) => e.stashInstanceId));
      if (instanceIds.size <= 1) continue; // Same instance, not a duplicate

      const [endpoint, stash_id] = key.split("|");
      const stashId: StashId = { endpoint, stash_id };

      // Determine primary entity (from instance with lowest priority)
      const priorities = await Promise.all(
        groupEntities.map(async (e) => ({
          entity: e,
          priority: await this.getInstancePriority(e.stashInstanceId),
        }))
      );

      priorities.sort((a, b) => a.priority - b.priority);
      const primary = priorities[0].entity;

      duplicateGroups.push({
        stashId,
        entities: groupEntities,
        primary,
      });
    }

    return duplicateGroups;
  }

  /**
   * Get deduplication statistics
   */
  async getStats(): Promise<DeduplicationStats[]> {
    const stats: DeduplicationStats[] = [];

    // Performers
    const performerTotal = await prisma.stashPerformer.count({ where: { deletedAt: null } });
    const performerWithIds = await prisma.stashPerformer.count({
      where: { deletedAt: null, stashIds: { not: null } },
    });
    const performerDupes = await this.findDuplicatePerformers();
    stats.push({
      entityType: "performer",
      totalEntities: performerTotal,
      entitiesWithStashIds: performerWithIds,
      duplicateGroups: performerDupes.length,
      uniqueStashIds: new Set(performerDupes.map((d) => this.stashIdKey(d.stashId))).size,
    });

    // Studios
    const studioTotal = await prisma.stashStudio.count({ where: { deletedAt: null } });
    const studioWithIds = await prisma.stashStudio.count({
      where: { deletedAt: null, stashIds: { not: null } },
    });
    const studioDupes = await this.findDuplicateStudios();
    stats.push({
      entityType: "studio",
      totalEntities: studioTotal,
      entitiesWithStashIds: studioWithIds,
      duplicateGroups: studioDupes.length,
      uniqueStashIds: new Set(studioDupes.map((d) => this.stashIdKey(d.stashId))).size,
    });

    // Tags
    const tagTotal = await prisma.stashTag.count({ where: { deletedAt: null } });
    const tagWithIds = await prisma.stashTag.count({
      where: { deletedAt: null, stashIds: { not: null } },
    });
    const tagDupes = await this.findDuplicateTags();
    stats.push({
      entityType: "tag",
      totalEntities: tagTotal,
      entitiesWithStashIds: tagWithIds,
      duplicateGroups: tagDupes.length,
      uniqueStashIds: new Set(tagDupes.map((d) => this.stashIdKey(d.stashId))).size,
    });

    return stats;
  }

  /**
   * Build a mapping of entity IDs to their canonical (primary) entity ID.
   * This is used to resolve duplicates at query time.
   *
   * @param entityType - The type of entity to build mapping for
   * @returns Map from entity ID to canonical entity ID
   */
  async buildCanonicalMapping(
    entityType: "performer" | "studio" | "tag"
  ): Promise<Map<string, string>> {
    let duplicates: DuplicateGroup<EntityWithStashIds>[];

    switch (entityType) {
      case "performer":
        duplicates = await this.findDuplicatePerformers();
        break;
      case "studio":
        duplicates = await this.findDuplicateStudios();
        break;
      case "tag":
        duplicates = await this.findDuplicateTags();
        break;
    }

    const mapping = new Map<string, string>();

    for (const group of duplicates) {
      const primaryId = group.primary.id;
      for (const entity of group.entities) {
        if (entity.id !== primaryId) {
          mapping.set(entity.id, primaryId);
        }
      }
    }

    logger.debug(
      `Built canonical mapping for ${entityType}: ${mapping.size} aliases to ${duplicates.length} primaries`
    );

    return mapping;
  }

  /**
   * Resolve an entity ID to its canonical ID (if it's a duplicate)
   * Returns the original ID if no mapping exists
   */
  resolveToCanonical(entityId: string, mapping: Map<string, string>): string {
    return mapping.get(entityId) ?? entityId;
  }
}

export const deduplicationService = new DeduplicationService();
