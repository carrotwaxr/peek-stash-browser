/**
 * Merge Reconciliation Routes (Admin Only)
 *
 * Handles admin endpoints for managing orphaned scene data:
 * - GET /api/admin/orphaned-scenes - List orphaned scenes with user activity
 * - GET /api/admin/orphaned-scenes/:id/matches - Get phash matches for an orphan
 * - POST /api/admin/orphaned-scenes/:id/reconcile - Transfer data to target scene
 * - POST /api/admin/orphaned-scenes/:id/discard - Delete orphaned user data
 * - POST /api/admin/reconcile-all - Auto-reconcile all with exact phash matches
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { mergeReconciliationService } from "../services/MergeReconciliationService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/orphaned-scenes
 * List all orphaned scenes with user activity
 */
router.get(
  "/orphaned-scenes",
  authenticated(async (req, res) => {
    try {
      const orphans = await mergeReconciliationService.findOrphanedScenesWithActivity();
      res.json({
        scenes: orphans,
        totalCount: orphans.length,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch orphaned scenes",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * GET /api/admin/orphaned-scenes/:id/matches
 * Get potential phash matches for an orphaned scene
 */
router.get(
  "/orphaned-scenes/:id/matches",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const matches = await mergeReconciliationService.findPhashMatches(id);
      res.json({ matches });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch matches",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/orphaned-scenes/:id/reconcile
 * Transfer user data from orphan to target scene
 */
router.post(
  "/orphaned-scenes/:id/reconcile",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const { targetSceneId } = req.body;

      if (!targetSceneId) {
        return res.status(400).json({ error: "targetSceneId is required" });
      }

      const result = await mergeReconciliationService.reconcileScene(
        id,
        targetSceneId,
        null, // Will be looked up if available
        req.user.id // Admin who initiated
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reconcile scene",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/orphaned-scenes/:id/discard
 * Delete orphaned user data for a scene
 */
router.post(
  "/orphaned-scenes/:id/discard",
  authenticated(async (req, res) => {
    try {
      const { id } = req.params;
      const result = await mergeReconciliationService.discardOrphanedData(id);

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to discard orphaned data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/reconcile-all
 * Auto-reconcile all orphans with exact phash matches
 */
router.post(
  "/reconcile-all",
  authenticated(async (req, res) => {
    try {
      const orphans = await mergeReconciliationService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }

        const matches = await mergeReconciliationService.findPhashMatches(orphan.id);
        const exactMatch = matches.find((m) => m.similarity === "exact");

        if (exactMatch) {
          await mergeReconciliationService.reconcileScene(
            orphan.id,
            exactMatch.sceneId,
            orphan.phash,
            req.user.id
          );
          reconciled++;
        } else {
          skipped++;
        }
      }

      res.json({
        ok: true,
        reconciled,
        skipped,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reconcile all",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;
