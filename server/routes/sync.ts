/**
 * Sync Routes
 *
 * Handles sync-related API endpoints:
 * - GET /api/sync/status - Get current sync status and settings (admin only)
 * - POST /api/sync/trigger - Trigger manual sync (admin only)
 * - POST /api/sync/abort - Abort the current sync (admin only)
 * - POST /api/sync/reprobe-clips - Re-probe clips without previews (admin only)
 * - PUT /api/sync/settings - Update sync settings (admin only)
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { stashSyncService } from "../services/StashSyncService.js";
import { syncScheduler } from "../services/SyncScheduler.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All sync routes require authentication
router.use(authenticate);

/**
 * GET /api/sync/status
 * Get current sync status and settings for all entity types (admin only:
 * only the Server settings tab shows them)
 */
router.get(
  "/status",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      const status = await stashSyncService.getSyncStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get sync status",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/sync/trigger
 * Manually trigger a sync (admin only)
 *
 * Body: { type?: 'full' | 'incremental' }
 * Default: incremental
 */
router.post(
  "/trigger",
  requireAdmin,
  authenticated((req, res) => {
    try {
      const { type = "incremental" } = (req.body ?? {}) as { type?: string };

      if (stashSyncService.isSyncing()) {
        res.status(409).json({
          error: "Sync already in progress",
          message: "Please wait for the current sync to complete",
        });
        return;
      }

      // Start sync in background, don't wait for completion
      if (type === "full") {
        syncScheduler.triggerFullSync().catch(() => {
          // Error is logged by the service
        });
      } else {
        syncScheduler.triggerIncrementalSync().catch(() => {
          // Error is logged by the service
        });
      }

      res.json({
        ok: true,
        message: `${type} sync started`,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to trigger sync",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/sync/abort
 * Abort the current sync (admin only)
 */
router.post(
  "/abort",
  requireAdmin,
  authenticated((req, res) => {
    try {
      if (!stashSyncService.isSyncing()) {
        res.status(400).json({
          error: "No sync in progress",
          message: "There is no sync to abort",
        });
        return;
      }

      stashSyncService.abort();

      res.json({
        ok: true,
        message: "Sync abort requested",
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to abort sync",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/sync/reprobe-clips
 * Re-probe clips that were synced before previews were generated (admin only)
 *
 * Body: { instanceId?: string }
 * If instanceId is not provided, uses the first enabled instance
 */
router.post(
  "/reprobe-clips",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      if (stashSyncService.isSyncing()) {
        res.status(409).json({
          error: "Sync in progress",
          message: "Cannot re-probe clips while a sync is running",
        });
        return;
      }

      const { instanceId } = (req.body ?? {}) as { instanceId?: string };

      // If no instance specified, get the first enabled instance
      const { stashInstanceManager } =
        await import("../services/StashInstanceManager.js");
      let targetInstanceId: string | undefined = instanceId;
      if (!targetInstanceId) {
        const enabledInstances = stashInstanceManager.getAllEnabled();
        if (enabledInstances.length === 0) {
          res.status(400).json({
            error: "No Stash instances",
            message: "No enabled Stash instances found",
          });
          return;
        }
        const firstInstance = enabledInstances[0];
        if (!firstInstance) {
          res.status(400).json({
            error: "No Stash instances",
            message: "No enabled Stash instances found",
          });
          return;
        }
        targetInstanceId = firstInstance.id;
      }

      const result =
        await stashSyncService.reProbeUngeneratedClips(targetInstanceId);

      res.json({
        ok: true,
        ...result,
        message: `Re-probed ${result.checked} clips, ${result.updated} now have previews`,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to re-probe clips",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * PUT /api/sync/settings
 * Update sync settings (admin only)
 *
 * Body: {
 *   syncIntervalMinutes?: number,
 *   enableScanSubscription?: boolean
 * }
 */
router.put(
  "/settings",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      const { syncIntervalMinutes, enableScanSubscription } = req.body as {
        syncIntervalMinutes?: number;
        enableScanSubscription?: boolean;
      };

      // Validate syncIntervalMinutes
      if (syncIntervalMinutes !== undefined) {
        if (
          typeof syncIntervalMinutes !== "number" ||
          syncIntervalMinutes < 5 ||
          syncIntervalMinutes > 10080
        ) {
          res.status(400).json({
            error: "Invalid sync interval",
            message:
              "Sync interval must be between 5 and 10080 minutes (7 days)",
          });
          return;
        }
      }

      const updates: {
        syncIntervalMinutes?: number;
        enableScanSubscription?: boolean;
      } = {};

      if (syncIntervalMinutes !== undefined) {
        updates.syncIntervalMinutes = syncIntervalMinutes;
      }
      if (enableScanSubscription !== undefined) {
        updates.enableScanSubscription = enableScanSubscription;
      }

      await syncScheduler.updateSettings(updates);

      const status = await stashSyncService.getSyncStatus();
      res.json({
        ok: true,
        settings: status.settings,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to update sync settings",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;
