/**
 * Unit Tests for UserStats Controller
 *
 * Tests the getUserStats endpoint including auth checks, sortBy validation
 * (with default fallback), waiting for fresh rankings (the freshness rule
 * itself is RankingComputeService.ensureFresh's, tested there), the viewer's
 * allowed instances, and error handling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserStats } from "../../controllers/userStats.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { userStatsAggregationService } from "../../services/UserStatsAggregationService.js";
import type { UserStatsResponse } from "../../types/api/index.js";
import { libraryHandler } from "../../utils/routeHelpers.js";
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
    forget: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockStatsService = vi.mocked(userStatsAggregationService);
const mockRankingService = vi.mocked(rankingComputeService, true);
const ALLOWED = ["inst-a", "inst-b"];

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

      await libraryHandler(getUserStats)(req, res, vi.fn());

      expect(res._getStatus()).toBe(401);
    });

    it("returns 401 when req.user has no id", async () => {
      const req = reqFor(getUserStats, { user: malformed({}) });
      const res = resFor(getUserStats);

      await libraryHandler(getUserStats)(req, res, vi.fn());

      expect(res._getStatus()).toBe(401);
    });
  });

  // ─── sortBy validation ────────────────────────────────────────────────────

  describe("sortBy parameter", () => {
    it("defaults to 'engagement' when no sortBy is provided", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
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
        allowedInstanceIds: ALLOWED,
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
        allowedInstanceIds: ALLOWED,
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
        allowedInstanceIds: ALLOWED,
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
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockRankingService.ensureFresh).toHaveBeenCalledExactlyOnceWith(
        1,
        { wait: true }
      );
      expect(events).toEqual(["rankings fresh", "stats read"]);
    });

    it("a failure reaches the error handler: without reading stats when the recompute fails", async () => {
      mockRankingService.ensureFresh.mockRejectedValue(
        new Error("disk I/O error")
      );
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getUserStats);

      await expect(getUserStats(req, res)).rejects.toThrow("disk I/O error");

      expect(res.json).not.toHaveBeenCalled();
      expect(mockStatsService.getUserStats).not.toHaveBeenCalled();
    });
  });

  // ─── Forced refresh ───────────────────────────────────────────────────────

  describe("refresh=1", () => {
    const refreshReq = (userId: number) =>
      reqFor(getUserStats, {
        user: { ...USER, id: userId },
        allowedInstanceIds: ALLOWED,
        query: { refresh: "1" },
      });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("refresh=1 forgets the user's rankings before waiting for a fresh compute", async () => {
      const events: string[] = [];
      mockRankingService.forget.mockImplementation(() => {
        events.push("forget");
      });
      mockRankingService.ensureFresh.mockImplementation(() => {
        events.push("ensureFresh");
        return Promise.resolve();
      });

      await getUserStats(refreshReq(11), resFor(getUserStats));

      expect(mockRankingService.forget).toHaveBeenCalledExactlyOnceWith(11);
      expect(mockRankingService.ensureFresh).toHaveBeenCalledExactlyOnceWith(
        11,
        { wait: true }
      );
      expect(events).toEqual(["forget", "ensureFresh"]);
    });

    it("a second refresh=1 from the same user within a minute does not forget again", async () => {
      await getUserStats(refreshReq(12), resFor(getUserStats));
      vi.advanceTimersByTime(30_000);
      await getUserStats(refreshReq(12), resFor(getUserStats));

      expect(mockRankingService.forget).toHaveBeenCalledTimes(1);
      expect(mockRankingService.ensureFresh).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(31_000);
      await getUserStats(refreshReq(12), resFor(getUserStats));

      expect(mockRankingService.forget).toHaveBeenCalledTimes(2);
    });

    it("another user's refresh=1 is not held back by this user's", async () => {
      await getUserStats(refreshReq(13), resFor(getUserStats));
      await getUserStats(refreshReq(14), resFor(getUserStats));

      expect(mockRankingService.forget).toHaveBeenCalledWith(13);
      expect(mockRankingService.forget).toHaveBeenCalledWith(14);
    });

    it("without refresh it does not forget", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });

      await getUserStats(req, resFor(getUserStats));

      expect(mockRankingService.forget).not.toHaveBeenCalled();
    });
  });

  // ─── Allowed instances ────────────────────────────────────────────────────

  describe("allowed instances", () => {
    it("passes req.allowedInstanceIds to the builder or service: the stats over the viewer's allowed instances", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(mockStatsService.getUserStats).toHaveBeenCalledExactlyOnceWith(1, {
        sortBy: "engagement",
        allowedInstanceIds: ["inst-a", "inst-b"],
      });
    });
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe("happy path", () => {
    it("returns stats from the aggregation service", async () => {
      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getUserStats);

      await getUserStats(req, res);

      expect(res._getStatus()).toBe(200);
      expect(res._getBody()).toEqual(SAMPLE_STATS);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe("error handling", () => {
    it("a failure reaches the error handler: the stats service throws", async () => {
      mockStatsService.getUserStats.mockRejectedValue(
        new Error("Service failure")
      );

      const req = reqFor(getUserStats, {
        user: USER,
        allowedInstanceIds: ALLOWED,
      });
      const res = resFor(getUserStats);

      await expect(getUserStats(req, res)).rejects.toThrow("Service failure");

      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
