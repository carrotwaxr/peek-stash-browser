/**
 * Database Backup Routes (Admin Only)
 *
 * Handles admin endpoints for database backup management:
 * - GET /api/admin/database/backups - List all backups, of every kind
 * - POST /api/admin/database/backup - Create a new backup
 * - DELETE /api/admin/database/backups/:filename - Delete a backup
 *
 * There is no download: a backup holds every user's password hash and
 * history and the Stash API keys, so it stays on the data volume.
 */
import express from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import {
  type BackupInfo,
  databaseBackupService,
} from "../services/DatabaseBackupService.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type {
  CreateDatabaseBackupResponse,
  DatabaseBackup,
  DeleteDatabaseBackupResponse,
  ListDatabaseBackupsResponse,
} from "../types/api/databaseBackup.js";
import type { TypedResponse } from "../types/api/express.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

function toDatabaseBackup(backup: BackupInfo): DatabaseBackup {
  return { ...backup, createdAt: backup.createdAt.toISOString() };
}

/**
 * GET /api/admin/database/backups
 * List all database backups
 */
router.get(
  "/database/backups",
  authenticated(
    async (
      _req,
      res: TypedResponse<ListDatabaseBackupsResponse | ApiErrorResponse>
    ) => {
      try {
        const backups = await databaseBackupService.listBackups();
        res.json({
          backups: backups.map(toDatabaseBackup),
          directory: databaseBackupService.getBackupDir(),
        });
      } catch (error) {
        res.status(500).json({
          error: "Failed to list backups",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  )
);

/**
 * POST /api/admin/database/backup
 * Create a new database backup
 */
router.post(
  "/database/backup",
  authenticated(
    async (
      _req,
      res: TypedResponse<CreateDatabaseBackupResponse | ApiErrorResponse>
    ) => {
      try {
        const backup = await databaseBackupService.createBackup();
        res.json({ backup: toDatabaseBackup(backup) });
      } catch (error) {
        res.status(500).json({
          error: "Failed to create backup",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  )
);

/**
 * DELETE /api/admin/database/backups/:filename
 * Delete a specific backup
 */
router.delete(
  "/database/backups/:filename",
  authenticated(
    async (
      req,
      res: TypedResponse<DeleteDatabaseBackupResponse | ApiErrorResponse>
    ) => {
      try {
        const { filename } = req.params;
        await databaseBackupService.deleteBackup(filename as string);
        res.json({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("Invalid") ? 400 : 500;
        res.status(status).json({
          error: "Failed to delete backup",
          message,
        });
      }
    }
  )
);

export default router;
