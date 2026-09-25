/**
 * Unit Tests for Database Backup Routes (Admin API)
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { databaseBackupService } from "../../services/DatabaseBackupService.js";
import { findHandler, reqFor, resFor } from "../helpers/controllerTestUtils.js";

// Mock DatabaseBackupService
vi.mock("../../services/DatabaseBackupService.js", () => ({
  databaseBackupService: {
    listBackups: vi.fn(),
    createBackup: vi.fn(),
    deleteBackup: vi.fn(),
    getBackupDir: vi.fn(() => "/app/data"),
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
    it("lists every backup with its kind, path and the backup directory", async () => {
      const preMigration =
        "peek-stash-browser.db.backup-20260924-101112-pre-3.5.0";
      mockService.getBackupDir.mockReturnValue("/app/data");
      mockService.listBackups.mockResolvedValue([
        {
          filename: preMigration,
          kind: "preMigration",
          version: "3.5.0",
          path: `/app/data/${preMigration}`,
          size: 4096,
          createdAt: new Date("2026-09-24T10:11:12.000Z"),
        },
        {
          filename: "peek-stash-browser.db.backup-20260118-104532",
          kind: "manual",
          version: null,
          path: "/app/data/peek-stash-browser.db.backup-20260118-104532",
          size: 246747136,
          createdAt: new Date("2026-01-18T10:45:32.000Z"),
        },
      ]);

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
      expect(res.json).toHaveBeenCalledWith({
        backups: [
          {
            filename: preMigration,
            kind: "preMigration",
            version: "3.5.0",
            path: `/app/data/${preMigration}`,
            size: 4096,
            createdAt: "2026-09-24T10:11:12.000Z",
          },
          {
            filename: "peek-stash-browser.db.backup-20260118-104532",
            kind: "manual",
            version: null,
            path: "/app/data/peek-stash-browser.db.backup-20260118-104532",
            size: 246747136,
            createdAt: "2026-01-18T10:45:32.000Z",
          },
        ],
        directory: "/app/data",
      });
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
      const filename = "peek-stash-browser.db.backup-20260118-104532-2";
      mockService.createBackup.mockResolvedValue({
        filename,
        kind: "manual",
        version: null,
        path: `/app/data/${filename}`,
        size: 246747136,
        createdAt: new Date("2026-01-18T10:45:32.000Z"),
      });

      const { default: router } =
        await import("../../routes/databaseBackup.js");

      const handler = findHandler(router, "post", "/database/backup");
      const req = reqFor(handler, {
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const res = resFor(handler);

      await handler(req, res, () => {});

      expect(mockService.createBackup).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        backup: {
          filename,
          kind: "manual",
          version: null,
          path: `/app/data/${filename}`,
          size: 246747136,
          createdAt: "2026-01-18T10:45:32.000Z",
        },
      });
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
