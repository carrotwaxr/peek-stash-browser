/**
 * Utility for looking up entity instanceId values
 *
 * With multi-instance support, user data (ratings, watch history, etc.)
 * needs to include the instanceId in composite keys to support the same
 * entity ID from different Stash instances.
 */

import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";

type EntityType = 'scene' | 'performer' | 'studio' | 'tag' | 'gallery' | 'group' | 'image';

const DEFAULT_INSTANCE_ID = 'default';

/**
 * Get the instanceId for an entity by looking it up in the database.
 * Returns 'default' if the entity is not found or has no instanceId.
 */
export async function getEntityInstanceId(
  entityType: EntityType,
  entityId: string
): Promise<string> {
  try {
    switch (entityType) {
      case 'scene': {
        // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
        const scene = await prisma.stashScene.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return scene?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'performer': {
        const performer = await prisma.stashPerformer.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return performer?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'studio': {
        const studio = await prisma.stashStudio.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return studio?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'tag': {
        const tag = await prisma.stashTag.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return tag?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'gallery': {
        const gallery = await prisma.stashGallery.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return gallery?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'group': {
        const group = await prisma.stashGroup.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return group?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      case 'image': {
        const image = await prisma.stashImage.findFirst({
          where: { id: entityId },
          select: { stashInstanceId: true },
        });
        return image?.stashInstanceId || DEFAULT_INSTANCE_ID;
      }
      default:
        return DEFAULT_INSTANCE_ID;
    }
  } catch {
    return DEFAULT_INSTANCE_ID;
  }
}

/**
 * Batch get instanceIds for multiple entities of the same type.
 * Returns a Map of entityId -> instanceId.
 */
export async function getEntityInstanceIds(
  entityType: EntityType,
  entityIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (entityIds.length === 0) {
    return result;
  }

  try {
    switch (entityType) {
      case 'scene': {
        const scenes = await prisma.stashScene.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        scenes.forEach(s => result.set(s.id, s.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'performer': {
        const performers = await prisma.stashPerformer.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        performers.forEach(p => result.set(p.id, p.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'studio': {
        const studios = await prisma.stashStudio.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        studios.forEach(s => result.set(s.id, s.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'tag': {
        const tags = await prisma.stashTag.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        tags.forEach(t => result.set(t.id, t.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'gallery': {
        const galleries = await prisma.stashGallery.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        galleries.forEach(g => result.set(g.id, g.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'group': {
        const groups = await prisma.stashGroup.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        groups.forEach(g => result.set(g.id, g.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
      case 'image': {
        const images = await prisma.stashImage.findMany({
          where: { id: { in: entityIds } },
          select: { id: true, stashInstanceId: true },
        });
        images.forEach(i => result.set(i.id, i.stashInstanceId || DEFAULT_INSTANCE_ID));
        break;
      }
    }
  } catch {
    // On error, return empty map - callers will use default
  }

  // Fill in defaults for any missing IDs
  entityIds.forEach(id => {
    if (!result.has(id)) {
      result.set(id, DEFAULT_INSTANCE_ID);
    }
  });

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
    return entities.map(e => ({ id: e.id, name: e.name }));
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
      };
    }

    return { id: entity.id, name: entity.name };
  });
}
