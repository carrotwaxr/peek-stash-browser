/**
 * Database Backup Routes (Admin Only)
 *
 * Handles admin endpoints for database backup management:
 * - GET /api/admin/database/backups - List all backups
 * - POST /api/admin/database/backup - Create a new backup
 * - DELETE /api/admin/database/backups/:filename - Delete a backup
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { databaseBackupService } from "../services/DatabaseBackupService.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/database/backups
 * List all database backups
 */
router.get(
  "/database/backups",
  authenticated(async (_req, res) => {
    try {
      const backups = await databaseBackupService.listBackups();
      res.json({ backups });
    } catch (error) {
      res.status(500).json({
        error: "Failed to list backups",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * POST /api/admin/database/backup
 * Create a new database backup
 */
router.post(
  "/database/backup",
  authenticated(async (_req, res) => {
    try {
      const backup = await databaseBackupService.createBackup();
      res.json({ backup });
    } catch (error) {
      res.status(500).json({
        error: "Failed to create backup",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * DELETE /api/admin/database/backups/:filename
 * Delete a specific backup
 */
router.delete(
  "/database/backups/:filename",
  authenticated(async (req, res) => {
    try {
      const { filename } = req.params;
      await databaseBackupService.deleteBackup(filename);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid") ? 400 : 500;
      res.status(status).json({
        error: "Failed to delete backup",
        message,
      });
    }
  })
);

export default router;
