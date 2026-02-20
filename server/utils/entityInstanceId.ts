/**
 * Utility for looking up entity instanceId values
 *
 * With multi-instance support, user data (ratings, watch history, etc.)
 * needs to include the instanceId in composite keys to support the same
 * entity ID from different Stash instances.
 */

import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "./logger.js";

type EntityType = 'scene' | 'performer' | 'studio' | 'tag' | 'gallery' | 'group' | 'image';

/**
 * Get the fallback instance ID (primary/default instance's UUID).
 * This is used when an entity is not found in the database.
 * Returns undefined if no instances are configured.
 */
function getFallbackInstanceId(): string | undefined {
  const configs = stashInstanceManager.getAllConfigs();
  if (configs.length === 0) {
    return undefined;
  }
  // Return the first (highest priority) instance's ID
  return configs[0].id;
}

/**
 * Get the instanceId for an entity by looking it up in the database.
 * If the entity is not found, falls back to the primary instance's UUID and logs a warning.
 * Throws an error if no Stash instances are configured.
 */
export async function getEntityInstanceId(
  entityType: EntityType,
  entityId: string
): Promise<string> {
  const fallbackId = getFallbackInstanceId();

  if (!fallbackId) {
    throw new Error(`Cannot get instanceId for ${entityType} ${entityId}: No Stash instances configured`);
  }

  try {
    switch (entityType) {
      case 'scene': {
        const scenes = await prisma.stashScene.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (scenes.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: scenes.length,
            instanceIds: scenes.map(s => s.stashInstanceId),
          });
        }
        if (scenes.length > 0 && scenes[0].stashInstanceId) {
          return scenes[0].stashInstanceId;
        }
        break;
      }
      case 'performer': {
        const performers = await prisma.stashPerformer.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (performers.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: performers.length,
            instanceIds: performers.map(p => p.stashInstanceId),
          });
        }
        if (performers.length > 0 && performers[0].stashInstanceId) {
          return performers[0].stashInstanceId;
        }
        break;
      }
      case 'studio': {
        const studios = await prisma.stashStudio.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (studios.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: studios.length,
            instanceIds: studios.map(s => s.stashInstanceId),
          });
        }
        if (studios.length > 0 && studios[0].stashInstanceId) {
          return studios[0].stashInstanceId;
        }
        break;
      }
      case 'tag': {
        const tags = await prisma.stashTag.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (tags.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: tags.length,
            instanceIds: tags.map(t => t.stashInstanceId),
          });
        }
        if (tags.length > 0 && tags[0].stashInstanceId) {
          return tags[0].stashInstanceId;
        }
        break;
      }
      case 'gallery': {
        const galleries = await prisma.stashGallery.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (galleries.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: galleries.length,
            instanceIds: galleries.map(g => g.stashInstanceId),
          });
        }
        if (galleries.length > 0 && galleries[0].stashInstanceId) {
          return galleries[0].stashInstanceId;
        }
        break;
      }
      case 'group': {
        const groups = await prisma.stashGroup.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (groups.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: groups.length,
            instanceIds: groups.map(g => g.stashInstanceId),
          });
        }
        if (groups.length > 0 && groups[0].stashInstanceId) {
          return groups[0].stashInstanceId;
        }
        break;
      }
      case 'image': {
        const images = await prisma.stashImage.findMany({
          where: { id: entityId },
          select: { stashInstanceId: true },
          orderBy: { stashInstanceId: 'asc' },
        });
        if (images.length > 1) {
          logger.warn(`Entity exists in multiple instances, using first by ID order`, {
            entityType,
            entityId,
            instanceCount: images.length,
            instanceIds: images.map(i => i.stashInstanceId),
          });
        }
        if (images.length > 0 && images[0].stashInstanceId) {
          return images[0].stashInstanceId;
        }
        break;
      }
    }

    // Entity not found - log warning and use fallback
    logger.warn(`Entity not found in database, using fallback instance`, {
      entityType,
      entityId,
      fallbackInstanceId: fallbackId,
    });
    return fallbackId;
  } catch (error) {
    logger.error(`Error looking up entity instanceId, using fallback`, {
      entityType,
      entityId,
      fallbackInstanceId: fallbackId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackId;
  }
}

/**
 * Check batch query results for entity IDs that appear in multiple instances.
 * Logs a warning for each duplicate to aid debugging multi-instance issues.
 */
function warnBatchDuplicates(
  entityType: EntityType,
  entities: Array<{ id: string; stashInstanceId: string | null }>
): void {
  // Group by entity ID to find duplicates
  const idGroups = new Map<string, string[]>();
  for (const entity of entities) {
    if (!entity.stashInstanceId) continue;
    const existing = idGroups.get(entity.id);
    if (existing) {
      existing.push(entity.stashInstanceId);
    } else {
      idGroups.set(entity.id, [entity.stashInstanceId]);
    }
  }

  // Log warnings for any IDs that appear in multiple instances
  for (const [entityId, instanceIds] of idGroups) {
    if (instanceIds.length > 1) {
      logger.warn(`Batch lookup: entity exists in multiple instances, using first by ID order`, {
        entityType,
        entityId,
        instanceCount: instanceIds.length,
        instanceIds,
      });
    }
  }
}

/**
 * Batch get instanceIds for multiple entities of the same type.
 * Returns a Map of entityId -> instanceId.
 * Uses the primary instance's UUID as fallback for any entities not found.
 * Throws an error if no Stash instances are configured.
 */
export async function getEntityInstanceIds(
  entityType: EntityType,
  entityIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (entityIds.length === 0) {
    return result;
  }

  const fallbackId = getFallbackInstanceId();

  if (!fallbackId) {
    throw new Error(`Cannot get instanceIds for ${entityType}: No Stash instances configured`);
  }

  try {
    switch (entityType) {
      case 'scene': {
        const scenes = await prisma.stashScene.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, scenes);
        // First-write-wins for duplicate entity IDs across instances.
        // Query order is undefined, so the winning instance is arbitrary.
        // This is acceptable since this function is a fallback — callers
        // should prefer providing instanceId directly.
        scenes.forEach(s => {
          if (s.stashInstanceId && !result.has(s.id)) {
            result.set(s.id, s.stashInstanceId);
          }
        });
        break;
      }
      case 'performer': {
        const performers = await prisma.stashPerformer.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, performers);
        performers.forEach(p => {
          if (p.stashInstanceId && !result.has(p.id)) {
            result.set(p.id, p.stashInstanceId);
          }
        });
        break;
      }
      case 'studio': {
        const studios = await prisma.stashStudio.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, studios);
        studios.forEach(s => {
          if (s.stashInstanceId && !result.has(s.id)) {
            result.set(s.id, s.stashInstanceId);
          }
        });
        break;
      }
      case 'tag': {
        const tags = await prisma.stashTag.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, tags);
        tags.forEach(t => {
          if (t.stashInstanceId && !result.has(t.id)) {
            result.set(t.id, t.stashInstanceId);
          }
        });
        break;
      }
      case 'gallery': {
        const galleries = await prisma.stashGallery.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, galleries);
        galleries.forEach(g => {
          if (g.stashInstanceId && !result.has(g.id)) {
            result.set(g.id, g.stashInstanceId);
          }
        });
        break;
      }
      case 'group': {
        const groups = await prisma.stashGroup.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, groups);
        groups.forEach(g => {
          if (g.stashInstanceId && !result.has(g.id)) {
            result.set(g.id, g.stashInstanceId);
          }
        });
        break;
      }
      case 'image': {
        const images = await prisma.stashImage.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        warnBatchDuplicates(entityType, images);
        images.forEach(i => {
          if (i.stashInstanceId && !result.has(i.id)) {
            result.set(i.id, i.stashInstanceId);
          }
        });
        break;
      }
    }
  } catch (error) {
    logger.error(`Error looking up entity instanceIds`, {
      entityType,
      entityCount: entityIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fill in fallback for any missing IDs and log warnings
  const missingIds: string[] = [];
  entityIds.forEach(id => {
    if (!result.has(id)) {
      result.set(id, fallbackId);
      missingIds.push(id);
    }
  });

  if (missingIds.length > 0) {
    logger.warn(`Some entities not found in database, using fallback instance`, {
      entityType,
      missingCount: missingIds.length,
      missingIds: missingIds.slice(0, 10), // Only log first 10 to avoid spam
      fallbackInstanceId: fallbackId,
    });
  }

  return result;
}

/**
 * Entity with instanceId for name disambiguation
 */
interface EntityWithInstance {
  id: string;
  name: string;
  instanceId: string;
}

/**
 * Minimal entity result with optional instance name disambiguation
 */
interface MinimalEntityResult {
  id: string;
  name: string;
  instanceId: string;
}

/**
 * Disambiguate entity names for filter dropdowns when multiple instances
 * have entities with the same name.
 *
 * Rules:
 * - Only add instance name suffix if there are duplicates with the same name
 * - Only suffix non-default instances (default = lowest priority)
 * - Format: "Entity Name (Instance Name)"
 *
 * @param entities - Array of entities with id, name, and instanceId
 * @returns Array of minimal entities with disambiguated names
 */
export function disambiguateEntityNames(entities: EntityWithInstance[]): MinimalEntityResult[] {
  // Get all instance configs to determine priorities
  const instances = stashInstanceManager.getAllConfigs();

  // If only one instance or no instances, no disambiguation needed
  if (instances.length <= 1) {
    return entities.map(e => ({ id: e.id, name: e.name, instanceId: e.instanceId }));
  }

  // Find the default instance (lowest priority number)
  const defaultInstanceId = instances.reduce((minInst, inst) =>
    inst.priority < minInst.priority ? inst : minInst
  ).id;

  // Build instance name lookup
  const instanceNames = new Map<string, string>();
  instances.forEach(inst => instanceNames.set(inst.id, inst.name));

  // Group entities by name (case-insensitive) to find duplicates
  const nameGroups = new Map<string, EntityWithInstance[]>();
  entities.forEach(entity => {
    const normalizedName = (entity.name || "").toLowerCase();
    const group = nameGroups.get(normalizedName) || [];
    group.push(entity);
    nameGroups.set(normalizedName, group);
  });

  // Find names that have duplicates across different instances
  const duplicatedNames = new Set<string>();
  nameGroups.forEach((group, normalizedName) => {
    const uniqueInstances = new Set(group.map(e => e.instanceId));
    if (uniqueInstances.size > 1) {
      duplicatedNames.add(normalizedName);
    }
  });

  // Build result with disambiguated names
  return entities.map(entity => {
    const normalizedName = (entity.name || "").toLowerCase();
    const hasDuplicates = duplicatedNames.has(normalizedName);
    const isNonDefault = entity.instanceId !== defaultInstanceId;

    // Only suffix if there are duplicates AND this is a non-default instance
    if (hasDuplicates && isNonDefault) {
      const instanceName = instanceNames.get(entity.instanceId) || entity.instanceId;
      return {
        id: entity.id,
        name: `${entity.name} (${instanceName})`,
        instanceId: entity.instanceId,
      };
    }

    return { id: entity.id, name: entity.name, instanceId: entity.instanceId };
  });
}
