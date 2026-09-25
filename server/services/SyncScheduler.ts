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
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { logSyncFailure } from "../utils/syncLog.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { type SyncProgress, stashSyncService } from "./StashSyncService.js";

/** The types the startup check reports as never synced when a row is absent */
const STARTUP_TYPES = [
  "studio",
  "tag",
  "performer",
  "group",
  "gallery",
  "scene",
  "image",
];

interface SyncSchedulerSettings {
  syncIntervalMinutes: number;
  enableScanSubscription: boolean;
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
      logger.info(
        "No Stash instances configured - sync scheduler will not start"
      );
      logger.info(
        "Sync will start automatically after Stash is configured via setup wizard"
      );
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
  async updateSettings(
    settings: Partial<SyncSchedulerSettings>
  ): Promise<void> {
    await prisma.syncSettings.upsert({
      where: { id: 1 },
      update: settings,
      create: {
        id: 1,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 60,
        enableScanSubscription: settings.enableScanSubscription ?? true,
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
      logSyncFailure("Manual incremental sync failed", error);
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
      logSyncFailure("Manual full sync failed", error);
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
    };
  }

  private startPollingInterval(intervalMinutes: number): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.intervalId = setInterval(
      () =>
        void (async () => {
          if (stashSyncService.isSyncing()) {
            logger.debug("Scheduled sync skipped - sync already in progress");
            return;
          }

          logger.info("Scheduled incremental sync triggered");
          try {
            await stashSyncService.incrementalSync();
          } catch (error) {
            logSyncFailure("Scheduled sync failed", error);
          }
        })(),
      intervalMs
    );

    logger.info(`Sync polling interval started: ${intervalMinutes} minutes`);
  }

  private async performStartupSync(): Promise<void> {
    // The stored sync state alone decides what to fetch. A migration that
    // needs Peek to refetch a type clears that type's timestamps, and the
    // sync below fetches it whole (see .claude/rules/prisma.md).
    // Check sync state for ALL entity types, not just scenes: this prevents
    // re-syncing already completed entities when scene sync fails/never
    // completes. Each enabled instance's own rows: another instance's (a
    // disabled one, or a deleted one whose purge has not run) never count.
    const instanceIds = stashInstanceManager.getAllEnabled().map((i) => i.id);
    const syncStates = await prisma.syncState.findMany({
      where: { stashInstanceId: { in: instanceIds } },
    });
    const instances = instanceIds.map((instanceId) => {
      const states = syncStates.filter((s) => s.stashInstanceId === instanceId);
      const stored = new Set(states.map((s) => s.entityType));
      return {
        instanceId,
        completedTypes: states
          .filter(
            (s) => s.lastFullSyncTimestamp ?? s.lastIncrementalSyncTimestamp
          )
          .map((s) => s.entityType),
        missingTypes: STARTUP_TYPES.filter((t) => !stored.has(t)),
      };
    });

    logger.info("Startup sync state check", {
      instances,
      totalSyncStates: syncStates.length,
    });

    // If no instance has ever synced any entity type, do a full sync. An
    // instance that has not, beside one that has, is fetched whole by the
    // smart sync below (its types have no timestamp).
    if (instances.every((i) => i.completedTypes.length === 0)) {
      logger.info(
        "No previous sync found for any entity type, performing full sync"
      );
      try {
        await stashSyncService.fullSync();
      } catch (error) {
        logSyncFailure("Startup full sync failed", error);
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
      instances,
    });

    try {
      await stashSyncService.smartIncrementalSync();
    } catch (error) {
      logSyncFailure("Startup smart incremental sync failed", error);
      // Don't throw - let the app continue
    }
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler();
