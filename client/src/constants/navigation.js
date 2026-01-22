import { ENTITY_ICON_NAMES } from "./entityIcons.js";

/**
 * Navigation item definitions with stable keys
 * These keys should NEVER change even if display names or paths are updated
 */
export const NAV_DEFINITIONS = [
  {
    key: "scenes",
    name: "Scenes",
    path: "/scenes",
    icon: ENTITY_ICON_NAMES.scene,
    description: "Browse all scenes in your library",
  },
  {
    key: "recommended",
    name: "Recommended",
    path: "/recommended",
    icon: "sparkles",
    description: "AI-recommended scenes based on your preferences",
  },
  {
    key: "performers",
    name: "Performers",
    path: "/performers",
    icon: ENTITY_ICON_NAMES.performer,
    description: "Browse performers in your library",
  },
  {
    key: "studios",
    name: "Studios",
    path: "/studios",
    icon: ENTITY_ICON_NAMES.studio,
    description: "Browse studios in your library",
  },
  {
    key: "tags",
    name: "Tags",
    path: "/tags",
    icon: ENTITY_ICON_NAMES.tag,
    description: "Browse tags in your library",
  },
  {
    key: "groups",
    name: "Collections",
    path: "/collections",
    icon: ENTITY_ICON_NAMES.group,
    description: "Browse collections and movies in your library",
  },
  {
    key: "galleries",
    name: "Galleries",
    path: "/galleries",
    icon: ENTITY_ICON_NAMES.gallery,
    description: "Browse image galleries in your library",
  },
  {
    key: "images",
    name: "Images",
    path: "/images",
    icon: ENTITY_ICON_NAMES.image,
    description: "Browse all images in your library",
  },
  {
    key: "playlists",
    name: "Playlists",
    path: "/playlists",
    icon: ENTITY_ICON_NAMES.playlist,
    description: "Manage your custom playlists",
  },
  {
    key: "clips",
    name: "Clips",
    path: "/clips",
    icon: ENTITY_ICON_NAMES.clip,
    description: "Browse scene clips and markers",
  },
];

/**
 * Landing page options for post-login redirect
 * Order matters - this is the display order in settings
 */
export const LANDING_PAGE_OPTIONS = [
  { key: "home", label: "Home", path: "/" },
  { key: "scenes", label: "Scenes", path: "/scenes" },
  { key: "performers", label: "Performers", path: "/performers" },
  { key: "studios", label: "Studios", path: "/studios" },
  { key: "tags", label: "Tags", path: "/tags" },
  { key: "collections", label: "Collections", path: "/collections" },
  { key: "galleries", label: "Galleries", path: "/galleries" },
  { key: "images", label: "Images", path: "/images" },
  { key: "playlists", label: "Playlists", path: "/playlists" },
  { key: "clips", label: "Clips", path: "/clips" },
  { key: "recommended", label: "Recommended", path: "/recommended" },
  { key: "watch-history", label: "Watch History", path: "/watch-history" },
  { key: "user-stats", label: "User Stats", path: "/user-stats" },
];

/**
 * Get the path for a landing page key
 * @param {string} key - Landing page key
 * @returns {string} Path for the landing page, defaults to "/"
 */
export const getLandingPagePath = (key) => {
  const option = LANDING_PAGE_OPTIONS.find((opt) => opt.key === key);
  return option?.path || "/";
};

/**
 * Get the landing page destination based on user preference
 * @param {Object} preference - User's landing page preference {pages: string[], randomize: boolean}
 * @param {string} [currentPath] - Current path to exclude from random selection
 * @returns {string} Path to navigate to
 */
export const getLandingPage = (preference, currentPath) => {
  // Default fallback
  if (!preference || !preference.pages?.length) {
    return "/";
  }

  if (preference.randomize && preference.pages.length > 1) {
    // Filter out the current page from random selection (if provided)
    let availablePages = preference.pages;
    if (currentPath) {
      const currentKey = LANDING_PAGE_OPTIONS.find(
        (opt) => opt.path === currentPath
      )?.key;
      if (currentKey) {
        availablePages = preference.pages.filter((key) => key !== currentKey);
      }
    }

    // If all pages were filtered (shouldn't happen with 2+ pages), fall back to all pages
    if (availablePages.length === 0) {
      availablePages = preference.pages;
    }

    const randomIndex = Math.floor(Math.random() * availablePages.length);
    return getLandingPagePath(availablePages[randomIndex]);
  }

  return getLandingPagePath(preference.pages[0]);
};

/**
 * Migrate navigation preferences to include any new items
 * @param {Array} savedPreferences - User's saved nav preferences
 * @returns {Array} Migrated preferences with all current nav items
 */
export const migrateNavPreferences = (savedPreferences) => {
  let prefs = savedPreferences;

  // If no preferences exist, create defaults (all enabled, in order)
  if (!prefs || prefs.length === 0) {
    return NAV_DEFINITIONS.map((def, idx) => ({
      id: def.key,
      enabled: true,
      order: idx,
    }));
  }

  // Find any new nav items that don't exist in saved preferences
  const existingIds = new Set(prefs.map((p) => p.id));
  const missingNavItems = NAV_DEFINITIONS.filter(
    (def) => !existingIds.has(def.key)
  );

  // Insert new nav items at their proper position from NAV_DEFINITIONS
  if (missingNavItems.length > 0) {
    // Create a map of existing prefs for quick lookup
    const prefsMap = new Map(prefs.map((p) => [p.id, p]));

    // Rebuild prefs array in NAV_DEFINITIONS order
    prefs = NAV_DEFINITIONS.map((def, definitionIndex) => {
      if (prefsMap.has(def.key)) {
        // Keep existing preference
        return prefsMap.get(def.key);
      } else {
        // Add new item at its proper position, enabled by default
        return {
          id: def.key,
          enabled: true,
          order: definitionIndex,
        };
      }
    });
  }

  // Re-normalize order values (ensure sequential 0, 1, 2, ...)
  prefs.sort((a, b) => a.order - b.order);
  prefs = prefs.map((pref, idx) => ({ ...pref, order: idx }));

  return prefs;
};

/**
 * Get navigation definition by key
 * @param {string} key - Navigation item key
 * @returns {Object|undefined} Navigation definition
 */
export const getNavDefinition = (key) => {
  return NAV_DEFINITIONS.find((def) => def.key === key);
};

/**
 * Get ordered and filtered nav items based on user preferences
 * @param {Array} preferences - User's nav preferences
 * @returns {Array} Ordered array of enabled nav items
 */
export const getOrderedNavItems = (preferences) => {
  if (!preferences || preferences.length === 0) {
    return NAV_DEFINITIONS;
  }

  // Sort by order
  const sortedPrefs = [...preferences].sort((a, b) => a.order - b.order);

  // Map to definitions and filter by enabled
  return sortedPrefs
    .filter((pref) => pref.enabled)
    .map((pref) => getNavDefinition(pref.id))
    .filter(Boolean); // Remove any undefined (in case of deleted nav items)
};
