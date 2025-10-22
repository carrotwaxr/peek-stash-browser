/**
 * localStorage cache utility for filter dropdown data
 * Caches performer, studio, and tag lists to reduce API calls
 */

const CACHE_KEYS = {
  performers: "peek-performers-cache",
  studios: "peek-studios-cache",
  tags: "peek-tags-cache",
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
 * @param {"performers"|"studios"|"tags"} entityType
 * @returns {{data: Array, timestamp: number}|null} Cached data or null if stale/missing
 */
export const getCache = (entityType) => {
  try {
    const cacheKey = CACHE_KEYS[entityType];
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached);

    // Check if cache is still fresh
    if (!isCacheFresh(parsed.timestamp)) {
      // Remove stale cache
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Error reading ${entityType} cache:`, error);
    return null;
  }
};

/**
 * Set cache for an entity type
 * @param {"performers"|"studios"|"tags"} entityType
 * @param {Array} data - Array of {id, name} objects
 */
export const setCache = (entityType, data) => {
  try {
    const cacheKey = CACHE_KEYS[entityType];
    const cacheData = {
      timestamp: Date.now(),
      data,
    };

    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.error(`Error setting ${entityType} cache:`, error);
    // If quota exceeded, try to clear old caches
    if (error.name === 'QuotaExceededError') {
      clearAllCaches();
    }
  }
};

/**
 * Clear cache for a specific entity type
 * @param {"performers"|"studios"|"tags"} entityType
 */
export const clearCache = (entityType) => {
  try {
    const cacheKey = CACHE_KEYS[entityType];
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error(`Error clearing ${entityType} cache:`, error);
  }
};

/**
 * Clear all filter caches
 */
export const clearAllCaches = () => {
  Object.values(CACHE_KEYS).forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error clearing cache ${key}:`, error);
    }
  });
};

/**
 * Get cache statistics
 * @returns {Object} Cache stats for each entity type
 */
export const getCacheStats = () => {
  const stats = {};

  Object.entries(CACHE_KEYS).forEach(([entityType]) => {
    const cached = getCache(entityType);
    stats[entityType] = {
      cached: !!cached,
      count: cached?.data?.length || 0,
      age: cached ? Math.floor((Date.now() - cached.timestamp) / 1000 / 60) : null, // minutes
    };
  });

  return stats;
};
