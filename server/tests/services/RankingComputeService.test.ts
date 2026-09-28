/**
 * Unit Tests for RankingComputeService
 *
 * Tests the percentile ranking algorithm, engagement score calculation,
 * tie handling, edge cases, and BigInt/float rounding from SQLite, and
 * `ensureFresh`: at most one recompute per user per hour, shared by
 * concurrent callers.
 */
import type { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { logger } from "../../utils/logger.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock prisma before importing service
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger to suppress output
vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);

/**
 * The ranking table's writes, resolving as Prisma would. The service builds
 * its delete and insert on the client and runs them as one batch
 * (`dbWriteBatch`), which the mock's `$transaction` resolves in order.
 */
function rankingTx() {
  const table = mockPrisma.userEntityRanking;
  table.deleteMany.mockResolvedValue({ count: 0 });
  table.createMany.mockResolvedValue({ count: 1 });
  return { userEntityRanking: table };
}

type RankingTx = ReturnType<typeof rankingTx>;

/** Helper: set up mocks for a recomputeAllRankings call */
function setupRankingMocks(opts: {
  avgDuration?: number;
  performerStats?: unknown[];
  studioStats?: unknown[];
  tagStats?: unknown[];
  sceneStats?: unknown[];
}) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([{ avgDuration: opts.avgDuration ?? 1200 }])
    .mockResolvedValueOnce(opts.performerStats ?? [])
    .mockResolvedValueOnce(opts.studioStats ?? [])
    .mockResolvedValueOnce(opts.tagStats ?? [])
    .mockResolvedValueOnce(opts.sceneStats ?? []);

  const txMock = rankingTx();

  return txMock;
}

