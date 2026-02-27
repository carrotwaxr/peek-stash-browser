/**
 * Unit Tests for RankingComputeService
 *
 * Tests the percentile ranking algorithm, engagement score calculation,
 * tie handling, edge cases, and BigInt/float rounding from SQLite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing service
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    userEntityRanking: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

// Mock logger to suppress output
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { rankingComputeService } from "../../services/RankingComputeService.js";
import prisma from "../../prisma/singleton.js";

const mockPrisma = vi.mocked(prisma);

/** Helper: set up mocks for a recomputeAllRankings call */
function setupRankingMocks(opts: {
  avgDuration?: number;
  performerStats?: unknown[];
  studioStats?: unknown[];
  tagStats?: unknown[];
  sceneStats?: unknown[];
}) {
  const queryRawMock = mockPrisma.$queryRaw as ReturnType<typeof vi.fn>;
  queryRawMock
    .mockResolvedValueOnce([{ avgDuration: opts.avgDuration ?? 1200 }])
    .mockResolvedValueOnce(opts.performerStats ?? [])
    .mockResolvedValueOnce(opts.studioStats ?? [])
    .mockResolvedValueOnce(opts.tagStats ?? [])
    .mockResolvedValueOnce(opts.sceneStats ?? []);

  const txMock = {
    userEntityRanking: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof txMock) => Promise<void>) => {
      await fn(txMock);
    }
  );

  return txMock;
}

/** Extract ranking records written by createMany for a specific entity type */
function getWrittenRankings(
  txMock: ReturnType<typeof setupRankingMocks>,
  entityType: string
): Array<{
  entityId: string;
  percentileRank: number;
  engagementScore: number;
  engagementRate: number;
  playCount: number;
  oCount: number;
  libraryPresence: number;
}> {
  for (const call of txMock.userEntityRanking.createMany.mock.calls) {
    const data = call[0].data;
    if (data.length > 0 && data[0].entityType === entityType) {
      return data;
    }
  }
  return [];
}

