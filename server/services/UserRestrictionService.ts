import type { UserContentRestriction } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import { userHiddenEntityService } from "./UserHiddenEntityService.js";

/**
 * Entity with ID (for extracting IDs from nested scene entities)
 */
interface EntityWithId {
  id: string;
}

/**
 * Scene group entity (can have nested group.id or direct id)
 */
interface SceneGroupEntity {
  group?: { id: string };
  id?: string;
}

/**
 * UserRestrictionService
 *
 * Handles content filtering based on per-user restrictions.
 * Supports INCLUDE (show only) and EXCLUDE (hide) modes for Groups, Tags, Studios, and Galleries.
 */
class UserRestrictionService {
  /**
   * Get all content restrictions for a user
   */
  async getRestrictionsForUser(
    userId: number
  ): Promise<UserContentRestriction[]> {
    return await prisma.userContentRestriction.findMany({
      where: { userId },
    });
  }

  /**
   * Get excluded scene IDs at the database level using SQL JOINs
   * This is MUCH faster than loading all scenes and filtering in memory
   *
   * Returns a Set of scene IDs that should be excluded based on:
   * 1. Directly hidden scenes
   * 2. Scenes with hidden performers (CASCADE)
   * 3. Scenes with hidden studios (CASCADE)
   * 4. Scenes with hidden tags (CASCADE)
   * 5. Scenes with hidden groups (CASCADE)
   * 6. Scenes with hidden galleries (CASCADE)
   * 7. Content restrictions (INCLUDE/EXCLUDE rules) - unless skipContentRestrictions
   *
   * PERFORMANCE: Caches allSceneIds query to avoid redundant full table scans.
   * For INCLUDE restrictions, we only load the full scene list once.
   */
  async getExcludedSceneIds(
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<Set<string>> {
    const startTime = Date.now();
    const excludedIds = new Set<string>();

    // Get hidden entity IDs
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    // 1. Directly hidden scenes
    for (const sceneId of hiddenIds.scenes) {
      excludedIds.add(sceneId);
    }

    // 2. Scenes with hidden performers (using junction table)
    if (hiddenIds.performers.size > 0) {
      const performerArray = Array.from(hiddenIds.performers);
      const scenesWithHiddenPerformers = await prisma.scenePerformer.findMany({
        where: { performerId: { in: performerArray } },
        select: { sceneId: true },
      });
      for (const sp of scenesWithHiddenPerformers) {
        excludedIds.add(sp.sceneId);
      }
    }

    // 3. Scenes with hidden studios (direct column on StashScene)
    if (hiddenIds.studios.size > 0) {
      const studioArray = Array.from(hiddenIds.studios);
      const scenesWithHiddenStudios = await prisma.stashScene.findMany({
        where: {
          studioId: { in: studioArray },
          deletedAt: null,
        },
        select: { id: true },
      });
      for (const s of scenesWithHiddenStudios) {
        excludedIds.add(s.id);
      }
    }

    // 4. Scenes with hidden tags (using junction table)
    if (hiddenIds.tags.size > 0) {
      const tagArray = Array.from(hiddenIds.tags);
      const scenesWithHiddenTags = await prisma.sceneTag.findMany({
        where: { tagId: { in: tagArray } },
        select: { sceneId: true },
      });
      for (const st of scenesWithHiddenTags) {
        excludedIds.add(st.sceneId);
      }
    }

    // 5. Scenes with hidden groups (using junction table)
    if (hiddenIds.groups.size > 0) {
      const groupArray = Array.from(hiddenIds.groups);
      const scenesWithHiddenGroups = await prisma.sceneGroup.findMany({
        where: { groupId: { in: groupArray } },
        select: { sceneId: true },
      });
      for (const sg of scenesWithHiddenGroups) {
        excludedIds.add(sg.sceneId);
      }
    }

    // 6. Scenes with hidden galleries (using junction table)
    if (hiddenIds.galleries.size > 0) {
      const galleryArray = Array.from(hiddenIds.galleries);
      const scenesWithHiddenGalleries = await prisma.sceneGallery.findMany({
        where: { galleryId: { in: galleryArray } },
        select: { sceneId: true },
      });
      for (const sg of scenesWithHiddenGalleries) {
        excludedIds.add(sg.sceneId);
      }
    }

    // 7. Apply content restrictions (if not skipped)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      // PERFORMANCE: Check if we need allSceneIds (only for INCLUDE mode or restrictEmpty)
      // Cache it once instead of querying multiple times
      let allSceneIdsCache: Set<string> | null = null;
      const needsAllSceneIds = restrictions.some(
        (r) => r.mode === "INCLUDE" || r.restrictEmpty
      );

      if (needsAllSceneIds) {
        const allScenes = await prisma.stashScene.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        allSceneIdsCache = new Set(allScenes.map((s) => s.id));
      }

      for (const restriction of restrictions) {
        const entityIds = JSON.parse(restriction.entityIds) as string[];
        if (entityIds.length === 0 && !restriction.restrictEmpty) continue;

        if (restriction.entityType === "groups") {
          if (restriction.mode === "EXCLUDE" && entityIds.length > 0) {
            // Exclude scenes in these groups
            const scenesInExcludedGroups = await prisma.sceneGroup.findMany({
              where: { groupId: { in: entityIds } },
              select: { sceneId: true },
            });
            for (const sg of scenesInExcludedGroups) {
              excludedIds.add(sg.sceneId);
            }
          } else if (restriction.mode === "INCLUDE" && entityIds.length > 0) {
            // Only include scenes in these groups - exclude all others
            const scenesInIncludedGroups = await prisma.sceneGroup.findMany({
              where: { groupId: { in: entityIds } },
              select: { sceneId: true },
            });
            const includedSceneIds = new Set(scenesInIncludedGroups.map(sg => sg.sceneId));

            // Use cached allSceneIds
            for (const sceneId of allSceneIdsCache!) {
              if (!includedSceneIds.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }

          // Handle restrictEmpty for groups
          if (restriction.restrictEmpty) {
            const scenesWithGroups = await prisma.sceneGroup.findMany({
              select: { sceneId: true },
              distinct: ['sceneId'],
            });
            const scenesWithGroupsSet = new Set(scenesWithGroups.map(sg => sg.sceneId));

            for (const sceneId of allSceneIdsCache!) {
              if (!scenesWithGroupsSet.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }
        } else if (restriction.entityType === "tags") {
          if (restriction.mode === "EXCLUDE" && entityIds.length > 0) {
            // Exclude scenes with these tags
            const scenesWithExcludedTags = await prisma.sceneTag.findMany({
              where: { tagId: { in: entityIds } },
              select: { sceneId: true },
            });
            for (const st of scenesWithExcludedTags) {
              excludedIds.add(st.sceneId);
            }
          } else if (restriction.mode === "INCLUDE" && entityIds.length > 0) {
            // Only include scenes with these tags - exclude all others
            const scenesWithIncludedTags = await prisma.sceneTag.findMany({
              where: { tagId: { in: entityIds } },
              select: { sceneId: true },
            });
            const includedSceneIds = new Set(scenesWithIncludedTags.map(st => st.sceneId));

            for (const sceneId of allSceneIdsCache!) {
              if (!includedSceneIds.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }

          // Handle restrictEmpty for tags
          if (restriction.restrictEmpty) {
            const scenesWithTags = await prisma.sceneTag.findMany({
              select: { sceneId: true },
              distinct: ['sceneId'],
            });
            const scenesWithTagsSet = new Set(scenesWithTags.map(st => st.sceneId));

            for (const sceneId of allSceneIdsCache!) {
              if (!scenesWithTagsSet.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }
        } else if (restriction.entityType === "studios") {
          if (restriction.mode === "EXCLUDE" && entityIds.length > 0) {
            // Exclude scenes from these studios
            const scenesFromExcludedStudios = await prisma.stashScene.findMany({
              where: {
                studioId: { in: entityIds },
                deletedAt: null,
              },
              select: { id: true },
            });
            for (const s of scenesFromExcludedStudios) {
              excludedIds.add(s.id);
            }
          } else if (restriction.mode === "INCLUDE" && entityIds.length > 0) {
            // Only include scenes from these studios - exclude all others
            const scenesFromIncludedStudios = await prisma.stashScene.findMany({
              where: {
                studioId: { in: entityIds },
                deletedAt: null,
              },
              select: { id: true },
            });
            const includedSceneIds = new Set(scenesFromIncludedStudios.map(s => s.id));

            for (const sceneId of allSceneIdsCache!) {
              if (!includedSceneIds.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }

          // Handle restrictEmpty for studios
          if (restriction.restrictEmpty) {
            const scenesWithoutStudio = await prisma.stashScene.findMany({
              where: {
                OR: [
                  { studioId: null },
                  { studioId: '' },
                ],
                deletedAt: null,
              },
              select: { id: true },
            });
            for (const s of scenesWithoutStudio) {
              excludedIds.add(s.id);
            }
          }
        } else if (restriction.entityType === "galleries") {
          if (restriction.mode === "EXCLUDE" && entityIds.length > 0) {
            // Exclude scenes linked to these galleries
            const scenesWithExcludedGalleries = await prisma.sceneGallery.findMany({
              where: { galleryId: { in: entityIds } },
              select: { sceneId: true },
            });
            for (const sg of scenesWithExcludedGalleries) {
              excludedIds.add(sg.sceneId);
            }
          } else if (restriction.mode === "INCLUDE" && entityIds.length > 0) {
            // Only include scenes linked to these galleries - exclude all others
            const scenesWithIncludedGalleries = await prisma.sceneGallery.findMany({
              where: { galleryId: { in: entityIds } },
              select: { sceneId: true },
            });
            const includedSceneIds = new Set(scenesWithIncludedGalleries.map(sg => sg.sceneId));

            for (const sceneId of allSceneIdsCache!) {
              if (!includedSceneIds.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }

          // Handle restrictEmpty for galleries
          if (restriction.restrictEmpty) {
            const scenesWithGalleries = await prisma.sceneGallery.findMany({
              select: { sceneId: true },
              distinct: ['sceneId'],
            });
            const scenesWithGalleriesSet = new Set(scenesWithGalleries.map(sg => sg.sceneId));

            for (const sceneId of allSceneIdsCache!) {
              if (!scenesWithGalleriesSet.has(sceneId)) {
                excludedIds.add(sceneId);
              }
            }
          }
        }
      }
    }

    logger.info(`getExcludedSceneIds: computed ${excludedIds.size} exclusions in ${Date.now() - startTime}ms`);
    return excludedIds;
  }

  /**
   * Filter scenes based on user's content restrictions and hidden entities
   *
   * Logic:
   * 1. Apply INCLUDE filters (intersection - must match ALL) - unless skipContentRestrictions
   * 2. Apply EXCLUDE filters (difference - must not match ANY) - unless skipContentRestrictions
   * 3. Apply restrictEmpty rules - unless skipContentRestrictions
   * 4. Apply hidden entity filtering (CASCADE: hide scenes with hidden performers/studios/tags) - ALWAYS applied
   *
   * @param scenes - Scenes to filter
   * @param userId - User ID
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterScenesForUser(
    scenes: NormalizedScene[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedScene[]> {
    let filtered = [...scenes];

    // Only apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      if (restrictions.length > 0) {
      // 1. Apply INCLUDE filters (intersection - must match ALL)
      const includeRestrictions = restrictions.filter(
        (r) => r.mode === "INCLUDE"
      );
      for (const restriction of includeRestrictions) {
        filtered = filtered.filter((scene) => {
          const sceneEntityIds = this.getSceneEntityIds(
            scene,
            restriction.entityType
          );

          // If restrictEmpty and scene has no entities, exclude
          if (restriction.restrictEmpty && sceneEntityIds.length === 0) {
            return false;
          }

          // Scene must have at least one included entity
          const allowedIds = JSON.parse(restriction.entityIds) as string[];
          return sceneEntityIds.some((id) => allowedIds.includes(id));
        });
      }

      // 2. Apply EXCLUDE filters (difference - must not match ANY)
      const excludeRestrictions = restrictions.filter(
        (r) => r.mode === "EXCLUDE"
      );
      for (const restriction of excludeRestrictions) {
        filtered = filtered.filter((scene) => {
          const sceneEntityIds = this.getSceneEntityIds(
            scene,
            restriction.entityType
          );

          // If restrictEmpty and scene has no entities, exclude
          if (restriction.restrictEmpty && sceneEntityIds.length === 0) {
            return false;
          }

          // Scene must not have any excluded entity
          const excludedIds = JSON.parse(restriction.entityIds) as string[];
          return !sceneEntityIds.some((id) => excludedIds.includes(id));
        });
      }
      }
    }

    // 3. Apply hidden entity filtering (CASCADE)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((scene) => {
      // Hide directly hidden scenes
      if (hiddenIds.scenes.has(scene.id)) {
        return false;
      }

      // CASCADE: Hide scenes with hidden performers
      if (scene.performers) {
        const hasHiddenPerformer = scene.performers.some((p) =>
          hiddenIds.performers.has(String(p.id))
        );
        if (hasHiddenPerformer) {
          return false;
        }
      }

      // CASCADE: Hide scenes with hidden studio
      if (scene.studio && hiddenIds.studios.has(String(scene.studio.id))) {
        return false;
      }

      // CASCADE: Hide scenes with hidden tags
      if (scene.tags) {
        const hasHiddenTag = scene.tags.some((t: EntityWithId) =>
          hiddenIds.tags.has(String(t.id))
        );
        if (hasHiddenTag) {
          return false;
        }
      }

      // CASCADE: Hide scenes with hidden groups
      if (scene.groups) {
        const hasHiddenGroup = scene.groups.some((g: SceneGroupEntity) => {
          const groupId = g.group?.id || (g as { id?: string }).id;
          return groupId && hiddenIds.groups.has(String(groupId));
        });
        if (hasHiddenGroup) {
          return false;
        }
      }

      // CASCADE: Hide scenes with hidden galleries
      if (scene.galleries) {
        const hasHiddenGallery = scene.galleries.some((g: EntityWithId) =>
          hiddenIds.galleries.has(String(g.id))
        );
        if (hasHiddenGallery) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }

  /**
   * Filter performers based on user's content restrictions and hidden entities
   * CASCADE: Checks tags, groups, and galleries that the performer is associated with
   *
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterPerformersForUser(
    performers: NormalizedPerformer[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedPerformer[]> {
    let filtered = [...performers];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      if (restrictions.length > 0) {
      // Apply tag restrictions
      const tagRestriction = restrictions.find((r) => r.entityType === "tags");
      if (tagRestriction) {
        const restrictedTagIds = JSON.parse(tagRestriction.entityIds) as string[];

        if (tagRestriction.mode === "EXCLUDE") {
          filtered = filtered.filter((performer) => {
            const performerTagIds = (performer.tags || []).map((t: EntityWithId) => String(t.id));
            return !performerTagIds.some((id) => restrictedTagIds.includes(id));
          });
        } else if (tagRestriction.mode === "INCLUDE") {
          filtered = filtered.filter((performer) => {
            const performerTagIds = (performer.tags || []).map((t: EntityWithId) => String(t.id));
            return performerTagIds.some((id) => restrictedTagIds.includes(id));
          });
        }
      }
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((performer) => {
      // Hide directly hidden performers
      if (hiddenIds.performers.has(performer.id)) {
        return false;
      }

      // CASCADE: Hide performers with hidden tags
      if (performer.tags) {
        const hasHiddenTag = (performer.tags as EntityWithId[]).some((t) =>
          hiddenIds.tags.has(String(t.id))
        );
        if (hasHiddenTag) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }

  /**
   * Filter studios based on user's content restrictions and hidden entities
   * Applies direct studio restrictions AND cascading tag/group restrictions
   *
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterStudiosForUser(
    studios: NormalizedStudio[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedStudio[]> {
    let filtered = [...studios];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      if (restrictions.length > 0) {
      // Apply direct studio restrictions
      const studioRestriction = restrictions.find(
        (r) => r.entityType === "studios"
      );

      if (studioRestriction) {
        const restrictedIds = JSON.parse(studioRestriction.entityIds) as string[];

        if (studioRestriction.mode === "EXCLUDE") {
          // Hide excluded studios
          filtered = filtered.filter((studio) => !restrictedIds.includes(studio.id));
        } else if (studioRestriction.mode === "INCLUDE") {
          // Show only included studios
          filtered = filtered.filter((studio) => restrictedIds.includes(studio.id));
        }
      }

      // CASCADE: Apply tag restrictions to studios
      const tagRestriction = restrictions.find((r) => r.entityType === "tags");

      if (tagRestriction) {
        const restrictedTagIds = JSON.parse(tagRestriction.entityIds) as string[];

        if (tagRestriction.mode === "EXCLUDE") {
          // Hide studios with excluded tags
          filtered = filtered.filter((studio) => {
            const studioTagIds = (studio.tags || []).map((t: EntityWithId) => String(t.id));
            return !studioTagIds.some((id) => restrictedTagIds.includes(id));
          });
        } else if (tagRestriction.mode === "INCLUDE") {
          // Show only studios with included tags
          filtered = filtered.filter((studio) => {
            const studioTagIds = (studio.tags || []).map((t: EntityWithId) => String(t.id));
            return studioTagIds.some((id) => restrictedTagIds.includes(id));
          });
        }
      }

      // CASCADE: Apply group restrictions to studios
      const groupRestriction = restrictions.find((r) => r.entityType === "groups");

      if (groupRestriction) {
        const restrictedGroupIds = JSON.parse(groupRestriction.entityIds) as string[];

        if (groupRestriction.mode === "EXCLUDE") {
          // Hide studios with excluded groups
          filtered = filtered.filter((studio) => {
            const studioGroupIds = ((studio as any).groups || []).map((g: EntityWithId) => String(g.id));
            return !studioGroupIds.some((id: string) => restrictedGroupIds.includes(id));
          });
        } else if (groupRestriction.mode === "INCLUDE") {
          // Show only studios with included groups
          filtered = filtered.filter((studio) => {
            const studioGroupIds = ((studio as any).groups || []).map((g: EntityWithId) => String(g.id));
            return studioGroupIds.some((id: string) => restrictedGroupIds.includes(id));
          });
        }
      }
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((studio) => {
      // Hide directly hidden studios
      if (hiddenIds.studios.has(studio.id)) {
        return false;
      }

      // CASCADE: Hide studios with hidden tags
      if (studio.tags) {
        const hasHiddenTag = (studio.tags as EntityWithId[]).some((t) =>
          hiddenIds.tags.has(String(t.id))
        );
        if (hasHiddenTag) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }

  /**
   * Filter tags based on user's content restrictions and hidden entities
   * CASCADE: Tags are hidden if they're directly excluded OR if all their content is in excluded groups/galleries
   *
   * CRITICAL: This prevents tags that only appear in excluded groups from showing up
   *
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterTagsForUser(
    tags: NormalizedTag[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedTag[]> {
    let filtered = [...tags];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      if (restrictions.length > 0) {
      // Apply direct tag restrictions
      const tagRestriction = restrictions.find((r) => r.entityType === "tags");
      if (tagRestriction) {
        const restrictedIds = JSON.parse(tagRestriction.entityIds) as string[];

        if (tagRestriction.mode === "EXCLUDE") {
          // Hide excluded tags
          filtered = filtered.filter((tag) => !restrictedIds.includes(tag.id));
        } else if (tagRestriction.mode === "INCLUDE") {
          // Show only included tags
          filtered = filtered.filter((tag) => restrictedIds.includes(tag.id));
        }
      }

      // REMOVED: Broken cascade logic that tried to check tag.groups and tag.galleries
      // These fields don't exist on Stash tags - tags only have count fields.
      // The correct approach is handled by EmptyEntityFilterService.filterEmptyTags()
      // which checks if tags appear on visible scenes/performers/studios.
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((tag) => {
      // Hide directly hidden tags
      return !hiddenIds.tags.has(tag.id);
    });

    return filtered;
  }

  /**
   * Filter groups based on user's content restrictions and hidden entities
   * Returns groups but hides restricted groups
   *
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterGroupsForUser(
    groups: NormalizedGroup[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedGroup[]> {
    let filtered = [...groups];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      const groupRestriction = restrictions.find(
        (r) => r.entityType === "groups"
      );

      if (groupRestriction) {
        const restrictedIds = JSON.parse(groupRestriction.entityIds) as string[];

        if (groupRestriction.mode === "EXCLUDE") {
          // Hide excluded groups
          filtered = filtered.filter((group) => !restrictedIds.includes(group.id));
        } else if (groupRestriction.mode === "INCLUDE") {
          // Show only included groups
          filtered = filtered.filter((group) => restrictedIds.includes(group.id));
        }
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((group) => {
      // Hide directly hidden groups
      return !hiddenIds.groups.has(group.id);
    });

    return filtered;
  }

  /**
   * Filter galleries based on user's content restrictions and hidden entities
   * Returns galleries but hides restricted galleries
   *
   * @param skipContentRestrictions - If true, skip INCLUDE/EXCLUDE rules but still apply hidden filtering (for admins)
   */
  async filterGalleriesForUser(
    galleries: NormalizedGallery[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<NormalizedGallery[]> {
    let filtered = [...galleries];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      const galleryRestriction = restrictions.find(
        (r) => r.entityType === "galleries"
      );

      if (galleryRestriction) {
        const restrictedIds = JSON.parse(galleryRestriction.entityIds) as string[];

        if (galleryRestriction.mode === "EXCLUDE") {
          // Hide excluded galleries
          filtered = filtered.filter((gallery) => !restrictedIds.includes(gallery.id));
        } else if (galleryRestriction.mode === "INCLUDE") {
          // Show only included galleries
          filtered = filtered.filter((gallery) => restrictedIds.includes(gallery.id));
        }
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((gallery) => {
      // Hide directly hidden galleries
      return !hiddenIds.galleries.has(gallery.id);
    });

    return filtered;
  }

  /**
   * Filter images for a user based on their restrictions and hidden entities
   */
  async filterImagesForUser(
    images: any[],
    userId: number,
    skipContentRestrictions: boolean = false
  ): Promise<any[]> {
    let filtered = [...images];

    // Apply content restrictions if they exist AND not skipped (admins skip these)
    if (!skipContentRestrictions) {
      const restrictions = await this.getRestrictionsForUser(userId);

      const imageRestriction = restrictions.find(
        (r) => r.entityType === "images"
      );

      if (imageRestriction) {
        const restrictedIds = JSON.parse(imageRestriction.entityIds) as string[];

        if (imageRestriction.mode === "EXCLUDE") {
          // Hide excluded images
          filtered = filtered.filter((image) => !restrictedIds.includes(image.id));
        } else if (imageRestriction.mode === "INCLUDE") {
          // Show only included images
          filtered = filtered.filter((image) => restrictedIds.includes(image.id));
        }
      }
    }

    // Apply hidden entity filtering (ALWAYS applied, even for admins)
    const hiddenIds = await userHiddenEntityService.getHiddenEntityIds(userId);

    filtered = filtered.filter((image) => {
      // Hide directly hidden images
      if (hiddenIds.images?.has(image.id)) return false;

      // Hide images in hidden galleries
      if (
        image.galleries?.some((g: any) => hiddenIds.galleries?.has(g.id))
      ) {
        return false;
      }

      return true;
    });

    return filtered;
  }

  /**
   * Get entity IDs from a scene based on entity type
   *
   * FOR TAGS: Implements cascading logic - checks:
   * - Direct scene tags
   * - Tags on the scene's studio
   * - Tags on the scene's performers
   */
  private getSceneEntityIds(
    scene: NormalizedScene,
    entityType: string
  ): string[] {
    switch (entityType) {
      case "groups":
        return (
          scene.groups?.map((g: SceneGroupEntity) =>
            String(g.group?.id || (g as { id?: string }).id)
          ) || []
        );
      case "tags": {
        // CASCADE: Collect tags from scene, studio, and performers
        const tagIds = new Set<string>();

        // Direct scene tags
        (scene.tags || []).forEach((t: EntityWithId) => {
          tagIds.add(String(t.id));
        });

        // Studio tags (cascading)
        if (scene.studio?.tags) {
          (scene.studio.tags as EntityWithId[]).forEach((t: EntityWithId) => {
            tagIds.add(String(t.id));
          });
        }

        // Performer tags (cascading)
        if (scene.performers) {
          scene.performers.forEach((performer) => {
            if ((performer as any).tags) {
              ((performer as any).tags as EntityWithId[]).forEach((t: EntityWithId) => {
                tagIds.add(String(t.id));
              });
            }
          });
        }

        return Array.from(tagIds);
      }
      case "studios":
        return scene.studio ? [String(scene.studio.id)] : [];
      case "galleries":
        return scene.galleries?.map((g: EntityWithId) => String(g.id)) || [];
      default:
        return [];
    }
  }
}

export const userRestrictionService = new UserRestrictionService();
export default userRestrictionService;
