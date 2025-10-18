/**
 * Default carousel configuration for new users
 * Defines all available carousels and their default state
 */

export interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

export const DEFAULT_CAROUSELS = [
  { id: "highRatedScenes", enabled: true, order: 0 },
  { id: "recentlyAddedScenes", enabled: true, order: 1 },
  { id: "longScenes", enabled: true, order: 2 },
  { id: "highBitrateScenes", enabled: true, order: 3 },
  { id: "barelyLegalScenes", enabled: true, order: 4 },
  { id: "favoritePerformerScenes", enabled: true, order: 5 },
  { id: "favoriteStudioScenes", enabled: true, order: 6 },
  { id: "favoriteTagScenes", enabled: true, order: 7 },
];

/**
 * Get default carousel preferences for a new user
 */
export function getDefaultCarouselPreferences(): CarouselPreference[] {
  return DEFAULT_CAROUSELS.map(({ id, enabled, order }) => ({
    id,
    enabled,
    order,
  }));
}
