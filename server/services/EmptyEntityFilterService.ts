import { stashCacheManager } from './StashCacheManager.js';
import { logger } from '../utils/logger.js';

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
  filterEmptyGalleries(galleries: any[]): any[] {
    return galleries.filter(gallery => {
      return gallery.image_count && gallery.image_count > 0;
    });
  }

  /**
   * Filter groups with no scenes
   * Complex case - must trace parent/child relationships
   * Remove "dead branches" where entire subtrees have no content
   */
  filterEmptyGroups(groups: any[]): any[] {
    if (groups.length === 0) return [];

    // Create a map for quick lookups
    const groupMap = new Map(groups.map(g => [g.id, g]));

    // Track which groups have content (directly or through children)
    const hasContent = new Map<string, boolean>();

    /**
     * Recursively check if a group has content
     * Content = has scenes OR has children with content
     */
    const checkHasContent = (groupId: string, visited = new Set<string>()): boolean => {
      // Prevent infinite loops in case of circular references
      if (visited.has(groupId)) return false;
      visited.add(groupId);

      // Check cache first
      if (hasContent.has(groupId)) {
        return hasContent.get(groupId)!;
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
        if (checkHasContent(childGroup.id, visited)) {
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
    const filtered = groups.filter(group => hasContent.get(group.id) === true);

    logger.debug('Filtered empty groups', {
      original: groups.length,
      filtered: filtered.length,
      removed: groups.length - filtered.length,
    });

    return filtered;
  }

  /**
   * Filter performers with no content
   * Hide if ALL of:
   * - No scenes
   * - No images
   * - Not in any visible group
   * - No visible gallery
   */
  filterEmptyPerformers(
    performers: any[],
    visibleGroups: Set<string>,
    visibleGalleries: Set<string>
  ): any[] {
    return performers.filter(performer => {
      // Has scenes? Keep
      if (performer.scene_count && performer.scene_count > 0) {
        return true;
      }

      // Has images? Keep
      if (performer.image_count && performer.image_count > 0) {
        return true;
      }

      // In a visible group? Keep
      // Note: We can't easily get performer's groups from the performer object
      // The performer object has group_count but not the actual group IDs
      // We'll need to check if the performer appears in any visible group
      // For now, if they have any groups, assume at least one is visible
      // TODO: This could be optimized by fetching group memberships from cache
      if (performer.group_count && performer.group_count > 0) {
        // Conservative approach: if they're in ANY group, keep them
        // The group itself will be filtered, so if all their groups are hidden,
        // the user won't see them associated with anything anyway
        return true;
      }

      // Has a visible gallery? Keep
      // Same issue - we have gallery_count but not the IDs
      // Conservative approach for now
      if (performer.gallery_count && performer.gallery_count > 0) {
        return true;
      }

      // No content found
      return false;
    });
  }

  /**
   * Filter studios with no content
   * Hide if ALL of:
   * - No scenes
   * - No visible groups
   * - No images
   * - No visible galleries
   */
  filterEmptyStudios(
    studios: any[],
    visibleGroups: Set<string>,
    visibleGalleries: Set<string>
  ): any[] {
    return studios.filter(studio => {
      // Has scenes? Keep
      if (studio.scene_count && studio.scene_count > 0) {
        return true;
      }

      // Has images? Keep
      if (studio.image_count && studio.image_count > 0) {
        return true;
      }

      // Has visible groups? Keep
      if (studio.groups && Array.isArray(studio.groups)) {
        const hasVisibleGroup = studio.groups.some((g: any) =>
          visibleGroups.has(g.id)
        );
        if (hasVisibleGroup) {
          return true;
        }
      }

      // Has galleries? (we don't have the actual gallery IDs on studio object)
      // Conservative approach: if gallery_count > 0, keep
      if (studio.gallery_count && studio.gallery_count > 0) {
        return true;
      }

      // No content found
      return false;
    });
  }

  /**
   * Filter tags with no attachments to visible entities
   * Most complex - must check all entity types and handle parent/child DAG
   *
   * Hide if:
   * - Not attached to any: Scenes, Images, Galleries, Groups, Performers, Studios
   * - Must trace and trim the parent/child tree
   */
  filterEmptyTags(
    tags: any[],
    visibleEntities: VisibleEntitySets
  ): any[] {
    if (tags.length === 0) return [];

    // Create a map for quick lookups
    const tagMap = new Map(tags.map(t => [t.id, t]));

    // Track which tags have content (directly or through valid children)
    const hasContent = new Map<string, boolean>();

    /**
     * Check if a tag has any attachments to visible entities
     * This requires checking the tag's counts against the visible sets
     *
     * Note: The tag counts include ALL entities, not just visible ones
     * So we need to actually check if the tag appears on any visible entity
     * This is expensive but necessary for accuracy
     */
    const checkDirectContent = (tag: any): boolean => {
      // For now, use the counts as a heuristic
      // A more accurate implementation would query the cache for each entity type
      // and check if the tag appears on any visible entities

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

      return false;
    };

    /**
     * Recursively check if a tag has content
     * Content = has direct attachments OR has children with content
     *
     * Note: Tags can form DAGs (multiple parents), not just trees
     * A tag should be kept if it has ANY valid child
     */
    const checkHasContent = (tagId: string, visited = new Set<string>()): boolean => {
      // Prevent infinite loops
      if (visited.has(tagId)) return false;
      visited.add(tagId);

      // Check cache first
      if (hasContent.has(tagId)) {
        return hasContent.get(tagId)!;
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
    const filtered = tags.filter(tag => hasContent.get(tag.id) === true);

    logger.debug('Filtered empty tags', {
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
  filterAllEntities(entities: {
    galleries?: any[];
    groups?: any[];
    studios?: any[];
    performers?: any[];
    tags?: any[];
  }): {
    galleries?: any[];
    groups?: any[];
    studios?: any[];
    performers?: any[];
    tags?: any[];
    visibilitySets: VisibleEntitySets;
  } {
    // Step 1: Filter galleries (no dependencies)
    const filteredGalleries = entities.galleries
      ? this.filterEmptyGalleries(entities.galleries)
      : [];
    const visibleGalleries = new Set(filteredGalleries.map(g => g.id));

    // Step 2: Filter groups (no dependencies, but complex tree)
    const filteredGroups = entities.groups
      ? this.filterEmptyGroups(entities.groups)
      : [];
    const visibleGroups = new Set(filteredGroups.map(g => g.id));

    // Step 3: Filter studios (needs: groups, galleries)
    const filteredStudios = entities.studios
      ? this.filterEmptyStudios(entities.studios, visibleGroups, visibleGalleries)
      : [];
    const visibleStudios = new Set(filteredStudios.map(s => s.id));

    // Step 4: Filter performers (needs: groups, galleries)
    const filteredPerformers = entities.performers
      ? this.filterEmptyPerformers(entities.performers, visibleGroups, visibleGalleries)
      : [];
    const visiblePerformers = new Set(filteredPerformers.map(p => p.id));

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
