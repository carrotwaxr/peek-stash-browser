/**
 * Sync Scheduler
 *
 * Handles automatic sync triggers:
 * - Startup sync (full if first run, incremental otherwise)
 * - Polling interval (configurable, default 60 min)
 * - Manual trigger support
 *
 * Note: Stash scan completion subscription is a future enhancement
 * that would require WebSocket connection to Stash GraphQL.
 */

import { wereMigrationsApplied } from "../initializers/database.js";
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { stashSyncService, type SyncProgress } from "./StashSyncService.js";

interface SyncSchedulerSettings {
  syncIntervalMinutes: number;
  enableScanSubscription: boolean;
  enablePluginWebhook: boolean;
}

class SyncScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isStarted = false;
  private currentSettings: SyncSchedulerSettings | null = null;

  /**
   * Start the sync scheduler
   * Should be called after StashInstanceManager is initialized
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn("SyncScheduler already started");
      return;
    }

    // Check if Stash is configured
    if (!stashInstanceManager.hasInstances()) {
      logger.info("No Stash instances configured - sync scheduler will not start");
      logger.info("Sync will start automatically after Stash is configured via setup wizard");
      this.isStarted = true;
      return;
    }

    // Load settings
    const settings = await this.loadSettings();
    this.currentSettings = settings;

    // Start polling interval
    this.startPollingInterval(settings.syncIntervalMinutes);

    // Perform initial sync
    await this.performStartupSync();

    this.isStarted = true;
    logger.info("SyncScheduler started", {
      intervalMinutes: settings.syncIntervalMinutes,
      scanSubscription: settings.enableScanSubscription,
      webhookEnabled: settings.enablePluginWebhook,
    });
  }

  /**
   * Stop the sync scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isStarted = false;
    logger.info("SyncScheduler stopped");
  }

  /**
   * Restart the scheduler (e.g., after settings change)
   */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Get current settings
   */
  getSettings(): SyncSchedulerSettings | null {
    return this.currentSettings;
  }

  /**
   * Update settings and restart scheduler if needed
   */
  async updateSettings(settings: Partial<SyncSchedulerSettings>): Promise<void> {
    await prisma.syncSettings.upsert({
      where: { id: 1 },
      update: settings,
      create: {
        id: 1,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 60,
        enableScanSubscription: settings.enableScanSubscription ?? true,
        enablePluginWebhook: settings.enablePluginWebhook ?? false,
      },
    });

    // Restart if interval changed
    if (
      settings.syncIntervalMinutes !== undefined &&
      settings.syncIntervalMinutes !== this.currentSettings?.syncIntervalMinutes
    ) {
      logger.info("Sync interval changed, restarting scheduler", {
        oldInterval: this.currentSettings?.syncIntervalMinutes,
        newInterval: settings.syncIntervalMinutes,
      });
      await this.restart();
    } else {
      // Just update in-memory settings
      this.currentSettings = await this.loadSettings();
    }
  }

  /**
   * Manually trigger an incremental sync
   */
  async triggerIncrementalSync(): Promise<void> {
    if (stashSyncService.isSyncing()) {
      logger.warn("Sync already in progress, skipping manual trigger");
      return;
    }

    logger.info("Manual incremental sync triggered");
    try {
      await stashSyncService.incrementalSync();
    } catch (error) {
      logger.error("Manual incremental sync failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Manually trigger a full sync
   */
  async triggerFullSync(): Promise<void> {
    if (stashSyncService.isSyncing()) {
      logger.warn("Sync already in progress, skipping manual trigger");
      return;
    }

    logger.info("Manual full sync triggered");
    try {
      await stashSyncService.fullSync();
    } catch (error) {
      logger.error("Manual full sync failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Subscribe to sync progress events
   */
  onProgress(callback: (progress: SyncProgress) => void): () => void {
    stashSyncService.on("progress", callback);
    return () => stashSyncService.off("progress", callback);
  }

  // ==================== Private Methods ====================

  private async loadSettings(): Promise<SyncSchedulerSettings> {
    const settings = await prisma.syncSettings.findFirst();

    return {
      syncIntervalMinutes: settings?.syncIntervalMinutes ?? 60,
      enableScanSubscription: settings?.enableScanSubscription ?? true,
      enablePluginWebhook: settings?.enablePluginWebhook ?? false,
    };
  }

  private startPollingInterval(intervalMinutes: number): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.intervalId = setInterval(async () => {
      if (stashSyncService.isSyncing()) {
        logger.debug("Scheduled sync skipped - sync already in progress");
        return;
      }

      logger.info("Scheduled incremental sync triggered");
      try {
        await stashSyncService.incrementalSync();
      } catch (error) {
        logger.error("Scheduled sync failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    logger.info(`Sync polling interval started: ${intervalMinutes} minutes`);
  }

  private async performStartupSync(): Promise<void> {
    // Check if migrations were applied - if so, force full sync to ensure
    // database schema changes are properly reflected in cached data
    if (wereMigrationsApplied()) {
      logger.info("Database migrations were applied, performing full sync to refresh cache");
      try {
        await stashSyncService.fullSync();
      } catch (error) {
        logger.error("Post-migration full sync failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - let the app continue, sync can be retried manually
      }
      return;
    }

    // Check sync state for ALL entity types, not just scenes
    // This prevents re-syncing already completed entities when scene sync fails/never completes
    const syncStates = await prisma.syncState.findMany();
    const syncStateMap = new Map(syncStates.map((s) => [s.entityType, s]));

    // Log what we found
    const completedTypes = syncStates
      .filter((s) => s.lastFullSyncTimestamp || s.lastIncrementalSyncTimestamp)
      .map((s) => s.entityType);

    const missingTypes = [
      "studio",
      "tag",
      "performer",
      "group",
      "gallery",
      "scene",
      "image",
    ].filter((t) => !syncStateMap.has(t));

    logger.info("Startup sync state check", {
      completedTypes,
      missingTypes,
      totalSyncStates: syncStates.length,
    });

    // If NO entity types have ever been synced, do a full sync
    if (completedTypes.length === 0) {
      logger.info("No previous sync found for any entity type, performing full sync");
      try {
        await stashSyncService.fullSync();
      } catch (error) {
        logger.error("Startup full sync failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - let the app continue, sync can be retried manually
      }
      return;
    }

    // Some entities have been synced - use smart incremental sync
    // This will:
    // - Skip entities with no changes since last sync
    // - Re-sync entities that never completed
    // - Incrementally sync entities that have changes
    logger.info("Performing smart incremental sync on startup", {
      completedTypes,
      missingTypes,
    });

    try {
      await stashSyncService.smartIncrementalSync();
    } catch (error) {
      logger.error("Startup smart incremental sync failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - let the app continue
    }
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();
