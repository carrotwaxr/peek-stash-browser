/**
 * Sync Routes
 *
 * Handles sync-related API endpoints:
 * - GET /api/sync/status - Sync status, settings and each instance's entity states (admin only)
 * - POST /api/sync/trigger - Trigger manual sync (admin only)
 * - POST /api/sync/abort - Abort the current sync (admin only)
 * - POST /api/sync/cleanup - Apply the deletions a cleanup refused (admin only)
 * - POST /api/sync/reprobe-clips - Re-probe clips without previews (admin only)
 * - PUT /api/sync/settings - Update sync settings (admin only)
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import {
  SYNC_ORDER,
  SyncBusyError,
  stashSyncService,
} from "../services/StashSyncService.js";
import { syncScheduler } from "../services/SyncScheduler.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type { TypedRequest, TypedResponse } from "../types/api/express.js";
import type {
  ApplyDeletionsRequest,
  ApplyDeletionsResponse,
  SyncStatusResponse,
} from "../types/api/sync.js";
import { authenticated } from "../utils/routeHelpers.js";
import { logSyncFailure } from "../utils/syncLog.js";

/** How the cleanup route names each type in its answer. */
const PLURALS: Record<(typeof SYNC_ORDER)[number], string> = {
  tag: "tags",
  studio: "studios",
  performer: "performers",
  group: "collections",
  gallery: "galleries",
  scene: "scenes",
  clip: "clips",
  image: "images",
};

const router = express.Router();

// All sync routes require authentication
router.use(authenticate);

/**
 * GET /api/sync/status
 * Whether a sync runs, the sync settings, and every configured instance's
 * entity sync states (admin only: only the Server settings tab shows them).
 * Instances appear by id and name, never by address.
 */
router.get(
  "/status",
  requireAdmin,
  authenticated(
    async (_req, res: TypedResponse<SyncStatusResponse | ApiErrorResponse>) => {
      try {
        res.json(await stashSyncService.getSyncStatus());
      } catch (error) {
        res.status(500).json({
          error: "Failed to get sync status",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  )
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
 * POST /api/sync/cleanup
 * The sync status's "Apply deletions" (admin only): one type's cleanup on
 * one enabled instance, without the ratio guard, after a cleanup refused to
 * soft-delete more than half of the type. It runs in the background under
 * the sync lock, so it answers 409 while a sync or an instance deletion
 * runs; its outcome goes to the type's `lastError`.
 *
 * Body: { instanceId: string, entityType: "tag" | "studio" | ... }
 */
router.post(
  "/cleanup",
  requireAdmin,
  authenticated(
    (
      req: TypedRequest<Partial<ApplyDeletionsRequest> | undefined>,
      res: TypedResponse<ApplyDeletionsResponse | ApiErrorResponse>
    ) => {
      const { instanceId, entityType } = req.body ?? {};
      const type = SYNC_ORDER.find((known) => known === entityType);
      if (typeof instanceId !== "string" || instanceId === "" || !type) {
        res.status(400).json({
          error: "Name an instance and one of the synced entity types",
        });
        return;
      }
      if (!stashInstanceManager.get(instanceId)) {
        res.status(404).json({
          error: "No enabled Stash instance with that id",
        });
        return;
      }

      let cleanup: Promise<unknown>;
      try {
        cleanup = stashSyncService.runCleanup(type, instanceId, {
          ignoreRatioGuard: true,
        });
      } catch (error) {
        if (error instanceof SyncBusyError) {
          res.status(409).json({
            error:
              error.job === "sync"
                ? "A sync is already running"
                : "Peek is removing a deleted instance's cached library. Try again once it has finished.",
          });
          return;
        }
        throw error;
      }
      cleanup.catch((error: unknown) => {
        logSyncFailure("Applying deletions failed", error, {
          instanceId,
          entityType: type,
        });
      });

      res.status(202).json({
        ok: true,
        message: `Applying the deletions of ${PLURALS[type]}`,
      });
    }
  )
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
 * Update sync settings (admin only). A new interval re-arms the scheduler's
 * timer; no sync starts, so the answer comes at once.
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
      const { syncIntervalMinutes, enableScanSubscription } = (req.body ??
        {}) as {
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
