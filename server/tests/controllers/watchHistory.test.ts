/**
 * Unit Tests for Watch History Controller
 *
 * Tests the watch history endpoints including:
 * - saveActivity (resume time and play duration tracking)
 * - incrementPlayCount (play count increment with threshold)
 * - incrementOCounter (O counter management)
 * - getWatchHistory (single scene retrieval)
 * - getAllWatchHistory (list retrieval)
 * - clearAllWatchHistory (bulk deletion)
 * - pingWatchHistory (player progress pings)
 * - the entity access check on every write
 */
import { Prisma, type WatchHistory } from "@prisma/client";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks are set up
import {
  clearAllWatchHistory,
  getAllWatchHistory,
  getWatchHistory,
  incrementOCounter,
  incrementPlayCount,
  pingWatchHistory,
  saveActivity,
} from "../../controllers/watchHistory.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userStatsService } from "../../services/UserStatsService.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock Prisma - hoisted to top level. Interactive transactions run their
// callback on this same mock client.
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefault: vi.fn(() => ({
      findScenes: vi.fn().mockResolvedValue({
        findScenes: { scenes: [{ files: [{ duration: 600 }] }] },
      }),
      sceneSaveActivity: vi.fn().mockResolvedValue({}),
      sceneAddPlay: vi
        .fn()
        .mockResolvedValue({ sceneAddPlay: { count: 1, history: [] } }),
      sceneIncrementO: vi.fn().mockResolvedValue({ sceneIncrementO: 1 }),
    })),
    getAllConfigs: vi.fn(() => [
      { id: "test-instance", name: "Test", priority: 0 },
    ]),
    getForSync: vi.fn(),
  },
}));

// Mock the access check: the request's instance when given, else "test-instance"
vi.mock("../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn(),
}));

// Mock UserStatsService
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    updateStatsForScene: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Get mocked functions
const mockPrisma = vi.mocked(prisma, true);
const mockResolve = vi.mocked(resolveAccessibleInstanceId);
const mockInstanceManager = vi.mocked(stashInstanceManager);

