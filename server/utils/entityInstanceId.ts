/**
 * Instance names for entity pickers: when several Stash instances hold an
 * entity of the same name, the non-default ones carry their instance's name.
 *
 * The bare-id instance lookups that used to live here guessed an instance
 * (item 33); every caller now takes the instance from the request.
 */
import { stashInstanceManager } from "../services/StashInstanceManager.js";

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
export function disambiguateEntityNames(
  entities: EntityWithInstance[]
): MinimalEntityResult[] {
  // Get all instance configs to determine priorities
  const instances = stashInstanceManager.getAllConfigs();

  // If only one instance or no instances, no disambiguation needed
  if (instances.length <= 1) {
    return entities.map((e) => ({
      id: e.id,
      name: e.name,
      instanceId: e.instanceId,
    }));
  }

  // Find the default instance (lowest priority number)
  const defaultInstanceId = instances.reduce((minInst, inst) =>
    inst.priority < minInst.priority ? inst : minInst
  ).id;

  // Build instance name lookup
  const instanceNames = new Map<string, string>();
  instances.forEach((inst) => instanceNames.set(inst.id, inst.name));

  // Group entities by name (case-insensitive) to find duplicates
  const nameGroups = new Map<string, EntityWithInstance[]>();
  entities.forEach((entity) => {
    const normalizedName = (entity.name || "").toLowerCase();
    const group = nameGroups.get(normalizedName) ?? [];
    group.push(entity);
    nameGroups.set(normalizedName, group);
  });

  // Find names that have duplicates across different instances
  const duplicatedNames = new Set<string>();
  nameGroups.forEach((group, normalizedName) => {
    const uniqueInstances = new Set(group.map((e) => e.instanceId));
    if (uniqueInstances.size > 1) {
      duplicatedNames.add(normalizedName);
    }
  });

  // Build result with disambiguated names
  return entities.map((entity) => {
    const normalizedName = (entity.name || "").toLowerCase();
    const hasDuplicates = duplicatedNames.has(normalizedName);
    const isNonDefault = entity.instanceId !== defaultInstanceId;

    // Only suffix if there are duplicates AND this is a non-default instance
    if (hasDuplicates && isNonDefault) {
      const instanceName =
        instanceNames.get(entity.instanceId) || entity.instanceId;
      return {
        id: entity.id,
        name: `${entity.name} (${instanceName})`,
        instanceId: entity.instanceId,
      };
    }

    return { id: entity.id, name: entity.name, instanceId: entity.instanceId };
  });
}
