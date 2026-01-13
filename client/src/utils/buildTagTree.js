// client/src/utils/buildTagTree.js
/**
 * Builds a tree structure from a flat array of tags with parent/child relationships.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 *
 * @param {Array} tags - Flat array of tag objects with `parents` and `children` arrays
 * @param {string} filterQuery - Optional search query to filter tags (shows matches + ancestors)
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree(tags, filterQuery = "") {
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
        .filter(Boolean);
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

  return roots;
}
