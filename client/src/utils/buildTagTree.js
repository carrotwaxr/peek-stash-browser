/**
 * Builds a tree structure from a flat array of tags with parent/child relationships.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 *
 * @param {Array} tags - Flat array of tag objects with `parents` and `children` arrays
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree(tags) {
  if (!tags || tags.length === 0) {
    return [];
  }

  // Create a map for quick lookup
  const tagMap = new Map();
  tags.forEach((tag) => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  // Build tree by nesting children under parents
  const roots = [];

  tags.forEach((tag) => {
    const treeNode = tagMap.get(tag.id);

    if (!tag.parents || tag.parents.length === 0) {
      // No parents = root node
      roots.push(treeNode);
    } else {
      // Add to each parent's children (handles multi-parent)
      tag.parents.forEach((parentRef) => {
        const parentNode = tagMap.get(parentRef.id);
        if (parentNode) {
          // Create a copy for each parent to avoid shared references
          const childCopy = { ...treeNode, children: [] };
          parentNode.children.push(childCopy);
        }
      });
    }
  });

  // Recursively populate children for non-root nodes
  function populateChildren(node) {
    const originalTag = tags.find((t) => t.id === node.id);
    if (originalTag?.children) {
      node.children = originalTag.children
        .map((childRef) => {
          const childTag = tagMap.get(childRef.id);
          if (childTag) {
            const childCopy = { ...childTag, children: [] };
            populateChildren(childCopy);
            return childCopy;
          }
          return null;
        })
        .filter(Boolean);
    }
  }

  roots.forEach(populateChildren);

  return roots;
}
