/**
 * Exclusion Routes
 *
 * Admin endpoints for managing pre-computed exclusions:
 * - POST /api/exclusions/recompute/:userId - Recompute for single user
 * - POST /api/exclusions/recompute-all - Recompute for all users
 * - GET /api/exclusions/stats - Get exclusion statistics
 */

import express from "express";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { exclusionComputationService } from "../services/ExclusionComputationService.js";
import { authenticated } from "../utils/routeHelpers.js";
import prisma from "../prisma/singleton.js";

const router = express.Router();

// All exclusion routes require authentication
router.use(authenticateToken);

/**
 * POST /api/exclusions/recompute/:userId
 * Recompute exclusions for a single user (admin only)
 */
router.post(
  "/recompute/:userId",
  requireAdmin,
  authenticated(async (req, res) => {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (isNaN(userId)) {
        return res.status(400).json({
          error: "Invalid user ID",
          message: "User ID must be a number",
        });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          message: `No user with ID ${userId}`,
        });
      }

      await exclusionComputationService.recomputeForUser(userId);

      res.json({
        ok: true,
        message: `Recomputed exclusions for user ${userId}`,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to recompute exclusions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      const result = await exclusionComputationService.recomputeAllUsers();

      res.json({
        ok: result.failed === 0,
        message: `Recomputed exclusions for ${result.success} users${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        success: result.success,
        failed: result.failed,
        errors: result.errors,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to recompute exclusions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
    try {
      const stats = await prisma.userExcludedEntity.groupBy({
        by: ["userId", "entityType", "reason"],
        _count: true,
      });

      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get exclusion stats",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

export default router;
