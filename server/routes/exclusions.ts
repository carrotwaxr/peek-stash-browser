/**
 * Exclusion Routes
 *
 * Admin endpoints for managing pre-computed exclusions:
 * - POST /api/exclusions/recompute/:userId - Recompute for single user
 * - POST /api/exclusions/recompute-all - Recompute for all users
 * - GET /api/exclusions/stats - Get exclusion statistics
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import { exclusionComputationService } from "../services/ExclusionComputationService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All exclusion routes require authentication
router.use(authenticate);

/**
 * POST /api/exclusions/recompute/:userId
 * Recompute exclusions for a single user (admin only)
 */
router.post(
  "/recompute/:userId",
  requireAdmin,
  authenticated(async (req, res) => {
    const userId = parseInt(req.params.userId as string, 10);
    if (isNaN(userId)) {
      res.status(400).json({
        error: "Invalid user ID",
        message: "User ID must be a number",
      });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      res.status(404).json({
        error: "User not found",
        message: `No user with ID ${userId}`,
      });
      return;
    }

    await exclusionComputationService.recomputeForUser(userId);

    res.json({
      ok: true,
      message: `Recomputed exclusions for user ${userId}`,
    });
  })
);

/**
 * POST /api/exclusions/recompute-all
 * Recompute exclusions for all users (admin only)
 */
router.post(
  "/recompute-all",
  requireAdmin,
  authenticated(async (req, res) => {
    const result = await exclusionComputationService.recomputeAllUsers();

    res.json({
      ok: result.failed === 0,
      message: `Recomputed exclusions for ${result.success} users${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
      success: result.success,
      failed: result.failed,
      // The caught text is in the log; the response names the users only
      errors: result.errors.map(({ userId }) => ({ userId })),
    });
  })
);

/**
 * GET /api/exclusions/stats
 * Get exclusion statistics per user and entity type (admin only)
 */
router.get(
  "/stats",
  requireAdmin,
  authenticated(async (req, res) => {
    const stats = await prisma.userExcludedEntity.groupBy({
      by: ["userId", "entityType", "reason"],
      _count: true,
    });

    res.json(stats);
  })
);

export default router;
