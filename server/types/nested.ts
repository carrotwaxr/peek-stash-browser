/**
 * Nested/Partial Entity Types
 *
 * These types represent entities when they appear inside other entities.
 * For example, when a Performer appears in Scene.performers[], it contains
 * fewer fields than a full Performer object.
 *
 * These types are inferred from GraphQL queries and represent the actual
 * data structure returned by those queries.
 */

/**
 * Lightweight tag reference
 * Used when tags appear in: Performer.tags[], Studio.tags[], Scene.tags[]
 */
export interface NestedTag {
  id: string;
  name: string;
  image_path: string | null;
  favorite: boolean;
}

/**
 * Group reference with scene index
 * Used in Scene.groups[]
 */
export interface NestedGroup {
  id: string;
  name: string;
  scene_index?: number; // Position of scene within group
  favorite?: boolean; // Added by Peek when merging user data
}
