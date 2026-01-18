/**
 * Unit Tests for Database Backup Routes (Admin API)
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

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
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { databaseBackupService } from "../../services/DatabaseBackupService.js";

const mockService = vi.mocked(databaseBackupService);

function createMockRequest(options: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: { id: number; username: string; role: string };
} = {}): Partial<Request> {
  return {
    params: options.params || {},
    body: options.body || {},
    user: options.user,
  } as Partial<Request>;
}

function createMockResponse() {
  const responseJson = vi.fn();
  const responseStatus = vi.fn(() => ({ json: responseJson }));
  return {
    json: responseJson,
    status: responseStatus,
    responseJson,
    responseStatus,
  };
}

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

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      // Find and call the route handler
      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backups" && l.route?.methods?.get
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.listBackups).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ backups: mockBackups });
    });

    it("should return 500 on service error", async () => {
      mockService.listBackups.mockRejectedValue(new Error("Disk error"));

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backups" && l.route?.methods?.get
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith({
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

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) => l.route?.path === "/database/backup" && l.route?.methods?.post
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.createBackup).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ backup: mockBackup });
    });
  });

  describe("DELETE /api/admin/database/backups/:filename", () => {
    it("should delete a backup", async () => {
      mockService.deleteBackup.mockResolvedValue(undefined);

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        params: { filename: "peek-stash-browser.db.backup-20260118-104532" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) =>
          l.route?.path === "/database/backups/:filename" &&
          l.route?.methods?.delete
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(mockService.deleteBackup).toHaveBeenCalledWith(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(json).toHaveBeenCalledWith({ ok: true });
    });

    it("should return 400 for invalid filename", async () => {
      mockService.deleteBackup.mockRejectedValue(
        new Error("Invalid backup filename")
      );

      const { default: router } = await import("../../routes/databaseBackup.js");

      const mockReq = createMockRequest({
        params: { filename: "../etc/passwd" },
        user: { id: 1, username: "admin", role: "ADMIN" },
      });
      const { json, status, responseJson, responseStatus } = createMockResponse();
      const mockRes = { json, status } as unknown as Response;

      const layer = router.stack.find(
        (l: any) =>
          l.route?.path === "/database/backups/:filename" &&
          l.route?.methods?.delete
      );
      const handler = layer?.route?.stack?.[0]?.handle;

      await handler(mockReq, mockRes, () => {});

      expect(responseStatus).toHaveBeenCalledWith(400);
    });
  });
});
