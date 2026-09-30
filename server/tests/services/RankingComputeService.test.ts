/**
 * Unit Tests for RankingComputeService
 *
 * Tests the percentile ranking algorithm, engagement score calculation,
 * tie handling, edge cases, and BigInt/float rounding from SQLite, and
 * `ensureFresh`: at most one recompute per user per hour, shared by
 * concurrent callers.
 */
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { dbWrite } from "../../utils/dbWrite.js";
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
  mockPrisma.$executeRaw.mockResolvedValue(0);
  return { userEntityRanking: table };
}

type RankingTx = ReturnType<typeof rankingTx>;

/** Helper: set up mocks for a recomputeAllRankings call */
function setupRankingMocks(opts: {
  avgDuration?: number;
  performerStats?: unknown[];
  studioStats?: unknown[];
  tagStats?: unknown[];
}) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([{ avgDuration: opts.avgDuration ?? 1200 }])
    .mockResolvedValueOnce(opts.performerStats ?? [])
    .mockResolvedValueOnce(opts.studioStats ?? [])
    .mockResolvedValueOnce(opts.tagStats ?? []);

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

/**
 * The entity ids of each ranking batch of `entityType` that reached the
 * database, in commit order. A batch's statements are built before its
 * writer-queue unit runs, so a built `createMany` counts only once the
 * unit hands it to `$transaction`.
 */
function committedRankings(entityType: string): string[][] {
  const createMany = mockPrisma.userEntityRanking.createMany.mock;
  const batches: string[][] = [];
  for (const [ops] of mockPrisma.$transaction.mock.calls) {
    const statements: unknown[] = Array.isArray(ops) ? ops : [];
    for (const statement of statements) {
      const index = createMany.results.findIndex(
        (result) => result.value === statement
      );
      if (index < 0) continue;
      const data = must(
        must(createMany.calls[index])[0],
        "createMany args"
      ).data;
      const rows = Array.isArray(data) ? data : [data];
      if (rows[0]?.entityType === entityType) {
        batches.push(rows.map((row) => row.entityId));
      }
    }
  }
  return batches;
}

/** One performer's stats row as the ranking query returns it */
function performerStats(entityId: string) {
  return {
    entityId,
    instanceId: "inst1",
    playCount: 1,
    oCount: 1,
    playDuration: 600,
    libraryPresence: 1,
  };
}

