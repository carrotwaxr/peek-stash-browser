/**
 * localStorage cache utility for filter dropdown data
 * Caches performer, studio, and tag lists to reduce API calls
 */

const CACHE_KEYS = {
  performers: "peek-performers-cache",
  studios: "peek-studios-cache",
  tags: "peek-tags-cache",
  groups: "peek-groups-cache",
  galleries: "peek-galleries-cache",
};

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Check if cached data is still valid
 * @param {number} timestamp - Cache timestamp
 * @returns {boolean} True if cache is still fresh
 */
const isCacheFresh = (timestamp) => {
  return Date.now() - timestamp < CACHE_TTL;
};

/**
 * Get cached data for an entity type
 * @param {string} cacheKey - Cache key (e.g., "tags" or "tags_scenes")
 * @returns {{data: Array, timestamp: number}|null} Cached data or null if stale/missing
 */
export const getCache = (cacheKey) => {
  try {
    // Support both simple keys (via CACHE_KEYS lookup) and composite keys (direct)
    const storageKey = CACHE_KEYS[cacheKey] || `peek-${cacheKey}-cache`;
    const cached = localStorage.getItem(storageKey);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached);

    // Check if cache is still fresh
    if (!isCacheFresh(parsed.timestamp)) {
      // Remove stale cache
      localStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Error reading ${cacheKey} cache:`, error);
    return null;
  }
};

/**
 * Set cache for an entity type
 * @param {string} cacheKey - Cache key (e.g., "tags" or "tags_scenes")
 * @param {Array} data - Array of {id, name} objects
 */
export const setCache = (cacheKey, data) => {
  try {
    // Support both simple keys (via CACHE_KEYS lookup) and composite keys (direct)
    const storageKey = CACHE_KEYS[cacheKey] || `peek-${cacheKey}-cache`;
    const cacheData = {
      timestamp: Date.now(),
      data,
    };

    localStorage.setItem(storageKey, JSON.stringify(cacheData));
  } catch (error) {
    console.error(`Error setting ${cacheKey} cache:`, error);
    // If quota exceeded, try to clear old caches
    if (error.name === "QuotaExceededError") {
      clearAllCaches();
    }
  }
};

/**
 * Clear all filter caches
 */
const clearAllCaches = () => {
  Object.values(CACHE_KEYS).forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error clearing cache ${key}:`, error);
    }
  });
};
