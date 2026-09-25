/**
 * Merge Reconciliation Routes (Admin Only)
 *
 * Handles admin endpoints for managing orphaned scene data:
 * - GET /api/admin/orphaned-scenes - List orphaned scenes with user activity
 * - GET /api/admin/orphaned-scenes/:ref/matches - Phash matches for an orphan
 * - POST /api/admin/orphaned-scenes/:ref/reconcile - Transfer data to target scene
 * - POST /api/admin/orphaned-scenes/:ref/discard - Delete orphaned user data
 * - POST /api/admin/reconcile-all - Reconcile every orphan with exactly one match
 *
 * `:ref` is the orphan as "id:instanceId"; a bare id answers 400. A target
 * is a scene id on the orphan's instance: a merge never crosses instances.
 */
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import express, { type Response } from "express";
import {
  type AuthenticatedRequest,
  authenticate,
  requireAdmin,
} from "../middleware/auth.js";
import {
  MergeTargetError,
  type SceneRef,
  mergeReconciliationService,
} from "../services/MergeReconciliationService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * The orphan named by `:ref`, or null after answering 400 when the ref
 * carries no instance.
 */
function orphanRef(ref: unknown, res: Response): SceneRef | null {
  const { id, instanceId } = parseEntityRef(typeof ref === "string" ? ref : "");
  if (!id || !instanceId) {
    res.status(400).json({ error: 'Scene reference must be "id:instanceId"' });
    return null;
  }
  return { id, instanceId };
}

/**
 * GET /api/admin/orphaned-scenes
 * List all orphaned scenes with user activity
 */
router.get(
  "/orphaned-scenes",
  authenticated(async (req, res) => {
    try {
      const orphans =
        await mergeReconciliationService.findOrphanedScenesWithActivity();
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
 * GET /api/admin/orphaned-scenes/:ref/matches
 * Live scenes of the orphan's instance with a matching phash
 */
router.get(
  "/orphaned-scenes/:ref/matches",
  authenticated(async (req, res) => {
    const orphan = orphanRef(req.params.ref, res);
    if (!orphan) return;
    try {
      const matches = await mergeReconciliationService.findPhashMatches(orphan);
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
 * POST /api/admin/orphaned-scenes/:ref/reconcile
 * Transfer user data from the orphan to `targetSceneId`, a scene id on the
 * orphan's instance. A target that is not a live scene there answers 400.
 */
router.post(
  "/orphaned-scenes/:ref/reconcile",
  authenticated(async (req: AuthenticatedRequest, res) => {
    const orphan = orphanRef(req.params.ref, res);
    if (!orphan) return;
    const { targetSceneId } = (req.body ?? {}) as { targetSceneId?: unknown };

    if (typeof targetSceneId !== "string" || !targetSceneId) {
      res.status(400).json({ error: "targetSceneId is required" });
      return;
    }

    try {
      const result = await mergeReconciliationService.reconcileScene(
        orphan,
        { id: targetSceneId, instanceId: orphan.instanceId },
        null, // Chosen by the admin, not matched by phash
        req.user.id // Admin who initiated
      );

      res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof MergeTargetError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({
        error: "Failed to reconcile scene",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/orphaned-scenes/:ref/discard
 * Delete the orphan's user data (on its instance only)
 */
router.post(
  "/orphaned-scenes/:ref/discard",
  authenticated(async (req, res) => {
    const orphan = orphanRef(req.params.ref, res);
    if (!orphan) return;
    try {
      const result =
        await mergeReconciliationService.discardOrphanedData(orphan);

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
 * Reconcile every orphan with exactly one phash match on its instance, as
 * sync does; orphans with several matches are left for the admin to pick.
 */
router.post(
  "/reconcile-all",
  authenticated(async (req: AuthenticatedRequest, res) => {
    try {
      const orphans =
        await mergeReconciliationService.findOrphanedScenesWithActivity();
      let reconciled = 0;
      let skipped = 0;

      for (const orphan of orphans) {
        if (!orphan.phash) {
          skipped++;
          continue;
        }

        const source = { id: orphan.id, instanceId: orphan.instanceId };
        const matches =
          await mergeReconciliationService.findPhashMatches(source);
        const [only] = matches;

        if (matches.length === 1 && only) {
          await mergeReconciliationService.reconcileScene(
            source,
            { id: only.sceneId, instanceId: orphan.instanceId },
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
