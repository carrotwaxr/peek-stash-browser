// client/src/utils/buildFolderTree.js

export const UNTAGGED_FOLDER_ID = "__untagged__";

/**
 * Get thumbnail from an item (scene, gallery, or image)
 */
const getItemThumbnail = (item) => {
  // Scene
  if (item.paths?.screenshot) return item.paths.screenshot;
  // Gallery
  if (item.cover?.paths?.thumbnail) return item.cover.paths.thumbnail;
  // Image
  if (item.paths?.thumbnail) return item.paths.thumbnail;
  return null;
};

/**
 * Build a folder tree structure from items and tag hierarchy.
 *
 * Items only appear at a level if they have that exact tag AND don't have any
 * child tags that would place them deeper in the hierarchy.
 *
 * @param {Array} items - Content items (scenes, galleries, images) with tags array
 * @param {Array} tags - All tags with hierarchy (parents/children arrays)
 * @param {Array} currentPath - Array of tag IDs representing current navigation path
 * @returns {Object} { folders: FolderNode[], items: Item[], breadcrumbs: Breadcrumb[] }
 */
export function buildFolderTree(items, tags, currentPath = []) {
  if (!items || !tags) {
    return { folders: [], items: [], breadcrumbs: [] };
  }

  // Build tag lookup map
  const tagMap = new Map();
  tags.forEach((tag) => tagMap.set(tag.id, tag));

  // Build breadcrumbs from path
  const breadcrumbs = currentPath.map((id) => {
    const tag = tagMap.get(id);
    return { id, name: tag?.name || "Unknown" };
  });

  // Determine current location
  const currentTagId = currentPath[currentPath.length - 1] || null;
  const currentTag = currentTagId ? tagMap.get(currentTagId) : null;

  // Get child tag IDs for current level
  let childTagIds;
  if (currentTag) {
    // Inside a tag - show its children
    childTagIds = new Set((currentTag.children || []).map((c) => c.id));
  } else {
    // At root - show top-level tags (no parents)
    childTagIds = new Set(
      tags.filter((t) => !t.parents || t.parents.length === 0).map((t) => t.id)
    );
  }

  // Group items by which folder they belong to at this level
  const folderContents = new Map(); // tagId -> items[] (for recursive counts)
  const leafItems = []; // Items that appear directly at this level
  const untaggedItems = [];

  items.forEach((item) => {
    const itemTagIds = new Set((item.tags || []).map((t) => t.id));

    // Check if item has no tags
    if (itemTagIds.size === 0) {
      if (currentPath.length === 0) {
        // Only show untagged at root
        untaggedItems.push(item);
      }
      return;
    }

    // At ROOT level: items never appear as loose items
    // They only appear inside folders (or in Untagged)
    if (currentPath.length === 0) {
      // Add to each root-level folder the item belongs to (for counts)
      childTagIds.forEach((childId) => {
        if (itemHasTagOrDescendant(item, childId, tagMap)) {
          if (!folderContents.has(childId)) {
            folderContents.set(childId, []);
          }
          folderContents.get(childId).push(item);
        }
      });
      return;
    }

    // INSIDE a tag folder: determine where this item should appear
    // Item must have the current tag directly to appear at this level
    if (!itemTagIds.has(currentTagId)) {
      // Item doesn't have current tag directly - it's here via a deeper descendant
      // Still add to child folder counts, but don't show as leaf
      childTagIds.forEach((childId) => {
        if (itemHasTagOrDescendant(item, childId, tagMap)) {
          if (!folderContents.has(childId)) {
            folderContents.set(childId, []);
          }
          folderContents.get(childId).push(item);
        }
      });
      return;
    }

    // Item has current tag directly - check if it also has any child tag
    let hasChildTag = false;
    for (const childId of childTagIds) {
      if (itemHasTagOrDescendant(item, childId, tagMap)) {
        if (!folderContents.has(childId)) {
          folderContents.set(childId, []);
        }
        folderContents.get(childId).push(item);
        hasChildTag = true;
      }
    }

    // If item has current tag but NO child tags, it's a leaf item at this level
    if (!hasChildTag) {
      leafItems.push(item);
    }
  });

  // Build folder nodes
  // Show ALL folders from tag hierarchy that have content (pre-computed count > 0)
  // This ensures folders appear even when current page has no items for them
  const folders = [];

  childTagIds.forEach((tagId) => {
    const tag = tagMap.get(tagId);
    if (!tag) return;

    const folderItems = folderContents.get(tagId) || [];

    // Get pre-computed count from tag (image_count, scene_count, or gallery_count)
    // These are set by the backend during sync and represent the total items with this tag
    const preComputedCount = tag.image_count || tag.scene_count || tag.gallery_count || 0;

    // Check if tag has children (it's a container/organizational tag)
    const hasChildren = tag.children && tag.children.length > 0;

    // If no items on current page AND no pre-computed count AND no children, this folder is truly empty
    // Container tags (with children) should always show even if they have no direct content
    if (folderItems.length === 0 && preComputedCount === 0 && !hasChildren) {
      return;
    }

    // Use items count if available (more accurate for current page context)
    // Fall back to pre-computed count when no items on current page
    const totalCount = folderItems.length > 0 ? folderItems.length : preComputedCount;

    // Get thumbnail - prefer tag image, then first item, then null
    const thumbnail = tag.image_path || (folderItems[0] ? getItemThumbnail(folderItems[0]) : null);

    folders.push({
      id: tagId,
      tag,
      name: tag.name,
      thumbnail,
      totalCount,
      isFolder: true,
    });
  });

  // Add untagged folder if at root and has items
  if (currentPath.length === 0 && untaggedItems.length > 0) {
    folders.push({
      id: UNTAGGED_FOLDER_ID,
      tag: null,
      name: "Untagged",
      thumbnail: getItemThumbnail(untaggedItems[0]),
      totalCount: untaggedItems.length,
      isFolder: true,
    });
  }

  // Sort folders alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));

  return {
    folders,
    items: leafItems,
    breadcrumbs,
  };
}

/**
 * Check if an item has a tag or any of its descendants
 */
function itemHasTagOrDescendant(item, tagId, tagMap, visited = new Set()) {
  if (visited.has(tagId)) return false;
  visited.add(tagId);

  const itemTagIds = new Set((item.tags || []).map((t) => t.id));

  // Direct match
  if (itemTagIds.has(tagId)) return true;

  // Check descendants
  const tag = tagMap.get(tagId);
  if (tag?.children) {
    for (const child of tag.children) {
      if (itemHasTagOrDescendant(item, child.id, tagMap, visited)) {
        return true;
      }
    }
  }

  return false;
}
