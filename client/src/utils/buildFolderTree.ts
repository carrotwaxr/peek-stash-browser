// client/src/utils/buildFolderTree.ts
import { indexTagHierarchy, tagTreeKey } from "./buildTagTree";
import { makeCompositeKey, parseCompositeKey } from "./compositeKey";

export const UNTAGGED_FOLDER_ID = "__untagged__";

/**
 * The fields the folder tree reads from a scene, gallery or image. Its tags
 * are on its own instance.
 */
export interface FolderTreeItem {
  instanceId?: string | null;
  tags?: readonly { id: string }[] | null;
  paths?: { screenshot?: string | null; thumbnail?: string | null } | null;
  cover?: { paths?: { thumbnail?: string | null } | null } | null;
}

/**
 * The fields the folder view reads from a tag (a row of the tag tree). Its
 * parents are on its own instance; children are derived from them.
 */
export interface FolderTreeTag {
  id: string;
  instanceId?: string | null;
  name: string;
  parents?: readonly { id: string }[] | null;
  image_count?: number | null;
  scene_count?: number | null;
  gallery_count?: number | null;
  image_path?: string | null;
}

/** A folder at the current level: a tag, or the Untagged folder (tag null) */
export interface FolderNode<T extends FolderTreeTag> {
  /** The tag's `tagTreeKey` ("id:instanceId"), or UNTAGGED_FOLDER_ID */
  id: string;
  tag: T | null;
  name: string;
  thumbnail: string | null;
  totalCount: number;
  isFolder: true;
}

export interface FolderTree<I extends FolderTreeItem, T extends FolderTreeTag> {
  folders: FolderNode<T>[];
  items: I[];
  breadcrumbs: { id: string; name: string }[];
}

/**
 * Get thumbnail from an item (scene, gallery, or image)
 */
const getItemThumbnail = (item: FolderTreeItem): string | null => {
  // Scene
  if (item.paths?.screenshot) return item.paths.screenshot;
  // Gallery
  if (item.cover?.paths?.thumbnail) return item.cover.paths.thumbnail;
  // Image
  if (item.paths?.thumbnail) return item.paths.thumbnail;
  return null;
};

/**
 * A folder path with its bare segments resolved to tag keys. A folder-view
 * URL bookmarked before paths named the instance lists bare ids: each goes
 * to the tag with that id on the page's instance (`instanceId`, the URL's
 * `instance`), else the only tag with that id, else the first by instance
 * id. A segment no loaded tag has, and a path with no bare segment, is
 * returned as it is.
 */
export function resolveFolderPath(
  path: readonly string[],
  tags: readonly FolderTreeTag[],
  instanceId: string | null
): readonly string[] {
  const isBare = (segment: string) =>
    parseCompositeKey(segment).instanceId === undefined;
  if (!path.some(isBare)) return path;

  // The first tag per id: the page's instance's, else the lowest instance id
  const rank = (tag: FolderTreeTag) =>
    tag.instanceId === instanceId ? "" : `~${tag.instanceId ?? ""}`;
  const chosen = new Map<string, FolderTreeTag>();
  for (const tag of tags) {
    const current = chosen.get(tag.id);
    if (!current || rank(tag) < rank(current)) chosen.set(tag.id, tag);
  }
  return path.map((segment) => {
    const tag = isBare(segment) ? chosen.get(segment) : undefined;
    return tag ? tagTreeKey(tag) : segment;
  });
}

/**
 * Build a folder tree structure from items and tag hierarchy.
 *
 * Items only appear at a level if they have that exact tag AND don't have any
 * child tags that would place them deeper in the hierarchy.
 *
 * Tags go by `tagTreeKey` ("id:instanceId"), paths too, so two instances'
 * same-numbered tags are two folders. Each tag's ancestors are computed once
 * per call; an item is placed by the union of its tags' ancestors, not by
 * walking every folder's subtree per item.
 *
 * @param {Array} items - Content items (scenes, galleries, images) with tags array
 * @param {Array} tags - All tags with their parents
 * @param {Array} currentPath - Array of tag keys representing current navigation path
 * @returns {Object} { folders: FolderNode[], items: Item[], breadcrumbs: Breadcrumb[] }
 */
export function buildFolderTree<
  I extends FolderTreeItem,
  T extends FolderTreeTag,
