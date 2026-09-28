// client/src/utils/buildTagTree.ts
import { makeCompositeKey } from "./compositeKey";

/**
 * The tag fields the tree reads. Callers pass richer tags; every other field
 * is carried into the tree nodes unchanged. A tag's parents are on its own
 * instance; children are derived from the parents.
 */
export interface TagTreeSource {
  id: string;
  instanceId?: string | null;
  name?: string | null;
  parents?: readonly { id: string }[] | null;
  scene_count?: number | null;
  performer_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A tag in the tree: its own fields, with `children` as nested nodes. */
export type TagTreeNode<T extends TagTreeSource> = Omit<T, "children"> & {
  children: TagTreeNode<T>[];
  /** Set (to true) only on ancestors of a search match, not on matches */
  isAncestorOnly?: boolean;
};

type SortableTag = Pick<
  TagTreeSource,
  "name" | "scene_count" | "performer_count" | "created_at" | "updated_at"
>;

/**
 * Get sort compare function for a given field and direction
 */
const getSortFn = (sortField: string, sortDirection: string) => {
  const dir = sortDirection === "ASC" ? 1 : -1;

  return (a: SortableTag, b: SortableTag) => {
    let valA, valB;

    switch (sortField) {
      case "name":
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
        return valA.localeCompare(valB) * dir;

      case "scenes_count":
      case "scene_count":
        valA = a.scene_count || 0;
        valB = b.scene_count || 0;
        return (valA - valB) * dir;

      case "performer_count":
        valA = a.performer_count || 0;
        valB = b.performer_count || 0;
        return (valA - valB) * dir;

      case "created_at":
        valA = a.created_at || "";
        valB = b.created_at || "";
        return valA.localeCompare(valB) * dir;

      case "updated_at":
        valA = a.updated_at || "";
        valB = b.updated_at || "";
        return valA.localeCompare(valB) * dir;

      default:
        // Default to name sort
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
        return valA.localeCompare(valB) * dir;
    }
  };
};

/** The key a tag goes by in a tree: "id:instanceId", or the bare id without an instance */
export const tagTreeKey = (tag: { id: string; instanceId?: string | null }) =>
  makeCompositeKey(tag.id, tag.instanceId);

/**
 * Each tag's parents and children within `tags`, by `tagTreeKey`, reading
 * each tag's parents once. A parent that is not in `tags` (hidden, say) is
 * left out, so a tag whose every parent is missing is a root.
 */
export function indexTagHierarchy<T extends TagTreeSource>(
  tags: readonly T[]
): {
  byKey: Map<string, T>;
  parentKeys: Map<string, string[]>;
  childKeys: Map<string, string[]>;
  rootKeys: string[];
} {
  const byKey = new Map<string, T>();
  for (const tag of tags) byKey.set(tagTreeKey(tag), tag);

  const parentKeys = new Map<string, string[]>();
  const childKeys = new Map<string, string[]>();
  const rootKeys: string[] = [];
  for (const [key, tag] of byKey) {
    const parents = new Set<string>();
    for (const parent of tag.parents ?? []) {
      const parentKey = makeCompositeKey(parent.id, tag.instanceId);
      if (parentKey !== key && byKey.has(parentKey)) parents.add(parentKey);
    }
    parentKeys.set(key, [...parents]);
    if (parents.size === 0) rootKeys.push(key);
    for (const parentKey of parents) {
      const siblings = childKeys.get(parentKey);
      if (siblings) siblings.push(key);
      else childKeys.set(parentKey, [key]);
    }
  }
  return { byKey, parentKeys, childKeys, rootKeys };
}

/**
 * Builds a tree structure from a flat array of tags with their parents.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 * Each level is sorted according to the specified sort field and direction.
 * Linear in the number of nodes: every lookup goes through a map keyed by
 * `tagTreeKey`, so tags from two instances never share a node.
 *
 * @param {Array} tags - Flat array of tag objects with `parents` arrays
 * @param {Object} options - Options object
 * @param {string} options.filterQuery - Optional search query to filter tags (shows matches + ancestors)
 * @param {string} options.sortField - Field to sort by (name, scenes_count, etc.)
 * @param {string} options.sortDirection - Sort direction (ASC or DESC)
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree<T extends TagTreeSource>(
  tags: readonly T[],
  options: {
    filterQuery?: string;
    sortField?: string;
    sortDirection?: string;
  } = {}
): TagTreeNode<T>[] {
  const {
    filterQuery = "",
    sortField = "name",
    sortDirection = "ASC",
  } = options;
  if (!tags || tags.length === 0) {
    return [];
  }

  const { byKey, parentKeys, childKeys, rootKeys } = indexTagHierarchy(tags);

  // If filtering, determine which tags match and which are ancestors of matches
  const matchingKeys = new Set<string>();
  const ancestorKeys = new Set<string>();

  if (filterQuery) {
    const query = filterQuery.toLowerCase();
    for (const [key, tag] of byKey) {
      if (tag.name?.toLowerCase().includes(query)) matchingKeys.add(key);
    }

    // If no matches, return empty
    if (matchingKeys.size === 0) {
      return [];
    }

    // Every ancestor of a match, each walked once
    const pending = [...matchingKeys];
    const seen = new Set(pending);
    for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
      for (const parentKey of parentKeys.get(key) ?? []) {
        if (seen.has(parentKey)) continue;
        seen.add(parentKey);
        if (!matchingKeys.has(parentKey)) ancestorKeys.add(parentKey);
        pending.push(parentKey);
      }
    }
  }

  const sortFn = getSortFn(sortField, sortDirection);
  // The keys on the path from the root, against circular parents
  const onPath = new Set<string>();

  const buildNode = (key: string): TagTreeNode<T> | null => {
    if (onPath.has(key)) return null;
    const tag = byKey.get(key);
    if (!tag) return null;

    // When filtering, skip tags that aren't matches or ancestors
    if (filterQuery && !matchingKeys.has(key) && !ancestorKeys.has(key)) {
      return null;
    }

    onPath.add(key);
    const children: TagTreeNode<T>[] = [];
    for (const childKey of childKeys.get(key) ?? []) {
      const child = buildNode(childKey);
      if (child) children.push(child);
    }
    onPath.delete(key);

    const node: TagTreeNode<T> = {
      ...tag,
      children: children.sort(sortFn),
    };
    // Only add isAncestorOnly when true (for ancestors of matches, not matches themselves)
    if (filterQuery && ancestorKeys.has(key)) {
      node.isAncestorOnly = true;
    }
    return node;
  };

  const roots: TagTreeNode<T>[] = [];
  for (const key of rootKeys) {
    const node = buildNode(key);
    if (node) roots.push(node);
  }

  // Sort roots as well
  return roots.sort(sortFn);
}
