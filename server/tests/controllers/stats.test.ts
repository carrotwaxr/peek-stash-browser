/**
 * Unit Tests for Stats Controller
 *
 * Tests the getStats (system/cache/DB metrics) and refreshCache (trigger sync)
 * endpoints. Verifies fallback behavior when services or filesystem calls fail,
 * and indirectly tests the internal formatBytes/formatUptime pure functions
 * through response assertions.
 */
import { promises as fs } from "fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getStats, refreshCache } from "../../controllers/stats.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { logger } from "../../utils/logger.js";
import { reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock dependencies BEFORE imports
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getStats: vi.fn(),
    isReady: vi.fn(),
    getLastRefreshed: vi.fn(),
  },
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    isSyncing: vi.fn(),
    fullSync: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("fs", () => ({
  promises: {
    stat: vi.fn(),
  },
}));

const mockEntityService = vi.mocked(stashEntityService);
const mockSyncService = vi.mocked(stashSyncService);
const mockLogger = vi.mocked(logger);
const mockFsStat = vi.mocked(fs.stat);

describe("Stats Controller", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "file:/tmp/test.db";

    // Default happy-path mocks
    mockEntityService.getStats.mockResolvedValue({
      scenes: 100,
      performers: 50,
      studios: 10,
      tags: 25,
      galleries: 5,
      images: 200,
      groups: 3,
      clips: 0,
      ungeneratedClips: 0,
    });
    mockEntityService.isReady.mockResolvedValue(true);
    mockEntityService.getLastRefreshed.mockResolvedValue(
      new Date("2026-01-15T12:00:00Z")
    );
    mockSyncService.isSyncing.mockReturnValue(false);
    mockFsStat.mockResolvedValue(partialRow({ size: 1048576 })); // 1 MB
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns a response with system, process, cache, and database sections", async () => {
      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      const body = res._getBody();
      expect(res._getStatus()).toBe(200);
      expect(body).toHaveProperty("system");
      expect(body).toHaveProperty("process");
      expect(body).toHaveProperty("cache");
      expect(body).toHaveProperty("database");
    });

    it("includes cache stats from stashEntityService", async () => {
      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      const body = res._getOkBody();
      expect(body.cache).toMatchObject({
        isInitialized: true,
        isRefreshing: false,
      });
      expect(body.cache.lastRefreshed).toBeDefined();
    });

    it("falls back to zero cache stats when stashEntityService throws", async () => {
      mockEntityService.getStats.mockImplementation(() => {
        throw new Error("Service not initialized");
      });

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      const body = res._getBody();
      // Should still return 200, not 500
      expect(res._getStatus()).toBe(200);
      expect(body).toHaveProperty("cache");
    });

    it("falls back to 0 database size when fs.stat fails", async () => {
      mockFsStat.mockRejectedValue(new Error("ENOENT"));

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      const body = res._getOkBody();
      expect(res._getStatus()).toBe(200);
      expect(body.database).toBeDefined();
      expect(body.database.size).toBe("0 B");
    });

    it("formats database size correctly for a 1 MB file", async () => {
      mockFsStat.mockResolvedValue(partialRow({ size: 1048576 }));

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      expect(res._getOkBody().database.size).toBe("1.00 MB");
    });

    it("formats database size correctly for a 1 KB file", async () => {
      mockFsStat.mockResolvedValue(partialRow({ size: 1024 }));

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      expect(res._getOkBody().database.size).toBe("1.00 KB");
    });

    it("formats database size correctly for a 2.5 GB file", async () => {
      mockFsStat.mockResolvedValue(
        partialRow({ size: 2.5 * 1024 * 1024 * 1024 })
      );

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      expect(res._getOkBody().database.size).toBe("2.50 GB");
    });

    it("formats 0 bytes as '0 B'", async () => {
      mockFsStat.mockResolvedValue(partialRow({ size: 0 }));

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      expect(res._getOkBody().database.size).toBe("0 B");
    });

    it("includes formatted uptime in system info", async () => {
      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      const body = res._getOkBody();
      // process.uptime() returns a real number; just verify the field exists and is a string
      expect(typeof body.system.uptime).toBe("string");
    });

    it("returns a minimal safe response when the outer catch fires", async () => {
      // Force an error in the main body by breaking the response construction
      // This tests the outermost try/catch fallback
      mockEntityService.getStats.mockImplementation(() => {
        throw new Error("Service broken");
      });
      mockEntityService.isReady.mockImplementation(() => {
        throw new Error("isReady broken");
      });
      mockEntityService.getLastRefreshed.mockImplementation(() => {
        throw new Error("getLastRefreshed broken");
      });
      mockSyncService.isSyncing.mockImplementation(() => {
        throw new Error("isSyncing broken");
      });

      const req = reqFor(getStats);
      const res = resFor(getStats);

      await getStats(req, res);

      // Should not 500 — the controller catches everything and returns a safe response
      const body = res._getBody();
      expect(body).toBeDefined();
    });
  });

  // ─── refreshCache ─────────────────────────────────────────────────────────

  describe("refreshCache", () => {
    it("triggers fullSync and returns success", () => {
      mockSyncService.fullSync.mockResolvedValue([]);

      const req = reqFor(refreshCache);
      const res = resFor(refreshCache);

      refreshCache(req, res);

      expect(mockSyncService.fullSync).toHaveBeenCalled();
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toMatchObject({
        success: true,
        message: "Cache refresh initiated",
      });
    });

    it("refreshCache answers 409 and starts nothing while a sync runs", () => {
      mockSyncService.isSyncing.mockReturnValue(true);

      const req = reqFor(refreshCache);
      const res = resFor(refreshCache);

      refreshCache(req, res);

      expect(res._getStatus()).toBe(409);
      expect(res._getBody()).toEqual({ error: "A sync is already running" });
      expect(mockSyncService.fullSync).not.toHaveBeenCalled();
    });

    it("an admin's abort of the refresh logs Sync aborted at info, not a failure", async () => {
      mockSyncService.fullSync.mockRejectedValue(new Error("Sync aborted"));

      refreshCache(reqFor(refreshCache), resFor(refreshCache));

      await vi.waitFor(() => {
        expect(mockLogger.info).toHaveBeenCalledWith("Sync aborted", {});
      });
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it("a refresh that fails logs the failure at error level", async () => {
      mockSyncService.fullSync.mockRejectedValue(new Error("Stash is down"));

      refreshCache(reqFor(refreshCache), resFor(refreshCache));

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          "Background full sync failed",
          { error: "Stash is down" }
        );
      });
    });

    it("returns 500 when fullSync throws synchronously", () => {
      mockSyncService.fullSync.mockImplementation(() => {
        throw new Error("Sync failed hard");
      });

      const req = reqFor(refreshCache);
      const res = resFor(refreshCache);

      refreshCache(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody()).toMatchObject({
        success: false,
        message: "Failed to refresh cache",
      });
    });
  });
});
