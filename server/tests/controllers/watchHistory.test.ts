/**
 * Unit Tests for Watch History Controller
 *
 * Tests the watch history endpoints including:
 * - saveActivity (resume time and play duration tracking)
 * - incrementPlayCount (play count increment with threshold)
 * - incrementOCounter (O counter management)
 * - getWatchHistory (single scene retrieval)
 * - clearAllWatchHistory (bulk deletion)
 * - the entity access check on every write
 */
import type { Prisma, WatchHistory } from "@prisma/client";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Import after mocks are set up
import {
  clearAllWatchHistory,
  getWatchHistory,
  incrementOCounter,
  incrementPlayCount,
  saveActivity,
} from "../../controllers/watchHistory.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { DB_WRITE_TX } from "../../utils/dbWrite.js";
import { authenticated } from "../../utils/routeHelpers.js";
import {
  findHandler,
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { anyOf, objectContaining } from "../helpers/matchers.js";
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
// The per-user caches a history clear drops
vi.mock("../../services/RankingComputeService.js", () => ({
  rankingComputeService: { forget: vi.fn() },
}));
vi.mock("../../services/RecommendationService.js", () => ({
  recommendationService: { forget: vi.fn() },
}));

// The stats writes a play or an O press runs inside its transaction
const { mockStatsWrites } = vi.hoisted(() => ({
  mockStatsWrites: vi.fn<(tx: Prisma.TransactionClient) => Promise<void>>(),
}));
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {
    statsWritesForScene: vi.fn(),
    bumpWriteGeneration: vi.fn(),
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Get mocked functions
const mockPrisma = vi.mocked(prisma, true);
const mockResolve = vi.mocked(resolveAccessibleInstanceId);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockStats = vi.mocked(userStatsService, true);

describe("Watch History Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashScene.findFirst.mockResolvedValue(
      partialRow({ duration: 600, stashInstanceId: "test-instance" })
    );
    mockResolve.mockImplementation((_userId, _type, _id, requested) =>
      Promise.resolve(requested)
    );
    mockStatsWrites.mockResolvedValue(undefined);
    mockStats.statsWritesForScene.mockResolvedValue(mockStatsWrites);
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
      await authenticated(saveActivity)(
        reqFor(saveActivity, {
          body: {
            sceneId: "123",
            instanceId: "test-instance",
            resumeTime: 60,
            playDuration: 10,
          },
          user: undefined,
        }),
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
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
          body: {
            sceneId: "123",
            instanceId: "test-instance",
            resumeTime: 60,
            playDuration: 10,
          },
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
          body: {
            sceneId: "123",
            instanceId: "test-instance",
            resumeTime: 120,
            playDuration: 10,
          },
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
          body: {
            sceneId: "123",
            instanceId: "test-instance",
            resumeTime: 60,
            playDuration: 0,
          },
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
          body: { sceneId: "123", instanceId: "test-instance", resumeTime: 60 },
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
      await authenticated(incrementPlayCount)(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123", instanceId: "test-instance" },
          user: undefined,
        }),
        res,
        vi.fn()
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
          body: { sceneId: "123", instanceId: "test-instance" },
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
          body: { sceneId: "123", instanceId: "test-instance" },
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
          body: { sceneId: "123", instanceId: "test-instance" },
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

    it("the play's stats run inside its transaction, after the history write, and bump the write generation once it commits", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 1, syncToStash: false })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({ id: 1, playCount: 1, playHistory: [] })
      );
      mockPrisma.watchHistory.update.mockResolvedValue(
        partialRow({ id: 1, playCount: 2 })
      );

      await incrementPlayCount(
        reqFor(incrementPlayCount, {
          body: { sceneId: "123", instanceId: "test-instance" },
          user: testUser({ id: 1 }),
        }),
        resFor(incrementPlayCount)
      );

      expect(mockStats.statsWritesForScene).toHaveBeenCalledWith(
        1,
        "123",
        "test-instance",
        { oCount: 0, playCount: 1, lastPlayedAt: anyOf(Date) }
      );
      // The transaction's client (the mock runs the callback on itself)
      expect(mockStatsWrites).toHaveBeenCalledWith(mockPrisma);
      const updated = must(
        mockPrisma.watchHistory.update.mock.invocationCallOrder[0]
      );
      const wrote = must(mockStatsWrites.mock.invocationCallOrder[0]);
      const bumped = must(
        mockStats.bumpWriteGeneration.mock.invocationCallOrder[0]
      );
      expect(wrote).toBeGreaterThan(updated);
      expect(bumped).toBeGreaterThan(wrote);
      expect(mockStats.bumpWriteGeneration).toHaveBeenCalledWith(1);
    });

    it("a failed stats write fails the play: nothing answers and nothing bumps", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 1, syncToStash: false })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({ id: 1, playCount: 1 })
      );
      mockStatsWrites.mockRejectedValue(new Error("stats refused"));

      const res = resFor(incrementPlayCount);
      await expect(
        incrementPlayCount(
          reqFor(incrementPlayCount, {
            body: { sceneId: "123", instanceId: "test-instance" },
            user: testUser({ id: 1 }),
          }),
          res
        )
      ).rejects.toThrow("stats refused");
      expect(res.json).not.toHaveBeenCalled();
      expect(mockStats.bumpWriteGeneration).not.toHaveBeenCalled();
    });

    describe("play token", () => {
      /** The play row as the database holds it after `playCount` plays */
      function playRow(playCount: number) {
        return partialRow<WatchHistory>({
          id: 1,
          playCount,
          playDuration: 0,
          resumeTime: 0,
          lastPlayedAt: new Date(),
          playHistory: [],
        });
      }

      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({ id: 1, syncToStash: false })
        );
        mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
        mockPrisma.watchHistory.create.mockResolvedValue(playRow(1));
      });

      /** One press of the play count, as user `userId` */
      async function press(
        playToken: string | undefined,
        userId = 1,
        sceneId = "123"
      ) {
        const res = resFor(incrementPlayCount);
        await incrementPlayCount(
          reqFor(incrementPlayCount, {
            body:
              playToken === undefined
                ? { sceneId, instanceId: "test-instance" }
                : { sceneId, instanceId: "test-instance", playToken },
            user: testUser({ id: userId }),
          }),
          res
        );
        return res;
      }

      it("a second increment with the same playToken within 10 minutes adds no play", async () => {
        await press("token-same");
        mockPrisma.watchHistory.findUnique.mockResolvedValue(playRow(1));
        mockPrisma.watchHistory.create.mockClear();
        mockPrisma.watchHistory.update.mockClear();

        const res = await press("token-same");

        expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
        expect(mockStats.statsWritesForScene).toHaveBeenCalledTimes(1);
        // The repeat answers the row as it stands
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            watchHistory: objectContaining({ playCount: 1 }),
          })
        );
      });

      it("a different token adds one", async () => {
        await press("token-one");
        mockPrisma.watchHistory.findUnique.mockResolvedValue(
          partialRow({ id: 1, playCount: 1, playHistory: [] })
        );
        mockPrisma.watchHistory.update.mockResolvedValue(playRow(2));

        await press("token-two");

        expect(mockPrisma.watchHistory.update).toHaveBeenCalledTimes(1);
      });

      it("a request without a token still counts, every time", async () => {
        await press(undefined);
        mockPrisma.watchHistory.findUnique.mockResolvedValue(
          partialRow({ id: 1, playCount: 1, playHistory: [] })
        );
        mockPrisma.watchHistory.update.mockResolvedValue(playRow(2));
        await press(undefined);

        expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(1);
        expect(mockPrisma.watchHistory.update).toHaveBeenCalledTimes(1);
      });

      it("two increments with the same token sent together add one play", async () => {
        const [first, second] = await Promise.all([
          press("token-together"),
          press("token-together"),
        ]);

        expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(1);
        expect(mockStats.statsWritesForScene).toHaveBeenCalledTimes(1);
        expect(first.json).toHaveBeenCalledWith(
          expect.objectContaining({ success: true })
        );
        expect(second.json).toHaveBeenCalledWith(
          expect.objectContaining({ success: true })
        );
      });

      it("a token is the user's and the scene's: another user or scene with it still counts", async () => {
        await press("token-shared");
        mockPrisma.watchHistory.create.mockClear();

        await press("token-shared", 2);
        await press("token-shared", 1, "456");

        expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(2);
      });

      it("a failed write releases the token, so the retry counts", async () => {
        mockStatsWrites.mockRejectedValueOnce(new Error("stats refused"));
        await expect(press("token-failed")).rejects.toThrow("stats refused");
        mockPrisma.watchHistory.create.mockClear();

        await press("token-failed");

        expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(1);
      });

      it("a token counts again after 10 minutes", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          await press("token-expiring");
          mockPrisma.watchHistory.create.mockClear();

          vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
          await press("token-expiring");

          expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it("keeps at most 5,000 tokens: the oldest is forgotten first", async () => {
        await press("token-oldest");
        for (let i = 0; i < 5000; i++) await press(`token-fill-${i}`);
        mockPrisma.watchHistory.create.mockClear();

        await press("token-oldest");
        expect(mockPrisma.watchHistory.create).toHaveBeenCalledTimes(1);

        mockPrisma.watchHistory.create.mockClear();
        await press("token-fill-4999");
        expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      });

      it.each([
        ["longer than 64 characters", "x".repeat(65)],
        ["empty", ""],
        ["not a string", 42],
      ])("a token %s is a 400 and writes nothing", async (_name, token) => {
        const res = resFor(incrementPlayCount);
        await incrementPlayCount(
          reqFor(incrementPlayCount, {
            body: malformed({
              sceneId: "123",
              instanceId: "test-instance",
              playToken: token,
            }),
            user: testUser({ id: 1 }),
          }),
          res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      });

      it("a token of 64 characters is accepted", async () => {
        const res = await press("y".repeat(64));

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ success: true })
        );
      });
    });
  });

  // ============================================================================
  // incrementOCounter Tests
  // ============================================================================

  describe("incrementOCounter", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(incrementOCounter);
      await authenticated(incrementOCounter)(
        reqFor(incrementOCounter, {
          body: { sceneId: "123", instanceId: "test-instance" },
          user: undefined,
        }),
        res,
        vi.fn()
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

    it("returns 400 and writes nothing when the request has no instance", async () => {
      const res = resFor(incrementOCounter);
      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: malformed({ sceneId: "123" }),
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing required field: instanceId",
      });
      expect(mockResolve).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
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
          body: { sceneId: "123", instanceId: "test-instance" },
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
      expect(mockStats.statsWritesForScene).toHaveBeenCalledWith(
        1,
        "123",
        "test-instance",
        { oCount: 1, playCount: 0, lastOAt: anyOf(Date) }
      );
      expect(mockStatsWrites).toHaveBeenCalledTimes(1);
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
          body: { sceneId: "123", instanceId: "test-instance" },
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
      expect(mockStatsWrites).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, oCount: 4 })
      );
    });

    it("the O's stats run inside its transaction, after the history write, and bump the write generation once it commits", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 1, syncToStash: false })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({ id: 1, oCount: 1 })
      );

      await incrementOCounter(
        reqFor(incrementOCounter, {
          body: { sceneId: "123", instanceId: "test-instance" },
          user: testUser({ id: 1 }),
        }),
        resFor(incrementOCounter)
      );

      // The transaction's client (the mock runs the callback on itself)
      expect(mockStatsWrites).toHaveBeenCalledWith(mockPrisma);
      const created = must(
        mockPrisma.watchHistory.create.mock.invocationCallOrder[0]
      );
      const wrote = must(mockStatsWrites.mock.invocationCallOrder[0]);
      const bumped = must(
        mockStats.bumpWriteGeneration.mock.invocationCallOrder[0]
      );
      expect(wrote).toBeGreaterThan(created);
      expect(bumped).toBeGreaterThan(wrote);
      expect(mockStats.bumpWriteGeneration).toHaveBeenCalledWith(1);
    });

    it("a failed stats write fails the O: nothing answers and nothing bumps", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        partialRow({ id: 1, syncToStash: false })
      );
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue(
        partialRow({ id: 1, oCount: 1 })
      );
      mockStatsWrites.mockRejectedValue(new Error("stats refused"));

      const res = resFor(incrementOCounter);
      await expect(
        incrementOCounter(
          reqFor(incrementOCounter, {
            body: { sceneId: "123", instanceId: "test-instance" },
            user: testUser({ id: 1 }),
          }),
          res
        )
      ).rejects.toThrow("stats refused");
      expect(res.json).not.toHaveBeenCalled();
      expect(mockStats.bumpWriteGeneration).not.toHaveBeenCalled();
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
      await authenticated(getWatchHistory)(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          user: undefined,
        }),
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("answers 400 without an instanceId", async () => {
      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.watchHistory.findUnique).not.toHaveBeenCalled();
    });

    it("answers 400 for a malformed instanceId", async () => {
      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          query: { instanceId: "a:b" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.watchHistory.findUnique).not.toHaveBeenCalled();
    });

    it("reads the row of the requested instance", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          query: { instanceId: "inst-b" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(mockPrisma.watchHistory.findUnique).toHaveBeenCalledWith({
        where: {
          userId_instanceId_sceneId: {
            userId: 1,
            instanceId: "inst-b",
            sceneId: "123",
          },
        },
      });
    });

    it("should return exists:false when no watch history found", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          query: { instanceId: "inst-a" },
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
          query: { instanceId: "inst-a" },
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

    it("reads histories stored as JSON-encoded strings", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 1,
          oCount: 2,
          oHistory: JSON.stringify([
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T01:00:00.000Z",
          ]),
          playHistory: JSON.stringify(["2024-01-01T00:00:00.000Z"]),
        })
      );

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          query: { instanceId: "inst-a" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      const body = res._getOkBody();
      expect(body.oHistory).toEqual([
        "2024-01-01T00:00:00.000Z",
        "2024-01-01T01:00:00.000Z",
      ]);
      expect(body.playHistory).toEqual(["2024-01-01T00:00:00.000Z"]);
    });

    it("reads a malformed history as an empty list", async () => {
      mockPrisma.watchHistory.findUnique.mockResolvedValue(
        partialRow({
          id: 1,
          playCount: 1,
          oCount: 2,
          oHistory: "not json",
          playHistory: "not json",
        })
      );

      const res = resFor(getWatchHistory);
      await getWatchHistory(
        reqFor(getWatchHistory, {
          params: { sceneId: "123" },
          query: { instanceId: "inst-a" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      expect(res.status).not.toHaveBeenCalled();
      const body = res._getOkBody();
      expect(body.oHistory).toEqual([]);
      expect(body.playHistory).toEqual([]);
    });
  });

  // ============================================================================
  // clearAllWatchHistory Tests
  // ============================================================================

  describe("clearAllWatchHistory", () => {
    it("should return 401 if user is not authenticated", async () => {
      const res = resFor(clearAllWatchHistory);
      await authenticated(clearAllWatchHistory)(
        reqFor(clearAllWatchHistory, {
          user: undefined,
        }),
        res,
        vi.fn()
      );

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("a database failure reaches the error handler", async () => {
      mockPrisma.watchHistory.deleteMany.mockRejectedValue(
        new Error("DB down")
      );

      const res = resFor(clearAllWatchHistory);
      await expect(
        clearAllWatchHistory(
          reqFor(clearAllWatchHistory, { user: testUser({ id: 1 }) }),
          res
        )
      ).rejects.toThrow("DB down");

      expect(res.json).not.toHaveBeenCalled();
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
      // The five deletes are one writer-queue unit
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = must(mockPrisma.$transaction.mock.calls[0])[0];
      expect(Array.isArray(ops) && ops.length).toBe(5);

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

    it("calls forget after the batch: the rankings recompute and Recommended rescores at once", async () => {
      for (const table of [
        mockPrisma.watchHistory,
        mockPrisma.userPerformerStats,
        mockPrisma.userStudioStats,
        mockPrisma.userTagStats,
        mockPrisma.userEntityRanking,
      ]) {
        table.deleteMany.mockResolvedValue({ count: 1 });
      }
      const res = resFor(clearAllWatchHistory);
      await clearAllWatchHistory(
        reqFor(clearAllWatchHistory, {
          user: testUser({ id: 1 }),
        }),
        res
      );

      const rankings = vi.mocked(rankingComputeService, true);
      const recommendations = vi.mocked(recommendationService, true);
      expect(rankings.forget).toHaveBeenCalledTimes(1);
      expect(rankings.forget).toHaveBeenCalledWith(1);
      expect(recommendations.forget).toHaveBeenCalledTimes(1);
      expect(recommendations.forget).toHaveBeenCalledWith(1);
      // A stats rebuild that read the history before the clear reads again
      expect(mockStats.bumpWriteGeneration).toHaveBeenCalledWith(1);
      // Once the batch commits (inside its unit, rankingForgetOrder.test.ts):
      // a recompute started before it read the old history
      const batch = must(mockPrisma.$transaction.mock.invocationCallOrder[0]);
      expect(must(rankings.forget.mock.invocationCallOrder[0])).toBeGreaterThan(
        batch
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

    it.each(writes.filter(([name]) => name !== "incrementOCounter"))(
      "%s answers 400 without an instance and writes nothing",
      async (_name, handler, extra) => {
        const res = resFor(handler);
        await handler(
          reqFor(handler, {
            body: { sceneId: "123", ...extra },
            user: testUser({ id: 1 }),
          }),
          res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: "Missing required field: instanceId",
        });
        expect(mockResolve).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
        expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
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
          body: {
            sceneId: "123",
            instanceId: "test-instance",
            resumeTime: 60,
            playDuration: 10,
          },
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
          body: { sceneId: "123", instanceId: "test-instance" },
          user: testUser({ id: 1 }),
        }),
        res
      );

      // The play history append needs the row read in the same transaction,
      // which an upsert can't give it
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        DB_WRITE_TX
      );
      expect(mockPrisma.watchHistory.create).toHaveBeenCalled();
      expect(mockPrisma.watchHistory.upsert).not.toHaveBeenCalled();
    });
  });
});

describe("legacy watch-history routes", () => {
  it("POST /api/watch-history/ping and GET /api/watch-history answer 404", async () => {
    const { default: router } = await import("../../routes/watchHistory.js");

    expect(() => findHandler(router, "post", "/ping")).toThrow(
      "No POST /ping route"
    );
    expect(() => findHandler(router, "get", "/")).toThrow("No GET / route");
    // The routes that replace them stay
    expect(() => findHandler(router, "post", "/save-activity")).not.toThrow();
    expect(() => findHandler(router, "get", "/scenes")).not.toThrow();
  });
});
