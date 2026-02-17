import prisma from "../prisma/singleton.js";
import { stashEntityService } from "./StashEntityService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";


export type EntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image";

export interface HiddenEntityIds {
  scenes: Set<string>;
  performers: Set<string>;
  studios: Set<string>;
  tags: Set<string>;
  groups: Set<string>;
  galleries: Set<string>;
  images: Set<string>;
}

/**
 * Service for managing user-hidden entities
 * Users can hide entities which will filter them from all views
 */
class UserHiddenEntityService {
  private hiddenIdsCache: Map<number, HiddenEntityIds> = new Map();

  /**
   * Hide an entity for a user
   */
  async hideEntity(
    userId: number,
    entityType: EntityType,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    await prisma.userHiddenEntity.upsert({
      where: {
        userId_entityType_entityId_instanceId: {
          userId,
          entityType,
          entityId,
          instanceId,
        },
      },
      create: {
        userId,
        entityType,
        entityId,
        instanceId,
      },
      update: {
        hiddenAt: new Date(), // Update timestamp if re-hiding
      },
    });

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Update pre-computed exclusions (pass instanceId so cascades are scoped)
    await exclusionComputationService.addHiddenEntity(userId, entityType, entityId, instanceId);
  }

  /**
   * Unhide (restore) an entity for a user
   */
  async unhideEntity(
    userId: number,
    entityType: EntityType,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    await prisma.userHiddenEntity.deleteMany({
      where: {
        userId,
        entityType,
        entityId,
        instanceId,
      },
    });

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Update pre-computed exclusions (async recompute)
    await exclusionComputationService.removeHiddenEntity(userId, entityType, entityId, instanceId);
  }

  /**
   * Unhide all entities for a user (optionally filtered by type)
   * @returns Number of entities unhidden
   */
  async unhideAll(userId: number, entityType?: string): Promise<number> {
    const where: any = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const result = await prisma.userHiddenEntity.deleteMany({ where });

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Recompute exclusions for this user (full recompute since multiple entities unhidden)
    if (result.count > 0) {
      await exclusionComputationService.recomputeForUser(userId);
    }

    return result.count;
  }

  /**
   * Get all hidden entities for a user with full entity details from cache
   */
  async getHiddenEntities(
    userId: number,
    entityType?: EntityType
  ): Promise<
    Array<{
      id: number;
      entityType: EntityType;
      entityId: string;
      hiddenAt: Date;
      entity: any; // Full entity data from Stash cache
    }>
  > {
    const where: any = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const hiddenEntities = await prisma.userHiddenEntity.findMany({
      where,
      orderBy: { hiddenAt: "desc" },
    });

    // Enrich with entity details from cache
    const enriched = await Promise.all(
      hiddenEntities.map(async (hidden) => {
        let entity = null;

        const instId = hidden.instanceId || undefined;
        switch (hidden.entityType) {
          case "scene":
            entity = await stashEntityService.getScene(hidden.entityId, instId);
            break;
          case "performer":
            entity = await stashEntityService.getPerformer(hidden.entityId, instId);
            break;
          case "studio":
            entity = await stashEntityService.getStudio(hidden.entityId, instId);
            break;
          case "tag":
            entity = await stashEntityService.getTag(hidden.entityId, instId);
            break;
          case "group":
            entity = await stashEntityService.getGroup(hidden.entityId, instId);
            break;
          case "gallery":
            entity = await stashEntityService.getGallery(hidden.entityId, instId);
            break;
          case "image":
            entity = await stashEntityService.getImage(hidden.entityId, instId);
            break;
        }

        return {
          id: hidden.id,
          entityType: hidden.entityType as EntityType,
          entityId: hidden.entityId,
          instanceId: hidden.instanceId,
          hiddenAt: hidden.hiddenAt,
          entity,
        };
      })
    );

    // Filter out entities that no longer exist in Stash cache
    return enriched.filter((item) => item.entity !== null);
  }

  /**
   * Get hidden entity IDs organized by type (for fast filtering)
   * Results are cached per user for performance
   */
  async getHiddenEntityIds(userId: number): Promise<HiddenEntityIds> {
    // Check cache first
    const cached = this.hiddenIdsCache.get(userId);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const hiddenEntities = await prisma.userHiddenEntity.findMany({
      where: { userId },
      select: {
        entityType: true,
        entityId: true,
      },
    });

    // Organize into sets by type
    const result: HiddenEntityIds = {
      scenes: new Set(),
      performers: new Set(),
      studios: new Set(),
      tags: new Set(),
      groups: new Set(),
      galleries: new Set(),
      images: new Set(),
    };

    for (const hidden of hiddenEntities) {
      const type = hidden.entityType;
      if (type === "scene") result.scenes.add(hidden.entityId);
      else if (type === "performer") result.performers.add(hidden.entityId);
      else if (type === "studio") result.studios.add(hidden.entityId);
      else if (type === "tag") result.tags.add(hidden.entityId);
      else if (type === "group") result.groups.add(hidden.entityId);
      else if (type === "gallery") result.galleries.add(hidden.entityId);
      else if (type === "image") result.images.add(hidden.entityId);
    }

    // Cache result
    this.hiddenIdsCache.set(userId, result);

    return result;
  }

  /**
   * Check if a specific entity is hidden for a user
   */
  async isEntityHidden(
    userId: number,
    entityType: EntityType,
    entityId: string
  ): Promise<boolean> {
    const hiddenIds = await this.getHiddenEntityIds(userId);

    switch (entityType) {
      case "scene":
        return hiddenIds.scenes.has(entityId);
      case "performer":
        return hiddenIds.performers.has(entityId);
      case "studio":
        return hiddenIds.studios.has(entityId);
      case "tag":
        return hiddenIds.tags.has(entityId);
      case "group":
        return hiddenIds.groups.has(entityId);
      case "gallery":
        return hiddenIds.galleries.has(entityId);
      case "image":
        return hiddenIds.images.has(entityId);
      default:
        return false;
    }
  }

  /**
   * Clear cached hidden IDs for a user (call after hide/unhide operations)
   */
  clearCache(userId: number): void {
    this.hiddenIdsCache.delete(userId);
  }

  /**
   * Clear all cached hidden IDs (call on cache refresh)
   */
  clearAllCache(): void {
    this.hiddenIdsCache.clear();
  }
}

export const userHiddenEntityService = new UserHiddenEntityService();
export default userHiddenEntityService;
