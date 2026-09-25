/**
 * Unit Tests for MergeReconciliationService
 */
import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  MergeTargetError,
  mergeReconciliationService,
} from "../../services/MergeReconciliationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { DB_WRITE_TX } from "../../utils/dbWrite.js";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { getConfig: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockManager = vi.mocked(stashInstanceManager, true);

const A = "inst-a";
const B = "inst-b";
const source = { id: "source", instanceId: A };
const target = { id: "target", instanceId: A };

/** No row found, typed for whichever `findUnique` it answers */
const none = null;

describe("MergeReconciliationService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockManager.getConfig.mockImplementation((id) =>
      id === A ? partialRow({ id: A, name: "Stash A" }) : undefined
    );
    mockPrisma.watchHistory.findUnique.mockResolvedValue(none);
    mockPrisma.sceneRating.findUnique.mockResolvedValue(none);
    mockPrisma.playlistItem.findMany.mockResolvedValue([]);
    mockPrisma.mergeRecord.create.mockResolvedValue(partialRow({ id: "mr-1" }));
  });

  describe("findOrphanedScenesWithActivity", () => {
    it("returns each orphan with its instance and counts only that instance's activity", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: "scene-1",
          stashInstanceId: A,
          title: "Test Scene",
          phash: "abc123",
          deletedAt: new Date("2025-01-10"),
          watchHistoryCount: 2n,
          totalPlayCount: 5n,
          ratingCount: 1n,
          favoriteCount: 1n,
        },
        {
          id: "scene-1",
          stashInstanceId: B,
          title: "Test Scene",
          phash: "abc123",
          deletedAt: new Date("2025-01-09"),
          watchHistoryCount: 1n,
          totalPlayCount: 2n,
          ratingCount: 0n,
          favoriteCount: 0n,
        },
      ]);

      const result =
        await mergeReconciliationService.findOrphanedScenesWithActivity();

      expect(result).toHaveLength(2);
      expect(must(result[0])).toMatchObject({
        id: "scene-1",
        instanceId: A,
        instanceName: "Stash A",
        userActivityCount: 3,
        totalPlayCount: 5,
        hasRatings: true,
        hasFavorites: true,
      });
      // An instance without a config shows its id
      expect(must(result[1])).toMatchObject({
        instanceId: B,
        instanceName: B,
        userActivityCount: 1,
        hasRatings: false,
      });
      const sql = must(mockPrisma.$queryRaw.mock.calls[0])[0] as unknown as
        | TemplateStringsArray
        | undefined;
      const text = must(sql).join("?");
      expect(text).toContain(
        "wh.sceneId = s.id AND wh.instanceId = s.stashInstanceId"
      );
      expect(text).toContain(
        "r.sceneId = s.id AND r.instanceId = s.stashInstanceId"
      );
    });
  });

  describe("findPhashMatches", () => {
    it("reads the scene by (id, instance) and looks for live scenes of that instance only", async () => {
      mockPrisma.stashScene.findUnique.mockResolvedValue(
        partialRow({ phash: "abc123", phashes: '["abc123","def456"]' })
      );
      mockPrisma.stashScene.findMany.mockResolvedValue([
        partialRow({ id: "scene-2", title: "Match Scene" }),
        partialRow({ id: "scene-3", title: null }),
      ]);

      const result = await mergeReconciliationService.findPhashMatches({
        id: "scene-1",
        instanceId: A,
      });

      expect(mockPrisma.stashScene.findUnique).toHaveBeenCalledWith(
        objectContaining({
          where: {
            id_stashInstanceId: { id: "scene-1", stashInstanceId: A },
          },
        })
      );
      const args = must(mockPrisma.stashScene.findMany.mock.calls[0])[0];
      expect(must(args).where).toMatchObject({
        stashInstanceId: A,
        deletedAt: null,
        NOT: { id: "scene-1" },
        OR: [
          { phash: { in: ["abc123", "def456"] } },
          { phashes: { contains: "abc123" } },
          { phashes: { contains: "def456" } },
        ],
      });
      expect(result).toEqual([
        {
          sceneId: "scene-2",
          instanceId: A,
          instanceName: "Stash A",
          title: "Match Scene",
          similarity: "exact",
          recommended: true,
        },
        {
          sceneId: "scene-3",
          instanceId: A,
          instanceName: "Stash A",
          title: null,
          similarity: "exact",
          recommended: false,
        },
      ]);
    });

    it("returns no match when the scene has no phash", async () => {
      mockPrisma.stashScene.findUnique.mockResolvedValue(
        partialRow({ phash: null, phashes: null })
      );

      const result = await mergeReconciliationService.findPhashMatches({
        id: "scene-1",
        instanceId: A,
      });

      expect(result).toHaveLength(0);
      expect(mockPrisma.stashScene.findMany).not.toHaveBeenCalled();
    });
  });

  describe("transferUserData", () => {
    it("transfers watch history to a target without any", async () => {
      mockPrisma.watchHistory.findUnique
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "source",
            playCount: 5,
            playDuration: 1000,
            oCount: 2,
            oHistory: "[]",
            playHistory: "[]",
            resumeTime: 100,
            lastPlayedAt: new Date(),
          })
        )
        .mockResolvedValueOnce(none); // No target history
      mockPrisma.watchHistory.create.mockResolvedValue(partialRow({}));

      const result = await mergeReconciliationService.transferUserData(
        source,
        target,
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.watchHistory.findUnique).toHaveBeenCalledWith({
        where: {
          userId_instanceId_sceneId: {
            userId: 1,
            instanceId: A,
            sceneId: "source",
          },
        },
      });
      expect(mockPrisma.watchHistory.create).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            instanceId: A,
            sceneId: "target",
            playCount: 5,
            // The source's JSON-encoded strings land as arrays
            oHistory: [],
            playHistory: [],
          }),
        })
      );
      expect(mockPrisma.watchHistory.delete).toHaveBeenCalledWith({
        where: {
          userId_instanceId_sceneId: {
            userId: 1,
            instanceId: A,
            sceneId: "source",
          },
        },
      });
    });

    it("merges watch history with the target's", async () => {
      mockPrisma.watchHistory.findUnique
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "source",
            playCount: 5,
            playDuration: 1000,
            oCount: 2,
            oHistory: '["2025-01-01"]',
            playHistory: "[]",
            resumeTime: 100,
            lastPlayedAt: new Date("2025-01-01"),
          })
        )
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "target",
            playCount: 3,
            playDuration: 500,
            oCount: 1,
            oHistory: '["2025-01-02"]',
            playHistory: "[]",
            resumeTime: 200,
            lastPlayedAt: new Date("2025-01-02"),
          })
        );
      mockPrisma.watchHistory.update.mockResolvedValue(partialRow({}));

      const result = await mergeReconciliationService.transferUserData(
        source,
        target,
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.watchHistory.update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            playCount: 8, // 5 + 3
            playDuration: 1500, // 1000 + 500
            oCount: 3, // 2 + 1
          }),
        })
      );
    });

    it("merges watch history into arrays, reading and writing inside one transaction", async () => {
      const findUnique = vi.mocked(prisma.watchHistory.findUnique);
      const update = vi.mocked(prisma.watchHistory.update);
      findUnique
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "source",
            playCount: 1,
            playDuration: 100,
            oCount: 1,
            // Written by the old updates: a JSON-encoded string
            oHistory: '["2025-01-01T00:00:00.000Z"]',
            playHistory: ["2025-01-03T00:00:00.000Z"],
            resumeTime: 10,
            lastPlayedAt: new Date("2025-01-03"),
          })
        )
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "target",
            playCount: 1,
            playDuration: 50,
            oCount: 1,
            oHistory: ["2025-01-02T00:00:00.000Z"],
            playHistory: "[]",
            resumeTime: 20,
            lastPlayedAt: new Date("2025-01-02"),
          })
        );
      update.mockResolvedValue(partialRow({}));

      // Count the calls made while the transaction callback runs
      const calls = () =>
        findUnique.mock.calls.length +
        update.mock.calls.length +
        mockPrisma.mergeRecord.create.mock.calls.length +
        mockPrisma.watchHistory.delete.mock.calls.length;
      let outside = -1;
      mockPrisma.$transaction.mockImplementationOnce((async (
        fn: (tx: typeof prisma) => Promise<unknown>
      ) => {
        const before = calls();
        const result = await fn(prisma);
        outside = before;
        return result;
      }) as never);

      await mergeReconciliationService.transferUserData(
        source,
        target,
        1,
        null,
        null
      );

      expect(update).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            oHistory: ["2025-01-01T00:00:00.000Z", "2025-01-02T00:00:00.000Z"],
            playHistory: ["2025-01-03T00:00:00.000Z"],
          }),
        })
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        DB_WRITE_TX
      );
      // Nothing was read or written before the transaction began
      expect(outside).toBe(0);
    });

    it("keeps the target's rating and ORs the favorites", async () => {
      mockPrisma.sceneRating.findUnique
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "source",
            rating: 80,
            favorite: true,
          })
        )
        .mockResolvedValueOnce(
          partialRow({
            userId: 1,
            sceneId: "target",
            rating: 90,
            favorite: false,
          })
        );
      mockPrisma.sceneRating.update.mockResolvedValue(partialRow({}));

      await mergeReconciliationService.transferUserData(
        source,
        target,
        1,
        null,
        null
      );

      expect(mockPrisma.sceneRating.update).toHaveBeenCalledWith(
        objectContaining({
          where: {
            userId_instanceId_sceneId: {
              userId: 1,
              instanceId: A,
              sceneId: "target",
            },
          },
          data: objectContaining({
            rating: 90, // Survivor wins
            favorite: true, // OR logic
          }),
        })
      );
    });

    it("moves the user's playlist items of the source's instance and records both instances", async () => {
      mockPrisma.playlistItem.findMany.mockResolvedValue([
        partialRow({ id: 11, playlistId: 1 }),
        partialRow({ id: 12, playlistId: 2 }),
      ]);
      // Playlist 2 already holds the target
      mockPrisma.playlistItem.findFirst.mockImplementation(((args: {
        where: { playlistId: number };
      }) =>
        Promise.resolve(
          args.where.playlistId === 2 ? partialRow({ id: 99 }) : null
        )) as never);

      const result = await mergeReconciliationService.transferUserData(
        source,
        target,
        7,
        "abc123",
        3
      );

      expect(result).toEqual({ success: true, mergeRecordId: "mr-1" });
      expect(mockPrisma.playlistItem.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: {
            sceneId: "source",
            instanceId: A,
            playlist: { userId: 7 },
          },
        })
      );
      expect(mockPrisma.playlistItem.findFirst).toHaveBeenCalledWith(
        objectContaining({
          where: { playlistId: 1, sceneId: "target", instanceId: A },
        })
      );
      expect(mockPrisma.playlistItem.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { sceneId: "target", instanceId: A },
      });
      expect(mockPrisma.playlistItem.delete).toHaveBeenCalledWith({
        where: { id: 12 },
      });
      expect(mockPrisma.mergeRecord.create).toHaveBeenCalledWith({
        data: objectContaining({
          sourceSceneId: "source",
          sourceInstanceId: A,
          targetSceneId: "target",
          targetInstanceId: A,
          matchedByPhash: "abc123",
          userId: 7,
          playCountTransferred: 0,
          reconciledBy: 3,
          automatic: false,
        }),
      });
    });

    it("transfers nothing and records nothing when the user has no data on the source", async () => {
      const result = await mergeReconciliationService.transferUserData(
        source,
        target,
        1,
        null,
        null
      );

      expect(result).toEqual({ success: false });
      expect(mockPrisma.mergeRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("reconcileScene", () => {
    it("refuses a target on another instance", async () => {
      await expect(
        mergeReconciliationService.reconcileScene(
          source,
          { id: "target", instanceId: B },
          null,
          1
        )
      ).rejects.toThrow(MergeTargetError);
      expect(mockPrisma.watchHistory.findMany).not.toHaveBeenCalled();
    });

    it("refuses a target that is deleted or unknown", async () => {
      mockPrisma.stashScene.findUnique
        .mockResolvedValueOnce(partialRow({ deletedAt: new Date() }))
        .mockResolvedValueOnce(none);

      await expect(
        mergeReconciliationService.reconcileScene(source, target, null, 1)
      ).rejects.toThrow(MergeTargetError);
      await expect(
        mergeReconciliationService.reconcileScene(source, target, null, 1)
      ).rejects.toThrow("not a live scene on Stash A");
      expect(mockPrisma.watchHistory.findMany).not.toHaveBeenCalled();
    });

    it("refuses the source itself as target", async () => {
      await expect(
        mergeReconciliationService.reconcileScene(source, source, null, 1)
      ).rejects.toThrow(MergeTargetError);
    });

    it("transfers for every user with history, a rating or a playlist item on the source", async () => {
      mockPrisma.stashScene.findUnique.mockResolvedValue(
        partialRow({ deletedAt: null })
      );
      mockPrisma.watchHistory.findMany.mockResolvedValue([
        partialRow({ userId: 1 }),
      ]);
      mockPrisma.sceneRating.findMany.mockResolvedValue([
        partialRow({ userId: 1 }),
        partialRow({ userId: 2 }),
      ]);
      mockPrisma.playlistItem.findMany.mockResolvedValueOnce([
        partialRow<
          Prisma.PlaylistItemGetPayload<{ include: { playlist: true } }>
        >({ playlist: partialRow({ userId: 3 }) }),
      ]);
      const transfer = vi
        .spyOn(mergeReconciliationService, "transferUserData")
        .mockResolvedValue({ success: true, mergeRecordId: "mr" });

      const result = await mergeReconciliationService.reconcileScene(
        source,
        target,
        "abc123",
        null
      );

      const where = { sceneId: "source", instanceId: A };
      expect(mockPrisma.watchHistory.findMany).toHaveBeenCalledWith(
        objectContaining({ where })
      );
      expect(mockPrisma.sceneRating.findMany).toHaveBeenCalledWith(
        objectContaining({ where })
      );
      expect(mockPrisma.playlistItem.findMany).toHaveBeenCalledWith(
        objectContaining({ where })
      );
      expect(transfer.mock.calls.map((c) => c[2])).toEqual([1, 2, 3]);
      expect(result).toEqual({
        sourceSceneId: "source",
        targetSceneId: "target",
        usersReconciled: 3,
        mergeRecordsCreated: 3,
      });
      transfer.mockRestore();
    });
  });

  describe("reconcileDeletedScenes", () => {
    const deleted = [
      { id: "1", phash: "p1" },
      { id: "2", phash: "p2" },
      { id: "3", phash: "p3" },
      { id: "4", phash: null },
    ];

    it("merges a scene with one candidate and leaves one with several for Merge Recovery", async () => {
      // Scenes 1 and 2 have activity on the instance; 3 has none
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { sceneId: "1" },
        { sceneId: "2" },
      ]);
      const match = (sceneId: string) => ({
        sceneId,
        instanceId: A,
        instanceName: "Stash A",
        title: null,
        similarity: "exact" as const,
        recommended: false,
      });
      const find = vi
        .spyOn(mergeReconciliationService, "findPhashMatches")
        .mockImplementation((scene) =>
          Promise.resolve(
            scene.id === "1" ? [match("10")] : [match("20"), match("21")]
          )
        );
      const reconcile = vi
        .spyOn(mergeReconciliationService, "reconcileScene")
        .mockResolvedValue({
          sourceSceneId: "1",
          targetSceneId: "10",
          usersReconciled: 1,
          mergeRecordsCreated: 1,
        });

      const result = await mergeReconciliationService.reconcileDeletedScenes(
        A,
        deleted
      );

      expect(result).toEqual({ merged: 1, ambiguous: 1 });
      // Only scenes with a phash are looked up, in one query
      const [sql, ...values] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
      expect(sql).toContain("json_each(?)");
      expect(values).toEqual([JSON.stringify(["1", "2", "3"]), A, A, A]);
      expect(find.mock.calls.map((c) => c[0])).toEqual([
        { id: "1", instanceId: A },
        { id: "2", instanceId: A },
      ]);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(reconcile).toHaveBeenCalledWith(
        { id: "1", instanceId: A },
        { id: "10", instanceId: A },
        "p1",
        null
      );
      find.mockRestore();
      reconcile.mockRestore();
    });

    it("runs no query when no deleted scene has a phash", async () => {
      const result = await mergeReconciliationService.reconcileDeletedScenes(
        A,
        [{ id: "4", phash: null }]
      );

      expect(result).toEqual({ merged: 0, ambiguous: 0 });
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("goes on with the next scene when one fails", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { sceneId: "1" },
        { sceneId: "2" },
      ]);
      const find = vi
        .spyOn(mergeReconciliationService, "findPhashMatches")
        .mockImplementation((scene) =>
          scene.id === "1"
            ? Promise.reject(new Error("database is locked"))
            : Promise.resolve([
                {
                  sceneId: "20",
                  instanceId: A,
                  instanceName: "Stash A",
                  title: null,
                  similarity: "exact" as const,
                  recommended: true,
                },
              ])
        );
      const reconcile = vi
        .spyOn(mergeReconciliationService, "reconcileScene")
        .mockResolvedValue({
          sourceSceneId: "2",
          targetSceneId: "20",
          usersReconciled: 1,
          mergeRecordsCreated: 1,
        });

      const result = await mergeReconciliationService.reconcileDeletedScenes(
        A,
        deleted
      );

      expect(result).toEqual({ merged: 1, ambiguous: 0 });
      expect(reconcile).toHaveBeenCalledWith(
        { id: "2", instanceId: A },
        { id: "20", instanceId: A },
        "p2",
        null
      );
      find.mockRestore();
      reconcile.mockRestore();
    });
  });

  describe("reconcileRecentDeletions", () => {
    it("reconciles the instance's scenes deleted in the last day that no merge record names as source", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: "5", phash: "p5" },
      ]);
      const reconcile = vi
        .spyOn(mergeReconciliationService, "reconcileDeletedScenes")
        .mockResolvedValue({ merged: 1, ambiguous: 0 });
      const now = vi.spyOn(Date, "now").mockReturnValue(1_790_000_000_000);

      const result =
        await mergeReconciliationService.reconcileRecentDeletions(A);

      expect(result).toEqual({ merged: 1, ambiguous: 0 });
      const call: unknown[] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
      const [sql, instanceId, since] = call;
      expect(sql).toEqual(stringContaining("NOT EXISTS"));
      expect(sql).toEqual(
        stringContaining("m.sourceInstanceId = s.stashInstanceId")
      );
      expect(instanceId).toBe(A);
      // Epoch milliseconds, as Prisma stores DateTime in SQLite
      expect(since).toBe(1_790_000_000_000 - 24 * 60 * 60 * 1000);
      expect(reconcile).toHaveBeenCalledWith(A, [{ id: "5", phash: "p5" }]);
      reconcile.mockRestore();
      now.mockRestore();
    });
  });

  describe("discardOrphanedData", () => {
    it("deletes the watch history and ratings of that scene on its instance", async () => {
      mockPrisma.watchHistory.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.sceneRating.deleteMany.mockResolvedValue({ count: 2 });

      const result = await mergeReconciliationService.discardOrphanedData({
        id: "scene-1",
        instanceId: B,
      });

      expect(result.watchHistoryDeleted).toBe(3);
      expect(result.ratingsDeleted).toBe(2);
      const where = { sceneId: "scene-1", instanceId: B };
      expect(mockPrisma.watchHistory.deleteMany).toHaveBeenCalledWith({
        where,
      });
      expect(mockPrisma.sceneRating.deleteMany).toHaveBeenCalledWith({
        where,
      });
    });
  });
});