describe("Watch History Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashScene.findFirst.mockResolvedValue(
      partialRow({ duration: 600, stashInstanceId: "test-instance" })
    );
    mockResolve.mockImplementation((_userId, _type, _id, requested) =>
      Promise.resolve(requested ?? "test-instance")
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // saveActivity Tests
  // ============================================================================

  describe("saveActivity", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should return 400 if sceneId is missing", async () => {
      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: malformed({ resumeTime: 60, playDuration: 10 }),
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing required field: sceneId",
      });
    });

    it("should create new watch history record if none exists (upsert)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 0,
          playDuration: 10,
          resumeTime: 60,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: 1,
              instanceId: "test-instance",
              sceneId: "123",
            },
          },
          create: objectContaining({
            userId: 1,
            instanceId: "test-instance",
            sceneId: "123",
            playDuration: 10,
            resumeTime: 60,
          }),
          update: objectContaining({
            resumeTime: 60,
            playDuration: { increment: 10 },
          }),
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          watchHistory: objectContaining({
            playDuration: 10,
            resumeTime: 60,
          }),
        })
      );
    });

    it("should update existing record with incremented playDuration", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 0,
          playDuration: 60, // 50 existing + 10 new = 60
          resumeTime: 120,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 120, playDuration: 10 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it("should handle zero playDuration gracefully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 0,
          playDuration: 50, // unchanged
          resumeTime: 60,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 60, playDuration: 0 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it("should handle null/undefined playDuration", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 0,
          playDuration: 0,
          resumeTime: 60,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 60 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: objectContaining({
            playDuration: { increment: 0 },
          }),
        })
      );
    });
  });

  // ============================================================================
  // incrementPlayCount Tests
  // ============================================================================

  describe("incrementPlayCount", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123" },
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 if sceneId is missing", async () => {
      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: malformed({}),
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should create new record with playCount=1 if none exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 1,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [new Date().toISOString()],
        })
      );

      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            playCount: 1,
            playHistory: [expect.any(String)],
          }),
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          watchHistory: objectContaining({
            playCount: 1,
          }),
        })
      );
    });

    it("should increment existing playCount using atomic increment", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 5,
          playHistory: ["2024-01-01T00:00:00.000Z"],
        })
      );
      mockPrisma.watchHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          userId: 1,
          sceneId: "123",
          playCount: 6,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: objectContaining({
            playCount: { increment: 1 },
          }),
        })
      );
    });

    it("should add timestamp to playHistory", async () => {
      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          playHistory: existingHistory,
        })
      );
      mockPrisma.watchHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 2,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      // Stored as an array, never a JSON string
      expect(mockPrisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            playHistory: ["2024-01-01T00:00:00.000Z", expect.any(String)],
          }),
        })
      );
    });
  });

  // ============================================================================
  // incrementOCounter Tests
  // ============================================================================

  describe("incrementOCounter", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(incrementOCounter);
      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: { sceneId: "123" },
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return 400 if sceneId is missing", async () => {
      const res = resFor(incrementOCounter);
      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: malformed({}),
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should create new record with oCount=1 if none exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 1,
          oHistory: [new Date().toISOString()],
        })
      );

      const res = resFor(incrementOCounter);
      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            oCount: 1,
          }),
        })
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          oCount: 1,
        })
      );
      expect(userStatsService.updateStatsForScene).toHaveBeenCalledTimes(1);
    });

    it("should increment existing oCount", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 3,
          oHistory: ["2024-01-01T00:00:00.000Z"],
        })
      );
      mockPrisma.watchHistory.update.mockResolvedValue(
        partialRow({
          id: 1,
          oCount: 4,
          oHistory: ["2024-01-01T00:00:00.000Z", new Date().toISOString()],
        })
      );

      const res = resFor(incrementOCounter);
      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            oCount: { increment: 1 },
            oHistory: ["2024-01-01T00:00:00.000Z", expect.any(String)],
          }),
        })
      );
      expect(userStatsService.updateStatsForScene).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, oCount: 4 })
      );
    });
  });

  // ============================================================================
  // getWatchHistory Tests
  // ============================================================================

  describe("getWatchHistory", () => {
    it("should return 400 if sceneId is missing", async () => {
      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: malformed({}),
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return exists:false when no watch history found", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.json).toHaveBeenCalledWith({
        exists: false,
        resumeTime: null,
        playCount: 0,
        oCount: 0,
      });
    });

    it("should return full watch history when record exists", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          resumeTime: 120,
          playCount: 5,
          playDuration: 300,
          lastPlayedAt: new Date("2024-01-01"),
          oCount: 2,
          oHistory: ["2024-01-01T00:00:00.000Z", "2024-01-01T01:00:00.000Z"],
          playHistory: ["2024-01-01T00:00:00.000Z"],
        })
      );

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          exists: true,
          resumeTime: 120,
          playCount: 5,
          playDuration: 300,
          oCount: 2,
        })
      );
    });
  });

  // ============================================================================
  // getAllWatchHistory Tests
  // ============================================================================

  describe("getAllWatchHistory", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(getAllWatchHistory);
      await getAllWatchHistory(
        reqFor(getAllWatchHistory, {
          query: {},
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should return all watch history for user", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          id: 1,
          sceneId: "123",
          resumeTime: 60,
          playCount: 1,
          oHistory: [],
          playHistory: [],
        }),
        partialRow({
          id: 2,
          sceneId: "456",
          resumeTime: 120,
          playCount: 2,
          oHistory: [],
          playHistory: [],
        }),
      ]);

      const res = resFor(getAllWatchHistory);
      await getAllWatchHistory(
        reqFor(getAllWatchHistory, {
          query: { limit: "20" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          orderBy: { lastPlayedAt: "desc" },
          take: 20,
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        watchHistory: arrayContaining([
          expect.objectContaining({ sceneId: "123" }),
          expect.objectContaining({ sceneId: "456" }),
        ]),
      });
    });

    it("should filter by inProgress when requested", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);

      const res = resFor(getAllWatchHistory);
      await getAllWatchHistory(
        reqFor(getAllWatchHistory, {
          query: { limit: "20", inProgress: "true" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 1,
            resumeTime: { not: null },
          },
        })
      );
    });
  });

  // ============================================================================
  // clearAllWatchHistory Tests
  // ============================================================================

  describe("clearAllWatchHistory", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(clearAllWatchHistory);
      await clearAllWatchHistory(
        reqFor(clearAllWatchHistory, {
          user: undefined,
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("should delete all watch history and stats for user", async () => {
      mockPrisma.watchHistory.deleteMany.mockResolvedValue({
        count: 10,
      });
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue({
        count: 5,
      });
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue({
        count: 3,
      });
      mockPrisma.userTagStats.deleteMany.mockResolvedValue({
        count: 15,
      });
      mockPrisma.userEntityRanking.deleteMany.mockResolvedValue({
        count: 20,
      });

      const res = resFor(clearAllWatchHistory);
      await clearAllWatchHistory(
        reqFor(clearAllWatchHistory, {
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userPerformerStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userStudioStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userTagStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          deletedCounts: {
            watchHistory: 10,
            performerStats: 5,
            studioStats: 3,
            tagStats: 15,
            rankings: 20,
          },
        })
      );
    });
  });

  // ============================================================================
  // Entity access (item 6)
  // ============================================================================

  describe("entity access", () => {
    const writes: [
      string,
      (req: AuthenticatedRequest, res: Response) => Promise<unknown>,
      Record<string, unknown>,
    ][] = [
      [
        "saveActivity",
        saveActivity as never,
        { resumeTime: 5, playDuration: 5 },
      ],
      ["incrementPlayCount", incrementPlayCount as never, {}],
      ["incrementOCounter", incrementOCounter as never, {}],
      ["pingWatchHistory", pingWatchHistory as never, { currentTime: 1 }],
    ];

    it.each(writes)(
      "%s returns 404 and writes nothing when the scene is not visible",
      async (_name, handler, extra) => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({
            id: 1,
            minimumPlayPercent: 0,
            syncToStash: true,
          })
        );
        mockResolve.mockResolvedValueOnce(null);

        const res = resFor(handler);
        await handler(
          reqFor(handler, {
            body: { sceneId: "123", instanceId: "inst-b", ...extra },
            user: testUser({ id: 1 }),
          }),
          res
        );

        expect(mockResolve).toHaveBeenCalledWith(1, "scene", "123", "inst-b");
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
          error: "Scene not found",
        });
        expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
        expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
      }
    );

    it("passes the request's instanceId through", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 0,
          playDuration: 5,
          resumeTime: 5,
          lastPlayedAt: new Date(),
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: {
            sceneId: "123",
            instanceId: "inst-b",
            resumeTime: 5,
            playDuration: 5,
          },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockResolve).toHaveBeenCalledWith(1, "scene", "123", "inst-b");
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: 1,
              instanceId: "inst-b",
              sceneId: "123",
            },
          },
        })
      );
    });

    it.each([[5], [""]])(
      "returns 400 when instanceId is %j",
      async (instanceId) => {
        const res = resFor(incrementOCounter);
        await incrementOCounter(
          reqFor(incrementOCounter, {
            body: malformed({ sceneId: "123", instanceId }),
            user: testUser({ id: 1 }),
          }),
          res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "instanceId must be a non-empty string",
        });
        expect(mockResolve).not.toHaveBeenCalled();
      }
    );

    it("ping reads the duration from the resolved instance", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          minimumPlayPercent: 50,
          syncToStash: false,
        })
      );
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          duration: 600,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      const record: WatchHistory = partialRow({
        id: 1,
        playCount: 0,
        playDuration: 0,
        resumeTime: 1,
        lastPlayedAt: new Date(),
        playHistory: [],
      });
      mockPrisma.watchHistory.create.mockResolvedValue(record);
      mockPrisma.watchHistory.update.mockResolvedValue(record);

      const res = resFor(pingWatchHistory);
      await pingWatchHistory(
        reqFor(pingWatchHistory, {
          body: { sceneId: "scene-1", currentTime: 1 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockResolve).toHaveBeenCalledWith(
        1,
        "scene",
        "scene-1",
        undefined
      );
      expect(mockPrisma.stashScene.findFirst).toHaveBeenCalledWith({
        where: { id: "scene-1", stashInstanceId: "test-instance" },
        select: { duration: true },
      });
      expect(mockPrisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ instanceId: "test-instance" }),
        })
      );
    });
  });

  // ============================================================================
  // pingWatchHistory Tests
  // ============================================================================

  describe("pingWatchHistory", () => {
    it("two pings of one session past the threshold count one play", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          minimumPlayPercent: 50,
          syncToStash: false,
        })
      );
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          duration: 600,
        })
      );
      // 400 of 600 seconds played: past the 50% threshold
      const record: WatchHistory = partialRow({
        id: 1,
        playCount: 0,
        playDuration: 400,
        resumeTime: 390,
        lastPlayedAt: new Date(),
        oHistory: [],
        playHistory: [],
      });
      mockPrisma.watchHistory.findUnique.mockResolvedValue(record);
      mockPrisma.watchHistory.update.mockResolvedValue(record);

      // A scene id no other test pings, so the session starts clean
      const res = resFor(pingWatchHistory);
      const ping = () =>
        pingWatchHistory(
          {
            body: { sceneId: "session-guard", currentTime: 400 },
            user: { id: 1 },
          } as never,
          res
        );
      await Promise.all([ping(), ping()]);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledTimes(2);
      expect(userStatsService.updateStatsForScene).toHaveBeenCalledTimes(1);
      expect(userStatsService.updateStatsForScene).toHaveBeenCalledWith(
        1,
        "session-guard",
        0,
        1,
        expect.any(Date),
        undefined,
        "test-instance"
      );
    });

    it("a ping whose first attempt found the database busy counts the play when tried again", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          minimumPlayPercent: 50,
          syncToStash: false,
        })
      );
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          duration: 600,
        })
      );
      // 400 of 600 seconds played: past the 50% threshold
      const record: WatchHistory = partialRow({
        id: 1,
        playCount: 0,
        playDuration: 400,
        resumeTime: 390,
        lastPlayedAt: new Date(),
        oHistory: [],
        playHistory: [],
      });
      mockPrisma.watchHistory.findUnique.mockResolvedValue(record);
      // The first attempt's write finds another writer holding the database
      mockPrisma.watchHistory.update
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError(
            "Operations timed out after 5s",
            { code: "P1008", clientVersion: "test" }
          )
        )
        .mockResolvedValue(record);

      // A scene id no other test pings, so the session starts clean
      const res = resFor(pingWatchHistory);
      await pingWatchHistory(
        {
          body: { sceneId: "session-busy-retry", currentTime: 400 },
          user: { id: 1 },
        } as never,
        res
      );

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledTimes(1);
      // Both attempts counted the play: the flag the failed one set did not
      // stop the second
      expect(mockPrisma.watchHistory.update).toHaveBeenCalledTimes(2);
      for (const call of mockPrisma.watchHistory.update.mock.calls) {
        expect(must(call)[0].data).toMatchObject({
          playCount: { increment: 1 },
        });
      }
      expect(userStatsService.updateStatsForScene).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // Race Condition Tests
  // ============================================================================

  describe("Race Condition Prevention", () => {
    it("saveActivity should use upsert to handle concurrent calls", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.upsert.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 0,
          playDuration: 10,
          resumeTime: 60,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(saveActivity);
      await saveActivity(
        reqFor(saveActivity, {
          body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
          user: testUser({ id: 1 }),
        }),
        res
      );

      // Verify upsert was called instead of findUnique + create/update
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalled();
      // saveActivity no longer uses findUnique before upsert
      expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
    });

    it("incrementPlayCount reads and writes in one transaction", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          syncToStash: false,
        })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 1,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: new Date(),
          oCount: 0,
          oHistory: [],
          playHistory: [],
        })
      );

      const res = resFor(incrementPlayCount);
      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      // The play history append needs the row read in the same transaction,
      // which an upsert can't give it
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        { maxWait: 10_000, timeout: 10_000 }
      );
      expect(mockPrisma.watchHistory.create).toHaveBeenCalled();
      expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
    });
  });
});