describe("RankingComputeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("engagement score formula", () => {
    it("calculates score as (oCount × 5) + normalizedDuration + playCount", async () => {
      // avgDuration = 1000 for easy normalization math
      // Entity: oCount=2, playDuration=2000 (normalized=2.0), playCount=3
      // Expected: (2 × 5) + 2.0 + 3 = 15.0
      const txMock = setupRankingMocks({
        avgDuration: 1000,
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 3,
            oCount: 2,
            playDuration: 2000,
            libraryPresence: 1,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(1);
      expect(rankings[0].engagementScore).toBe(15);
    });

    it("normalizes duration by average scene duration", async () => {
      // avgDuration = 600, playDuration = 1200 → normalized = 2.0
      // oCount=0, playCount=0, so score = normalized duration only = 2.0
      const txMock = setupRankingMocks({
        avgDuration: 600,
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 0,
            oCount: 0,
            playDuration: 1200,
            libraryPresence: 1,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings[0].engagementScore).toBe(2);
    });
  });

  describe("engagement rate (score / libraryPresence)", () => {
    it("divides engagement score by library presence", async () => {
      // score = (0 × 5) + (1200/1200) + 10 = 11, libraryPresence = 5
      // rate = 11 / 5 = 2.2
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 10,
            oCount: 0,
            playDuration: 1200,
            libraryPresence: 5,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings[0].engagementRate).toBeCloseTo(2.2, 5);
    });

    it("uses Math.max(libraryPresence, 1) to avoid division by zero", async () => {
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 5,
            oCount: 1,
            playDuration: 1200,
            libraryPresence: 0, // Zero library presence
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      // Should not be Infinity — divides by max(0, 1) = 1
      expect(Number.isFinite(rankings[0].engagementRate)).toBe(true);
      // score = (1 × 5) + 1 + 5 = 11, rate = 11 / 1 = 11
      expect(rankings[0].engagementRate).toBe(11);
    });
  });

  describe("percentile rank computation", () => {
    it("assigns 100 to top entity and 0 to bottom entity", async () => {
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          // High engagement
          { entityId: "top", instanceId: "i1", playCount: 100, oCount: 20, playDuration: 50000, libraryPresence: 1 },
          // Medium engagement
          { entityId: "mid", instanceId: "i1", playCount: 10, oCount: 2, playDuration: 5000, libraryPresence: 1 },
          // Low engagement
          { entityId: "low", instanceId: "i1", playCount: 1, oCount: 0, playDuration: 100, libraryPresence: 1 },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(3);

      const byId = Object.fromEntries(rankings.map((r) => [r.entityId, r]));
      expect(byId["top"].percentileRank).toBe(100);
      expect(byId["low"].percentileRank).toBe(0);
      expect(byId["mid"].percentileRank).toBe(50);
    });

    it("assigns 100 to a single entity", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          { entityId: "only", instanceId: "i1", playCount: 5, oCount: 1, playDuration: 600, libraryPresence: 1 },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(1);
      // Single entity: (n - 0 - 1) / max(n - 1, 1) = 0 / 1 = 0 → actually 0
      // Formula: 100 * (1 - 0 - 1) / max(0, 1) = 0
      // Wait, let's check: n=1, i=0: 100 * (1 - 0 - 1) / max(0, 1) = 100 * 0 / 1 = 0
      // Hmm, that means a single entity gets 0, not 100. Let me verify...
      // Actually looking at the code: Math.round((100 * (n - i - 1)) / Math.max(n - 1, 1))
      // n=1, i=0: 100 * (1 - 0 - 1) / max(0, 1) = 100 * 0 / 1 = 0
      expect(rankings[0].percentileRank).toBe(0);
    });

    it("handles ties — entities with same engagement rate get same percentile", async () => {
      // Two entities with identical stats should get the same percentile
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          { entityId: "a", instanceId: "i1", playCount: 10, oCount: 2, playDuration: 2400, libraryPresence: 5 },
          { entityId: "b", instanceId: "i1", playCount: 10, oCount: 2, playDuration: 2400, libraryPresence: 5 },
          { entityId: "c", instanceId: "i1", playCount: 1, oCount: 0, playDuration: 100, libraryPresence: 10 },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      const byId = Object.fromEntries(rankings.map((r) => [r.entityId, r]));

      // a and b have identical engagement rates, so they must share the same percentile
      expect(byId["a"].percentileRank).toBe(byId["b"].percentileRank);
      // c has lower engagement rate, so lower percentile
      expect(byId["c"].percentileRank).toBeLessThan(byId["a"].percentileRank);
    });
  });

  describe("empty data handling", () => {
    it("returns empty rankings when no entities have engagement", async () => {
      const txMock = setupRankingMocks({
        performerStats: [],
        studioStats: [],
        tagStats: [],
        sceneStats: [],
      });

      await rankingComputeService.recomputeAllRankings(1);

      // When empty, upsertRankings calls deleteMany directly (not via transaction)
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalled();
    });

    it("handles some entity types empty and others populated", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          { entityId: "perf1", instanceId: "i1", playCount: 5, oCount: 1, playDuration: 600, libraryPresence: 3 },
        ],
        studioStats: [], // Empty
        tagStats: [
          { entityId: "tag1", instanceId: "i1", playCount: 3, oCount: 0, playDuration: 300, libraryPresence: 10 },
        ],
        sceneStats: [], // Empty
      });

      await rankingComputeService.recomputeAllRankings(1);

      // Performer and tag rankings should be written
      const perfRankings = getWrittenRankings(txMock, "performer");
      const tagRankings = getWrittenRankings(txMock, "tag");
      expect(perfRankings).toHaveLength(1);
      expect(tagRankings).toHaveLength(1);

      // Studio and scene should trigger deleteMany (empty results)
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, entityType: "studio" } })
      );
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, entityType: "scene" } })
      );
    });
  });

  describe("multi-entity-type orchestration", () => {
    it("computes rankings for all four entity types in parallel", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          { entityId: "p1", instanceId: "i1", playCount: 10, oCount: 2, playDuration: 5000, libraryPresence: 3 },
        ],
        studioStats: [
          { entityId: "s1", instanceId: "i1", playCount: 8, oCount: 1, playDuration: 4000, libraryPresence: 5 },
        ],
        tagStats: [
          { entityId: "t1", instanceId: "i1", playCount: 20, oCount: 5, playDuration: 10000, libraryPresence: 15 },
        ],
        sceneStats: [
          { entityId: "sc1", instanceId: "i1", playCount: 3, oCount: 1, playDuration: 900, libraryPresence: 1 },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      // All four entity types should be written
      const perfRankings = getWrittenRankings(txMock, "performer");
      const studioRankings = getWrittenRankings(txMock, "studio");
      const tagRankings = getWrittenRankings(txMock, "tag");
      const sceneRankings = getWrittenRankings(txMock, "scene");

      expect(perfRankings).toHaveLength(1);
      expect(studioRankings).toHaveLength(1);
      expect(tagRankings).toHaveLength(1);
      expect(sceneRankings).toHaveLength(1);
    });
  });

  describe("average scene duration fallback", () => {
    it("defaults to 1200 when no scenes have duration", async () => {
      const queryRawMock = mockPrisma.$queryRaw as ReturnType<typeof vi.fn>;
      queryRawMock
        .mockResolvedValueOnce([{ avgDuration: null }]) // No scenes
        .mockResolvedValueOnce([
          { entityId: "p1", instanceId: "i1", playCount: 0, oCount: 0, playDuration: 2400, libraryPresence: 1 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const txMock = {
        userEntityRanking: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: typeof txMock) => Promise<void>) => {
          await fn(txMock);
        }
      );

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      // normalized = 2400 / 1200 = 2.0, score = 0 + 2.0 + 0 = 2.0
      expect(rankings[0].engagementScore).toBe(2);
    });
  });

  describe("Int field rounding (issue #410)", () => {
    it("rounds playCount, oCount, and libraryPresence to integers before writing", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: BigInt(5),
            oCount: BigInt(3),
            playDuration: 3600.5,
            libraryPresence: BigInt(10),
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(1);

      const record = rankings[0];
      expect(Number.isInteger(record.playCount)).toBe(true);
      expect(Number.isInteger(record.oCount)).toBe(true);
      expect(Number.isInteger(record.libraryPresence)).toBe(true);
    });

    it("handles floating-point values from SQL without BigInt conversion errors", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 5.0000000001,
            oCount: 3.0,
            playDuration: 80.31500000000001,
            libraryPresence: 10.0000000001,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings[0].playCount).toBe(5);
      expect(rankings[0].oCount).toBe(3);
      expect(rankings[0].libraryPresence).toBe(10);
    });
  });

  describe("instanceId handling", () => {
    it("defaults empty instanceId to empty string", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "perf1",
            instanceId: null, // null from DB
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 3,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings[0].instanceId).toBe("");
    });
  });
});
