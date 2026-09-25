import prisma from "../prisma/singleton.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";
import { dbWrite } from "../utils/dbWrite.js";
import {
  entityRefKey,
  resolveVisibleApartFromOwnHides,
} from "./EntityAccessService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { stashEntityService } from "./StashEntityService.js";

type NormalizedEntity =
  | NormalizedScene
  | NormalizedPerformer
  | NormalizedStudio
  | NormalizedTag
  | NormalizedGroup
  | NormalizedGallery
  | NormalizedImage;

export type EntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image";

/**
 * One row of the Hidden Items list. `restricted` rows carry no entity: the
 * user could not see it even without their own hides.
 */
export interface HiddenEntityItem {
  id: number;
  entityType: EntityType;
  entityId: string;
  /** As stored: "" for a hide that applies to every instance */
  instanceId: string;
  hiddenAt: Date;
  restricted: boolean;
  entity: NormalizedEntity | null;
}

export interface HiddenEntityIds {
  scenes: Set<string>;
  performers: Set<string>;
  studios: Set<string>;
  tags: Set<string>;
  groups: Set<string>;
  galleries: Set<string>;
  images: Set<string>;
}

const HIDEABLE_TYPES: ReadonlySet<string> = new Set<EntityType>([
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
]);

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
    await dbWrite("hide.add", () =>
      prisma.userHiddenEntity.upsert({
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
      })
    );

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Update pre-computed exclusions (pass instanceId so cascades are scoped)
    await exclusionComputationService.addHiddenEntity(
      userId,
      entityType,
      entityId,
      instanceId
    );
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
    await dbWrite("hide.remove", () =>
      prisma.userHiddenEntity.deleteMany({
        where: {
          userId,
          entityType,
          entityId,
          instanceId,
        },
      })
    );

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Update pre-computed exclusions (async recompute)
    exclusionComputationService.removeHiddenEntity(
      userId,
      entityType,
      entityId,
      instanceId
    );
  }

  /**
   * Unhide all entities for a user (optionally filtered by type)
   * @returns Number of entities unhidden
   */
  async unhideAll(userId: number, entityType?: string): Promise<number> {
    const where: { userId: number; entityType?: string } = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const result = await dbWrite("hide.removeAll", () =>
      prisma.userHiddenEntity.deleteMany({ where })
    );

    // Invalidate local cache for this user
    this.hiddenIdsCache.delete(userId);

    // Recompute exclusions for this user (full recompute since multiple entities unhidden)
    if (result.count > 0) {
      await exclusionComputationService.recomputeForUser(userId);
    }

    return result.count;
  }

  /**
   * For each target, has this user already hidden it? A target on an
   * instance is covered by a hide on that instance or one stored for every
   * instance (""); a target without an instance by any hide of that type and
   * id. One query for the whole batch.
   */
  async findAlreadyHidden(
    userId: number,
    targets: ReadonlyArray<{
      entityType: EntityType;
      entityId: string;
      instanceId: string;
    }>
  ): Promise<boolean[]> {
    if (targets.length === 0) return [];

    const rows = await prisma.userHiddenEntity.findMany({
      where: {
        userId,
        entityId: { in: [...new Set(targets.map((t) => t.entityId))] },
      },
      select: { entityType: true, entityId: true, instanceId: true },
    });
    const key = (...parts: string[]) => parts.join("\0");
    const stored = new Set(
      rows.map((r) => key(r.entityType, r.entityId, r.instanceId))
    );
    const anyInstance = new Set(rows.map((r) => key(r.entityType, r.entityId)));

    return targets.map((t) =>
      t.instanceId
        ? stored.has(key(t.entityType, t.entityId, t.instanceId)) ||
          stored.has(key(t.entityType, t.entityId, ""))
        : anyInstance.has(key(t.entityType, t.entityId))
    );
  }

  /**
   * The user's hidden rows for the Hidden Items list, newest first.
   *
   * A row carries the entity's cached data only when the user could see the
   * entity if they had hidden nothing (resolveVisibleApartFromOwnHides, one
   * query per entity type). A hide stored for every instance shows the
   * first instance where that holds. Every other row (restricted or empty
   * for the user, deleted, or on an instance they do not use) comes back as
   * restricted, with no entity, so its owner can still unhide it.
   */
  async getHiddenEntities(
    userId: number,
    entityType?: EntityType
  ): Promise<HiddenEntityItem[]> {
    const where: { userId: number; entityType?: EntityType } = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const hiddenEntities = await prisma.userHiddenEntity.findMany({
      where,
      orderBy: { hiddenAt: "desc" },
    });

    const byType = new Map<EntityType, typeof hiddenEntities>();
    for (const hidden of hiddenEntities) {
      const type = hidden.entityType as EntityType;
      const list = byType.get(type) ?? [];
      list.push(hidden);
      byType.set(type, list);
    }
    // Row id -> the instance to show the entity from
    const shownOn = new Map<number, string>();
    for (const [type, rows] of byType) {
      if (!HIDEABLE_TYPES.has(type)) continue;
      const resolved = await resolveVisibleApartFromOwnHides(
        userId,
        type,
        rows.map((row) => ({ id: row.entityId, instanceId: row.instanceId }))
      );
      for (const row of rows) {
        const instanceId = resolved.get(
          entityRefKey(row.entityId, row.instanceId)
        );
        if (instanceId) shownOn.set(row.id, instanceId);
      }
    }

    return Promise.all(
      hiddenEntities.map(async (hidden): Promise<HiddenEntityItem> => {
        const shownInstanceId = shownOn.get(hidden.id);
        const entity = shownInstanceId
          ? await this.getCachedEntity(
              hidden.entityType as EntityType,
              hidden.entityId,
              shownInstanceId
            )
          : null;
        return {
          id: hidden.id,
          entityType: hidden.entityType as EntityType,
          entityId: hidden.entityId,
          instanceId: hidden.instanceId,
          hiddenAt: hidden.hiddenAt,
          restricted: entity === null,
          entity,
        };
      })
    );
  }

  private async getCachedEntity(
    entityType: EntityType,
    entityId: string,
    instanceId: string
  ): Promise<NormalizedEntity | null> {
    switch (entityType) {
      case "scene":
        return stashEntityService.getScene(entityId, instanceId);
      case "performer":
        return stashEntityService.getPerformer(entityId, instanceId);
      case "studio":
        return stashEntityService.getStudio(entityId, instanceId);
      case "tag":
        return stashEntityService.getTag(entityId, instanceId);
      case "group":
        return stashEntityService.getGroup(entityId, instanceId);
      case "gallery":
        return stashEntityService.getGallery(entityId, instanceId);
      case "image":
        return stashEntityService.getImage(entityId, instanceId);
      default:
        return null;
    }
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
