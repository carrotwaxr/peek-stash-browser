import {
  Clock,
  Heart,
  PlayCircle,
  Star,
  Tag,
  Video,
} from "lucide-react";

/**
 * Shared carousel definitions for homepage and settings
 * Order: Continue Watching, Recently Added, High Rated, Favorite Performers,
 *        Favorite Tags, Favorite Studios
 *
 * Note: Some carousels (High Bitrate, Barely Legal, Feature Length) have been removed.
 * In the future, users will be able to create custom carousels using a filter builder.
 */
export const CAROUSEL_DEFINITIONS = [
  {
    title: "Continue Watching",
    iconComponent: PlayCircle,
    iconProps: { className: "w-6 h-6", color: "#10b981" },
    fetchKey: "continueWatching",
    isSpecial: true, // Not a standard query carousel
  },
  {
    title: "Recently Added",
    iconComponent: Clock,
    iconProps: { className: "w-6 h-6", style: { color: "var(--status-info)" } },
    fetchKey: "recentlyAddedScenes",
  },
  {
    title: "High Rated",
    iconComponent: Star,
    iconProps: {
      className: "w-6 h-6",
      style: { color: "var(--status-warning)" },
    },
    fetchKey: "highRatedScenes",
  },
  {
    title: "Favorite Performers",
    iconComponent: Heart,
    iconProps: {
      className: "w-6 h-6",
      style: { color: "var(--status-error)" },
    },
    fetchKey: "favoritePerformerScenes",
  },
  {
    title: "Favorite Tags",
    iconComponent: Tag,
    iconProps: {
      className: "w-6 h-6",
      style: { color: "var(--accent-primary)" },
    },
    fetchKey: "favoriteTagScenes",
  },
  {
    title: "Favorite Studios",
    iconComponent: Video,
    iconProps: { className: "w-6 h-6", style: { color: "var(--status-info)" } },
    fetchKey: "favoriteStudioScenes",
  },
];

/**
 * Migrate carousel preferences to include any new carousels
 * @param {Array} savedPreferences - Preferences from backend
 * @returns {Array} - Migrated preferences with all carousels
 */
export const migrateCarouselPreferences = (savedPreferences) => {
  let prefs = savedPreferences;

  // If no preferences exist, create defaults
  if (!prefs || prefs.length === 0) {
    return CAROUSEL_DEFINITIONS.map((def, idx) => ({
      id: def.fetchKey,
      enabled: true,
      order: idx,
    }));
  }

  // Filter out removed carousels (barelyLegalScenes, longScenes, highBitrateScenes)
  const validIds = new Set(CAROUSEL_DEFINITIONS.map((def) => def.fetchKey));
  prefs = prefs.filter((pref) => validIds.has(pref.id));

  // Migrate: Add any new carousels that don't exist in saved preferences
  const existingIds = new Set(prefs.map((p) => p.id));
  const missingCarousels = CAROUSEL_DEFINITIONS.filter(
    (def) => !existingIds.has(def.fetchKey)
  );

  // Add missing carousels at the end (or at beginning for continueWatching)
  missingCarousels.forEach((def) => {
    const newPref = {
      id: def.fetchKey,
      enabled: true,
      order: def.fetchKey === "continueWatching" ? -1 : prefs.length,
    };
    prefs.push(newPref);
  });

  // Re-normalize order values
  prefs.sort((a, b) => a.order - b.order);
  prefs = prefs.map((pref, idx) => ({ ...pref, order: idx }));

  return prefs;
};
