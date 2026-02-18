/**
 * Hierarchy Utilities
 *
 * Functions for working with hierarchical entities (tags and studios).
 * Used to expand filter selections to include child entities when
 * "Include sub-tags" or "Include sub-studios" options are enabled.
 *
 * Depth parameter:
 *   0 or undefined: No hierarchy (exact match only)
 *   -1: All descendants (infinite depth)
 *   1, 2, 3...: Specific depth levels
 */

import { stashEntityService } from "../services/StashEntityService.js";

/**
 * Get all descendant tag IDs for a given tag ID
 *
 * @param tagId - The parent tag ID to start from
 * @param depth - How deep to traverse (-1 for infinite, 0 for none, N for N levels)
 * @returns Set of tag IDs including the original and all descendants up to depth
 */
export async function getDescendantTagIds(
  tagId: string,
  depth: number
): Promise<Set<string>> {
  const result = new Set<string>();
  result.add(tagId);

  // depth 0 or undefined means no hierarchy
  if (depth === 0) {
    return result;
  }

  const allTags = await stashEntityService.getAllTags();

  // Build a map of tag ID to its children by inverting parent relationships
  // Tags store parents, not children, so we invert to get children
  const childrenMap = new Map<string, string[]>();
  for (const tag of allTags) {
    if (tag.parents && Array.isArray(tag.parents)) {
      for (const parent of tag.parents) {
        const parentId = String(parent.id);
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)?.push(String(tag.id));
      }
    }
  }
  // BFS to collect descendants up to depth
  const queue: { id: string; currentDepth: number }[] = [
    { id: tagId, currentDepth: 0 },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;
    const { id, currentDepth } = item;

    // Check if we've reached the depth limit (depth -1 means infinite)
    if (depth !== -1 && currentDepth >= depth) {
      continue;
    }

    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push({ id: childId, currentDepth: currentDepth + 1 });
      }
    }
  }

  return result;
}

/**
 * Get all descendant studio IDs for a given studio ID
 *
 * @param studioId - The parent studio ID to start from
 * @param depth - How deep to traverse (-1 for infinite, 0 for none, N for N levels)
 * @returns Set of studio IDs including the original and all descendants up to depth
 */
export async function getDescendantStudioIds(
  studioId: string,
  depth: number
): Promise<Set<string>> {
  const result = new Set<string>();
  result.add(studioId);

  // depth 0 or undefined means no hierarchy
  if (depth === 0) {
    return result;
  }

  const allStudios = await stashEntityService.getAllStudios();

  // Build a map of studio ID to its children by inverting parent relationships
  // Studios store parent_studio, not child_studios, so we invert to get children
  const childrenMap = new Map<string, string[]>();
  for (const studio of allStudios) {
    if (studio.parent_studio?.id) {
      const parentId = String(studio.parent_studio.id);
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push(String(studio.id));
    }
  }

  // BFS to collect descendants up to depth
  const queue: { id: string; currentDepth: number }[] = [
    { id: studioId, currentDepth: 0 },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;
    const { id, currentDepth } = item;

    // Check if we've reached the depth limit (depth -1 means infinite)
    if (depth !== -1 && currentDepth >= depth) {
      continue;
    }

    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push({ id: childId, currentDepth: currentDepth + 1 });
      }
    }
  }

  return result;
}

/**
 * Expand tag IDs to include descendants based on depth
 *
 * @param tagIds - Array of tag IDs to expand
 * @param depth - How deep to traverse (-1 for infinite, 0 for none, N for N levels)
 * @returns Array of expanded tag IDs (original + descendants)
 */
export async function expandTagIds(tagIds: string[], depth: number): Promise<string[]> {
  if (depth === 0 || !tagIds || tagIds.length === 0) {
    return tagIds;
  }

  const expandedSet = new Set<string>();
  for (const tagId of tagIds) {
    const descendants = await getDescendantTagIds(String(tagId), depth);
    for (const id of descendants) {
      expandedSet.add(id);
    }
  }

  return Array.from(expandedSet);
}

/**
 * Expand studio IDs to include descendants based on depth
 *
 * @param studioIds - Array of studio IDs to expand
 * @param depth - How deep to traverse (-1 for infinite, 0 for none, N for N levels)
 * @returns Array of expanded studio IDs (original + descendants)
 */
export async function expandStudioIds(studioIds: string[], depth: number): Promise<string[]> {
  if (depth === 0 || !studioIds || studioIds.length === 0) {
    return studioIds;
  }

  const expandedSet = new Set<string>();
  for (const studioId of studioIds) {
    const descendants = await getDescendantStudioIds(String(studioId), depth);
    for (const id of descendants) {
      expandedSet.add(id);
    }
  }

  return Array.from(expandedSet);
}

