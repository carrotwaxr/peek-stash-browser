import { logger } from "../utils/logger.js";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";

/**
 * FilteredEntityCacheService
 *
 * In-memory cache for filtered entity lists per user.
 * Avoids expensive recalculation of user restrictions + empty entity filtering on every request.
 *
 * Performance Impact:
 * - First request: Same cost as before (cache miss, compute and store)
 * - Subsequent requests: Near-instant (in-memory lookup)
 * - Expected cache hit rate: 95%+ (users browse multiple pages)
 *
 * Cache Invalidation:
 * - Per-user: When user restrictions change
 * - Global: When Stash cache updates (new content)
 * - Version-based: Cache key includes Stash cache version
 */

type EntityType = "performers" | "studios" | "tags" | "groups" | "galleries";

type Entity =
  | NormalizedPerformer
  | NormalizedStudio
  | NormalizedTag
  | NormalizedGroup
  | NormalizedGallery;

interface CachedEntities {
  entities: Entity[];
  timestamp: number;
  cacheVersion: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  sizeBytes: number;
  entries: Array<{
    key: string;
    entityCount: number;
    age: number;
    sizeBytes: number;
  }>;
}

class FilteredEntityCacheService {
  private cache = new Map<string, CachedEntities>();
  private hits = 0;
  private misses = 0;

  // Configuration
  private readonly MAX_CACHE_SIZE_MB = 100; // 100MB max total cache size
  private readonly MAX_USER_CACHE_SIZE_MB = 10; // 10MB max per user
  private readonly MAX_AGE_MS = 1000 * 60 * 60; // 1 hour TTL

  /**
   * Get filtered entities for a user
   * Returns cached version if available, otherwise returns null (caller should compute and store)
   */
  get(
    userId: number,
    entityType: EntityType,
    cacheVersion: number
  ): Entity[] | null {
    const key = this.getCacheKey(userId, entityType, cacheVersion);
    const cached = this.cache.get(key);

    if (!cached) {
      this.misses++;
      logger.debug("Cache miss", { userId, entityType, cacheVersion });
      return null;
    }

    // Check if cache is stale (version mismatch or expired)
    const age = Date.now() - cached.timestamp;
    if (cached.cacheVersion !== cacheVersion || age > this.MAX_AGE_MS) {
      this.cache.delete(key);
      this.misses++;
      logger.debug("Cache stale", {
        userId,
        entityType,
        reason:
          cached.cacheVersion !== cacheVersion ? "version mismatch" : "expired",
        age,
      });
      return null;
    }

    this.hits++;
    logger.debug("Cache hit", { userId, entityType, entityCount: cached.entities.length });
    return cached.entities;
  }

  /**
   * Store filtered entities in cache
   */
  set(
    userId: number,
    entityType: EntityType,
    entities: Entity[],
    cacheVersion: number
  ): void {
    const key = this.getCacheKey(userId, entityType, cacheVersion);

    // Check cache size limits before adding
    this.evictIfNeeded();

    this.cache.set(key, {
      entities,
      timestamp: Date.now(),
      cacheVersion,
    });

    logger.debug("Cache set", {
      userId,
      entityType,
      entityCount: entities.length,
      cacheVersion,
    });
  }

  /**
   * Invalidate cache for a specific user
   * Called when user restrictions change
   */
  invalidateUser(userId: number): void {
    let deletedCount = 0;
    const userPrefix = `user:${userId}:`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(userPrefix)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    logger.info("Invalidated user cache", { userId, deletedCount });
  }

  /**
   * Invalidate all cache
   * Called when Stash cache updates
   */
  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;

    logger.info("Invalidated all cache", { deletedCount: size });
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => {
      const sizeBytes = this.estimateSize(value.entities);
      return {
        key,
        entityCount: value.entities.length,
        age: Date.now() - value.timestamp,
        sizeBytes,
      };
    });

    const totalSizeBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      sizeBytes: totalSizeBytes,
      entries: entries.sort((a, b) => b.sizeBytes - a.sizeBytes), // Largest first
    };
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    userId: number,
    entityType: EntityType,
    cacheVersion: number
  ): string {
    return `user:${userId}:${entityType}:v${cacheVersion}`;
  }

  /**
   * Estimate memory size of entities array
   * Rough estimate: JSON.stringify length
   */
  private estimateSize(entities: Entity[]): number {
    try {
      return JSON.stringify(entities).length;
    } catch {
      // Fallback: estimate based on count
      return entities.length * 1000; // ~1KB per entity estimate
    }
  }

  /**
   * Evict old/large entries if cache exceeds limits
   * Uses LRU strategy (evicts oldest entries first)
   */
  private evictIfNeeded(): void {
    const stats = this.getCacheStats();
    const sizeMB = stats.sizeBytes / 1024 / 1024;

    if (sizeMB <= this.MAX_CACHE_SIZE_MB) {
      return; // No eviction needed
    }

    logger.warn("Cache size exceeded, evicting old entries", {
      currentSizeMB: sizeMB.toFixed(2),
      maxSizeMB: this.MAX_CACHE_SIZE_MB,
      entries: stats.size,
    });

    // Sort by age (oldest first)
    const sortedEntries = stats.entries.sort((a, b) => b.age - a.age);

    // Evict oldest entries until size is under limit
    let evictedCount = 0;
    let currentSize = stats.sizeBytes;

    for (const entry of sortedEntries) {
      if (currentSize / 1024 / 1024 <= this.MAX_CACHE_SIZE_MB * 0.8) {
        break; // Reduced to 80% of limit, stop evicting
      }

      this.cache.delete(entry.key);
      currentSize -= entry.sizeBytes;
      evictedCount++;
    }

    logger.info("Cache eviction complete", {
      evictedCount,
      newSizeMB: (currentSize / 1024 / 1024).toFixed(2),
      remainingEntries: stats.size - evictedCount,
    });
  }

  /**
   * Evict entries for a specific user if they exceed per-user limit
   */
  private evictUserIfNeeded(userId: number): void {
    const userPrefix = `user:${userId}:`;
    const userEntries = Array.from(this.cache.entries())
      .filter(([key]) => key.startsWith(userPrefix))
      .map(([key, value]) => ({
        key,
        sizeBytes: this.estimateSize(value.entities),
        age: Date.now() - value.timestamp,
      }));

    const totalSize = userEntries.reduce((sum, e) => sum + e.sizeBytes, 0);
    const sizeMB = totalSize / 1024 / 1024;

    if (sizeMB <= this.MAX_USER_CACHE_SIZE_MB) {
      return; // No eviction needed
    }

    logger.warn("User cache size exceeded, evicting old entries", {
      userId,
      currentSizeMB: sizeMB.toFixed(2),
      maxSizeMB: this.MAX_USER_CACHE_SIZE_MB,
      entries: userEntries.length,
    });

    // Sort by age (oldest first)
    const sortedEntries = userEntries.sort((a, b) => b.age - a.age);

    // Evict oldest entries until size is under limit
    let evictedCount = 0;
    let currentSize = totalSize;

    for (const entry of sortedEntries) {
      if (currentSize / 1024 / 1024 <= this.MAX_USER_CACHE_SIZE_MB * 0.8) {
        break; // Reduced to 80% of limit, stop evicting
      }

      this.cache.delete(entry.key);
      currentSize -= entry.sizeBytes;
      evictedCount++;
    }

    logger.info("User cache eviction complete", {
      userId,
      evictedCount,
      newSizeMB: (currentSize / 1024 / 1024).toFixed(2),
    });
  }
}

export const filteredEntityCacheService = new FilteredEntityCacheService();
export default filteredEntityCacheService;
