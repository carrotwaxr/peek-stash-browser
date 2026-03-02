/**
 * Indicator behavior configuration
 *
 * Future: This will be sourced from user settings in the database.
 * Users will be able to customize behavior per card type per relationship.
 *
 * Behaviors:
 * - 'rich': Show TooltipEntityGrid with entity previews
 * - 'nav': Count + click navigates to filtered list
 * - 'count': Count only, no interaction
 */

export const INDICATOR_BEHAVIORS = {
  scene: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',
    images: 'count',
  },
  image: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',
    images: 'count',
  },
  gallery: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'count',
    scenes: 'nav',
    images: 'nav',
  },
  performer: {
    performers: 'count',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  tag: {
    performers: 'rich',
    tags: 'count',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  studio: {
    performers: 'nav',
    tags: 'rich',
    studios: 'count',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  group: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  clip: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
};

/**
 * Get indicator behavior for a card type and relationship
 * @param {string} cardType - The card type (scene, performer, tag, etc.)
 * @param {string} relationshipType - The relationship (performers, tags, etc.)
 * @returns {'rich'|'nav'|'count'} The behavior for this indicator
 */
export function getIndicatorBehavior(cardType, relationshipType) {
  return INDICATOR_BEHAVIORS[cardType]?.[relationshipType] ?? 'count';
}
