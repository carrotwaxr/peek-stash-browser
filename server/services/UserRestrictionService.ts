import { PrismaClient } from "@prisma/client";
import type { UserContentRestriction } from "@prisma/client";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";

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

const prisma = new PrismaClient();

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
   * Filter scenes based on user's content restrictions
   *
   * Logic:
   * 1. Apply INCLUDE filters (intersection - must match ALL)
   * 2. Apply EXCLUDE filters (difference - must not match ANY)
   * 3. Apply restrictEmpty rules
   */
  async filterScenesForUser(
    scenes: NormalizedScene[],
    userId: number
  ): Promise<NormalizedScene[]> {
    const restrictions = await this.getRestrictionsForUser(userId);

    if (restrictions.length === 0) {
      return scenes; // No restrictions, return all scenes
    }

    let filtered = [...scenes];

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

    return filtered;
  }

  /**
   * Filter performers based on user's content restrictions
   * Returns performers but with filtered scene counts
   */
  async filterPerformersForUser(
    performers: NormalizedPerformer[],
    _userId: number
  ): Promise<NormalizedPerformer[]> {
    // For now, return all performers
    // In the future, we could filter based on whether all their scenes are restricted
    return performers;
  }

  /**
   * Filter studios based on user's content restrictions
   * Returns studios but with filtered scene counts
   */
  async filterStudiosForUser(
    studios: NormalizedStudio[],
    userId: number
  ): Promise<NormalizedStudio[]> {
    const restrictions = await this.getRestrictionsForUser(userId);
    const studioRestriction = restrictions.find(
      (r) => r.entityType === "studios"
    );

    if (!studioRestriction) {
      return studios; // No studio restrictions
    }

    const restrictedIds = JSON.parse(studioRestriction.entityIds) as string[];

    if (studioRestriction.mode === "EXCLUDE") {
      // Hide excluded studios
      return studios.filter((studio) => !restrictedIds.includes(studio.id));
    } else if (studioRestriction.mode === "INCLUDE") {
      // Show only included studios
      return studios.filter((studio) => restrictedIds.includes(studio.id));
    }

    return studios;
  }

  /**
   * Filter tags based on user's content restrictions
   * Returns tags but hides restricted tags
   */
  async filterTagsForUser(
    tags: NormalizedTag[],
    userId: number
  ): Promise<NormalizedTag[]> {
    const restrictions = await this.getRestrictionsForUser(userId);
    const tagRestriction = restrictions.find((r) => r.entityType === "tags");

    if (!tagRestriction) {
      return tags; // No tag restrictions
    }

    const restrictedIds = JSON.parse(tagRestriction.entityIds) as string[];

    if (tagRestriction.mode === "EXCLUDE") {
      // Hide excluded tags
      return tags.filter((tag) => !restrictedIds.includes(tag.id));
    } else if (tagRestriction.mode === "INCLUDE") {
      // Show only included tags
      return tags.filter((tag) => restrictedIds.includes(tag.id));
    }

    return tags;
  }

  /**
   * Filter groups based on user's content restrictions
   * Returns groups but hides restricted groups
   */
  async filterGroupsForUser(
    groups: NormalizedGroup[],
    userId: number
  ): Promise<NormalizedGroup[]> {
    const restrictions = await this.getRestrictionsForUser(userId);
    const groupRestriction = restrictions.find(
      (r) => r.entityType === "groups"
    );

    if (!groupRestriction) {
      return groups; // No group restrictions
    }

    const restrictedIds = JSON.parse(groupRestriction.entityIds) as string[];

    if (groupRestriction.mode === "EXCLUDE") {
      // Hide excluded groups
      return groups.filter((group) => !restrictedIds.includes(group.id));
    } else if (groupRestriction.mode === "INCLUDE") {
      // Show only included groups
      return groups.filter((group) => restrictedIds.includes(group.id));
    }

    return groups;
  }

  /**
   * Filter galleries based on user's content restrictions
   * Returns galleries but hides restricted galleries
   */
  async filterGalleriesForUser(
    galleries: NormalizedGallery[],
    userId: number
  ): Promise<NormalizedGallery[]> {
    const restrictions = await this.getRestrictionsForUser(userId);
    const galleryRestriction = restrictions.find(
      (r) => r.entityType === "galleries"
    );

    if (!galleryRestriction) {
      return galleries; // No gallery restrictions
    }

    const restrictedIds = JSON.parse(galleryRestriction.entityIds) as string[];

    if (galleryRestriction.mode === "EXCLUDE") {
      // Hide excluded galleries
      return galleries.filter((gallery) => !restrictedIds.includes(gallery.id));
    } else if (galleryRestriction.mode === "INCLUDE") {
      // Show only included galleries
      return galleries.filter((gallery) => restrictedIds.includes(gallery.id));
    }

    return galleries;
  }

  /**
   * Get entity IDs from a scene based on entity type
   */
  private getSceneEntityIds(
    scene: NormalizedScene,
    entityType: string
  ): string[] {
    switch (entityType) {
      case "groups":
        // SceneGroup has nested group.id structure, but sometimes just id
        return (
          scene.groups?.map((g: SceneGroupEntity) =>
            String(g.group?.id || (g as { id?: string }).id)
          ) || []
        );
      case "tags":
        return scene.tags?.map((t: EntityWithId) => String(t.id)) || [];
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
