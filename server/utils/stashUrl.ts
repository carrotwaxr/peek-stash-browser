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
 * Gets the UI Stash URL from the current instance configuration
 * This is used for "View in Stash" links - uses uiUrl if set
 * @returns UI Stash URL (e.g., http://localhost:9999 or https://stash.example.com)
 */
export function getStashUiUrl(): string | null {
  try {
    return stashInstanceManager.getUiUrl();
  } catch {
    // No instance configured
    return null;
  }
}

/**
 * Builds a Stash entity URL for "View in Stash" links
 * Uses the uiUrl if configured, otherwise falls back to the base url
 * @param entityType - Type of entity (scene, performer, studio, tag, group, gallery, image)
 * @param entityId - ID of the entity
 * @returns Full URL to the entity in Stash, or null if stashBaseUrl is not available
 */
export function buildStashEntityUrl(
  entityType: 'scene' | 'performer' | 'studio' | 'tag' | 'group' | 'gallery' | 'image',
  entityId: string | number
): string | null {
  const baseUrl = getStashUiUrl();

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
