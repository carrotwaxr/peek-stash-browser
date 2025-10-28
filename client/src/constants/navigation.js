/**
 * Navigation item definitions with stable keys
 * These keys should NEVER change even if display names or paths are updated
 */
export const NAV_DEFINITIONS = [
  {
    key: "scenes",
    name: "Scenes",
    path: "/scenes",
    icon: "clapperboard",
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
    icon: "user-star",
    description: "Browse performers in your library",
  },
  {
    key: "studios",
    name: "Studios",
    path: "/studios",
    icon: "spotlight",
    description: "Browse studios in your library",
  },
  {
    key: "tags",
    name: "Tags",
    path: "/tags",
    icon: "tags",
    description: "Browse tags in your library",
  },
  {
    key: "galleries",
    name: "Galleries",
    path: "/galleries",
    icon: "images",
    description: "Browse image galleries in your library",
  },
  {
    key: "playlists",
    name: "Playlists",
    path: "/playlists",
    icon: "list",
    description: "Manage your custom playlists",
  },
];

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

  // Add any new nav items that don't exist in saved preferences
  const existingIds = new Set(prefs.map((p) => p.id));
  const missingNavItems = NAV_DEFINITIONS.filter(
    (def) => !existingIds.has(def.key)
  );

  missingNavItems.forEach((def) => {
    const newPref = {
      id: def.key,
      enabled: true,
      order: prefs.length, // Add to end
    };
    prefs.push(newPref);
  });

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