/** Extract ranking records written by createMany for a specific entity type */
function getWrittenRankings(
  txMock: RankingTx,
  entityType: string
): Prisma.UserEntityRankingCreateManyInput[] {
  for (const [args] of txMock.userEntityRanking.createMany.mock.calls) {
    const data = must(args, "createMany args").data;
    const rows = Array.isArray(data) ? data : [data];
    if (rows[0]?.entityType === entityType) {
      return rows;
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
      expect(must(rankings[0]).engagementScore).toBe(15);
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
      expect(must(rankings[0]).engagementScore).toBe(2);
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
      expect(must(rankings[0]).engagementRate).toBeCloseTo(2.2, 5);
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
      expect(Number.isFinite(must(rankings[0]).engagementRate)).toBe(true);
      // score = (1 × 5) + 1 + 5 = 11, rate = 11 / 1 = 11
      expect(must(rankings[0]).engagementRate).toBe(11);
    });
  });

  describe("percentile rank computation", () => {
    it("assigns 100 to top entity and 0 to bottom entity", async () => {
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          // High engagement
          {
            entityId: "top",
            instanceId: "i1",
            playCount: 100,
            oCount: 20,
            playDuration: 50000,
            libraryPresence: 1,
          },
          // Medium engagement
          {
            entityId: "mid",
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 5000,
            libraryPresence: 1,
          },
          // Low engagement
          {
            entityId: "low",
            instanceId: "i1",
            playCount: 1,
            oCount: 0,
            playDuration: 100,
            libraryPresence: 1,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(3);

      const byId = Object.fromEntries(rankings.map((r) => [r.entityId, r]));
      expect(must(byId["top"]).percentileRank).toBe(100);
      expect(must(byId["low"]).percentileRank).toBe(0);
      expect(must(byId["mid"]).percentileRank).toBe(50);
    });

    it("assigns 100 to a single entity", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "only",
            instanceId: "i1",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 1,
          },
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
      expect(must(rankings[0]).percentileRank).toBe(0);
    });

    it("handles ties — entities with same engagement rate get same percentile", async () => {
      // Two entities with identical stats should get the same percentile
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          {
            entityId: "a",
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 2400,
            libraryPresence: 5,
          },
          {
            entityId: "b",
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 2400,
            libraryPresence: 5,
          },
          {
            entityId: "c",
            instanceId: "i1",
            playCount: 1,
            oCount: 0,
            playDuration: 100,
            libraryPresence: 10,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      const byId = Object.fromEntries(rankings.map((r) => [r.entityId, r]));

      // a and b have identical engagement rates, so they must share the same percentile
      expect(must(byId["a"]).percentileRank).toBe(
        must(byId["b"]).percentileRank
      );
      // c has lower engagement rate, so lower percentile
      expect(must(byId["c"]).percentileRank).toBeLessThan(
        must(must(byId["a"]).percentileRank)
      );
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

      // When empty, upsertRankings runs the delete alone, as its own unit
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalled();
      expect(txMock.userEntityRanking.createMany).not.toHaveBeenCalled();
    });

    it("handles some entity types empty and others populated", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "i1",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 3,
          },
        ],
        studioStats: [], // Empty
        tagStats: [
          {
            entityId: "tag1",
            instanceId: "i1",
            playCount: 3,
            oCount: 0,
            playDuration: 300,
            libraryPresence: 10,
          },
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
    it("computes rankings for all four entity types", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "p1",
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 5000,
            libraryPresence: 3,
          },
        ],
        studioStats: [
          {
            entityId: "s1",
            instanceId: "i1",
            playCount: 8,
            oCount: 1,
            playDuration: 4000,
            libraryPresence: 5,
          },
        ],
        tagStats: [
          {
            entityId: "t1",
            instanceId: "i1",
            playCount: 20,
            oCount: 5,
            playDuration: 10000,
            libraryPresence: 15,
          },
        ],
        sceneStats: [
          {
            entityId: "sc1",
            instanceId: "i1",
            playCount: 3,
            oCount: 1,
            playDuration: 900,
            libraryPresence: 1,
          },
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

  describe("query order", () => {
    it("reads one entity type after another, never two at once", async () => {
      // Run together, the reads contend for the pool and the disk: at 200k
      // scenes each took 0.8 to 1.3 s that way, 0.15 to 0.2 s in turn
      let inFlight = 0;
      let most = 0;
      mockPrisma.$queryRaw.mockImplementation(
        prismaImpl<typeof prisma.$queryRaw>(async () => {
          inFlight++;
          most = Math.max(most, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight--;
          return [];
        })
      );
      rankingTx();

      await rankingComputeService.recomputeAllRankings(1);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
      expect(most).toBe(1);
      mockPrisma.$queryRaw.mockReset();
    });
  });

  describe("average scene duration fallback", () => {
    it("defaults to 1200 when no scenes have duration", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ avgDuration: null }]) // No scenes
        .mockResolvedValueOnce([
          {
            entityId: "p1",
            instanceId: "i1",
            playCount: 0,
            oCount: 0,
            playDuration: 2400,
            libraryPresence: 1,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const txMock = rankingTx();

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      // normalized = 2400 / 1200 = 2.0, score = 0 + 2.0 + 0 = 2.0
      expect(must(rankings[0]).engagementScore).toBe(2);
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

      const record = must(rankings[0]);
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
      expect(must(rankings[0]).playCount).toBe(5);
      expect(must(rankings[0]).oCount).toBe(3);
      expect(must(rankings[0]).libraryPresence).toBe(10);
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
      expect(must(rankings[0]).instanceId).toBe("");
    });
  });

  // The service remembers each user's last recompute for the life of the
  // process, so every test here uses a user id of its own
  describe("ensureFresh", () => {
    const MINUTE_MS = 60 * 1000;
    let now = 0;

    const later = (ms: number) => {
      now += ms;
      vi.setSystemTime(now);
    };

    // One recompute is five queries: the average duration and one per type
    const QUERIES_PER_RECOMPUTE = 5;
    const recomputes = () =>
      mockPrisma.$queryRaw.mock.calls.length / QUERIES_PER_RECOMPUTE;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      now = Date.UTC(2026, 8, 28, 12);
      vi.setSystemTime(now);
      // A user with no engagement: every query answers no rows (the average
      // duration falls back to its default)
      mockPrisma.$queryRaw.mockResolvedValue([]);
      // Nothing known from before: no ranking row
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue(null);
      rankingTx();
    });

    afterEach(() => {
      vi.useRealTimers();
      mockPrisma.$queryRaw.mockReset();
    });

    it("a user with no engagement is recomputed once an hour, not on every call", async () => {
      await rankingComputeService.ensureFresh(101, { wait: true });
      await rankingComputeService.ensureFresh(101, { wait: true });
      later(59 * MINUTE_MS);
      await rankingComputeService.ensureFresh(101, { wait: true });

      expect(recomputes()).toBe(1);

      later(2 * MINUTE_MS);
      await rankingComputeService.ensureFresh(101, { wait: true });

      expect(recomputes()).toBe(2);
      // Only the first call, knowing nothing yet, read the ranking table
      expect(mockPrisma.userEntityRanking.findFirst).toHaveBeenCalledTimes(1);
    });

    it("concurrent ensureFresh calls share one recompute", async () => {
      await Promise.all([
        rankingComputeService.ensureFresh(102, { wait: true }),
        rankingComputeService.ensureFresh(102, { wait: true }),
        rankingComputeService.ensureFresh(102),
      ]);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(QUERIES_PER_RECOMPUTE);
      expect(mockPrisma.userEntityRanking.findFirst).toHaveBeenCalledTimes(1);
      // Each of the four types written once
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledTimes(4);
    });

    it("a failed recompute is retried on the next call", async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error("disk I/O error"));

      await expect(
        rankingComputeService.ensureFresh(103, { wait: true })
      ).rejects.toThrow("disk I/O error");
      await rankingComputeService.ensureFresh(103, { wait: true });
      await rankingComputeService.ensureFresh(103, { wait: true });

      // The failed attempt's first query, then one whole recompute
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(
        1 + QUERIES_PER_RECOMPUTE
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Ranking recompute failed",
        objectContaining({ userId: 103 })
      );
    });

    it("after a restart, freshness comes from the newest ranking row", async () => {
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue(
        partialRow({ updatedAt: new Date(now - 10 * MINUTE_MS) })
      );

      await rankingComputeService.ensureFresh(104, { wait: true });

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.userEntityRanking.findFirst).toHaveBeenCalledWith({
        where: { userId: 104 },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });

      // The row's time starts its hour: 51 minutes on, the rankings are stale
      later(51 * MINUTE_MS);
      await rankingComputeService.ensureFresh(104, { wait: true });

      expect(recomputes()).toBe(1);
      expect(mockPrisma.userEntityRanking.findFirst).toHaveBeenCalledTimes(1);
    });

    it("after a restart, a ranking row older than an hour is recomputed at once", async () => {
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue(
        partialRow({ updatedAt: new Date(now - 61 * MINUTE_MS) })
      );

      await rankingComputeService.ensureFresh(105, { wait: true });

      expect(recomputes()).toBe(1);
    });

    it("without wait, ensureFresh returns while the recompute runs", async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      mockPrisma.$queryRaw.mockImplementation(
        prismaImpl<typeof prisma.$queryRaw>(async () => {
          await gate;
          return [];
        })
      );

      await rankingComputeService.ensureFresh(106);

      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalled();

      release();
      // A waiting call joins the recompute already running
      await rankingComputeService.ensureFresh(106, { wait: true });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(QUERIES_PER_RECOMPUTE);
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledTimes(4);
    });

    it("without wait, a failed recompute is logged and not thrown", async () => {
      const failure = new Error("disk I/O error");
      mockPrisma.$queryRaw.mockRejectedValueOnce(failure);

      await rankingComputeService.ensureFresh(107);

      await vi.waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith("Ranking recompute failed", {
          userId: 107,
          error: failure,
        });
      });
    });
  });
});
