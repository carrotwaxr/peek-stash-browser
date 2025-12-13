import { logger } from "../utils/logger.js";

/**
 * EmptyEntityFilterService
 *
 * Filters out entities with no content for regular users (admins see everything).
 * "Content" is defined as: Scenes or Images
 *
 * Complexity:
 * - Galleries: Simple (has images?)
 * - Groups: Tree traversal (parent/child relationships)
 * - Studios: Cross-reference with visible groups/galleries
 * - Performers: Cross-reference with visible groups/galleries
 * - Tags: DAG traversal + check all entity types
 *
 * IMPORTANT: Must filter in dependency order:
 * 1. Galleries (no dependencies)
 * 2. Groups (no dependencies, but complex tree)
 * 3. Studios (needs: groups, galleries)
 * 4. Performers (needs: groups, galleries)
 * 5. Tags (needs: ALL entities)
 */

/**
 * Minimal gallery structure for filtering (only fields used by this service)
 */
interface FilterableGallery {
  id: string;
  image_count?: number | null;
}

/**
 * Minimal group structure for filtering
 * Groups can have parent/child relationships forming a tree
 */
interface FilterableGroup {
  id: string;
  scene_count?: number | null;
  sub_groups?: Array<{ group?: FilterableGroup; id?: string }>;
}

/**
 * Minimal performer structure for filtering
 */
interface FilterablePerformer {
  id: string;
  scene_count?: number | null;
  image_count?: number | null;
  group_count?: number | null;
  gallery_count?: number | null;
}

/**
 * Minimal studio structure for filtering
 */
interface FilterableStudio {
  id: string;
  scene_count?: number | null;
  image_count?: number | null;
  gallery_count?: number | null;
  groups?: Array<{ id: string }>;
}

/**
 * Minimal tag structure for filtering
 * Tags can have parent/child relationships forming a DAG (directed acyclic graph)
 */
interface FilterableTag {
  id: string;
  scene_count?: number | null;
  image_count?: number | null;
  gallery_count?: number | null;
  group_count?: number | null;
  performer_count?: number | null;
  studio_count?: number | null;
  children?: Array<{ id: string }>;
}

interface VisibleEntitySets {
  scenes?: Set<string>;
  images?: Set<string>;
  galleries: Set<string>;
  groups: Set<string>;
  performers: Set<string>;
  studios: Set<string>;
}

class EmptyEntityFilterService {
  /**
   * Filter galleries with no images
   * Simple case - just check image_count
   */
  filterEmptyGalleries<T extends FilterableGallery>(galleries: T[]): T[] {
    return galleries.filter((gallery) => {
      return gallery.image_count && gallery.image_count > 0;
    });
  }

  /**
   * Filter groups with no scenes
   * Complex case - must trace parent/child relationships
   * Remove "dead branches" where entire subtrees have no content
   */
  filterEmptyGroups<T extends FilterableGroup>(groups: T[]): T[] {
    if (groups.length === 0) return [];

    // Create a map for quick lookups
    const groupMap = new Map(groups.map((g) => [g.id, g]));

    // Track which groups have content (directly or through children)
    const hasContent = new Map<string, boolean>();

    /**
     * Recursively check if a group has content
     * Content = has scenes OR has children with content
     */
    const checkHasContent = (
      groupId: string,
      visited = new Set<string>()
    ): boolean => {
      // Prevent infinite loops in case of circular references
      if (visited.has(groupId)) return false;
      visited.add(groupId);

      // Check cache first
      if (hasContent.has(groupId)) {
        const cached = hasContent.get(groupId);
        return cached !== undefined ? cached : false;
      }

      const group = groupMap.get(groupId);
      if (!group) return false;

      // Direct content: has scenes
      if (group.scene_count && group.scene_count > 0) {
        hasContent.set(groupId, true);
        return true;
      }

      // Check if any child groups have content
      const subGroups = group.sub_groups || [];
      for (const subGroupRel of subGroups) {
        const childGroup = subGroupRel.group || subGroupRel;
        if (childGroup.id && checkHasContent(childGroup.id, visited)) {
          hasContent.set(groupId, true);
          return true;
        }
      }

      // No content found
      hasContent.set(groupId, false);
      return false;
    };

    // Check all groups
    for (const group of groups) {
      checkHasContent(group.id);
    }

    // Filter to only groups with content
    const filtered = groups.filter(
      (group) => hasContent.get(group.id) === true
    );

    logger.debug("Filtered empty groups", {
      original: groups.length,
      filtered: filtered.length,
      removed: groups.length - filtered.length,
    });

    return filtered;
  }

