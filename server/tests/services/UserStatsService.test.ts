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
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { logger } from "../../utils/logger.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Hoist mock functions so they can be referenced in vi.mock factories
const { mockGetScene, mockGetScenesByIdsWithRelations } = vi.hoisted(() => ({
  mockGetScene: vi.fn(),
  mockGetScenesByIdsWithRelations: vi.fn(),
}));

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock StashEntityService
vi.mock("../../services/StashEntityService.js", () => ({
  stashEntityService: {
    getScene: mockGetScene,
    getScenesByIdsWithRelations: mockGetScenesByIdsWithRelations,
  },
}));

// Mock StashInstanceManager (used for default instanceId fallback)
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: () => ({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
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

const mockPrisma = vi.mocked(prisma, true);

describe("UserStatsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updateStatsForScene", () => {
    it("passes instanceId to getScene when provided (#390)", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [],
        studio: null,
        tags: [],
      });

      await userStatsService.updateStatsForScene(
        1,
        "scene-1",
        0,
        1,
        new Date(),
        undefined,
        "instance-xyz"
      );

      expect(mockGetScene).toHaveBeenCalledWith("scene-1", "instance-xyz");
    });

    it("uses provided instanceId for stats upsert", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: { id: "studio-1", name: "Studio A" },
        tags: [{ id: "tag-1", name: "Tag A" }],
      });

      await userStatsService.updateStatsForScene(
        1,
        "scene-1",
        1,
        1,
        new Date(),
        new Date(),
        "instance-aaa"
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
          create: objectContaining({
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
      mockPrisma.stashScene.findFirst.mockResolvedValue(
        partialRow({
          stashInstanceId: "resolved-instance",
        })
      );

      await userStatsService.updateStatsForScene(
        1,
        "scene-1",
        0,
        1
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

      await userStatsService.updateStatsForScene(1, "scene-1", 0, 1);

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
        1,
        "scene-1",
        1,
        1,
        undefined,
        undefined,
        "inst-a"
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
        1,
        "scene-1",
        0,
        1,
        undefined,
        undefined,
        "inst-a"
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
        1,
        "scene-1",
        0,
        1,
        undefined,
        undefined,
        "inst-a"
      );

      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
    });

    it("handles errors gracefully without throwing", async () => {
      mockGetScene.mockRejectedValue(new Error("DB error"));

      // Should not throw
      await expect(
        userStatsService.updateStatsForScene(
          1,
          "scene-1",
          0,
          1,
          undefined,
          undefined,
          "inst-a"
        )
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        "Error updating stats for scene",
        expect.objectContaining({
          userId: 1,
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCountDelta: 0,
          playCountDelta: 1,
          error: "DB error",
        })
      );
    });

    it("logs a failed stats write with its entity and still makes the others", async () => {
      mockGetScene.mockResolvedValue({
        id: "scene-1",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: { id: "studio-1", name: "Studio A" },
        tags: [{ id: "tag-1", name: "Tag A" }],
      });
      mockPrisma.userStudioStats.upsert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Foreign key failed", {
          code: "P2003",
          clientVersion: "test",
        })
      );

      await expect(
        userStatsService.updateStatsForScene(
          1,
          "scene-1",
          1,
          0,
          undefined,
          new Date(),
          "inst-a"
        )
      ).resolves.toBeUndefined();

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userTagStats.upsert).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Error updating stats for scene",
        expect.objectContaining({
          userId: 1,
          sceneId: "scene-1",
          instanceId: "inst-a",
          entityType: "studio",
          entityId: "studio-1",
          oCountDelta: 1,
          playCountDelta: 0,
          code: "P2003",
        })
      );
    });
  });

  describe("rebuildAllStatsForUser", () => {
    beforeEach(() => {
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue(
        partialRow({})
      );
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue(partialRow({}));
      mockPrisma.userTagStats.deleteMany.mockResolvedValue(partialRow({}));
      mockPrisma.userPerformerStats.createMany.mockResolvedValue(
        partialRow({})
      );
      mockPrisma.userStudioStats.createMany.mockResolvedValue(partialRow({}));
      mockPrisma.userTagStats.createMany.mockResolvedValue(partialRow({}));
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
        partialRow({
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 2,
          playCount: 3,
          oHistory: "[]",
          playHistory: "[]",
        }),
        partialRow({
          sceneId: "scene-2",
          instanceId: "instance-b",
          oCount: 1,
          playCount: 1,
          oHistory: "[]",
          playHistory: "[]",
        }),
      ]);

      // Both scenes have the same performer (same ID, different instances)
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "instance-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
        {
          id: "scene-2",
          instanceId: "instance-b",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      // Performer stats should have TWO entries (one per instance)
      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      const performerData = [must(performerCall).data].flat();
      expect(performerData).toHaveLength(2);

      // Find the entries for each instance
      const instanceAStats = must(
        performerData.find((d) => d.instanceId === "instance-a")
      );
      const instanceBStats = must(
        performerData.find((d) => d.instanceId === "instance-b")
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
        partialRow({
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 2,
          playCount: 3,
          oHistory: "[]",
          playHistory: "[]",
        }),
        partialRow({
          sceneId: "scene-2",
          instanceId: "instance-a",
          oCount: 5,
          playCount: 10,
          oHistory: "[]",
          playHistory: "[]",
        }),
      ]);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "instance-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
        {
          id: "scene-2",
          instanceId: "instance-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      const performerData = [must(performerCall).data].flat();

      // Should aggregate into ONE entry (same performer + same instance)
      expect(performerData).toHaveLength(1);
      expect(must(performerData[0]).performerId).toBe("perf-1");
      expect(must(performerData[0]).instanceId).toBe("instance-a");
      expect(must(performerData[0]).oCounter).toBe(7); // 2 + 5
      expect(must(performerData[0]).playCount).toBe(13); // 3 + 10
    });

    it("creates no stats when user has no watch history", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);
      mockGetScenesByIdsWithRelations.mockResolvedValue([]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      expect([must(performerCall).data].flat().length).toBe(0);
    });

    it("tracks lastPlayedAt and lastOAt from play/o history", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 2,
          playCount: 3,
          oHistory: JSON.stringify([
            "2026-01-10T12:00:00Z",
            "2026-02-01T15:30:00Z",
          ]),
          playHistory: JSON.stringify([
            "2026-01-10T12:00:00Z",
            "2026-01-20T08:00:00Z",
            "2026-02-05T20:00:00Z",
          ]),
        }),
      ]);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "inst-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      const performerData = [must(performerCall).data].flat();

      // lastPlayedAt should be the last entry in playHistory
      expect(must(performerData[0]).lastPlayedAt).toEqual(
        new Date("2026-02-05T20:00:00Z")
      );
      // lastOAt should be the last entry in oHistory
      expect(must(performerData[0]).lastOAt).toEqual(
        new Date("2026-02-01T15:30:00Z")
      );
    });

    it("reads a malformed history as empty and still rebuilds the scene's stats", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 2,
          playCount: 3,
          oHistory: "not json",
          playHistory: "not json",
        }),
      ]);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "inst-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      const performerData = [must(performerCall).data].flat();
      expect(performerData).toEqual([
        objectContaining({
          performerId: "perf-1",
          oCounter: 2,
          playCount: 3,
          lastPlayedAt: null,
          lastOAt: null,
        }),
      ]);
    });

    it("handles watch history with oHistory/playHistory as arrays (already parsed)", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 1,
          playCount: 1,
          oHistory: ["2026-01-10T12:00:00Z"], // Already an array
          playHistory: ["2026-01-10T12:00:00Z"],
        }),
      ]);

      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "inst-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      // Should not throw
      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      expect([must(performerCall).data].flat().length).toBe(1);
    });

    it("skips scenes not found in cache", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "scene-1",
          instanceId: "inst-a",
          oCount: 1,
          playCount: 1,
          oHistory: "[]",
          playHistory: "[]",
        }),
        partialRow({
          sceneId: "scene-deleted",
          instanceId: "inst-a",
          oCount: 5,
          playCount: 10,
          oHistory: "[]",
          playHistory: "[]",
        }),
      ]);

      // Only scene-1 found in cache, scene-deleted is missing
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "inst-a",
          performers: [{ id: "perf-1", name: "Jane" }],
          studio: null,
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const performerCall =
        mockPrisma.userPerformerStats.createMany.mock.calls[0]?.[0];
      const performerData = [must(performerCall).data].flat();

      // Only scene-1's stats should be included
      expect(performerData).toHaveLength(1);
      expect(must(performerData[0]).oCounter).toBe(1);
      expect(must(performerData[0]).playCount).toBe(1);
    });

    it("builds separate studio stats per instance", async () => {
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({
          sceneId: "scene-1",
          instanceId: "instance-a",
          oCount: 1,
          playCount: 2,
          oHistory: "[]",
          playHistory: "[]",
        }),
        partialRow({
          sceneId: "scene-2",
          instanceId: "instance-b",
          oCount: 3,
          playCount: 4,
          oHistory: "[]",
          playHistory: "[]",
        }),
      ]);

      // Same studio ID from different instances
      mockGetScenesByIdsWithRelations.mockResolvedValue([
        {
          id: "scene-1",
          instanceId: "instance-a",
          performers: [],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
        {
          id: "scene-2",
          instanceId: "instance-b",
          performers: [],
          studio: { id: "studio-1", name: "Studio A" },
          tags: [],
        },
      ]);

      await userStatsService.rebuildAllStatsForUser(1);

      const studioCall =
        mockPrisma.userStudioStats.createMany.mock.calls[0]?.[0];
      const studioData = [must(studioCall).data].flat();

      // Should be TWO entries (same studio ID but different instances)
      expect(studioData).toHaveLength(2);

      const instAStudio = must(
        studioData.find((d) => d.instanceId === "instance-a")
      );
      const instBStudio = must(
        studioData.find((d) => d.instanceId === "instance-b")
      );

      expect(instAStudio.studioId).toBe("studio-1");
      expect(instAStudio.oCounter).toBe(1);
      expect(instBStudio.studioId).toBe("studio-1");
      expect(instBStudio.oCounter).toBe(3);
    });
  });

  describe("rebuildAllStats", () => {
    it("rebuilds stats for all users", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        partialRow({ id: 1 }),
        partialRow({ id: 2 }),
      ]);

      // Mock the rebuild for each user
      mockPrisma.userPerformerStats.deleteMany.mockResolvedValue(
        partialRow({})
      );
      mockPrisma.userStudioStats.deleteMany.mockResolvedValue(partialRow({}));
      mockPrisma.userTagStats.deleteMany.mockResolvedValue(partialRow({}));
      mockPrisma.watchHistory.findMany.mockResolvedValue([]);
      mockGetScenesByIdsWithRelations.mockResolvedValue([]);
      mockPrisma.userPerformerStats.createMany.mockResolvedValue(
        partialRow({})
      );
      mockPrisma.userStudioStats.createMany.mockResolvedValue(partialRow({}));
      mockPrisma.userTagStats.createMany.mockResolvedValue(partialRow({}));

      await userStatsService.rebuildAllStats();

      // deleteMany should be called twice per stat type (once per user)
      expect(mockPrisma.userPerformerStats.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userStudioStats.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userTagStats.deleteMany).toHaveBeenCalledTimes(2);
    });
  });
});
