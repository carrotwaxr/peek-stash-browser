/**
 * Unit Tests for DataMigrationService
 *
 * Tests the one-time data migration system that runs on server startup.
 * Critical for verifying that migrations like 002_rebuild_stats_multi_instance
 * execute correctly and handle failures properly.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    dataMigration: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

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

// Mock UserStatsService
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    rebuildAllStatsForUser: vi.fn(),
    rebuildAllStats: vi.fn(),
  },
}));

import prisma from "../../prisma/singleton.js";
import { userStatsService } from "../../services/UserStatsService.js";

const mockPrisma = vi.mocked(prisma);
const mockStatsService = vi.mocked(userStatsService);

describe("DataMigrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  async function importFresh() {
    const mod = await import("../../services/DataMigrationService.js");
    return mod.dataMigrationService;
  }

  describe("runPendingMigrations", () => {
    it("does nothing when all migrations are already applied", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        { id: 1, name: "001_rebuild_user_stats", appliedAt: new Date() },
        { id: 2, name: "002_rebuild_stats_multi_instance", appliedAt: new Date() },
      ] as any);

      const { logger } = await import("../../utils/logger.js");
      const service = await importFresh();
      await service.runPendingMigrations();

      expect(logger.info).toHaveBeenCalledWith(
        "[DataMigration] No pending migrations"
      );
      // Should not create any migration records
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("runs pending migration 001 and marks it applied", async () => {
      // No migrations applied yet
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);

      // Mock 001 dependencies
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, username: "admin" },
      ] as any);
      mockStatsService.rebuildAllStatsForUser.mockResolvedValue();
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      // Both migrations should be marked as applied
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "001_rebuild_user_stats" },
      });
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "002_rebuild_stats_multi_instance" },
      });
    });

    it("skips already-applied migration and only runs pending ones", async () => {
      // 001 already applied, 002 pending
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        { id: 1, name: "001_rebuild_user_stats", appliedAt: new Date() },
      ] as any);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      // Only 002 should be created
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "002_rebuild_stats_multi_instance" },
      });
    });

    it("calls rebuildAllStats for migration 002", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        { id: 1, name: "001_rebuild_user_stats", appliedAt: new Date() },
      ] as any);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockStatsService.rebuildAllStats).toHaveBeenCalledTimes(1);
    });

    it("calls rebuildAllStatsForUser for each user in migration 001", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, username: "admin" },
        { id: 2, username: "user1" },
        { id: 3, username: "user2" },
      ] as any);
      mockStatsService.rebuildAllStatsForUser.mockResolvedValue();
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledTimes(3);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(1);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(2);
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledWith(3);
    });

    it("continues with other users if one user's stats rebuild fails in 001", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, username: "admin" },
        { id: 2, username: "broken_user" },
        { id: 3, username: "user2" },
      ] as any);
      mockStatsService.rebuildAllStatsForUser
        .mockResolvedValueOnce() // user 1 succeeds
        .mockRejectedValueOnce(new Error("DB error")) // user 2 fails
        .mockResolvedValueOnce(); // user 3 succeeds
      mockStatsService.rebuildAllStats.mockResolvedValue();

      const service = await importFresh();
      await service.runPendingMigrations();

      // All three users attempted
      expect(mockStatsService.rebuildAllStatsForUser).toHaveBeenCalledTimes(3);
      // Migration still marked as applied (001 doesn't throw on individual user failure)
      expect(mockPrisma.dataMigration.create).toHaveBeenCalledWith({
        data: { name: "001_rebuild_user_stats" },
      });
    });

    it("does not mark 002 as applied when rebuildAllStats throws", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([
        { id: 1, name: "001_rebuild_user_stats", appliedAt: new Date() },
      ] as any);
      mockPrisma.dataMigration.create.mockResolvedValue({} as any);

      mockStatsService.rebuildAllStats.mockRejectedValue(
        new Error("Stats rebuild failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "Stats rebuild failed"
      );

      // Migration should NOT be marked as applied so it retries on next startup
      expect(mockPrisma.dataMigration.create).not.toHaveBeenCalled();
    });

    it("propagates error when dataMigration.findMany fails", async () => {
      mockPrisma.dataMigration.findMany.mockRejectedValue(
        new Error("Database connection failed")
      );

      const service = await importFresh();
      await expect(service.runPendingMigrations()).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("getAppliedMigrations", () => {
    it("returns list of applied migrations ordered by date", async () => {
      const migrations = [
        { id: 1, name: "001_rebuild_user_stats", appliedAt: new Date("2026-01-15") },
        { id: 2, name: "002_rebuild_stats_multi_instance", appliedAt: new Date("2026-02-11") },
      ];
      mockPrisma.dataMigration.findMany.mockResolvedValue(migrations as any);

      const service = await importFresh();
      const result = await service.getAppliedMigrations();

      expect(result).toEqual(migrations);
      expect(mockPrisma.dataMigration.findMany).toHaveBeenCalledWith({
        orderBy: { appliedAt: "asc" },
      });
    });

    it("returns empty array when no migrations applied", async () => {
      mockPrisma.dataMigration.findMany.mockResolvedValue([]);

      const service = await importFresh();
      const result = await service.getAppliedMigrations();

      expect(result).toEqual([]);
    });
  });
});
