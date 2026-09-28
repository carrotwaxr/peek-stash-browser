/**
 * Unit Tests for UserStats Controller
 *
 * Tests the getUserStats endpoint including auth checks, sortBy validation
 * (with default fallback), waiting for fresh rankings (the freshness rule
 * itself is RankingComputeService.ensureFresh's, tested there), and error
 * handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserStats } from "../../controllers/userStats.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { userStatsAggregationService } from "../../services/UserStatsAggregationService.js";
import type { UserStatsResponse } from "../../types/api/index.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";

// Mock dependencies BEFORE imports
vi.mock("../../services/UserStatsAggregationService.js", () => ({
  userStatsAggregationService: {
    getUserStats: vi.fn(),
  },
}));

vi.mock("../../services/RankingComputeService.js", () => ({
  default: {
    ensureFresh: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockStatsService = vi.mocked(userStatsAggregationService);
const mockRankingService = vi.mocked(rankingComputeService, true);

const USER = { id: 1, username: "testuser", role: "USER" };

const SAMPLE_STATS: UserStatsResponse = {
  library: {
    sceneCount: 50,
    performerCount: 0,
    studioCount: 0,
    tagCount: 0,
    galleryCount: 0,
    imageCount: 0,
    clipCount: 0,
  },
  engagement: {
    totalWatchTime: 3600,
    totalPlayCount: 0,
    totalOCount: 0,
    totalImagesViewed: 0,
    uniqueScenesWatched: 0,
  },
  topScenes: [],
  topPerformers: [],
  topStudios: [],
  topTags: [],
  mostWatchedScene: null,
  mostViewedImage: null,
  mostOdScene: null,
  mostOdPerformer: null,
};

describe("UserStats Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRankingService.ensureFresh.mockResolvedValue(undefined);
    mockStatsService.getUserStats.mockResolvedValue(SAMPLE_STATS);
  });

  // ─── Auth ─────────────────────────────────────────────────────────────────

  describe("authentication", () => {
    it("returns 401 when req.user is undefined", async () => {
      const req = reqFor(getUserStats);
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(401);
    });

    it("returns 401 when req.user has no id", async () => {
      const req = reqFor(getUserStats, { user: malformed({}) });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(401);
    });
  });

  // ─── sortBy validation ────────────────────────────────────────────────────

  describe("sortBy parameter", () => {
    it("defaults to 'engagement' when no sortBy is provided", async () => {
      const req = reqFor(getUserStats, { user: USER });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "engagement" })
      );
    });

    it("accepts 'oCount' as a valid sortBy", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        query: { sortBy: "oCount" },
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "oCount" })
      );
    });

    it("accepts 'playCount' as a valid sortBy", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        query: { sortBy: "playCount" },
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "playCount" })
      );
    });

    it("falls back to 'engagement' for an invalid sortBy value", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        query: { sortBy: "invalidField" },
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ sortBy: "engagement" })
      );
    });
  });

  // ─── Ranking freshness ────────────────────────────────────────────────────

  describe("ranking freshness", () => {
    it("waits for the user's rankings to be fresh before reading the stats", async () => {
      const events: string[] = [];
      mockRankingService.ensureFresh.mockImplementation(async () => {
        await Promise.resolve();
        events.push("rankings fresh");
      });
      mockStatsService.getUserStats.mockImplementation(() => {
        events.push("stats read");
        return Promise.resolve(SAMPLE_STATS);
      });
      const req = reqFor(getUserStats, { user: USER });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockRankingService.ensureFresh).toHaveBeenCalledExactlyOnceWith(
        1,
        { wait: true }
      );
      expect(events).toEqual(["rankings fresh", "stats read"]);
    });

    it("returns 500 without reading stats when the recompute fails", async () => {
      mockRankingService.ensureFresh.mockRejectedValue(
        new Error("disk I/O error")
      );
      const req = reqFor(getUserStats, { user: USER });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(500);
      expect(mockStatsService.getUserStats).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("returns stats from the aggregation service", async () => {
      const req = reqFor(getUserStats, { user: USER });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(SAMPLE_STATS);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 500 when the stats service throws", async () => {
      mockStatsService.getUserStats.mockRejectedValue(
        new Error("Service failure")
      );

      const req = reqFor(getUserStats, { user: USER });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(500);
    });
  });
});
