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
import { stashSyncService } from "./StashSyncService.js";

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
   * Start the sync scheduler: the polling interval, then the startup sync.
   * Called after StashInstanceManager is initialized, at boot and by the
   * setup wizard once it has saved the first instance. With no enabled
   * instance it does nothing and stays stopped, so a later call starts it.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn("SyncScheduler already started");
      return;
    }

    if (!stashInstanceManager.hasInstances()) {
      logger.info(
        "No Stash instances configured - sync scheduler will not start"
      );
      logger.info(
        "Sync will start automatically after Stash is configured via setup wizard"
      );
      return;
    }

    // Started from here on: a second call while this one's startup sync runs
    // returns above instead of starting another sync
    this.isStarted = true;
    let settings: SyncSchedulerSettings;
    try {
      settings = await this.loadSettings();
    } catch (error) {
      // Not started: a later call tries again
      this.isStarted = false;
      throw error;
    }
    // Stopped (a shutdown) while the settings loaded: arm no timer
    if (!this.isRunning()) return;
    this.currentSettings = settings;

    this.startPollingInterval(settings.syncIntervalMinutes);

    await this.performStartupSync();

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
   * Save the settings. A new interval re-arms the running scheduler's timer,
   * so the next scheduled sync comes one new interval from now; it never
   * starts a sync. A stopped scheduler reads the saved settings when it
   * starts.
   */
  async updateSettings(
    settings: Partial<SyncSchedulerSettings>
  ): Promise<void> {
    const saved = await prisma.syncSettings.upsert({
      where: { id: 1 },
      update: settings,
      create: {
        id: 1,
        syncIntervalMinutes: settings.syncIntervalMinutes ?? 60,
        enableScanSubscription: settings.enableScanSubscription ?? true,
      },
    });

    const oldInterval = this.currentSettings?.syncIntervalMinutes;
    this.currentSettings = {
      syncIntervalMinutes: saved.syncIntervalMinutes,
      enableScanSubscription: saved.enableScanSubscription,
    };

    if (this.isStarted && saved.syncIntervalMinutes !== oldInterval) {
      logger.info("Sync interval changed, next scheduled sync reset", {
        oldInterval,
        newInterval: saved.syncIntervalMinutes,
      });
      this.startPollingInterval(saved.syncIntervalMinutes);
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
