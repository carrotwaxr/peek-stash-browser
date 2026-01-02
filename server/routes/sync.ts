/**
 * Sync Routes
 *
 * Handles sync-related API endpoints:
 * - GET /api/sync/status - Get current sync status
 * - POST /api/sync/trigger - Trigger manual sync (admin only)
 * - POST /api/sync/notify - Webhook for Stash plugin (admin only)
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
 * Get current sync status for all entity types
 */
router.get(
  "/status",
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
  authenticated(async (req, res) => {
    try {
      const { type = "incremental" } = req.body;

      if (stashSyncService.isSyncing()) {
        return res.status(409).json({
          error: "Sync already in progress",
          message: "Please wait for the current sync to complete",
        });
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
  authenticated(async (req, res) => {
    try {
      if (!stashSyncService.isSyncing()) {
        return res.status(400).json({
          error: "No sync in progress",
          message: "There is no sync to abort",
        });
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
 * POST /api/sync/notify
 * Webhook endpoint for Stash plugin to notify of entity changes
 * (admin only, requires enablePluginWebhook setting)
 *
 * Body: { entity: string, id: string, action: 'create' | 'update' | 'delete' }
 */
router.post(
  "/notify",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      const status = await stashSyncService.getSyncStatus();

      if (!status.settings.enablePluginWebhook) {
        return res.status(403).json({
          error: "Webhook disabled",
          message: "Plugin webhook is not enabled in sync settings",
        });
      }

      const { entity, id, action } = req.body;

      if (!entity || !id || !action) {
        return res.status(400).json({
          error: "Missing required fields",
          message: "Request must include entity, id, and action",
        });
      }

      const validEntities = [
        "scene",
        "performer",
        "studio",
        "tag",
        "group",
        "gallery",
        "image",
      ];
      if (!validEntities.includes(entity)) {
        return res.status(400).json({
          error: "Invalid entity type",
          message: `Entity must be one of: ${validEntities.join(", ")}`,
        });
      }

      const validActions = ["create", "update", "delete"];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          error: "Invalid action",
          message: `Action must be one of: ${validActions.join(", ")}`,
        });
      }

      // Queue single entity sync (don't wait for completion)
      stashSyncService.syncSingleEntity(entity, id, action).catch(() => {
        // Error is logged by the service
      });

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to process webhook",
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
 *   enableScanSubscription?: boolean,
 *   enablePluginWebhook?: boolean
 * }
 */
router.put(
  "/settings",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      const {
        syncIntervalMinutes,
        enableScanSubscription,
        enablePluginWebhook,
      } = req.body;

      // Validate syncIntervalMinutes
      if (syncIntervalMinutes !== undefined) {
        if (
          typeof syncIntervalMinutes !== "number" ||
          syncIntervalMinutes < 5 ||
          syncIntervalMinutes > 1440
        ) {
          return res.status(400).json({
            error: "Invalid sync interval",
            message:
              "Sync interval must be between 5 and 1440 minutes (24 hours)",
          });
        }
      }

      const updates: {
        syncIntervalMinutes?: number;
        enableScanSubscription?: boolean;
        enablePluginWebhook?: boolean;
      } = {};

      if (syncIntervalMinutes !== undefined) {
        updates.syncIntervalMinutes = syncIntervalMinutes;
      }
      if (enableScanSubscription !== undefined) {
        updates.enableScanSubscription = enableScanSubscription;
      }
      if (enablePluginWebhook !== undefined) {
        updates.enablePluginWebhook = enablePluginWebhook;
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
