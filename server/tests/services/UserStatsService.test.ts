/**
 * Unit Tests for UserStatsService - Multi-Instance Focus
 *
 * Tests that stats are correctly separated by instanceId, which is the core
 * fix in 3.3.2. Covers:
 * - statsWritesForScene: the upserts a play or an O press runs in its unit
 * - rebuildAllStatsForUser separating stats by instance, and giving way to
 *   a play that committed after its read
 * - Composite key behavior (performerId + instanceId)
 */
import { Prisma, type WatchHistory } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
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

// A written rebuild forgets the user's rankings
vi.mock("../../services/RankingComputeService.js", () => ({
  rankingComputeService: { forget: vi.fn() },
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

  describe("statsWritesForScene", () => {
    /** The scene the stats writes read: two performers, a studio, a tag */
    const SCENE = {
      id: "scene-1",
      performers: [
        { id: "perf-1", name: "Jane" },
        { id: "perf-2", name: "John" },
      ],
      studio: { id: "studio-1", name: "Studio A" },
      tags: [{ id: "tag-1", name: "Tag A" }],
    };

    it("reads the scene on its instance before the unit, and writes nothing until run", async () => {
      mockGetScene.mockResolvedValue(SCENE);

      await userStatsService.statsWritesForScene(1, "scene-1", "inst-a", {
        oCount: 0,
        playCount: 1,
      });

      expect(mockGetScene).toHaveBeenCalledWith("scene-1", "inst-a");
      expect(mockPrisma.userPerformerStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userTagStats.upsert).not.toHaveBeenCalled();
    });

    it("upserts each performer, the studio and each tag with the increments, on the scene's instance, through the transaction given", async () => {
      mockGetScene.mockResolvedValue(SCENE);
      const playedAt = new Date("2026-09-01T10:00:00Z");

      const writes = await userStatsService.statsWritesForScene(
        1,
        "scene-1",
        "inst-a",
        { oCount: 0, playCount: 1, lastPlayedAt: playedAt }
      );
      await writes(mockPrisma);

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledWith({
        where: {
          userId_instanceId_performerId: {
            userId: 1,
            instanceId: "inst-a",
            performerId: "perf-1",
          },
        },
        create: {
          userId: 1,
          instanceId: "inst-a",
          performerId: "perf-1",
          oCounter: 0,
          playCount: 1,
          lastPlayedAt: playedAt,
        },
        update: {
          oCounter: { increment: 0 },
          playCount: { increment: 1 },
          lastPlayedAt: { set: playedAt },
        },
      });
      expect(mockPrisma.userStudioStats.upsert).toHaveBeenCalledWith({
        where: {
          userId_instanceId_studioId: {
            userId: 1,
            instanceId: "inst-a",
            studioId: "studio-1",
          },
        },
        create: {
          userId: 1,
          instanceId: "inst-a",
          studioId: "studio-1",
          oCounter: 0,
          playCount: 1,
        },
        update: {
          oCounter: { increment: 0 },
          playCount: { increment: 1 },
        },
      });
      expect(mockPrisma.userTagStats.upsert).toHaveBeenCalledWith({
        where: {
          userId_instanceId_tagId: {
            userId: 1,
            instanceId: "inst-a",
            tagId: "tag-1",
          },
        },
        create: {
          userId: 1,
          instanceId: "inst-a",
          tagId: "tag-1",
          oCounter: 0,
          playCount: 1,
        },
        update: {
          oCounter: { increment: 0 },
          playCount: { increment: 1 },
        },
      });
    });

    it("an O press adds to oCounter and sets the performers' lastOAt", async () => {
      mockGetScene.mockResolvedValue(SCENE);
      const oAt = new Date("2026-09-01T11:00:00Z");

      const writes = await userStatsService.statsWritesForScene(
        1,
        "scene-1",
        "inst-a",
        { oCount: 1, playCount: 0, lastOAt: oAt }
      );
      await writes(mockPrisma);

      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledWith(
        objectContaining({
          create: objectContaining({ oCounter: 1, playCount: 0, lastOAt: oAt }),
          update: {
            oCounter: { increment: 1 },
            playCount: { increment: 0 },
            lastOAt: { set: oAt },
          },
        })
      );
    });

    it("a scene with no studio gets no studio upsert", async () => {
      mockGetScene.mockResolvedValue({ ...SCENE, studio: null });

      const writes = await userStatsService.statsWritesForScene(
        1,
        "scene-1",
        "inst-a",
        { oCount: 0, playCount: 1 }
      );
      await writes(mockPrisma);

      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userPerformerStats.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userTagStats.upsert).toHaveBeenCalledTimes(1);
    });

    it("a scene missing from the cache gets no stats writes, and is logged", async () => {
      mockGetScene.mockResolvedValue(null);

      const writes = await userStatsService.statsWritesForScene(
        1,
        "nonexistent",
        "inst-a",
        { oCount: 0, playCount: 1 }
      );
      await expect(writes(mockPrisma)).resolves.toBeUndefined();

      expect(mockPrisma.userPerformerStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userStudioStats.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.userTagStats.upsert).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Scene not found in cache for stats update",
        { userId: 1, sceneId: "nonexistent", instanceId: "inst-a" }
      );
    });

    it("a failed upsert rejects, so the history write it runs in fails with it", async () => {
      mockGetScene.mockResolvedValue(SCENE);
      mockPrisma.userStudioStats.upsert.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Foreign key failed", {
          code: "P2003",
          clientVersion: "test",
        })
      );

      const writes = await userStatsService.statsWritesForScene(
        1,
        "scene-1",
        "inst-a",
        { oCount: 1, playCount: 0 }
      );

      await expect(writes(mockPrisma)).rejects.toThrow("Foreign key failed");
      // Nothing after the failed one is sent
      expect(mockPrisma.userTagStats.upsert).not.toHaveBeenCalled();
    });

    it("a failed scene read rejects before the unit", async () => {
      mockGetScene.mockRejectedValue(new Error("DB error"));

      await expect(
        userStatsService.statsWritesForScene(1, "scene-1", "inst-a", {
          oCount: 0,
          playCount: 1,
        })
      ).rejects.toThrow("DB error");
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

  describe("rebuildAllStatsForUser against plays landing meanwhile", () => {
    const HISTORY = [
      partialRow<WatchHistory>({
        sceneId: "scene-1",
        instanceId: "inst-a",
        oCount: 1,
        playCount: 2,
        oHistory: "[]",
        playHistory: "[]",
      }),
    ];
    const SCENES = [
      {
        id: "scene-1",
        instanceId: "inst-a",
        performers: [{ id: "perf-1", name: "Jane" }],
        studio: null,
        tags: [],
      },
    ];

    beforeEach(() => {
      mockPrisma.watchHistory.findMany.mockResolvedValue(HISTORY);
      mockPrisma.$transaction.mockResolvedValue([]);
    });

    it("writes once, and forgets the user's rankings inside its unit after the batch commits", async () => {
      mockGetScenesByIdsWithRelations.mockResolvedValue(SCENES);

      await userStatsService.rebuildAllStatsForUser(1);

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(rankingComputeService.forget).toHaveBeenCalledTimes(1);
      expect(rankingComputeService.forget).toHaveBeenCalledWith(1);
      // Inside the unit, once the batch committed: a ranking write queued
      // behind the rebuild finds the user forgotten when it starts
      expect(
        must(
          vi.mocked(rankingComputeService.forget).mock.invocationCallOrder[0]
        )
      ).toBeGreaterThan(
        must(mockPrisma.$transaction.mock.invocationCallOrder[0])
      );
    });

    it("reads again when a play commits between its read and its write", async () => {
      // A play commits (its unit bumps the generation) while the rebuild
      // reads the scenes of its first read
      mockGetScenesByIdsWithRelations
        .mockImplementationOnce(() => {
          userStatsService.bumpWriteGeneration(1);
          return Promise.resolve(SCENES);
        })
        .mockResolvedValue(SCENES);

      await userStatsService.rebuildAllStatsForUser(1);

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledTimes(2);
      // Only the second read's batch is written
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(rankingComputeService.forget).toHaveBeenCalledTimes(1);
    });

    it("another user's play does not make it read again", async () => {
      mockGetScenesByIdsWithRelations
        .mockImplementationOnce(() => {
          userStatsService.bumpWriteGeneration(2);
          return Promise.resolve(SCENES);
        })
        .mockResolvedValue(SCENES);

      await userStatsService.rebuildAllStatsForUser(1);

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("keeps the stats and warns after four reads that each lost to a play", async () => {
      mockGetScenesByIdsWithRelations.mockImplementation(() => {
        userStatsService.bumpWriteGeneration(1);
        return Promise.resolve(SCENES);
      });

      await expect(
        userStatsService.rebuildAllStatsForUser(1)
      ).resolves.toBeUndefined();

      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledTimes(4);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(rankingComputeService.forget).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Stats rebuild kept the stats: plays kept landing while it read",
        { userId: 1, attempts: 4 }
      );
    });

    it("a failed batch rethrows and forgets nothing", async () => {
      mockGetScenesByIdsWithRelations.mockResolvedValue(SCENES);
      mockPrisma.$transaction.mockRejectedValueOnce(new Error("disk full"));

      await expect(userStatsService.rebuildAllStatsForUser(1)).rejects.toThrow(
        "disk full"
      );
      expect(rankingComputeService.forget).not.toHaveBeenCalled();
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