>(
  items: readonly I[],
  tags: readonly T[],
  currentPath: string[] = []
): FolderTree<I, T> {
  if (!items || !tags) {
    return { folders: [], items: [], breadcrumbs: [] };
  }

  const { byKey, parentKeys, childKeys, rootKeys } = indexTagHierarchy(tags);

  // Build breadcrumbs from path
  const breadcrumbs = currentPath.map((key) => {
    const tag = byKey.get(key);
    return { id: key, name: tag?.name || "Unknown" };
  });

  // Determine current location
  const currentTagKey = currentPath[currentPath.length - 1] ?? null;
  const currentTag = currentTagKey ? byKey.get(currentTagKey) : undefined;

  // The folders at this level: the current tag's children, or the roots
  const childTagKeys = new Set(
    currentTag && currentTagKey
      ? (childKeys.get(currentTagKey) ?? [])
      : rootKeys
  );

  // Each tag with its ancestors, computed once per tag
  const reachMemo = new Map<string, ReadonlySet<string>>();
  const ancestorsOrSelf = (
    key: string,
    visiting = new Set<string>()
  ): ReadonlySet<string> => {
    const known = reachMemo.get(key);
    if (known) return known;
    const reach = new Set<string>([key]);
    // A circular parent ends the walk without caching a partial answer
    if (visiting.has(key)) return reach;
    visiting.add(key);
    for (const parentKey of parentKeys.get(key) ?? []) {
      for (const ancestor of ancestorsOrSelf(parentKey, visiting)) {
        reach.add(ancestor);
      }
    }
    visiting.delete(key);
    reachMemo.set(key, reach);
    return reach;
  };

  // Group items by which folder they belong to at this level
  const folderContents = new Map<string, I[]>(); // tag key -> items[] (for recursive counts)
  const leafItems: I[] = []; // Items that appear directly at this level
  const untaggedItems: I[] = [];

  const addToFolder = (tagKey: string, item: I) => {
    const contents = folderContents.get(tagKey);
    if (contents) {
      contents.push(item);
    } else {
      folderContents.set(tagKey, [item]);
    }
  };

  items.forEach((item) => {
    const itemTagKeys = new Set(
      (item.tags || []).map((t) => makeCompositeKey(t.id, item.instanceId))
    );

    // Check if item has no tags
    if (itemTagKeys.size === 0) {
      if (currentPath.length === 0) {
        // Only show untagged at root
        untaggedItems.push(item);
      }
      return;
    }

    // Every tag the item reaches: its own and their ancestors
    const reach = new Set<string>();
    for (const key of itemTagKeys) {
      for (const ancestor of ancestorsOrSelf(key)) reach.add(ancestor);
    }

    // The folders at this level that hold the item (it has the folder's tag
    // or a descendant of it)
    let inChildFolder = false;
    for (const childKey of childTagKeys) {
      if (reach.has(childKey)) {
        addToFolder(childKey, item);
        inChildFolder = true;
      }
    }

    // At ROOT level items never appear as loose items, only inside folders
    // (or in Untagged). Inside a folder, an item is a leaf when it has the
    // current tag directly and no child folder holds it.
    if (
      currentPath.length > 0 &&
      currentTagKey !== null &&
      itemTagKeys.has(currentTagKey) &&
      !inChildFolder
    ) {
      leafItems.push(item);
    }
  });

  // Build folder nodes
  // Show ALL folders from tag hierarchy that have content (pre-computed count > 0)
  // This ensures folders appear even when current page has no items for them
  const folders: FolderNode<T>[] = [];

  childTagKeys.forEach((tagKey) => {
    const tag = byKey.get(tagKey);
    if (!tag) return;

    const folderItems = folderContents.get(tagKey) ?? [];

    // Get pre-computed count from tag (image_count, scene_count, or gallery_count)
    // These are set by the backend during sync and represent the total items with this tag
    const preComputedCount =
      tag.image_count || tag.scene_count || tag.gallery_count || 0;

    // Check if tag has children (it's a container/organizational tag)
    const hasChildren = (childKeys.get(tagKey)?.length ?? 0) > 0;

    // If no items on current page AND no pre-computed count AND no children, this folder is truly empty
    // Container tags (with children) should always show even if they have no direct content
    if (folderItems.length === 0 && preComputedCount === 0 && !hasChildren) {
      return;
    }

    // Use items count if available (more accurate for current page context)
    // Fall back to pre-computed count when no items on current page
    const totalCount =
      folderItems.length > 0 ? folderItems.length : preComputedCount;

    // Get thumbnail - prefer tag image, then first item, then null
    const thumbnail =
      tag.image_path ||
      (folderItems[0] ? getItemThumbnail(folderItems[0]) : null);

    folders.push({
      id: tagKey,
      tag,
      name: tag.name,
      thumbnail,
      totalCount,
      isFolder: true,
    });
  });

  // Add untagged folder if at root and has items
  const firstUntagged = untaggedItems[0];
  if (currentPath.length === 0 && firstUntagged) {
    folders.push({
      id: UNTAGGED_FOLDER_ID,
      tag: null,
      name: "Untagged",
      thumbnail: getItemThumbnail(firstUntagged),
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
