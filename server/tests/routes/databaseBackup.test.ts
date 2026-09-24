/**
 * Unit Tests for Database Backup Routes (Admin API)
 */
import { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databaseBackupService } from "../../services/DatabaseBackupService.js";
import { findHandler, reqFor, resFor } from "../helpers/controllerTestUtils.js";

// Mock DatabaseBackupService
vi.mock("../../services/DatabaseBackupService.js", () => ({
  databaseBackupService: {
    listBackups: vi.fn(),
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
  },
}));

// Mock auth middleware
vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockService = vi.mocked(databaseBackupService);

describe("Database Backup Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /api/admin/database/backups", () => {
    it("should return list of backups", async () => {
      const mockBackups = [
        {
          filename: "peek-stash-browser.db.backup-20260118-104532",
          size: 246747136,
          createdAt: new Date("2026-01-18T10:45:32.000Z"),
        },
      ];
      mockService.listBackups.mockResolvedValue(mockBackups);

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      // Find and call the route handler
      const handler = findHandler(router, "get", "/database/backups");
      const req = reqFor(handler, {
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(mockService.listBackups).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ backups: mockBackups });
    });

    it("should return 500 on service error", async () => {
      mockService.listBackups.mockRejectedValue(new Error("Disk error"));

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      const handler = findHandler(router, "get", "/database/backups");
      const req = reqFor(handler, {
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to list backups",
        message: "Disk error",
      });
    });
  });

  describe("POST /api/admin/database/backup", () => {
    it("should create a backup and return info", async () => {
      const mockBackup = {
        filename: "peek-stash-browser.db.backup-20260118-104532",
        size: 246747136,
        createdAt: new Date("2026-01-18T10:45:32.000Z"),
      };
      mockService.createBackup.mockResolvedValue(mockBackup);

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      const handler = findHandler(router, "post", "/database/backup");
      const req = reqFor(handler, {
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(mockService.createBackup).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ backup: mockBackup });
    });
  });

  describe("DELETE /api/admin/database/backups/:filename", () => {
    it("should delete a backup", async () => {
      mockService.deleteBackup.mockResolvedValue(undefined);

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      const handler = findHandler(
        router,
        "delete",
        "/database/backups/:filename"
      );
      const req = reqFor(handler, {
        params: { filename: "peek-stash-browser.db.backup-20260118-104532" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(mockService.deleteBackup).toHaveBeenCalledWith(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("should return 400 for invalid filename", async () => {
      mockService.deleteBackup.mockRejectedValue(
        new Error("Invalid backup filename")
      );

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      const handler = findHandler(
        router,
        "delete",
        "/database/backups/:filename"
      );
      const req = reqFor(handler, {
        params: { filename: "../etc/passwd" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
