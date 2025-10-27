import getStash from '../stash.js';
import { logger } from '../utils/logger.js';
import { transformScene, transformPerformer, transformStudio, transformTag } from '../utils/pathMapping.js';
import type { Scene, Performer, Studio, Tag } from 'stashapp-api';

/**
 * Normalized scene with default per-user fields
 */
export type NormalizedScene = Scene & {
  // Per-user fields that default to null/0
  rating: number | null;
  rating100: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
  play_duration: number;
  resume_time: number;
  play_history: string[];
  o_history: any[]; // Match Stash's Scene type
  last_played_at: string | null;
  last_o_at: string | null;
}

/**
 * Normalized performer with default per-user fields
 */
export type NormalizedPerformer = Performer & {
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
  last_played_at: string | null;
  last_o_at: string | null;
}

/**
 * Normalized studio with default per-user fields
 */
export type NormalizedStudio = Studio & {
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
}

/**
 * Normalized tag with default per-user fields
 */
export type NormalizedTag = Tag & {
  rating: number | null;
  favorite: boolean;
  o_counter: number;
  play_count: number;
}

/**
 * Server-wide cache state
 */
interface CacheState {
  scenes: Map<string, NormalizedScene>;
  performers: Map<string, NormalizedPerformer>;
  studios: Map<string, NormalizedStudio>;
  tags: Map<string, NormalizedTag>;
  lastRefreshed: Date | null;
  isInitialized: boolean;
  isRefreshing: boolean;
}

/**
 * Manages server-wide Stash entity cache
 * - Initializes on server startup
 * - Refreshes hourly via scheduled job
 * - Provides fast Map-based lookups
 */
class StashCacheManager {
  private cache: CacheState = {
    scenes: new Map(),
    performers: new Map(),
    studios: new Map(),
    tags: new Map(),
    lastRefreshed: null,
    isInitialized: false,
    isRefreshing: false,
  };

  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Initialize cache - should be called on server startup after config is verified
   */
  async initialize(): Promise<void> {
    if (this.cache.isInitialized) {
      logger.warn('StashCacheManager already initialized');
      return;
    }

    logger.info('Initializing Stash cache...');
    await this.refreshCache();

    // Set up hourly refresh job
    this.refreshInterval = setInterval(() => {
      this.refreshCache().catch(err => {
        logger.error('Scheduled cache refresh failed', { error: err.message });
      });
    }, this.REFRESH_INTERVAL_MS);

    this.cache.isInitialized = true;
    logger.info('StashCacheManager initialized successfully');
  }

  /**
   * Manually trigger cache refresh (for UI "Refresh" button)
   */
  async refreshCache(): Promise<void> {
    if (this.cache.isRefreshing) {
      logger.warn('Cache refresh already in progress, skipping');
      return;
    }

    this.cache.isRefreshing = true;
    const startTime = Date.now();

    try {
      const stash = getStash();

      // Fetch all entities in parallel
      // Use compact query for scenes to reduce bandwidth (trimmed nested objects)
      const [scenesResult, performersResult, studiosResult, tagsResult] = await Promise.all([
        stash.findScenesCompact({ filter: { per_page: -1 } }),
        stash.findPerformers({ filter: { per_page: -1 } }),
        stash.findStudios({ filter: { per_page: -1 } }),
        stash.findTags({ filter: { per_page: -1 } }),
      ]);

      // Create new Maps (double-buffering for atomic swap)
      const newScenes = new Map<string, NormalizedScene>();
      const newPerformers = new Map<string, NormalizedPerformer>();
      const newStudios = new Map<string, NormalizedStudio>();
      const newTags = new Map<string, NormalizedTag>();

      // Normalize scenes with default per-user fields AND transform URLs to use Peek proxy
      scenesResult.findScenes.scenes.forEach((scene: Scene) => {
        const transformed = transformScene(scene);
        newScenes.set(scene.id, {
          ...transformed,
          rating: null,
          rating100: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
          play_duration: 0,
          resume_time: 0,
          play_history: [],
          o_history: [],
          last_played_at: null,
          last_o_at: null,
        });
      });

      // Normalize performers with default per-user fields AND transform image URLs
      performersResult.findPerformers.performers.forEach((performer: Performer) => {
        const transformed = transformPerformer(performer);
        newPerformers.set(performer.id, {
          ...transformed,
          rating: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
          last_played_at: null,
          last_o_at: null,
        });
      });

      // Normalize studios with default per-user fields AND transform image URLs
      studiosResult.findStudios.studios.forEach((studio: Studio) => {
        const transformed = transformStudio(studio);
        newStudios.set(studio.id, {
          ...transformed,
          rating: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
        });
      });

      // Normalize tags with default per-user fields AND transform image URLs
      tagsResult.findTags.tags.forEach((tag: Tag) => {
        const transformed = transformTag(tag);
        newTags.set(tag.id, {
          ...transformed,
          rating: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
        });
      });

      // Atomic swap
      this.cache.scenes = newScenes;
      this.cache.performers = newPerformers;
      this.cache.studios = newStudios;
      this.cache.tags = newTags;
      this.cache.lastRefreshed = new Date();

      const duration = Date.now() - startTime;
      logger.info('Cache refreshed successfully', {
        duration: `${duration}ms`,
        counts: {
          scenes: newScenes.size,
          performers: newPerformers.size,
          studios: newStudios.size,
          tags: newTags.size,
        },
      });
    } catch (error) {
      logger.error('Cache refresh failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    } finally {
      this.cache.isRefreshing = false;
    }
  }

  /**
   * Get all scenes as array
   */
  getAllScenes(): NormalizedScene[] {
    return Array.from(this.cache.scenes.values());
  }

  /**
   * Get scene by ID
   */
  getScene(id: string): NormalizedScene | undefined {
    return this.cache.scenes.get(id);
  }

  /**
   * Get all performers as array
   */
  getAllPerformers(): NormalizedPerformer[] {
    return Array.from(this.cache.performers.values());
  }

  /**
   * Get performer by ID
   */
  getPerformer(id: string): NormalizedPerformer | undefined {
    return this.cache.performers.get(id);
  }

  /**
   * Get all studios as array
   */
  getAllStudios(): NormalizedStudio[] {
    return Array.from(this.cache.studios.values());
  }

  /**
   * Get studio by ID
   */
  getStudio(id: string): NormalizedStudio | undefined {
    return this.cache.studios.get(id);
  }

  /**
   * Get all tags as array
   */
  getAllTags(): NormalizedTag[] {
    return Array.from(this.cache.tags.values());
  }

  /**
   * Get tag by ID
   */
  getTag(id: string): NormalizedTag | undefined {
    return this.cache.tags.get(id);
  }

  /**
   * Check if cache is initialized
   */
  isReady(): boolean {
    return this.cache.isInitialized;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memUsage = process.memoryUsage();
    return {
      isInitialized: this.cache.isInitialized,
      isRefreshing: this.cache.isRefreshing,
      lastRefreshed: this.cache.lastRefreshed,
      counts: {
        scenes: this.cache.scenes.size,
        performers: this.cache.performers.size,
        studios: this.cache.studios.size,
        tags: this.cache.tags.size,
      },
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      },
      estimatedCacheSize: `${((this.cache.scenes.size * 3) / 1024).toFixed(2)} MB`, // Rough estimate: 3KB per scene
    };
  }

  /**
   * Cleanup - stop refresh interval
   */
  cleanup(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    logger.info('StashCacheManager cleanup complete');
  }
}

// Export singleton instance
export const stashCacheManager = new StashCacheManager();
