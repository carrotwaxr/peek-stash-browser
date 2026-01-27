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
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.js";

// Mock Prisma - hoisted to top level
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    watchHistory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    stashScene: {
      findFirst: vi.fn().mockResolvedValue({
        duration: 600,
        stashInstanceId: "test-instance",
      }),
    },
    userPerformerStats: {
      deleteMany: vi.fn(),
    },
    userStudioStats: {
      deleteMany: vi.fn(),
    },
    userTagStats: {
      deleteMany: vi.fn(),
    },
    userEntityRanking: {
      deleteMany: vi.fn(),
    },
  },
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefault: vi.fn(() => ({
      findScenes: vi.fn().mockResolvedValue({
        findScenes: { scenes: [{ files: [{ duration: 600 }] }] },
      }),
      sceneSaveActivity: vi.fn().mockResolvedValue({}),
      sceneAddPlay: vi.fn().mockResolvedValue({ sceneAddPlay: { count: 1, history: [] } }),
      sceneIncrementO: vi.fn().mockResolvedValue({ sceneIncrementO: 1 }),
    })),
    getAllConfigs: vi.fn(() => [{ id: "test-instance", name: "Test", priority: 0 }]),
  },
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

// Import after mocks are set up
import {
  saveActivity,
  incrementPlayCount,
  incrementOCounter,
  getWatchHistory,
  getAllWatchHistory,
  clearAllWatchHistory,
} from "../../controllers/watchHistory.js";
import prisma from "../../prisma/singleton.js";

// Get mocked functions
const mockPrisma = vi.mocked(prisma);

