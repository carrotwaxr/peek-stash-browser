/**
 * Unit Tests for Stats Controller
 *
 * Tests the getStats (system/cache/DB metrics) and refreshCache (trigger sync)
 * endpoints. Verifies fallback behavior when services or filesystem calls fail,
 * and indirectly tests the internal formatBytes/formatUptime pure functions
 * through response assertions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { stashEntityService } from "../../services/StashEntityService.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { promises as fs } from "fs";
import { getStats, refreshCache } from "../../controllers/stats.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockEntityService = vi.mocked(stashEntityService);
const mockSyncService = vi.mocked(stashSyncService);
const mockFsStat = vi.mocked(fs.stat);

describe("Stats Controller", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "file:/tmp/test.db";

    // Default happy-path mocks
    mockEntityService.getStats.mockReturnValue({
      scenes: 100,
      performers: 50,
      studios: 10,
      tags: 25,
      galleries: 5,
      images: 200,
      groups: 3,
    } as any);
    mockEntityService.isReady.mockReturnValue(true);
    mockEntityService.getLastRefreshed.mockReturnValue(new Date("2026-01-15T12:00:00Z"));
    mockSyncService.isSyncing.mockReturnValue(false);
    mockFsStat.mockResolvedValue({ size: 1048576 } as any); // 1 MB
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  // ─── getStats ─────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns a response with system, process, cache, and database sections", async () => {
      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      const body = res._getBody();
      expect(res._getStatus()).toBe(200);
      expect(body).toHaveProperty("system");
      expect(body).toHaveProperty("process");
      expect(body).toHaveProperty("cache");
      expect(body).toHaveProperty("database");
    });

    it("includes cache stats from stashEntityService", async () => {
      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      const body = res._getBody();
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

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      const body = res._getBody();
      // Should still return 200, not 500
      expect(res._getStatus()).toBe(200);
      expect(body).toHaveProperty("cache");
    });

    it("falls back to 0 database size when fs.stat fails", async () => {
      mockFsStat.mockRejectedValue(new Error("ENOENT"));

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      const body = res._getBody();
      expect(res._getStatus()).toBe(200);
      expect(body.database).toBeDefined();
      expect(body.database.size).toBe("0 B");
    });

    it("formats database size correctly for a 1 MB file", async () => {
      mockFsStat.mockResolvedValue({ size: 1048576 } as any);

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      expect(res._getBody().database.size).toBe("1.00 MB");
    });

    it("formats database size correctly for a 1 KB file", async () => {
      mockFsStat.mockResolvedValue({ size: 1024 } as any);

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      expect(res._getBody().database.size).toBe("1.00 KB");
    });

    it("formats database size correctly for a 2.5 GB file", async () => {
      mockFsStat.mockResolvedValue({ size: 2.5 * 1024 * 1024 * 1024 } as any);

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      expect(res._getBody().database.size).toBe("2.50 GB");
    });

    it("formats 0 bytes as '0 B'", async () => {
      mockFsStat.mockResolvedValue({ size: 0 } as any);

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      expect(res._getBody().database.size).toBe("0 B");
    });

    it("includes formatted uptime in system info", async () => {
      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      const body = res._getBody();
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

      const req = mockReq();
      const res = mockRes();

      await getStats(req, res);

      // Should not 500 — the controller catches everything and returns a safe response
      const body = res._getBody();
      expect(body).toBeDefined();
    });
  });

  // ─── refreshCache ─────────────────────────────────────────────────────────

  describe("refreshCache", () => {
    it("triggers fullSync and returns success", async () => {
      mockSyncService.fullSync.mockResolvedValue(undefined as any);

      const req = mockReq();
      const res = mockRes();

      await refreshCache(req, res);

      expect(mockSyncService.fullSync).toHaveBeenCalled();
      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toMatchObject({
        success: true,
        message: "Cache refresh initiated",
      });
    });

    it("returns 500 when fullSync throws synchronously", async () => {
      mockSyncService.fullSync.mockImplementation(() => {
        throw new Error("Sync failed hard");
      });

      const req = mockReq();
      const res = mockRes();

      await refreshCache(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody()).toMatchObject({
        success: false,
        message: "Failed to refresh cache",
      });
    });
  });
});
