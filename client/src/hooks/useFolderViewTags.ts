// client/src/hooks/useFolderViewTags.ts
import type {
  TagTreeRow,
  TagTreeScope,
  UntaggedKind,
} from "@peek/shared-types";
import { useTagTree } from "../api/hooks";

/** The detail page a folder view sits on, each as "id:instanceId" (or a bare id) */
interface FolderViewFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
  galleryId?: string;
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
  if (filters.galleryId) scope.gallery = filters.galleryId;
  return Object.keys(scope).length > 0 ? scope : undefined;
}

/**
 * The tags for the folder view, fetched only while it is active: every tag
 * the user can see, or on a detail page the tags on its scenes and their
 * ancestors (the compact tag tree; each row names its instance), with the
 * count of the page's untagged items (`untagged`, its type) the Untagged
 * folder lists.
 */
export function useFolderViewTags(
  isActive: boolean,
  filters: FolderViewFilters | null = null,
  untagged?: UntaggedKind
) {
  const { data, isLoading, error, refetch } = useTagTree(
    scopeOf(filters),
    isActive,
    untagged
  );
  return {
    tags: data?.tags ?? NO_TAGS,
    untaggedCount: data?.untagged ?? 0,
    isLoading,
    error,
    refetch,
  };
}
