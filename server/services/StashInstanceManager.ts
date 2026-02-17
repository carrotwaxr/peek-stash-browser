import type { StashInstance } from "@prisma/client";
import { StashClient } from "../graphql/StashClient.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Manages Stash server instance connections.
 *
 * Supports multiple Stash instances for aggregated library view.
 * Each instance is identified by a UUID and can be enabled/disabled.
 */
class StashInstanceManager {
  private instances = new Map<string, StashClient>();
  private configs = new Map<string, StashInstance>();
  private initialized = false;

  /**
   * Initialize the manager by loading all enabled instances from the database.
   * Should be called after database initialization and env var migration.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("StashInstanceManager already initialized");
      return;
    }

    const configs = await prisma.stashInstance.findMany({
      where: { enabled: true },
      orderBy: { priority: "asc" },
    });

    if (configs.length === 0) {
      logger.warn("No Stash instances configured");
      // Don't throw - let the setup wizard handle this
      this.initialized = true;
      return;
    }

    // Initialize StashClient connections
    for (const config of configs) {
      try {
        logger.info(`Initializing Stash instance: ${config.name}`, {
          id: config.id,
          url: config.url,
        });

        const stash = new StashClient({
          url: config.url,
          apiKey: config.apiKey,
        });

        this.instances.set(config.id, stash);
        this.configs.set(config.id, config);

        logger.info(`Stash instance initialized: ${config.name}`);
      } catch (error) {
        logger.error(`Failed to initialize Stash instance: ${config.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    this.initialized = true;
    logger.info(
      `StashInstanceManager initialized with ${this.instances.size} instance(s)`
    );
  }

  /**
   * Check if the manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if any Stash instances are configured
   */
  hasInstances(): boolean {
    return this.instances.size > 0;
  }

  /**
   * Get the default (highest priority) Stash instance.
   * Returns the first enabled instance by priority order.
   */
  getDefault(): StashClient {
    const first = this.instances.values().next().value;
    if (!first) {
      throw new Error(
        "No Stash instance configured. Please complete the setup wizard."
      );
    }
    return first;
  }

  /**
   * Get all enabled Stash instances as an array of [instanceId, client] tuples.
   * Useful for iterating over all instances during sync or cache operations.
   */
  getAll(): Array<[string, StashClient]> {
    return Array.from(this.instances.entries());
  }

  /**
   * Get all enabled instance IDs.
   */
  getAllInstanceIds(): string[] {
    return Array.from(this.instances.keys());
  }

  /**
   * Get the default instance config
   */
  getDefaultConfig(): StashInstance {
    const first = this.configs.values().next().value;
    if (!first) {
      throw new Error("No Stash instance configured");
    }
    return first;
  }

  /**
   * Get a Stash instance by ID.
   * Returns undefined if the instance doesn't exist or is disabled.
   */
  get(instanceId: string): StashClient | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get a Stash instance for sync operations.
   * Returns null and logs a warning if not found, allowing callers to skip sync gracefully.
   */
  getForSync(instanceId: string): StashClient | null {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      logger.warn("Stash instance not found for sync, skipping", { instanceId });
      return null;
    }
    return instance;
  }

  /**
   * Get a Stash instance by ID, throwing if not found.
   * Use this when the instance ID is expected to be valid.
   */
  getRequired(instanceId: string): StashClient {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Stash instance not found: ${instanceId}`);
    }
    return instance;
  }

  /**
   * Get instance config by ID
   */
  getConfig(instanceId: string): StashInstance | undefined {
    return this.configs.get(instanceId);
  }

  /**
   * Get all instance configs (for admin UI)
   */
  getAllConfigs(): StashInstance[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get all enabled instances with their configs.
   * Used by sync service to iterate over all instances.
   */
  getAllEnabled(): Array<{ id: string; name: string }> {
    return Array.from(this.configs.values()).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }

  /**
   * Get the URL for a Stash instance (without /graphql suffix)
   * Used by proxy controllers to construct full URLs
   */
  getBaseUrl(instanceId?: string): string {
    const config = instanceId
      ? this.configs.get(instanceId)
      : this.configs.values().next().value;

    if (!config) {
      throw new Error("No Stash instance configured");
    }

    return config.url.replace("/graphql", "");
  }

  /**
   * Get the API key for a Stash instance
   * Used by proxy controllers to authenticate requests
   */
  getApiKey(instanceId?: string): string {
    const config = instanceId
      ? this.configs.get(instanceId)
      : this.configs.values().next().value;

    if (!config) {
      throw new Error("No Stash instance configured");
    }

    return config.apiKey;
  }

  /**
   * Reload instances from database (e.g., after config change)
   */
  async reload(): Promise<void> {
    this.instances.clear();
    this.configs.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Get count of configured instances
   */
  getInstanceCount(): number {
    return this.instances.size;
  }
}

// Export singleton instance
export const stashInstanceManager = new StashInstanceManager();
