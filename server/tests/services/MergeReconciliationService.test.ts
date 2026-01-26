/**
 * Unit Tests for MergeReconciliationService
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRaw: vi.fn(),
    stashScene: {
      findFirst: vi.fn(), // Changed from findUnique for composite primary key
      findMany: vi.fn(),
    },
    watchHistory: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    sceneRating: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    mergeRecord: {
      create: vi.fn(),
    },
  },
}));

import prisma from "../../prisma/singleton.js";
import { mergeReconciliationService } from "../../services/MergeReconciliationService.js";

describe("MergeReconciliationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findOrphanedScenesWithActivity", () => {
    it("should return orphaned scenes with user activity", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          id: "scene-1",
          title: "Test Scene",
          phash: "abc123",
          deletedAt: new Date("2025-01-10"),
          watchHistoryCount: 2,
          totalPlayCount: 5,
          ratingCount: 1,
          favoriteCount: 1,
        },
      ]);

      const result = await mergeReconciliationService.findOrphanedScenesWithActivity();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("scene-1");
      expect(result[0].userActivityCount).toBe(3);
      expect(result[0].hasRatings).toBe(true);
      expect(result[0].hasFavorites).toBe(true);
    });
  });

  describe("findPhashMatches", () => {
    it("should find scenes with matching phash", async () => {
      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue({
        phash: "abc123",
        phashes: null,
      } as never);

      vi.mocked(prisma.stashScene.findMany).mockResolvedValue([
        { id: "scene-2", title: "Match Scene", phash: "abc123", stashUpdatedAt: new Date() },
      ] as never);

      const result = await mergeReconciliationService.findPhashMatches("scene-1");

      expect(result).toHaveLength(1);
      expect(result[0].sceneId).toBe("scene-2");
      expect(result[0].similarity).toBe("exact");
      expect(result[0].recommended).toBe(true);
    });

    it("should return empty array if scene has no phash", async () => {
      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue({
        phash: null,
        phashes: null,
      } as never);

      const result = await mergeReconciliationService.findPhashMatches("scene-1");

      expect(result).toHaveLength(0);
    });
  });

  describe("transferUserData", () => {
    it("should transfer watch history to target without existing data", async () => {
      vi.mocked(prisma.watchHistory.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          playCount: 5,
          playDuration: 1000,
          oCount: 2,
          oHistory: "[]",
          playHistory: "[]",
          resumeTime: 100,
          lastPlayedAt: new Date(),
        } as never)
        .mockResolvedValueOnce(null); // No target history

      vi.mocked(prisma.sceneRating.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.watchHistory.create).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      const result = await mergeReconciliationService.transferUserData(
        "source",
        "target",
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(prisma.watchHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sceneId: "target",
            playCount: 5,
          }),
        })
      );
    });

    it("should merge watch history with existing target data", async () => {
      vi.mocked(prisma.watchHistory.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          playCount: 5,
          playDuration: 1000,
          oCount: 2,
          oHistory: '["2025-01-01"]',
          playHistory: "[]",
          resumeTime: 100,
          lastPlayedAt: new Date("2025-01-01"),
        } as never)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "target",
          playCount: 3,
          playDuration: 500,
          oCount: 1,
          oHistory: '["2025-01-02"]',
          playHistory: "[]",
          resumeTime: 200,
          lastPlayedAt: new Date("2025-01-02"),
        } as never);

      vi.mocked(prisma.sceneRating.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.watchHistory.update).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      const result = await mergeReconciliationService.transferUserData(
        "source",
        "target",
        1,
        "abc123",
        null
      );

      expect(result.success).toBe(true);
      expect(prisma.watchHistory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            playCount: 8, // 5 + 3
            playDuration: 1500, // 1000 + 500
            oCount: 3, // 2 + 1
          }),
        })
      );
    });

    it("should use OR logic for favorites", async () => {
      vi.mocked(prisma.watchHistory.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.sceneRating.findUnique)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "source",
          rating: 80,
          favorite: true,
        } as never)
        .mockResolvedValueOnce({
          userId: 1,
          sceneId: "target",
          rating: 90,
          favorite: false,
        } as never);

      vi.mocked(prisma.sceneRating.update).mockResolvedValue({} as never);
      vi.mocked(prisma.mergeRecord.create).mockResolvedValue({ id: "mr-1" } as never);

      await mergeReconciliationService.transferUserData("source", "target", 1, null, null);

      expect(prisma.sceneRating.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rating: 90, // Survivor wins
            favorite: true, // OR logic
          }),
        })
      );
    });
  });

  describe("discardOrphanedData", () => {
    it("should delete watch history and ratings", async () => {
      vi.mocked(prisma.watchHistory.deleteMany).mockResolvedValue({ count: 3 });
      vi.mocked(prisma.sceneRating.deleteMany).mockResolvedValue({ count: 2 });

      const result = await mergeReconciliationService.discardOrphanedData("scene-1");

      expect(result.watchHistoryDeleted).toBe(3);
      expect(result.ratingsDeleted).toBe(2);
    });
  });
});