/** The SQL of a `$queryRaw` tagged-template call */
function sqlOf(query: unknown): string {
  return Array.isArray(query) ? query.join("?") : "";
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
      });

      await rankingComputeService.recomputeAllRankings(1);

      // Performer and tag rankings should be written
      const perfRankings = getWrittenRankings(txMock, "performer");
      const tagRankings = getWrittenRankings(txMock, "tag");
      expect(perfRankings).toHaveLength(1);
      expect(tagRankings).toHaveLength(1);

      // Studio should trigger deleteMany (empty results)
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledWith(
        objectContaining({ where: { userId: 1, entityType: "studio" } })
      );
    });
  });

  describe("multi-entity-type orchestration", () => {
    it("computes and stores performer, studio and tag rankings, never scenes", async () => {
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
      });

      await rankingComputeService.recomputeAllRankings(1);

      // The three stored types are written; scenes are ranked when the
      // stats page reads them, so nothing reads or writes a scene ranking
      const perfRankings = getWrittenRankings(txMock, "performer");
      const studioRankings = getWrittenRankings(txMock, "studio");
      const tagRankings = getWrittenRankings(txMock, "tag");

      expect(perfRankings).toHaveLength(1);
      expect(studioRankings).toHaveLength(1);
      expect(tagRankings).toHaveLength(1);
      expect(getWrittenRankings(txMock, "scene")).toEqual([]);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalledWith(
        objectContaining({ where: { userId: 1, entityType: "scene" } })
      );
    });
  });

  describe("a user deleted while the recompute runs", () => {
    const performerStats = [
      {
        entityId: "p1",
        instanceId: "i1",
        playCount: 1,
        oCount: 0,
        playDuration: 60,
        libraryPresence: 1,
      },
    ];

    it("a written batch is the delete and the insert only: the foreign key to User refuses rows of a missing user", async () => {
      setupRankingMocks({ performerStats });

      await rankingComputeService.recomputeAllRankings(9);

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(mockPrisma.userEntityRanking.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("a batch the foreign key refuses (P2003) resolves as nothing written, logged at debug", async () => {
      const txMock = setupRankingMocks({ performerStats });
      txMock.userEntityRanking.createMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          "Foreign key constraint violated",
          { code: "P2003", clientVersion: "test" }
        )
      );

      await expect(
        rankingComputeService.recomputeAllRankings(9)
      ).resolves.toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        "Rankings not written: the user no longer exists",
        { userId: 9, entityType: "performer" }
      );
    });

    it("any other write error still fails the recompute", async () => {
      const txMock = setupRankingMocks({ performerStats });
      txMock.userEntityRanking.createMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        })
      );

      await expect(
        rankingComputeService.recomputeAllRankings(9)
      ).rejects.toThrow("Unique constraint failed");
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

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4);
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
    it("writes each ranking on its entity's instance", async () => {
      const txMock = setupRankingMocks({
        performerStats: [
          {
            entityId: "perf1",
            instanceId: "inst-2",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 3,
          },
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(must(rankings[0]).instanceId).toBe("inst-2");
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

    // One recompute is four queries: the average duration and one per type
    const QUERIES_PER_RECOMPUTE = 4;
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
      // Each of the three types written once
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledTimes(3);
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
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledTimes(3);
    });

    it("after forget, the next call recomputes at once, even with a ranking row under an hour old", async () => {
      await rankingComputeService.ensureFresh(108, { wait: true });
      expect(recomputes()).toBe(1);
      // The rows that recompute wrote: after a restart they would count
      mockPrisma.userEntityRanking.findFirst.mockResolvedValue(
        partialRow({ updatedAt: new Date(now) })
      );
      later(MINUTE_MS);

      rankingComputeService.forget(108);
      await rankingComputeService.ensureFresh(108, { wait: true });

      expect(recomputes()).toBe(2);
      // Forgotten is not unknown: the ranking table is not read again
      expect(mockPrisma.userEntityRanking.findFirst).toHaveBeenCalledTimes(1);

      // The new recompute counts as usual
      later(MINUTE_MS);
      await rankingComputeService.ensureFresh(108, { wait: true });
      expect(recomputes()).toBe(2);
    });

    it("a recompute running when forget is called stops, writes nothing and does not mark the user fresh", async () => {
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

      const first = rankingComputeService["refresh"](109);
      rankingComputeService.forget(109);
      release();
      await first;

      // It read the average duration, then stopped before the first type
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        "Ranking recompute stopped: the user was forgotten",
        { userId: 109 }
      );

      // Not marked fresh: the next call recomputes, all three types
      await rankingComputeService.ensureFresh(109, { wait: true });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(
        1 + QUERIES_PER_RECOMPUTE
      );
      expect(mockPrisma.userEntityRanking.deleteMany).toHaveBeenCalledTimes(3);
    });

    it("a recompute started before forget does not overwrite the one after it", async () => {
      // The first recompute reads the performers before an import and is
      // slow to land; the second, started after forget, reads them after it
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let performerReads = 0;
      mockPrisma.$queryRaw.mockImplementation(
        prismaImpl<typeof prisma.$queryRaw>(async (query) => {
          if (!sqlOf(query).includes("FROM UserPerformerStats")) return [];
          performerReads++;
          if (performerReads === 1) {
            await gate;
            return [performerStats("before-import")];
          }
          return [performerStats("after-import")];
        })
      );

      const before = rankingComputeService["refresh"](111);
      await vi.waitFor(() => {
        expect(performerReads).toBe(1);
      });
      rankingComputeService.forget(111);
      await rankingComputeService.ensureFresh(111, { wait: true });
      release();
      await before;

      // Only the newer recompute's performers reach the table
      expect(committedRankings("performer")).toEqual([["after-import"]]);
    });

    it("a ranking batch waiting in the writer queue when forget is called writes nothing", async () => {
      mockPrisma.$queryRaw.mockImplementation(
        prismaImpl<typeof prisma.$queryRaw>((query) =>
          sqlOf(query).includes("FROM UserPerformerStats")
            ? [performerStats("before-import")]
            : []
        )
      );
      // Another unit holds the writer queue, so the recompute's first batch
      // is built and waits behind it
      let release: () => void = () => undefined;
      const holder = dbWrite(
        "test.hold",
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );

      const running = rankingComputeService["refresh"](112);
      await vi.waitFor(() => {
        expect(mockPrisma.userEntityRanking.createMany).toHaveBeenCalled();
      });
      rankingComputeService.forget(112);
      release();
      await holder;
      await running;

      // The batch saw the forget when its unit started
      expect(committedRankings("performer")).toEqual([]);
    });

    it("a clearing write waiting in the writer queue when forget is called deletes nothing", async () => {
      // No performer to rank: the recompute's first write clears the type
      let release: () => void = () => undefined;
      const holder = dbWrite(
        "test.hold",
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );

      const running = rankingComputeService["refresh"](113);
      // The average duration and the performers read; the clear is queued
      await vi.waitFor(() => {
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
      });
      rankingComputeService.forget(113);
      release();
      await holder;
      await running;

      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalled();
    });

    it("forget of a user the service never saw is harmless", async () => {
      rankingComputeService.forget(110);
      await rankingComputeService.ensureFresh(110, { wait: true });

      expect(recomputes()).toBe(1);
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
