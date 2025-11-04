import getStash from "../stash.js";
import { logger } from "../utils/logger.js";
import {
  transformScene,
  transformPerformer,
  transformStudio,
  transformTag,
  transformGallery,
  transformGroup,
} from "../utils/pathMapping.js";
import type { Scene, Performer, Studio, Tag, Gallery, Group } from "stashapp-api";
import type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
} from "../types/index.js";

/**
 * Server-wide cache state
 */
interface CacheState {
  scenes: Map<string, NormalizedScene>;
  performers: Map<string, NormalizedPerformer>;
  studios: Map<string, NormalizedStudio>;
  tags: Map<string, NormalizedTag>;
  galleries: Map<string, NormalizedGallery>;
  groups: Map<string, NormalizedGroup>;
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
    galleries: new Map(),
    groups: new Map(),
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
      logger.warn("StashCacheManager already initialized");
      return;
    }

    logger.info("Initializing Stash cache...");
    await this.refreshCache();

    // Set up hourly refresh job
    this.refreshInterval = setInterval(() => {
      this.refreshCache().catch((err) => {
        logger.error("Scheduled cache refresh failed", { error: err.message });
      });
    }, this.REFRESH_INTERVAL_MS);

    this.cache.isInitialized = true;
    logger.info("StashCacheManager initialized successfully");
  }

  /**
   * Manually trigger cache refresh (for UI "Refresh" button)
   */
  async refreshCache(): Promise<void> {
    if (this.cache.isRefreshing) {
      logger.warn("Cache refresh already in progress, skipping");
      return;
    }

    this.cache.isRefreshing = true;
    const startTime = Date.now();

    try {
      const stash = getStash();

      // Fetch all entities in parallel
      // Use compact query for scenes to reduce bandwidth (trimmed nested objects)
      const [
        scenesResult,
        performersResult,
        studiosResult,
        tagsResult,
        galleriesResult,
        groupsResult,
      ] = await Promise.all([
        stash.findScenesCompact({ filter: { per_page: -1 } }),
        stash.findPerformers({ filter: { per_page: -1 } }),
        stash.findStudios({ filter: { per_page: -1 } }),
        stash.findTags({ filter: { per_page: -1 } }),
        stash.findGalleries({ filter: { per_page: -1 } }),
        stash.findGroups({ filter: { per_page: -1 } }),
      ]);

      // Create new Maps (double-buffering for atomic swap)
      const newScenes = new Map<string, NormalizedScene>();
      const newPerformers = new Map<string, NormalizedPerformer>();
      const newStudios = new Map<string, NormalizedStudio>();
      const newTags = new Map<string, NormalizedTag>();
      const newGalleries = new Map<string, NormalizedGallery>();
      const newGroups = new Map<string, NormalizedGroup>();

      // Normalize scenes with default per-user fields AND transform URLs to use Peek proxy
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      scenesResult.findScenes.scenes.forEach((scene) => {
        const transformed = transformScene(scene as Scene);
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
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      performersResult.findPerformers.performers.forEach(
        (performer) => {
          const transformed = transformPerformer(performer as Performer);
          newPerformers.set(performer.id, {
            ...transformed,
            rating: null,
            favorite: false,
            o_counter: 0,
            play_count: 0,
            last_played_at: null,
            last_o_at: null,
          });
        }
      );

      // Normalize studios with default per-user fields AND transform image URLs
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      studiosResult.findStudios.studios.forEach((studio) => {
        const transformed = transformStudio(studio as Studio);
        newStudios.set(studio.id, {
          ...transformed,
          rating: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
        });
      });

      // Normalize tags with default per-user fields AND transform image URLs
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      tagsResult.findTags.tags.forEach((tag) => {
        const transformed = transformTag(tag as Tag);
        newTags.set(tag.id, {
          ...transformed,
          rating: null,
          rating100: null,
          favorite: false,
          o_counter: 0,
          play_count: 0,
        });
      });

      // Normalize galleries with default per-user fields AND transform image URLs
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      galleriesResult.findGalleries.galleries.forEach((gallery) => {
        const transformed = transformGallery(gallery as Gallery);
        newGalleries.set(gallery.id, {
          ...transformed,
          rating: null,
          favorite: false,
        });
      });

      // Normalize groups with default per-user fields AND transform image URLs
      // Type assertion needed: GraphQL generated types don't perfectly match but structure is compatible
      groupsResult.findGroups.groups.forEach((group) => {
        const transformed = transformGroup(group as Group);
        newGroups.set(group.id, {
          ...transformed,
          rating: null,
          favorite: false,
        });
      });

      // Atomic swap
      this.cache.scenes = newScenes;
      this.cache.performers = newPerformers;
      this.cache.studios = newStudios;
      this.cache.tags = newTags;
      this.cache.galleries = newGalleries;
      this.cache.groups = newGroups;
      this.cache.lastRefreshed = new Date();

      const duration = Date.now() - startTime;
      logger.info("Cache refreshed successfully", {
        duration: `${duration}ms`,
        counts: {
          scenes: newScenes.size,
          performers: newPerformers.size,
          studios: newStudios.size,
          tags: newTags.size,
          galleries: newGalleries.size,
          groups: newGroups.size,
        },
      });
    } catch (error) {
      logger.error("Cache refresh failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
   * Get all galleries as array
   */
  getAllGalleries(): NormalizedGallery[] {
    return Array.from(this.cache.galleries.values());
  }

  /**
   * Get gallery by ID
   */
  getGallery(id: string): NormalizedGallery | undefined {
    return this.cache.galleries.get(id);
  }

  /**
   * Get all groups as array
   */
  getAllGroups(): NormalizedGroup[] {
    return Array.from(this.cache.groups.values());
  }

  /**
   * Get group by ID
   */
  getGroup(id: string): NormalizedGroup | undefined {
    return this.cache.groups.get(id);
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
        galleries: this.cache.galleries.size,
      },
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      },
      estimatedCacheSize: `${(
        (this.cache.scenes.size * 3 + this.cache.galleries.size * 1) /
        1024
      ).toFixed(2)} MB`, // Rough estimate: 3KB per scene, 1KB per gallery
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
    logger.info("StashCacheManager cleanup complete");
  }
}

// Export singleton instance
export const stashCacheManager = new StashCacheManager();