  /**
   * Filter performers with no content
   * Hide if ALL of:
   * - Not in any visible scene
   * - No images
   * - Not in any visible group
   * - No visible gallery
   */
  filterEmptyPerformers<T extends FilterablePerformer>(
    performers: T[],
    visibleGroups: FilterableGroup[],
    visibleGalleries: FilterableGallery[],
    visibleScenes?: Array<{ id: string; performers?: Array<{ id: string }> }>
  ): T[] {
    // Build set of performers in visible scenes
    const performersInVisibleScenes = new Set<string>();
    if (visibleScenes) {
      for (const scene of visibleScenes) {
        if (scene.performers) {
          for (const performer of scene.performers) {
            performersInVisibleScenes.add(performer.id);
          }
        }
      }
    }

    // Build reverse indexes: which performers appear in visible groups/galleries
    const performersInVisibleGroups = new Set<string>();
    const performersInVisibleGalleries = new Set<string>();

    // Index performers from visible groups
    for (const group of visibleGroups) {
      // Groups have performers array with nested structure
      const groupPerformers = (group as { performers?: Array<{ id: string }> })
        .performers;
      if (groupPerformers) {
        for (const performer of groupPerformers) {
          performersInVisibleGroups.add(performer.id);
        }
      }
    }

    // Index performers from visible galleries
    for (const gallery of visibleGalleries) {
      // Galleries have performers array
      const galleryPerformers = (
        gallery as { performers?: Array<{ id: string }> }
      ).performers;
      if (galleryPerformers) {
        for (const performer of galleryPerformers) {
          performersInVisibleGalleries.add(performer.id);
        }
      }
    }

    return performers.filter((performer) => {
      // CRITICAL FIX: Check if performer appears in visible scenes
      // This replaces the buggy scene_count check
      if (visibleScenes && performersInVisibleScenes.has(performer.id)) {
        return true;
      }

      // Fallback to old logic if visibleScenes not provided (backward compatibility)
      if (!visibleScenes && performer.scene_count && performer.scene_count > 0) {
        return true;
      }

      // Has images? Keep
      if (performer.image_count && performer.image_count > 0) {
        return true;
      }

      // In a visible group? Keep
      if (performersInVisibleGroups.has(performer.id)) {
        return true;
      }

      // Has a visible gallery? Keep
      if (performersInVisibleGalleries.has(performer.id)) {
        return true;
      }

      // No content found
      return false;
    });
  }

