// client/src/utils/buildFolderTree.ts
import { indexTagHierarchy, tagTreeKey } from "./buildTagTree";
import { parseCompositeKey } from "./compositeKey";

/** The Untagged folder's id (A10b brings the folder back as a real filter) */
export const UNTAGGED_FOLDER_ID = "__untagged__";

/** A tag tree row's count of the page's type: what a folder counts */
export type FolderCountField = "scene_count" | "gallery_count" | "image_count";

/**
 * The fields the folder view reads from a tag (a row of the tag tree). Its
 * parents are on its own instance; children are derived from them. The
 * counts are the viewer's (the tree subtracts their exclusions).
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

/** A folder at the current level: a tag */
export interface FolderNode<T extends FolderTreeTag> {
  /** The tag's `tagTreeKey` ("id:instanceId") */
  id: string;
  tag: T;
  name: string;
  thumbnail: string | null;
  /** The items of the page's type that carry the tag itself */
  count: number;
  isFolder: true;
}

export interface FolderTree<T extends FolderTreeTag> {
  folders: FolderNode<T>[];
  breadcrumbs: { id: string; name: string }[];
}

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
 * The folders at a path: the current tag's children, or the roots, each
 * shown while its subtree (the tag or a descendant) holds a tag with items
 * of the page's type (`countField` above 0). A folder's `count` is its tag's
 * own. Items are not placed here: the list pages the folder's own items.
 *
 * Tags go by `tagTreeKey` ("id:instanceId"), paths too, so two instances'
 * same-numbered tags are two folders. Each tag's parents are read once; the
 * tags with content mark their ancestors in one walk each, stopping at a
 * tag already marked, so a parent loop ends.
 */
export function buildFolderTree<T extends FolderTreeTag>(
  tags: readonly T[],
  currentPath: readonly string[],
  countField: FolderCountField
): FolderTree<T> {
  const { byKey, parentKeys, childKeys, rootKeys } = indexTagHierarchy(tags);

  const breadcrumbs = currentPath.map((key) => ({
    id: key,
    name: byKey.get(key)?.name || "Unknown",
  }));

  const countOf = (tag: T) => tag[countField] ?? 0;

  // Every tag whose subtree holds content: the tags with a count and their
  // ancestors
  const withContent = new Set<string>();
  const mark = (key: string) => {
    const stack = [key];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined || withContent.has(next)) continue;
      withContent.add(next);
      stack.push(...(parentKeys.get(next) ?? []));
    }
  };
  for (const [key, tag] of byKey) {
    if (countOf(tag) > 0) mark(key);
  }

  const currentTagKey = currentPath.at(-1);
  const levelKeys =
    currentTagKey === undefined
      ? rootKeys
      : (childKeys.get(currentTagKey) ?? []);

  const folders: FolderNode<T>[] = [];
  for (const key of new Set(levelKeys)) {
    const tag = byKey.get(key);
    if (!tag || !withContent.has(key)) continue;
    folders.push({
      id: key,
      tag,
      name: tag.name,
      thumbnail: tag.image_path || null,
      count: countOf(tag),
      isFolder: true,
    });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, breadcrumbs };
}
