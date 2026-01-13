// client/src/utils/buildTagTree.js

/**
 * Get sort compare function for a given field and direction
 */
const getSortFn = (sortField, sortDirection) => {
  const dir = sortDirection === "ASC" ? 1 : -1;

  return (a, b) => {
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

/**
 * Builds a tree structure from a flat array of tags with parent/child relationships.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 * Each level is sorted according to the specified sort field and direction.
 *
 * @param {Array} tags - Flat array of tag objects with `parents` and `children` arrays
 * @param {Object} options - Options object
 * @param {string} options.filterQuery - Optional search query to filter tags (shows matches + ancestors)
 * @param {string} options.sortField - Field to sort by (name, scenes_count, etc.)
 * @param {string} options.sortDirection - Sort direction (ASC or DESC)
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree(tags, options = {}) {
  const { filterQuery = "", sortField = "name", sortDirection = "ASC" } = options;
  if (!tags || tags.length === 0) {
    return [];
  }

  // Create a map for quick lookup
  const tagMap = new Map();
  tags.forEach((tag) => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  // If filtering, determine which tags match and which are ancestors of matches
  let matchingIds = new Set();
  let ancestorIds = new Set();

  if (filterQuery) {
    const query = filterQuery.toLowerCase();

    // Find all matching tags
    tags.forEach((tag) => {
      if (tag.name?.toLowerCase().includes(query)) {
        matchingIds.add(tag.id);
      }
    });

    // If no matches, return empty
    if (matchingIds.size === 0) {
      return [];
    }

    // Find all ancestors of matching tags
    const findAncestors = (tagId, visited = new Set()) => {
      if (visited.has(tagId)) return;
      visited.add(tagId);

      const tag = tags.find((t) => t.id === tagId);
      if (tag?.parents) {
        tag.parents.forEach((parent) => {
          if (!matchingIds.has(parent.id)) {
            ancestorIds.add(parent.id);
          }
          findAncestors(parent.id, visited);
        });
      }
    };

    matchingIds.forEach((id) => findAncestors(id));
  }

  // Build tree by nesting children under parents
  const roots = [];
  const sortFn = getSortFn(sortField, sortDirection);

  // Recursive function to build tree node with children
  const buildNode = (tagId, visitedPath = new Set()) => {
    // Prevent infinite loops from circular references
    if (visitedPath.has(tagId)) return null;

    const tag = tagMap.get(tagId);
    if (!tag) return null;

    // When filtering, skip tags that aren't matches or ancestors
    if (filterQuery && !matchingIds.has(tagId) && !ancestorIds.has(tagId)) {
      return null;
    }

    const node = {
      ...tag,
      children: [],
    };
    // Only add isAncestorOnly when true (for ancestors of matches, not matches themselves)
    if (filterQuery && ancestorIds.has(tagId)) {
      node.isAncestorOnly = true;
    }

    // Build children
    const originalTag = tags.find((t) => t.id === tagId);
    if (originalTag?.children) {
      const newPath = new Set(visitedPath);
      newPath.add(tagId);

      node.children = originalTag.children
        .map((childRef) => buildNode(childRef.id, newPath))
        .filter(Boolean)
        .sort(sortFn);
    }

    return node;
  };

  // Find root tags and build tree
  tags.forEach((tag) => {
    if (!tag.parents || tag.parents.length === 0) {
      const node = buildNode(tag.id);
      if (node) {
        roots.push(node);
      }
    }
  });

  // Sort roots as well
  return roots.sort(sortFn);
}
