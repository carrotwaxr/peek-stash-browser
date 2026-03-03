/**
 * Unit Tests for UserStats Controller
 *
 * Tests the getUserStats endpoint including auth checks, sortBy validation
 * (with default fallback), ranking freshness logic (ensureFreshRankings),
 * and error handling.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock dependencies BEFORE imports
vi.mock("../../services/UserStatsAggregationService.js", () => ({
  userStatsAggregationService: {
    getUserStats: vi.fn(),
  },
}));

vi.mock("../../services/RankingComputeService.js", () => ({
  default: {
    recomputeAllRankings: vi.fn(),
  },
}));

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userEntityRanking: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { userStatsAggregationService } from "../../services/UserStatsAggregationService.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import prisma from "../../prisma/singleton.js";
import { getUserStats } from "../../controllers/userStats.js";
import { mockReq, mockRes } from "../helpers/controllerTestUtils.js";

const mockStatsService = vi.mocked(userStatsAggregationService);
const mockRankingService = vi.mocked(rankingComputeService);
const mockPrisma = vi.mocked(prisma);

const USER = { id: 1, username: "testuser", role: "USER" };

const SAMPLE_STATS = {
  totalScenes: 50,
  totalPlayTime: 3600,
  topPerformers: [],
  topStudios: [],
  topTags: [],
};

describe("UserStats Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: rankings are fresh (updated just now)
    mockPrisma.userEntityRanking.findFirst.mockResolvedValue({
      updatedAt: new Date(),
    } as any);

    mockRankingService.recomputeAllRankings.mockResolvedValue(undefined as any);
    mockStatsService.getUserStats.mockResolvedValue(SAMPLE_STATS as any);
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when req.user is undefined", async () => {
      const req = mockReq({}, {}, undefined, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(401);
    });

    it("returns 401 when req.user has no id", async () => {
      const req = mockReq({}, {}, {} as any, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(401);
    });
  });

  // ─── sortBy validation ────────────────────────────────────────────────────

  describe("sortBy parameter", () => {
    it("defaults to 'engagement' when no sortBy is provided", async () => {
      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "engagement" })
      );
    });

    it("accepts 'oCount' as a valid sortBy", async () => {
      const req = mockReq({}, {}, USER, { sortBy: "oCount" });
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "oCount" })
      );
    });

    it("accepts 'playCount' as a valid sortBy", async () => {
      const req = mockReq({}, {}, USER, { sortBy: "playCount" });
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "playCount" })
      );
    });

    it("falls back to 'engagement' for an invalid sortBy value", async () => {
      const req = mockReq({}, {}, USER, { sortBy: "invalidField" });
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "engagement" })
      );
    });
  });

  // ─── Ranking freshness (ensureFreshRankings) ──────────────────────────────

  describe("ranking freshness", () => {
    it("does not recompute when rankings are fresh (< 1 hour old)", async () => {
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue({
        updatedAt: new Date(), // just now — fresh
      } as any);

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockRankingService.recomputeAllRankings).not.toHaveBeenCalled();
    });

    it("recomputes when rankings are stale (> 1 hour old)", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue({
        updatedAt: twoHoursAgo,
      } as any);

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockRankingService.recomputeAllRankings).toHaveBeenCalledWith(1);
    });

    it("recomputes when no rankings exist at all", async () => {
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue(null);

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(mockRankingService.recomputeAllRankings).toHaveBeenCalledWith(1);
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("returns stats from the aggregation service", async () => {
      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(SAMPLE_STATS);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 500 when the stats service throws", async () => {
      mockStatsService.getUserStats.mockRejectedValue(new Error("Service failure"));

      const req = mockReq({}, {}, USER, {});
      const res = mockRes();

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
