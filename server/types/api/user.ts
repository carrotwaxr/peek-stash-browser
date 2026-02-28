// server/types/api/user.ts
/**
 * User Settings & Preferences Types
 *
 * Centralized type definitions for user settings endpoints.
 * Previously duplicated across controllers/user.ts, controllers/carousel.ts,
 * and controllers/setup.ts.
 */

/**
 * Carousel preference configuration for user home page
 */
export interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

/**
 * Table column configuration for a preset
 */
export interface TableColumnsConfig {
  visible: string[];
  order: string[];
}

/**
 * Filter preset for scene/performer/studio/tag filtering
 */
export interface FilterPreset {
  id: string;
  name: string;
  filters: unknown;
  sort?: string;
  direction?: string;
  viewMode?: string;
  zoomLevel?: string;
  tableColumns?: TableColumnsConfig | null;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * User filter presets collection, keyed by entity type
 */
export interface FilterPresets {
  scene?: FilterPreset[];
  performer?: FilterPreset[];
  studio?: FilterPreset[];
  tag?: FilterPreset[];
  group?: FilterPreset[];
  gallery?: FilterPreset[];
  [key: string]: FilterPreset[] | undefined;
}

/**
 * Default filter presets (preset IDs for each entity type)
 */
export interface DefaultFilterPresets {
  scene?: string;
  performer?: string;
  studio?: string;
  tag?: string;
  group?: string;
  gallery?: string;
  [key: string]: string | undefined;
}

/**
 * Sync updates for entity ratings/favorites
 */
export interface SyncUpdates {
  rating?: number | null;
  rating100?: number | null;
  favorite?: boolean;
  [key: string]: unknown;
}

/**
 * User content restriction from database
 */
export interface UserRestriction {
  id?: number;
  userId?: string;
  entityType: string;
  mode: string;
  entityIds: string[] | string;
  restrictEmpty?: boolean;
  [key: string]: unknown;
}
