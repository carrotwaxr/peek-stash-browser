import type {
  Gallery,
  Group,
  Performer,
  Scene,
  Studio,
  Tag,
} from "stashapp-api";
import type {
  NormalizedGallery,
  NormalizedGroup,
  NormalizedPerformer,
  NormalizedScene,
  NormalizedStudio,
  NormalizedTag,
} from "../types/index.js";
import { logger } from "../utils/logger.js";
import {
  transformGallery,
  transformGroup,
  transformPerformer,
  transformScene,
  transformStudio,
  transformTag,
} from "../utils/stashUrlProxy.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";

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
  cacheVersion: number; // Increments on each refresh for cache invalidation
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
    cacheVersion: 0,
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
   * Helper to extract detailed error information from GraphQL/network errors
   */
  private getDetailedErrorInfo(
    error: unknown,
    context: string
  ): Record<string, unknown> {
    const details: Record<string, unknown> = {
      context,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof Error) {
      details.name = error.name;
      details.message = error.message;
      details.stack = error.stack;

      // GraphQL errors from graphql-request
      const gqlError = error as any;
      if (gqlError.response) {
        details.httpStatus = gqlError.response.status;
        details.httpStatusText = gqlError.response.statusText;
        details.responseHeaders = gqlError.response.headers;

        // GraphQL-specific error details
        if (gqlError.response.errors) {
          details.graphqlErrors = gqlError.response.errors;
        }
        if (gqlError.response.data) {
          details.partialData = "Response contained partial data";
        }
      }

      // Network errors
      if (gqlError.code) {
        details.errorCode = gqlError.code;
      }
      if (gqlError.cause) {
        details.cause = gqlError.cause;
      }
    } else {
      details.unknownError = String(error);
    }

    return details;
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
      logger.info("Starting cache refresh - fetching entities from Stash");
      const stash = stashInstanceManager.getDefault();

      // Fetch entities individually with detailed progress logging
      logger.info("Fetching scenes (compact)...");
      const scenesStart = Date.now();
      const scenesResult = await stash
        .findScenesCompact({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch scenes",
            this.getDetailedErrorInfo(err, "findScenesCompact")
          );
          throw new Error(`Scene fetch failed: ${err.message}`);
        });
      logger.info(
        `Scenes fetched in ${Date.now() - scenesStart}ms (${scenesResult.findScenes.scenes.length} scenes)`
      );

      logger.info("Fetching performers...");
      const performersStart = Date.now();
      const performersResult = await stash
        .findPerformers({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch performers",
            this.getDetailedErrorInfo(err, "findPerformers")
          );
          throw new Error(`Performer fetch failed: ${err.message}`);
        });
      logger.info(
        `Performers fetched in ${Date.now() - performersStart}ms (${performersResult.findPerformers.performers.length} performers)`
      );

      logger.info("Fetching studios...");
      const studiosStart = Date.now();
      const studiosResult = await stash
        .findStudios({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch studios",
            this.getDetailedErrorInfo(err, "findStudios")
          );
          throw new Error(`Studio fetch failed: ${err.message}`);
        });
      logger.info(
        `Studios fetched in ${Date.now() - studiosStart}ms (${studiosResult.findStudios.studios.length} studios)`
      );

      logger.info("Fetching tags...");
      const tagsStart = Date.now();
      const tagsResult = await stash
        .findTags({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch tags",
            this.getDetailedErrorInfo(err, "findTags")
          );
          throw new Error(`Tag fetch failed: ${err.message}`);
        });
      logger.info(
        `Tags fetched in ${Date.now() - tagsStart}ms (${tagsResult.findTags.tags.length} tags)`
      );

      logger.info("Fetching galleries...");
      const galleriesStart = Date.now();
      const galleriesResult = await stash
        .findGalleries({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch galleries",
            this.getDetailedErrorInfo(err, "findGalleries")
          );
          throw new Error(`Gallery fetch failed: ${err.message}`);
        });
      logger.info(
        `Galleries fetched in ${Date.now() - galleriesStart}ms (${galleriesResult.findGalleries.galleries.length} galleries)`
      );

      logger.info("Fetching groups...");
      const groupsStart = Date.now();
      const groupsResult = await stash
        .findGroups({ filter: { per_page: -1 } })
        .catch((err) => {
          logger.error(
            "Failed to fetch groups",
            this.getDetailedErrorInfo(err, "findGroups")
          );
          throw new Error(`Group fetch failed: ${err.message}`);
        });
      logger.info(
        `Groups fetched in ${Date.now() - groupsStart}ms (${groupsResult.findGroups.groups.length} groups)`
      );

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
      performersResult.findPerformers.performers.forEach((performer) => {
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
      });

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
      this.cache.cacheVersion++;

      // Recompute exclusions for all users (empty entities may have changed)
      // Run asynchronously to not block the cache refresh response
      setImmediate(() => {
        exclusionComputationService.recomputeAllUsers().catch((err) => {
          logger.error("Failed to recompute exclusions after cache refresh", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      });
      logger.info("Triggered exclusion recomputation due to cache refresh");

      const duration = Date.now() - startTime;
      logger.info("✓ Cache refreshed successfully", {
        duration: `${duration}ms`,
        counts: {
          scenes: newScenes.size,
          performers: newPerformers.size,
          studios: newStudios.size,
          tags: newTags.size,
          galleries: newGalleries.size,
          groups: newGroups.size,
        },
        totalEntities:
          newScenes.size +
          newPerformers.size +
          newStudios.size +
          newTags.size +
          newGalleries.size +
          newGroups.size,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error("✗ Cache refresh failed", {
        ...this.getDetailedErrorInfo(error, "refreshCache"),
        durationBeforeFailure: `${duration}ms`,
        cacheState: {
          wasInitialized: this.cache.isInitialized,
          hadPreviousData: this.cache.lastRefreshed !== null,
          previousRefresh: this.cache.lastRefreshed?.toISOString(),
        },
      });

      // Provide actionable guidance based on error type
      // Check more specific errors first, then more general ones
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("unauthorized") || message.includes("401")) {
          logger.error("TROUBLESHOOTING: Authentication failed");
          logger.error("  → Verify STASH_API_KEY is correct");
          logger.error("  → Check Stash Settings > Security > API Key");
        } else if (message.includes("403") || message.includes("forbidden")) {
          logger.error("TROUBLESHOOTING: Access forbidden");
          logger.error("  → API key may not have required permissions");
        } else if (message.includes("timeout")) {
          logger.error("TROUBLESHOOTING: Request timed out");
          logger.error("  → Stash may be overloaded or have large library");
          logger.error("  → Check Stash server logs for performance issues");
        } else if (message.includes("ssl") || message.includes("certificate")) {
          logger.error("TROUBLESHOOTING: TLS/SSL certificate issue");
          logger.error("  → Use http:// instead of https:// for local Stash");
          logger.error(
            "  → Or configure NODE_TLS_REJECT_UNAUTHORIZED=0 (not recommended for production)"
          );
        } else if (message.includes("fetch") && message.includes("failed")) {
          logger.error("TROUBLESHOOTING: Network connectivity issue detected");
          logger.error(
            "  → Verify STASH_URL is correct and accessible from Peek container"
          );
          logger.error("  → Check if Stash server is running");
          logger.error("  → Test connectivity: curl -v <STASH_URL>/graphql");
        }
      }

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
   * Get current cache version
   * Used for filtered entity cache invalidation
   */
  getCacheVersion(): number {
    return this.cache.cacheVersion;
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
   * Reinitialize the cache after Stash instance changes
   * Called when a new StashInstance is created, updated, or deleted
   * Unlike initialize(), this can be called multiple times
   */
  async reinitialize(): Promise<void> {
    logger.info("Reinitializing Stash cache due to instance change...");

    // Clear existing interval if any
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Reset state to allow reinitialization
    this.cache.isInitialized = false;

    // Check if we have any Stash instances configured
    if (!stashInstanceManager.hasInstances()) {
      logger.warn(
        "No Stash instances configured - cache will remain empty until instance is added"
      );
      this.cache.isInitialized = true;
      return;
    }

    // Perform the initialization
    await this.initialize();
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
