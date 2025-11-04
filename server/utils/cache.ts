import NodeCache from "node-cache";
import { logger } from "./logger.js";

// Cache configuration
const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_CHECK_PERIOD_SECONDS = 600; // Check for expired keys every 10 minutes

// Create cache instances
const stashEntityCache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: CACHE_CHECK_PERIOD_SECONDS,
  useClones: false, // Better performance, but be careful not to mutate cached objects
});

const userRatingCache = new NodeCache({
  stdTTL: CACHE_TTL_SECONDS,
  checkperiod: CACHE_CHECK_PERIOD_SECONDS,
  useClones: false,
});

// Cache keys
export const CACHE_KEYS = {
  SCENES_ALL: "stash:scenes:all",
  PERFORMERS_ALL: "stash:performers:all",
  STUDIOS_ALL: "stash:studios:all",
  TAGS_ALL: "stash:tags:all",

  userSceneRatings: (userId: number) => `user:${userId}:scene-ratings`,
  userPerformerRatings: (userId: number) => `user:${userId}:performer-ratings`,
  userStudioRatings: (userId: number) => `user:${userId}:studio-ratings`,
  userTagRatings: (userId: number) => `user:${userId}:tag-ratings`,
};

// Stash entity cache methods
export const stashCache = {
  get: <T>(key: string): T | undefined => {
    const value = stashEntityCache.get<T>(key);
    if (value !== undefined) {
      logger.debug("Cache hit", { key });
    }
    return value;
  },

  set: <T>(key: string, value: T, ttl?: number): boolean => {
    const success =
      ttl !== undefined
        ? stashEntityCache.set(key, value, ttl)
        : stashEntityCache.set(key, value);
    if (success) {
      logger.debug("Cache set", { key, ttl: ttl || CACHE_TTL_SECONDS });
    }
    return success;
  },

  del: (key: string): number => {
    return stashEntityCache.del(key);
  },

  flush: (): void => {
    stashEntityCache.flushAll();
    logger.info("Stash entity cache flushed");
  },

  getStats: () => {
    return stashEntityCache.getStats();
  },
};

// User rating cache methods
export const ratingCache = {
  get: <T>(key: string): T | undefined => {
    const value = userRatingCache.get<T>(key);
    if (value !== undefined) {
      logger.debug("Cache hit", { key });
    }
    return value;
  },

  set: <T>(key: string, value: T, ttl?: number): boolean => {
    const success =
      ttl !== undefined
        ? userRatingCache.set(key, value, ttl)
        : userRatingCache.set(key, value);
    if (success) {
      logger.debug("Cache set", { key, ttl: ttl || CACHE_TTL_SECONDS });
    }
    return success;
  },

  del: (key: string): number => {
    return userRatingCache.del(key);
  },

  // Invalidate all rating caches for a specific user
  invalidateUserCaches: (userId: number): void => {
    const keys = [
      CACHE_KEYS.userSceneRatings(userId),
      CACHE_KEYS.userPerformerRatings(userId),
      CACHE_KEYS.userStudioRatings(userId),
      CACHE_KEYS.userTagRatings(userId),
    ];
    userRatingCache.del(keys);
    logger.info("User rating caches invalidated", { userId });
  },

  flush: (): void => {
    userRatingCache.flushAll();
    logger.info("User rating cache flushed");
  },

  getStats: () => {
    return userRatingCache.getStats();
  },
};

// Event listeners for cache stats logging
stashEntityCache.on("expired", (key, _value) => {
  logger.debug("Cache entry expired", { key });
});

userRatingCache.on("expired", (key, _value) => {
  logger.debug("Cache entry expired", { key });
});

// Log cache stats periodically (every 30 minutes)
setInterval(() => {
  const stashStats = stashCache.getStats();
  const ratingStats = ratingCache.getStats();

  logger.info("Cache statistics", {
    stash: {
      keys: stashStats.keys,
      hits: stashStats.hits,
      misses: stashStats.misses,
      hitRate: stashStats.hits / (stashStats.hits + stashStats.misses) || 0,
    },
    ratings: {
      keys: ratingStats.keys,
      hits: ratingStats.hits,
      misses: ratingStats.misses,
      hitRate: ratingStats.hits / (ratingStats.hits + ratingStats.misses) || 0,
    },
  });
}, 30 * 60 * 1000);

export default { stashCache, ratingCache, CACHE_KEYS };
