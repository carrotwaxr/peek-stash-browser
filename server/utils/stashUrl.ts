/**
 * Utility functions for working with Stash URLs
 */

/**
 * Strips /graphql from the STASH_URL environment variable to get the base Stash URL
 * @returns Base Stash URL (e.g., http://localhost:9999)
 */
export function getStashBaseUrl(): string | null {
  const stashUrl = process.env.STASH_URL;

  if (!stashUrl) {
    return null;
  }

  // Remove /graphql suffix if present
  return stashUrl.replace(/\/graphql\/?$/, '');
}

/**
 * Builds a Stash entity URL
 * @param entityType - Type of entity (scene, performer, studio, tag, group, gallery)
 * @param entityId - ID of the entity
 * @returns Full URL to the entity in Stash, or null if stashBaseUrl is not available
 */
export function buildStashEntityUrl(
  entityType: 'scene' | 'performer' | 'studio' | 'tag' | 'group' | 'gallery',
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
  };

  const path = pathMap[entityType];
  if (!path) {
    return null;
  }

  return `${baseUrl}/${path}/${entityId}`;
}
