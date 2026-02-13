/**
 * Unit Tests for UserStatsService - Multi-Instance Focus
 *
 * Tests that stats are correctly separated by instanceId, which is the core
 * fix in 3.3.2. Covers:
 * - updateStatsForScene resolving instanceId correctly
 * - rebuildAllStatsForUser separating stats by instance
 * - Composite key behavior (performerId + instanceId)
 * - Edge cases: missing instanceId, empty string fallback
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoist mock functions so they can be referenced in vi.mock factories
const { mockGetScene, mockGetScenesByIdsWithRelations } = vi.hoisted(() => ({
  mockGetScene: vi.fn(),
  mockGetScenesByIdsWithRelations: vi.fn(),
}));

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    userPerformerStats: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    userStudioStats: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    userTagStats: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    watchHistory: {
      findMany: vi.fn(),
    },
    stashScene: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScene: mockGetScene,
    getScenesByIdsWithRelations: mockGetScenesByIdsWithRelations,
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

import prisma from "../../prisma/singleton.js";
import { userStatsService } from "../../services/UserStatsService.js";

const mockPrisma = vi.mocked(prisma);

describe("UserStatsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateStatsForScene", () => {
    it("uses provided instanceId for stats upsert", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: { id: "studio-1", name: "Studio A" },
        tags: [{ id: "tag-1", name: "Tag A" }],
      });

      await userStatsService.updateStatsForScene(
        1, "scene-1", 1, 1, new Date(), new Date(), "instance-aaa"
      );

      // Performer stats should use the provided instanceId
      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_performerId: {
              userId: 1,
              instanceId: "instance-aaa",
              performerId: "perf-1",
            },
          },
          create: expect.objectContaining({
            instanceId: "instance-aaa",
          }),
        })
      );

      // Studio stats
      expect(mockPrisma.userStudioStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_studioId: {
              userId: 1,
              instanceId: "instance-aaa",
              studioId: "studio-1",
            },
          },
        })
      );

      // Tag stats
      expect(mockPrisma.userTagStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_tagId: {
              userId: 1,
              instanceId: "instance-aaa",
              tagId: "tag-1",
            },
          },
        })
      );
    });

    it("resolves instanceId from DB when not provided", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: null,
        tags: [],
      });
      mockPrisma.stashScene.findFirst.mockResolvedValue({
        stashInstanceId: "resolved-instance",
      } as any);

      await userStatsService.updateStatsForScene(
        1, "scene-1", 0, 1
        // No instanceId provided
      );

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_performerId: {
              userId: 1,
              instanceId: "resolved-instance",
              performerId: "perf-1",
            },
          },
        })
      );
    });

    it("uses empty string when instanceId cannot be resolved", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: null,
        tags: [],
      });
      mockPrisma.stashScene.findFirst.mockResolvedValue(null);

      await userStatsService.updateStatsForScene(
        1, "scene-1", 0, 1
      );

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_instanceId_performerId: {
              userId: 1,
              instanceId: "",
              performerId: "perf-1",
            },
          },
        })
      );
    });

    it("silently returns when scene not found in cache", async () => {
      mockGetScene.mockResolvedValue(null);

      await userStatsService.updateStatsForScene(1, "nonexistent", 0, 1);

      expect(mockPrisma.userPerformerStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userTagStats.upsert).not.toHaveBeenCalled();
    });

    it("updates all performers in a multi-performer scene", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [
          { id: "perf-1", name: "Jane" },
          { id: "perf-2", name: "John" },
          { id: "perf-3", name: "Alex" },
        ],
        studio: null,
        tags: [],
      });

      await userStatsService.updateStatsForScene(
        1, "scene-1", 1, 1, undefined, undefined, "inst-a"
      );

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledTimes(3);
    });

    it("updates all tags in a multi-tag scene", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [],
        studio: null,
        tags: [
          { id: "tag-1", name: "Tag A" },
          { id: "tag-2", name: "Tag B" },
        ],
      });

      await userStatsService.updateStatsForScene(
        1, "scene-1", 0, 1, undefined, undefined, "inst-a"
      );

      expect(mockPrisma.userTagStats.upsert).toHaveBeenCalledTimes(2);
    });

    it("does not call studio upsert when scene has no studio", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [],
        studio: null,
        tags: [],
      });

      await userStatsService.updateStatsForScene(
        1, "scene-1", 0, 1, undefined, undefined, "inst-a"
      );

      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
    });

    it("handles errors gracefully without throwing", async () => {
      mockGetScene.mockRejectedValue(new Error("DB error"));

      // Should not throw
      await expect(
        userStatsService.updateStatsForScene(1, "scene-1", 0, 1)
      ).resolves.toBeUndefined();
    });
  });

  describe("rebuildAllStatsForUser", () => {
    beforeEach(() => {
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.userTagStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.userPerformerStats.createMany.mockResolvedValue({} as any);
      mockPrisma.userStudioStats.createMany.mockResolvedValue({} as any);
      mockPrisma.userTagStats.createMany.mockResolvedValue({} as any);
    });

    it("clears existing stats before rebuilding", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);
      mockGetScenesByIdsWithRelations.mockResolvedValue([]);

      await userStatsService.rebuildAllStatsForUser(1);

      expect(mockPrisma.userPerformerStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userStudioStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(mockPrisma.userTagStats.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
    });

    it("separates stats by instanceId from watch history", async () => {
      // Two watch history entries from different instances for the same performer
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 2,
          playCount: 3,
          oHistory: "[]",
          playHistory: "[]",
        },
        {
          sceneId: "scene-2",
          instanceId: "instance-b",
          oCount: 1,
          playCount: 1,
          oHistory: "[]",
          playHistory: "[]",
        },
      ] as any);

      // Both scenes have the same performer (same ID, different instances)
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
        {
          id: "scene-2",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      // Performer stats should have TWO entries (one per instance)
      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      const performerData = performerCall.data as any[];
      expect(performerData).toHaveLength(2);

      // Find the entries for each instance
      const instanceAStats = performerData.find(
        (d: any) => d.instanceId === "instance-a"
      );
      const instanceBStats = performerData.find(
        (d: any) => d.instanceId === "instance-b"
      );

      expect(instanceAStats).toBeDefined();
      expect(instanceAStats.performerId).toBe("perf-1");
      expect(instanceAStats.oCounter).toBe(2);
      expect(instanceAStats.playCount).toBe(3);

      expect(instanceBStats).toBeDefined();
      expect(instanceBStats.performerId).toBe("perf-1");
      expect(instanceBStats.oCounter).toBe(1);
      expect(instanceBStats.playCount).toBe(1);
    });

    it("aggregates stats within same instance correctly", async () => {
      // Two watch entries for different scenes but same instance and performer
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 2,
          playCount: 3,
          oHistory: "[]",
          playHistory: "[]",
        },
        {
          sceneId: "scene-2",
          instanceId: "instance-a",
          oCount: 5,
          playCount: 10,
          oHistory: "[]",
          playHistory: "[]",
        },
      ] as any);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
        {
          id: "scene-2",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      const performerData = performerCall.data as any[];

      // Should aggregate into ONE entry (same performer + same instance)
      expect(performerData).toHaveLength(1);
      expect(performerData[0].performerId).toBe("perf-1");
      expect(performerData[0].instanceId).toBe("instance-a");
      expect(performerData[0].oCounter).toBe(7); // 2 + 5
      expect(performerData[0].playCount).toBe(13); // 3 + 10
    });

    it("uses empty string as instanceId when watch history has no instanceId", async () => {
      // Legacy watch history without instanceId
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: null,
          oCount: 1,
          playCount: 2,
          oHistory: "[]",
          playHistory: "[]",
        },
      ] as any);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      const performerData = performerCall.data as any[];

      expect(performerData[0].instanceId).toBe("");
    });

    it("creates no stats when user has no watch history", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);
      mockGetScenesByIdsWithRelations.mockResolvedValue([]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      expect((performerCall.data as any[]).length).toBe(0);
    });

    it("tracks lastPlayedAt and lastOAt from play/o history", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 2,
          playCount: 3,
          oHistory: JSON.stringify(["2026-01-10T12:00:00Z", "2026-02-01T15:30:00Z"]),
          playHistory: JSON.stringify(["2026-01-10T12:00:00Z", "2026-01-20T08:00:00Z", "2026-02-05T20:00:00Z"]),
        },
      ] as any);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      const performerData = performerCall.data as any[];

      // lastPlayedAt should be the last entry in playHistory
      expect(performerData[0].lastPlayedAt).toEqual(new Date("2026-02-05T20:00:00Z"));
      // lastOAt should be the last entry in oHistory
      expect(performerData[0].lastOAt).toEqual(new Date("2026-02-01T15:30:00Z"));
    });

    it("handles watch history with oHistory/playHistory as arrays (already parsed)", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 1,
          playCount: 1,
          oHistory: ["2026-01-10T12:00:00Z"], // Already an array
          playHistory: ["2026-01-10T12:00:00Z"],
        },
      ] as any);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      // Should not throw
      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      expect((performerCall.data as any[]).length).toBe(1);
    });

    it("skips scenes not found in cache", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 1,
          playCount: 1,
          oHistory: "[]",
          playHistory: "[]",
        },
        {
          sceneId: "scene-deleted",
          instanceId: "inst-a",
          oCount: 5,
          playCount: 10,
          oHistory: "[]",
          playHistory: "[]",
        },
      ] as any);

      // Only scene-1 found in cache, scene-deleted is missing
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall = mockPrisma.userPerformerStats.createMany.mock.calls[0][0];
      const performerData = performerCall.data as any[];

      // Only scene-1's stats should be included
      expect(performerData).toHaveLength(1);
      expect(performerData[0].oCounter).toBe(1);
      expect(performerData[0].playCount).toBe(1);
    });

    it("builds separate studio stats per instance", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        {
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 1,
          playCount: 2,
          oHistory: "[]",
          playHistory: "[]",
        },
        {
          sceneId: "scene-2",
          instanceId: "instance-b",
          oCount: 3,
          playCount: 4,
          oHistory: "[]",
          playHistory: "[]",
        },
      ] as any);

      // Same studio ID from different instances
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          performers: [],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
        {
          id: "scene-2",
          performers: [],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const studioCall = mockPrisma.userStudioStats.createMany.mock.calls[0][0];
      const studioData = studioCall.data as any[];

      // Should be TWO entries (same studio ID but different instances)
      expect(studioData).toHaveLength(2);

      const instAStudio = studioData.find((d: any) => d.instanceId === "instance-a");
      const instBStudio = studioData.find((d: any) => d.instanceId === "instance-b");

      expect(instAStudio.studioId).toBe("studio-1");
      expect(instAStudio.oCounter).toBe(1);
      expect(instBStudio.studioId).toBe("studio-1");
      expect(instBStudio.oCounter).toBe(3);
    });
  });

  describe("rebuildAllStats", () => {
    it("rebuilds stats for all users", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ] as any);

      // Mock the rebuild for each user
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.userTagStats.deleteMany.mockResolvedValue({} as any);
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);
      mockGetScenesByIdsWithRelations.mockResolvedValue([]);
      mockPrisma.userPerformerStats.createMany.mockResolvedValue({} as any);
      mockPrisma.userStudioStats.createMany.mockResolvedValue({} as any);
      mockPrisma.userTagStats.createMany.mockResolvedValue({} as any);

      await userStatsService.rebuildAllStats();

      // deleteMany should be called twice per stat type (once per user)
      expect(mockPrisma.userPerformerStats.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userStudioStats.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userTagStats.deleteMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("getPerformerStats", () => {
    it("returns Map of performer stats for a user", async () => {
      mockPrisma.userPerformerStats.findMany.mockResolvedValue([
        {
          performerId: "perf-1",
          instanceId: "inst-a",
          oCounter: 5,
          playCount: 10,
          lastPlayedAt: new Date("2026-02-01"),
          lastOAt: new Date("2026-01-15"),
        },
        {
          performerId: "perf-2",
          instanceId: "inst-a",
          oCounter: 0,
          playCount: 3,
          lastPlayedAt: new Date("2026-01-20"),
          lastOAt: null,
        },
      ] as any);

      const result = await userStatsService.getPerformerStats(1);

      expect(result.size).toBe(2);
      expect(result.get("perf-1\0inst-a")).toEqual({
        oCounter: 5,
        playCount: 10,
        lastPlayedAt: expect.any(String),
        lastOAt: expect.any(String),
      });
      expect(result.get("perf-2\0inst-a")?.lastOAt).toBeNull();
    });

    it("returns separate stats for same performerId across different instances", async () => {
      mockPrisma.userPerformerStats.findMany.mockResolvedValue([
        { performerId: "2", instanceId: "instance-aaa", oCounter: 5, playCount: 10, lastPlayedAt: null, lastOAt: null },
        { performerId: "2", instanceId: "instance-bbb", oCounter: 3, playCount: 7, lastPlayedAt: null, lastOAt: null },
      ]);

      const stats = await userStatsService.getPerformerStats(1);

      expect(stats.size).toBe(2);
      expect(stats.get("2\0instance-aaa")).toEqual(
        expect.objectContaining({ oCounter: 5, playCount: 10 })
      );
      expect(stats.get("2\0instance-bbb")).toEqual(
        expect.objectContaining({ oCounter: 3, playCount: 7 })
      );
    });
  });

  describe("getStudioStats", () => {
    it("returns Map of studio stats for a user", async () => {
      mockPrisma.userStudioStats.findMany.mockResolvedValue([
        { studioId: "studio-1", instanceId: "inst-a", oCounter: 2, playCount: 5 },
      ] as any);

      const result = await userStatsService.getStudioStats(1);

      expect(result.size).toBe(1);
      expect(result.get("studio-1\0inst-a")).toEqual({
        oCounter: 2,
        playCount: 5,
      });
    });

    it("returns separate stats for same studioId across different instances", async () => {
      mockPrisma.userStudioStats.findMany.mockResolvedValue([
        { studioId: "5", instanceId: "inst-a", oCounter: 10, playCount: 20 },
        { studioId: "5", instanceId: "inst-b", oCounter: 1, playCount: 2 },
      ]);

      const stats = await userStatsService.getStudioStats(1);

      expect(stats.size).toBe(2);
      expect(stats.get("5\0inst-a")).toEqual({ oCounter: 10, playCount: 20 });
      expect(stats.get("5\0inst-b")).toEqual({ oCounter: 1, playCount: 2 });
    });
  });

  describe("getTagStats", () => {
    it("returns Map of tag stats for a user", async () => {
      mockPrisma.userTagStats.findMany.mockResolvedValue([
        { tagId: "tag-1", instanceId: "inst-a", oCounter: 3, playCount: 7 },
        { tagId: "tag-2", instanceId: "inst-a", oCounter: 0, playCount: 1 },
      ] as any);

      const result = await userStatsService.getTagStats(1);

      expect(result.size).toBe(2);
      expect(result.get("tag-1\0inst-a")).toEqual({ oCounter: 3, playCount: 7 });
    });

    it("returns separate stats for same tagId across different instances", async () => {
      mockPrisma.userTagStats.findMany.mockResolvedValue([
        { tagId: "3", instanceId: "inst-x", oCounter: 8, playCount: 15 },
        { tagId: "3", instanceId: "inst-y", oCounter: 2, playCount: 4 },
      ]);

      const stats = await userStatsService.getTagStats(1);

      expect(stats.size).toBe(2);
      expect(stats.get("3\0inst-x")).toEqual({ oCounter: 8, playCount: 15 });
      expect(stats.get("3\0inst-y")).toEqual({ oCounter: 2, playCount: 4 });
    });
  });
});
