// client/src/hooks/useFolderViewTags.ts
import type { TagTreeRow, TagTreeScope } from "@peek/shared-types";
import { useTagTree } from "../api/hooks";

/** The detail page a folder view sits on, each as "id:instanceId" (or a bare id) */
interface FolderViewFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

const NO_TAGS: TagTreeRow[] = [];

/** The tree's scope for the page's filters; undefined for the whole library */
function scopeOf(filters: FolderViewFilters | null): TagTreeScope | undefined {
  if (!filters) return undefined;
  const scope: TagTreeScope = {};
  if (filters.performerId) scope.performer = filters.performerId;
  if (filters.tagId) scope.tag = filters.tagId;
  if (filters.studioId) scope.studio = filters.studioId;
  if (filters.groupId) scope.group = filters.groupId;
  return Object.keys(scope).length > 0 ? scope : undefined;
}

/**
 * The tags for the folder view, fetched only while it is active: every tag
 * the user can see, or on a detail page the tags on its scenes and their
 * ancestors (the compact tag tree; each row names its instance).
 */
export function useFolderViewTags(
  isActive: boolean,
  filters: FolderViewFilters | null = null
) {
  const { data, isLoading, error } = useTagTree(scopeOf(filters), isActive);
  return { tags: data?.tags ?? NO_TAGS, isLoading, error };
}
