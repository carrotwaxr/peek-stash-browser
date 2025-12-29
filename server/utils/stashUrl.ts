/**
 * Utility functions for working with Stash URLs
 */

import { stashInstanceManager } from "../services/StashInstanceManager.js";

/**
 * Gets the base Stash URL from the current instance configuration
 * @returns Base Stash URL (e.g., http://localhost:9999)
 */
export function getStashBaseUrl(): string | null {
  try {
    return stashInstanceManager.getBaseUrl();
  } catch {
    // No instance configured
    return null;
  }
}

/**
 * Builds a Stash entity URL
 * @param entityType - Type of entity (scene, performer, studio, tag, group, gallery, image)
 * @param entityId - ID of the entity
 * @returns Full URL to the entity in Stash, or null if stashBaseUrl is not available
 */
export function buildStashEntityUrl(
  entityType: 'scene' | 'performer' | 'studio' | 'tag' | 'group' | 'gallery' | 'image',
  entityId: string | number
): string | null {
  const baseUrl = getStashBaseUrl();

  if (!baseUrl) {
    return null;
  }

  // Map entity types to Stash URL paths
  const pathMap: Record<string, string> = {
    scene: 'scenes',
    performer: 'performers',
    studio: 'studios',
    tag: 'tags',
    group: 'groups',
    gallery: 'galleries',
    image: 'images',
  };

  const path = pathMap[entityType];
  if (!path) {
    return null;
  }

  return `${baseUrl}/${path}/${entityId}`;
}