/**
 * Hydrate tag parent/child relationships
 *
 * Tags only store parentIds. This function:
 * 1. Hydrates parents with full tag data (id + name)
 * 2. Computes children by inverting parent relationships
 *
 * @param tags - Tags to hydrate
 * @returns Tags with hydrated parents and computed children
 */
export async function hydrateTagRelationships<T extends { id: string; name?: string; parents?: { id: string; name?: string }[] }>(
  tags: T[]
): Promise<(T & { children: { id: string; name: string }[] })[]> {
  // Fetch ALL tags from cache to build complete name lookup
  // This ensures we can resolve parent names even for single-item requests
  const allTags = await stashEntityService.getAllTags();
  const tagNameMap = new Map<string, string>();
  for (const tag of allTags) {
    tagNameMap.set(tag.id, tag.name || "Unknown");
  }

  // Build children map by inverting parent relationships from ALL tags
  const childrenMap = new Map<string, { id: string; name: string }[]>();
  for (const tag of allTags) {
    if (tag.parents && Array.isArray(tag.parents)) {
      for (const parent of tag.parents) {
        if (!childrenMap.has(parent.id)) {
          childrenMap.set(parent.id, []);
        }
        childrenMap.get(parent.id)?.push({
          id: tag.id,
          name: tag.name || "Unknown",
        });
      }
    }
  }

  // Hydrate each tag in the input array
  return tags.map((tag) => ({
    ...tag,
    // Hydrate parents with names
    parents: (tag.parents || []).map((p) => ({
      id: p.id,
      name: tagNameMap.get(p.id) || "Unknown",
    })),
    // Add computed children
    children: childrenMap.get(tag.id) || [],
  }));
}

/**
 * Hydrate entity tags with full tag data (id, name, image_path)
 *
 * Entities store tagIds as JSON array of IDs. This function:
 * 1. Fetches all tags from cache
 * 2. Hydrates tag objects with names and image_path (preserving existing data)
 *
 * @param entities - Entities with tags array of {id} objects
 * @returns Entities with hydrated tags array of {id, name, image_path} objects
 */
export async function hydrateEntityTags<T extends { tags?: { id: string; name?: string; image_path?: string | null }[] }>(
  entities: T[]
): Promise<T[]> {
  // Get all tags to build lookup
  const allTags = await stashEntityService.getAllTags();
  const tagDataMap = new Map<string, { name: string; image_path: string | null }>();
  for (const tag of allTags) {
    tagDataMap.set(tag.id, {
      name: tag.name || "Unknown",
      image_path: tag.image_path || null,
    });
  }

  // Hydrate each entity's tags, preserving existing data
  return entities.map((entity) => ({
    ...entity,
    tags: (entity.tags || []).map((t) => {
      const tagData = tagDataMap.get(t.id);
      return {
        ...t,
        id: t.id,
        name: tagData?.name || t.name || "Unknown",
        image_path: t.image_path ?? tagData?.image_path ?? null,
      };
    }),
  }));
}

/**
 * Hydrate studio parent/child relationships
 *
 * Studios only store parentId. This function:
 * 1. Hydrates parent_studio with full studio data (id + name)
 * 2. Computes child_studios by inverting parent relationships
 *
 * @param studios - Studios to hydrate
 * @returns Studios with hydrated parent_studio and computed child_studios
 */
export async function hydrateStudioRelationships<T extends { id: string; name?: string; parent_studio?: { id: string; name?: string } | null }>(
  studios: T[]
): Promise<(T & { child_studios: { id: string; name: string }[] })[]> {
  // Fetch ALL studios from cache to build complete name lookup
  // This ensures we can resolve parent names even for single-item requests
  const allStudios = await stashEntityService.getAllStudios();
  const studioNameMap = new Map<string, string>();
  for (const studio of allStudios) {
    studioNameMap.set(studio.id, studio.name || "Unknown");
  }

  // Build children map by inverting parent relationships from ALL studios
  const childrenMap = new Map<string, { id: string; name: string }[]>();
  for (const studio of allStudios) {
    if (studio.parent_studio?.id) {
      const parentId = studio.parent_studio.id;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push({
        id: studio.id,
        name: studio.name || "Unknown",
      });
    }
  }

  // Hydrate each studio in the input array
  return studios.map((studio) => ({
    ...studio,
    // Hydrate parent with name
    parent_studio: studio.parent_studio?.id
      ? {
          id: studio.parent_studio.id,
          name: studioNameMap.get(studio.parent_studio.id) || "Unknown",
        }
      : null,
    // Add computed children
    child_studios: childrenMap.get(studio.id) || [],
  }));
}