  /**
   * Filter studios with no content
   * Hide if ALL of:
   * - Not in any visible scene
   * - No visible groups
   * - No images
   * - No visible galleries
   * - No child studios with content
   */
  filterEmptyStudios<T extends FilterableStudio>(
    studios: T[],
    visibleGroups: FilterableGroup[],
    visibleGalleries: FilterableGallery[],
    visibleScenes?: Array<{ id: string; studio?: { id: string } | null }>
  ): T[] {
    // Build set of studios in visible scenes
    const studiosInVisibleScenes = new Set<string>();
    if (visibleScenes) {
      for (const scene of visibleScenes) {
        if (scene.studio) {
          studiosInVisibleScenes.add(scene.studio.id);
        }
      }
    }

    // Build set of visible group IDs for fast lookup
    const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));

    // Build set of studios that have visible galleries
    const studiosWithVisibleGalleries = new Set<string>();
    for (const gallery of visibleGalleries) {
      const studioId = (gallery as { studio?: { id: string } }).studio?.id;
      if (studioId) {
        studiosWithVisibleGalleries.add(studioId);
      }
    }

    // Build parent -> children map for recursive check
    const studioMap = new Map(studios.map((s) => [s.id, s]));
    const childrenMap = new Map<string, string[]>();
    for (const studio of studios) {
      const parentId = (studio as { parent_studio?: { id: string } }).parent_studio?.id;
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId)!.push(studio.id);
      }
    }

    // Track which studios have content
    const hasContent = new Map<string, boolean>();

    const checkHasContent = (studioId: string, visited = new Set<string>()): boolean => {
      if (visited.has(studioId)) return false;
      visited.add(studioId);

      if (hasContent.has(studioId)) {
        return hasContent.get(studioId)!;
      }

      const studio = studioMap.get(studioId);
      if (!studio) return false;

      // Check if studio appears in visible scenes
      if (visibleScenes && studiosInVisibleScenes.has(studio.id)) {
        hasContent.set(studioId, true);
        return true;
      }

      // Fallback to scene_count if visibleScenes not provided
      if (!visibleScenes && studio.scene_count && studio.scene_count > 0) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has images? Keep
      if (studio.image_count && studio.image_count > 0) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has visible galleries? Keep
      if (studiosWithVisibleGalleries.has(studio.id)) {
        hasContent.set(studioId, true);
        return true;
      }

      // Has visible groups? Keep
      if (studio.groups && Array.isArray(studio.groups)) {
        if (studio.groups.some((g) => visibleGroupIds.has(g.id))) {
          hasContent.set(studioId, true);
          return true;
        }
      }

      // Check if any child studio has content
      const children = childrenMap.get(studioId) || [];
      for (const childId of children) {
        if (checkHasContent(childId, visited)) {
          hasContent.set(studioId, true);
          return true;
        }
      }

      hasContent.set(studioId, false);
      return false;
    };

    // Check all studios
    for (const studio of studios) {
      checkHasContent(studio.id);
    }

    const filtered = studios.filter((studio) => hasContent.get(studio.id) === true);

    logger.debug("Filtered empty studios", {
      original: studios.length,
      filtered: filtered.length,
      removed: studios.length - filtered.length,
    });

    return filtered;
  }

  /**
   * Filter tags with no attachments to visible entities
   * Most complex - must check all entity types and handle parent/child DAG
   *
   * Hide if:
   * - Not attached to any: Scenes, Images, Galleries, Groups, Performers, Studios
   * - Must trace and trim the parent/child tree
   */
  filterEmptyTags<T extends FilterableTag>(
    tags: T[],
    visibleEntities: VisibleEntitySets,
    visibleScenes?: Array<{
      id: string;
      tags?: Array<{ id: string }>;
      performers?: Array<{ id: string }>;
      studio?: { id: string } | null;
    }>,
    allPerformers?: Array<{ id: string; tags?: Array<{ id: string }> }>
  ): T[] {
    if (tags.length === 0) return [];

    // Create a map for quick lookups
    const tagMap = new Map(tags.map((t) => [t.id, t]));

    // Track which tags have content (directly or through valid children)
    const hasContent = new Map<string, boolean>();

    /**
     * CRITICAL FIX: Build set of tags that appear on visible entities
     * This replaces the buggy count-based heuristic
     */
    const tagsOnVisibleEntities = new Set<string>();

    // Build performer ID -> tags lookup from allPerformers
    const performerTagsMap = new Map<string, string[]>();
    if (allPerformers) {
      for (const performer of allPerformers) {
        if (performer.tags) {
          performerTagsMap.set(performer.id, performer.tags.map(t => t.id));
        }
      }
    }

    if (visibleScenes) {
      // Tags on visible scenes (direct scene tags)
      for (const scene of visibleScenes) {
        if (scene.tags) {
          for (const tag of scene.tags) {
            tagsOnVisibleEntities.add(tag.id);
          }
        }

        // Tags on performers in visible scenes (lookup from allPerformers)
        if (scene.performers && allPerformers) {
          for (const performer of scene.performers) {
            const performerTags = performerTagsMap.get(performer.id);
            if (performerTags) {
              for (const tagId of performerTags) {
                tagsOnVisibleEntities.add(tagId);
              }
            }
          }
        }

        // Note: Studio tags are not loaded via scenes - they're on the studio entities
        // This would require passing allStudios, but studio tags are a rare use case
        // Skip for now - can be added later if needed
      }
    }

    // Tags on visible performers (from visibilitySet)
    // Note: We already captured these from scenes above if visibleScenes provided

    // Tags on visible studios (from visibilitySet)
    // Note: We already captured these from scenes above if visibleScenes provided

    /**
     * Check if a tag has any attachments to visible entities
     */
    const checkDirectContent = (tag: FilterableTag): boolean => {
      // CRITICAL FIX: Check if tag appears on visible entities
      if (visibleScenes && tagsOnVisibleEntities.has(tag.id)) {
        return true;
      }

      // Fallback to old count-based heuristic if visibleScenes not provided
      if (!visibleScenes) {
        // Has scenes? Keep (assuming scenes are filtered by user restrictions already)
        if (tag.scene_count && tag.scene_count > 0) {
          return true;
        }

        // Has images? Keep
        if (tag.image_count && tag.image_count > 0) {
          return true;
        }

        // Attached to visible galleries?
        if (tag.gallery_count && tag.gallery_count > 0) {
          // Conservative: if it has any galleries, assume at least one is visible
          return true;
        }

        // Attached to visible groups?
        if (tag.group_count && tag.group_count > 0) {
          // Conservative: if it has any groups, assume at least one is visible
          return true;
        }

        // Attached to visible performers?
        if (tag.performer_count && tag.performer_count > 0) {
          // Conservative: if it has any performers, assume at least one is visible
          return true;
        }

        // Attached to visible studios?
        if (tag.studio_count && tag.studio_count > 0) {
          // Conservative: if it has any studios, assume at least one is visible
          return true;
        }
      }

      // Has images? Keep (always check this)
      if (tag.image_count && tag.image_count > 0) {
        return true;
      }

      return false;
    };

    /**
     * Recursively check if a tag has content
     * Content = has direct attachments OR has children with content
     *
     * Note: Tags can form DAGs (multiple parents), not just trees
     * A tag should be kept if it has ANY valid child
     */
    const checkHasContent = (
      tagId: string,
      visited = new Set<string>()
    ): boolean => {
      // Prevent infinite loops
      if (visited.has(tagId)) return false;
      visited.add(tagId);

      // Check cache first
      if (hasContent.has(tagId)) {
        const cached = hasContent.get(tagId);
        return cached !== undefined ? cached : false;
      }

      const tag = tagMap.get(tagId);
      if (!tag) return false;

      // Direct content: has attachments to entities
      if (checkDirectContent(tag)) {
        hasContent.set(tagId, true);
        return true;
      }

      // Check if any child tags have content
      const children = tag.children || [];
      for (const childTag of children) {
        if (checkHasContent(childTag.id, visited)) {
          // This tag is a valid parent of a tag with content
          hasContent.set(tagId, true);
          return true;
        }
      }

      // No content found
      hasContent.set(tagId, false);
      return false;
    };

    // Check all tags
    for (const tag of tags) {
      checkHasContent(tag.id);
    }

    // Filter to only tags with content
    const filtered = tags.filter((tag) => hasContent.get(tag.id) === true);

    logger.debug("Filtered empty tags", {
      original: tags.length,
      filtered: filtered.length,
      removed: tags.length - filtered.length,
    });

    return filtered;
  }

  /**
   * Main filtering orchestrator
   * Filters all entity types in the correct dependency order
   * Returns visibility sets for use by other filters
   */
  filterAllEntities<
    TGallery extends FilterableGallery = FilterableGallery,
    TGroup extends FilterableGroup = FilterableGroup,
    TStudio extends FilterableStudio = FilterableStudio,
    TPerformer extends FilterablePerformer = FilterablePerformer,
    TTag extends FilterableTag = FilterableTag,
  >(entities: {
    galleries?: TGallery[];
    groups?: TGroup[];
    studios?: TStudio[];
    performers?: TPerformer[];
    tags?: TTag[];
  }): {
    galleries?: TGallery[];
    groups?: TGroup[];
    studios?: TStudio[];
    performers?: TPerformer[];
    tags?: TTag[];
    visibilitySets: VisibleEntitySets;
  } {
    // Step 1: Filter galleries (no dependencies)
    const filteredGalleries = entities.galleries
      ? this.filterEmptyGalleries(entities.galleries)
      : [];

    // Step 2: Filter groups (no dependencies, but complex tree)
    const filteredGroups = entities.groups
      ? this.filterEmptyGroups(entities.groups)
      : [];

    // Step 3: Filter studios (needs: groups, galleries)
    const filteredStudios = entities.studios
      ? this.filterEmptyStudios(
          entities.studios,
          filteredGroups,
          filteredGalleries
        )
      : [];

    // Step 4: Filter performers (needs: groups, galleries)
    const filteredPerformers = entities.performers
      ? this.filterEmptyPerformers(
          entities.performers,
          filteredGroups,
          filteredGalleries
        )
      : [];

    // Build visibility sets for tags
    const visibleGalleries = new Set(filteredGalleries.map((g) => g.id));
    const visibleGroups = new Set(filteredGroups.map((g) => g.id));
    const visibleStudios = new Set(filteredStudios.map((s) => s.id));
    const visiblePerformers = new Set(filteredPerformers.map((p) => p.id));

    // Step 5: Filter tags (needs: all entities)
    const visibilitySet: VisibleEntitySets = {
      galleries: visibleGalleries,
      groups: visibleGroups,
      studios: visibleStudios,
      performers: visiblePerformers,
    };

    const filteredTags = entities.tags
      ? this.filterEmptyTags(entities.tags, visibilitySet)
      : [];

    return {
      galleries: filteredGalleries,
      groups: filteredGroups,
      studios: filteredStudios,
      performers: filteredPerformers,
      tags: filteredTags,
      visibilitySets: {
        ...visibilitySet,
      },
    };
  }
}

export const emptyEntityFilterService = new EmptyEntityFilterService();
export default emptyEntityFilterService;
