/**
 * EntityExclusionHelper
 *
 * Reads a user's pre-computed exclusions into memory, for checks by id.
 * Lists and reads apply exclusions in SQL (the exclusion join on
 * UserExcludedEntity) or through EntityAccessService, not through this.
 *
 * Supports both global exclusions (empty instanceId → applies to all instances)
 * and instance-scoped exclusions (specific instanceId → applies only to that instance).
 */
import prisma from "../prisma/singleton.js";
import { entityKey } from "../utils/entityRef.js";

/** Structured exclusion data for instance-aware in-memory filtering */
export interface ExclusionData {
  /** Entity IDs excluded from ALL instances (global exclusions with empty instanceId) */
  globalIds: Set<string>;
  /** entityKey(entityId, instanceId) of the instance-scoped exclusions */
  scopedKeys: Set<string>;
}

class EntityExclusionHelper {
  /**
   * Get excluded entity IDs for a user and entity type.
   * Useful when you need the Set for other operations (e.g., DB-level NOT IN clauses).
   *
   * Instance-aware behavior:
   * - When `instanceId` is provided: returns global exclusions + exclusions scoped to that instance.
   *   This gives precise results for single-instance queries.
   * - When `instanceId` is omitted: returns ALL exclusions (global + all scoped) as a superset.
   *   This is the safe default that over-excludes rather than under-excludes.
   *
   * @param userId User ID to check exclusions for (if undefined, returns empty Set)
   * @param entityType Type of entity
   * @param instanceId Optional instance ID to scope exclusions to a specific instance
   * @returns Set of excluded entity IDs
   */
  async getExcludedIds(
    userId: number | undefined,
    entityType: string,
    instanceId?: string
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
        instanceId: true,
      },
    });

    if (instanceId === undefined) {
      // No instance specified: return all exclusions as a flat superset (backward compat)
      return new Set(records.map((r) => r.entityId));
    }

    // Instance specified: return global exclusions + exclusions scoped to this instance
    const result = new Set<string>();
    for (const r of records) {
      if (!r.instanceId || r.instanceId === instanceId) {
        result.add(r.entityId);
      }
    }
    return result;
  }

  /**
   * Get structured exclusion data for instance-aware in-memory filtering.
   * Returns both global IDs and scoped exclusion keys, allowing callers to
   * check per-entity instanceId without additional DB queries.
   *
   * Use this when filtering entity arrays that have instanceId and you need
   * to differentiate between global and instance-scoped exclusions.
   *
   * @param userId User ID to check exclusions for (if undefined, returns empty sets)
   * @param entityType Type of entity
   * @returns Object with globalIds (Set of entity IDs excluded from all instances)
   *          and scopedKeys (Set of entityKey(entityId, instanceId) for instance-scoped exclusions)
   */
  async getExclusionData(
    userId: number | undefined,
    entityType: string
  ): Promise<ExclusionData> {
    if (!userId) {
      return { globalIds: new Set(), scopedKeys: new Set() };
    }
    const records = await prisma.userExcludedEntity.findMany({
      where: {
        userId,
        entityType,
      },
      select: {
        entityId: true,
        instanceId: true,
      },
    });

    const globalIds = new Set<string>();
    const scopedKeys = new Set<string>();

    for (const r of records) {
      if (!r.instanceId) {
        globalIds.add(r.entityId);
      } else {
        scopedKeys.add(entityKey(r.entityId, r.instanceId));
      }
    }

    return { globalIds, scopedKeys };
  }

  /**
   * Check if an entity is excluded, given pre-fetched exclusion data.
   * Utility for callers using getExclusionData() for in-memory filtering.
   *
   * @param entityId The entity ID to check
   * @param entityInstanceId The entity's instance ID (if available)
   * @param exclusionData Data from getExclusionData()
   * @returns true if the entity is excluded
   */
  isExcluded(
    entityId: string,
    entityInstanceId: string | undefined,
    exclusionData: ExclusionData
  ): boolean {
    if (exclusionData.globalIds.has(entityId)) {
      return true;
    }
    if (
      entityInstanceId &&
      exclusionData.scopedKeys.has(entityKey(entityId, entityInstanceId))
    ) {
      return true;
    }
    return false;
  }
}

export const entityExclusionHelper = new EntityExclusionHelper();
