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

import { cachedEntityQueryService } from "../services/CachedEntityQueryService.js";

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

  const allTags = await cachedEntityQueryService.getAllTags();

  // Build a map of tag ID to its children for O(1) lookups
  const childrenMap = new Map<string, string[]>();
  for (const tag of allTags) {
    if (tag.children && Array.isArray(tag.children)) {
      childrenMap.set(
        String(tag.id),
        tag.children.map((c) => String(c.id))
      );
    }
  }

  // BFS to collect descendants up to depth
  const queue: { id: string; currentDepth: number }[] = [
    { id: tagId, currentDepth: 0 },
  ];

  while (queue.length > 0) {
    const { id, currentDepth } = queue.shift()!;

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

  const allStudios = await cachedEntityQueryService.getAllStudios();

  // Build a map of studio ID to its children for O(1) lookups
  const childrenMap = new Map<string, string[]>();
  for (const studio of allStudios) {
    if (studio.child_studios && Array.isArray(studio.child_studios)) {
      childrenMap.set(
        String(studio.id),
        studio.child_studios.map((c) => String(c.id))
      );
    }
  }

  // BFS to collect descendants up to depth
  const queue: { id: string; currentDepth: number }[] = [
    { id: studioId, currentDepth: 0 },
  ];

  while (queue.length > 0) {
    const { id, currentDepth } = queue.shift()!;

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
