/**
 * Unit Tests for DatabaseBackupService
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";

// Mock fs/promises
vi.mock("fs/promises");

// Mock prisma - add at top with other mocks
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $executeRawUnsafe: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Mock environment
const originalEnv = process.env;

describe("DatabaseBackupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CONFIG_DIR: "/app/data" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe("listBackups", () => {
    it("should return empty array when no backups exist", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db",
        "other-file.txt",
      ] as any);

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups).toEqual([]);
    });

    it("should return backup files with metadata", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db",
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260117-093045",
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename === "peek-stash-browser.db.backup-20260118-104532") {
          return { size: 246747136, mtime: new Date("2026-01-18T10:45:32.000Z") } as any;
        }
        return { size: 123456789, mtime: new Date("2026-01-17T09:30:45.000Z") } as any;
      });

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].filename).toBe("peek-stash-browser.db.backup-20260118-104532");
      expect(backups[0].size).toBe(246747136);
      expect(backups[1].filename).toBe("peek-stash-browser.db.backup-20260117-093045");
    });

    it("should sort backups by date descending (newest first)", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db.backup-20260117-093045",
        "peek-stash-browser.db.backup-20260118-104532",
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename.includes("20260118")) {
          return { size: 100, mtime: new Date("2026-01-18T10:45:32.000Z") } as any;
        }
        return { size: 100, mtime: new Date("2026-01-17T09:30:45.000Z") } as any;
      });

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      expect(backups[0].filename).toContain("20260118");
      expect(backups[1].filename).toContain("20260117");
    });

    it("should log error and rethrow when directory read fails", async () => {
      const { logger } = await import("../../utils/logger.js");
      const readError = new Error("ENOENT: no such file or directory");
      vi.mocked(fs.readdir).mockRejectedValue(readError);

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      await expect(databaseBackupService.listBackups()).rejects.toThrow(
        "ENOENT: no such file or directory"
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to read backup directory",
        expect.objectContaining({
          dataDir: "/app/data",
          error: "ENOENT: no such file or directory",
        })
      );
    });

    it("should gracefully skip files deleted between readdir and stat", async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260117-093045",
        "peek-stash-browser.db.backup-20260116-080000",
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        // Simulate file deletion - middle file throws ENOENT
        if (filename.includes("20260117")) {
          throw new Error("ENOENT: no such file or directory");
        }
        if (filename.includes("20260118")) {
          return { size: 200, mtime: new Date("2026-01-18T10:45:32.000Z") } as any;
        }
        return { size: 100, mtime: new Date("2026-01-16T08:00:00.000Z") } as any;
      });

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );
      const backups = await databaseBackupService.listBackups();

      // Should return 2 backups, skipping the deleted one
      expect(backups).toHaveLength(2);
      expect(backups[0].filename).toBe("peek-stash-browser.db.backup-20260118-104532");
      expect(backups[1].filename).toBe("peek-stash-browser.db.backup-20260116-080000");
    });
  });

  describe("createBackup", () => {
    it("should create a backup with timestamped filename", async () => {
      // Mock Date to get predictable filename - must be before import
      vi.useFakeTimers();
      const mockDate = new Date("2026-01-18T10:45:32.000Z");
      vi.setSystemTime(mockDate);

      vi.mocked(prisma.$executeRawUnsafe).mockResolvedValue(0);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 246747136,
        mtime: new Date("2026-01-18T10:45:32.000Z"),
      } as any);

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      const backup = await databaseBackupService.createBackup();

      expect(backup.filename).toBe("peek-stash-browser.db.backup-20260118-104532");
      expect(backup.size).toBe(246747136);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("VACUUM INTO")
      );

      vi.useRealTimers();
    });

    it("should throw error if VACUUM INTO fails", async () => {
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
        new Error("Database locked")
      );

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      await expect(databaseBackupService.createBackup()).rejects.toThrow(
        "Database locked"
      );
    });
  });

  describe("deleteBackup", () => {
    it("should delete a valid backup file", async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      await databaseBackupService.deleteBackup(
        "peek-stash-browser.db.backup-20260118-104532"
      );

      expect(fs.unlink).toHaveBeenCalledWith(
        "/app/data/peek-stash-browser.db.backup-20260118-104532"
      );
    });

    it("should reject invalid filenames (path traversal prevention)", async () => {
      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      await expect(
        databaseBackupService.deleteBackup("../../../etc/passwd")
      ).rejects.toThrow("Invalid backup filename");

      await expect(
        databaseBackupService.deleteBackup("peek-stash-browser.db")
      ).rejects.toThrow("Invalid backup filename");

      await expect(
        databaseBackupService.deleteBackup("random-file.txt")
      ).rejects.toThrow("Invalid backup filename");

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it("should throw error if file does not exist", async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const { databaseBackupService } = await import(
        "../../services/DatabaseBackupService.js"
      );

      await expect(
        databaseBackupService.deleteBackup(
          "peek-stash-browser.db.backup-20260118-104532"
        )
      ).rejects.toThrow();
    });
  });
});
