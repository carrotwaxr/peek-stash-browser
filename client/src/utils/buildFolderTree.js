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

  // Determine which tags to show as folders at this level
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
  const folderContents = new Map(); // tagId -> items[]
  const leafItems = []; // Items that are "directly" at this level
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

    // Check if item belongs to any child folder at this level
    let belongsToChildFolder = false;
    childTagIds.forEach((childId) => {
      // Item belongs to this folder if it has the tag or any descendant
      if (itemHasTagOrDescendant(item, childId, tagMap)) {
        if (!folderContents.has(childId)) {
          folderContents.set(childId, []);
        }
        folderContents.get(childId).push(item);
        belongsToChildFolder = true;
      }
    });

    // If at root and item doesn't belong to any root-level folder, it's a leaf
    // If inside a tag and item is directly tagged with current tag but not children, it's a leaf
    if (!belongsToChildFolder) {
      if (currentTagId && itemTagIds.has(currentTagId)) {
        leafItems.push(item);
      } else if (!currentTagId) {
        // At root with tags but none are root-level tags - treat as leaf
        leafItems.push(item);
      }
    }
  });

  // Build folder nodes (only folders with content)
  const folders = [];

  childTagIds.forEach((tagId) => {
    const tag = tagMap.get(tagId);
    if (!tag) return;

    const folderItems = folderContents.get(tagId) || [];
    if (folderItems.length === 0) return; // Hide empty folders

    // Calculate total count (recursive)
    const totalCount = folderItems.length;

    // Get thumbnail
    const thumbnail = tag.image_path || getItemThumbnail(folderItems[0]) || null;

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

  // Combine leaf items with untagged if at root
  const displayItems = currentPath.length === 0
    ? [...leafItems, ...untaggedItems]
    : leafItems;

  return {
    folders,
    items: displayItems,
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