describe("Watch History Controller", () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let responseJson: ReturnType<typeof vi.fn>;
  let responseStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    responseJson = vi.fn();
    responseStatus = vi.fn(() => ({ json: responseJson }));

    mockResponse = {
      json: responseJson,
      status: responseStatus,
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // saveActivity Tests
  // ============================================================================

  describe("saveActivity", () => {
    it("should return 401 if user is not authenticated", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
        user: undefined,
      };

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: "User not found" });
    });

    it("should return 400 if sceneId is missing", async () => {
      mockRequest = {
        body: { resumeTime: 60, playDuration: 10 },
        user: { id: 1 },
      };

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({ error: "Missing required field: sceneId" });
    });

    it("should create new watch history record if none exists (upsert)", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_instanceId_sceneId: { userId: 1, instanceId: "test-instance", sceneId: "123" } },
          create: expect.objectContaining({
            userId: 1,
            instanceId: "test-instance",
            sceneId: "123",
            playDuration: 10,
            resumeTime: 60,
          }),
          update: expect.objectContaining({
            resumeTime: 60,
            playDuration: { increment: 10 },
          }),
        })
      );

      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          watchHistory: expect.objectContaining({
            playDuration: 10,
            resumeTime: 60,
          }),
        })
      );
    });

    it("should update existing record with incremented playDuration", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 120, playDuration: 10 },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalled();
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it("should handle zero playDuration gracefully", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 60, playDuration: 0 },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it("should handle null/undefined playDuration", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 60 },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
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
      mockRequest = {
        body: { sceneId: "123" },
        user: undefined,
      };

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it("should return 400 if sceneId is missing", async () => {
      mockRequest = {
        body: {},
        user: { id: 1 },
      };

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should create new record with playCount=1 if none exists", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            playCount: 1,
          }),
        })
      );

      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          watchHistory: expect.objectContaining({
            playCount: 1,
          }),
        })
      );
    });

    it("should increment existing playCount using atomic increment", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue({
        id: 1,
        userId: 1,
        sceneId: "123",
        playCount: 5,
        playHistory: ["2024-01-01T00:00:00.000Z"],
      } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
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
      } as never);

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            playCount: { increment: 1 },
          }),
        })
      );
    });

    it("should add timestamp to playHistory", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      const existingHistory = ["2024-01-01T00:00:00.000Z"];
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue({
        id: 1,
        playHistory: existingHistory,
      } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
        id: 1,
        playCount: 2,
        playDuration: 0,
        resumeTime: 0,
        lastPlayedAt: new Date(),
        oCount: 0,
        oHistory: [],
        playHistory: [],
      } as never);

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            playHistory: expect.stringContaining("2024-01-01T00:00:00.000Z"),
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
      mockRequest = {
        body: { sceneId: "123" },
        user: undefined,
      };

      await incrementOCounter(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it("should return 400 if sceneId is missing", async () => {
      mockRequest = {
        body: {},
        user: { id: 1 },
      };

      await incrementOCounter(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should create new record with oCount=1 if none exists", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);
      mockPrisma.watchHistory.create.mockResolvedValue({
        id: 1,
        oCount: 1,
        oHistory: [new Date().toISOString()],
      } as never);

      await incrementOCounter(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oCount: 1,
          }),
        })
      );

      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          oCount: 1,
        })
      );
    });

    it("should increment existing oCount", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue({
        id: 1,
        oCount: 3,
        oHistory: ["2024-01-01T00:00:00.000Z"],
      } as never);
      mockPrisma.watchHistory.update.mockResolvedValue({
        id: 1,
        oCount: 4,
        oHistory: ["2024-01-01T00:00:00.000Z", new Date().toISOString()],
      } as never);

      await incrementOCounter(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oCount: 4,
          }),
        })
      );
    });
  });

  // ============================================================================
  // getWatchHistory Tests
  // ============================================================================

  describe("getWatchHistory", () => {
    it("should return 400 if sceneId is missing", async () => {
      mockRequest = {
        params: {},
        user: { id: 1 },
      };

      await getWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(400);
    });

    it("should return 401 if user is not authenticated", async () => {
      mockRequest = {
        params: { sceneId: "123" },
        user: undefined,
      };

      await getWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it("should return exists:false when no watch history found", async () => {
      mockRequest = {
        params: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.watchHistory.findUnique.mockResolvedValue(null);

      await getWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseJson).toHaveBeenCalledWith({
        exists: false,
        resumeTime: null,
        playCount: 0,
        oCount: 0,
      });
    });

    it("should return full watch history when record exists", async () => {
      mockRequest = {
        params: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.watchHistory.findUnique.mockResolvedValue({
        id: 1,
        resumeTime: 120,
        playCount: 5,
        playDuration: 300,
        lastPlayedAt: new Date("2024-01-01"),
        oCount: 2,
        oHistory: ["2024-01-01T00:00:00.000Z", "2024-01-01T01:00:00.000Z"],
        playHistory: ["2024-01-01T00:00:00.000Z"],
      } as never);

      await getWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseJson).toHaveBeenCalledWith(
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
      mockRequest = {
        query: {},
        user: undefined,
      };

      await getAllWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it("should return all watch history for user", async () => {
      mockRequest = {
        query: { limit: "20" },
        user: { id: 1 },
      };

      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          id: 1,
          sceneId: "123",
          resumeTime: 60,
          playCount: 1,
          oHistory: [],
          playHistory: [],
        },
        {
          id: 2,
          sceneId: "456",
          resumeTime: 120,
          playCount: 2,
          oHistory: [],
          playHistory: [],
        },
      ] as never);

      await getAllWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          orderBy: { lastPlayedAt: "desc" },
          take: 20,
        })
      );

      expect(responseJson).toHaveBeenCalledWith({
        watchHistory: expect.arrayContaining([
          expect.objectContaining({ sceneId: "123" }),
          expect.objectContaining({ sceneId: "456" }),
        ]),
      });
    });

    it("should filter by inProgress when requested", async () => {
      mockRequest = {
        query: { limit: "20", inProgress: "true" },
        user: { id: 1 },
      };

      mockPrisma.watchHistory.findMany.mockResolvedValue([] as never);

      await getAllWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

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
      mockRequest = {
        user: undefined,
      };

      await clearAllWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

      expect(responseStatus).toHaveBeenCalledWith(401);
    });

    it("should delete all watch history and stats for user", async () => {
      mockRequest = {
        user: { id: 1 },
      };

      mockPrisma.watchHistory.deleteMany.mockResolvedValue({ count: 10 } as never);
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue({ count: 5 } as never);
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue({ count: 3 } as never);
      mockPrisma.userTagStats.deleteMany.mockResolvedValue({ count: 15 } as never);
      mockPrisma.userEntityRanking.deleteMany.mockResolvedValue({ count: 20 } as never);

      await clearAllWatchHistory(mockRequest as AuthenticatedRequest, mockResponse as Response);

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

      expect(responseJson).toHaveBeenCalledWith(
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
  // Race Condition Tests (upsert behavior)
  // ============================================================================

  describe("Race Condition Prevention (upsert)", () => {
    it("saveActivity should use upsert to handle concurrent calls", async () => {
      mockRequest = {
        body: { sceneId: "123", resumeTime: 60, playDuration: 10 },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.upsert.mockResolvedValue({
        id: 1,
        playCount: 0,
        playDuration: 10,
        resumeTime: 60,
        lastPlayedAt: new Date(),
        oCount: 0,
        oHistory: [],
        playHistory: [],
      } as never);

      await saveActivity(mockRequest as AuthenticatedRequest, mockResponse as Response);

      // Verify upsert was called instead of findUnique + create/update
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalled();
      // saveActivity no longer uses findUnique before upsert
      expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
    });

    it("incrementPlayCount should use upsert to handle concurrent calls", async () => {
      mockRequest = {
        body: { sceneId: "123" },
        user: { id: 1 },
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, syncToStash: false } as never);
      mockPrisma.watchHistory.findUnique.mockResolvedValue(null); // For playHistory
      mockPrisma.watchHistory.upsert.mockResolvedValue({
        id: 1,
        playCount: 1,
        playDuration: 0,
        resumeTime: 0,
        lastPlayedAt: new Date(),
        oCount: 0,
        oHistory: [],
        playHistory: [],
      } as never);

      await incrementPlayCount(mockRequest as AuthenticatedRequest, mockResponse as Response);

      // Verify upsert was called
      expect(mockPrisma.watchHistory.upsert).toHaveBeenCalled();
      // findUnique is still called for playHistory, but create/update should not be
      expect(mockPrisma.watchHistory.create).not.toHaveBeenCalled();
      expect(mockPrisma.watchHistory.update).not.toHaveBeenCalled();
    });
  });
});
