/**
 * Unit Tests for RankingComputeService
 *
 * Tests the ranking algorithm (`computeRankings`: engagement score and its
 * percentile, the smoothed decayed rate, the affinity from kept opens), tie
 * handling, edge cases, and BigInt/float rounding from SQLite, and
 * `ensureFresh`: at most one recompute per user per hour, shared by
 * concurrent callers.
 */
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type RawEntityStats,
  computeRankings,
  percentileRank,
  rankingComputeService,
} from "../../services/RankingComputeService.js";
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
  keptBase?: { opened: number; kept: number };
  performerStats?: unknown[];
  studioStats?: unknown[];
  tagStats?: unknown[];
}) {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([{ avgDuration: opts.avgDuration ?? 1200 }])
    .mockResolvedValueOnce([opts.keptBase ?? { opened: 10, kept: 5 }])
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
  return raw(entityId, {
    instanceId: "inst1",
    oCount: 1,
    playDuration: 600,
  });
}

/** The SQL text of a `$queryRaw` tagged-template call (fragments aside) */
function sqlOf(query: unknown): string {
  return Array.isArray(query) ? query.join("?") : "";
}

/** Whether the query is the performer read */
const isPerformerRead = (query: unknown) =>
  sqlOf(query).includes("sp.performerId AS entityId");

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
          raw("perf1", {
            instanceId: "inst1",
            playCount: 3,
            oCount: 2,
            playDuration: 2000,
            libraryPresence: 1,
          }),
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
          raw("perf1", {
            instanceId: "inst1",
            playCount: 0,
            oCount: 0,
            playDuration: 1200,
            libraryPresence: 1,
          }),
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(must(rankings[0]).engagementScore).toBe(2);
    });
  });

  describe("smoothed rate, affinity and opened and kept counts", () => {
    it("writes what computeRankings computes from the rows and the user's kept rate", async () => {
      const rows = [
        raw("liked", {
          playCount: 10,
          oCount: 2,
          playDuration: 6000,
          decayedPlayCount: 6,
          decayedOCount: 1,
          decayedPlayDuration: 3000,
          openedCount: 8,
          keptCount: 8,
          libraryPresence: 5,
        }),
        raw("dropped", {
          playCount: 0,
          playDuration: 300,
          openedCount: 9,
          keptCount: 0,
          libraryPresence: 40,
        }),
      ];
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        keptBase: { opened: 20, kept: 10 },
        performerStats: rows,
      });

      await rankingComputeService.recomputeAllRankings(1);

      const expected = computeRankings(rows, {
        avgSceneDuration: 1200,
        keptBase: 0.5,
      });
      const written = getWrittenRankings(txMock, "performer");
      expect(written).toHaveLength(2);
      for (const want of expected) {
        const row = must(written.find((r) => r.entityId === want.entityId));
        expect(row.engagementRate).toBeCloseTo(want.engagementRate, 9);
        expect(row.affinity).toBeCloseTo(want.affinity, 9);
        expect(row.openedCount).toBe(want.openedCount);
        expect(row.keptCount).toBe(want.keptCount);
      }
      const dropped = must(written.find((r) => r.entityId === "dropped"));
      expect(dropped.affinity).toBeLessThan(0);
    });

    it("a user with no history on live scenes has a kept rate of 1", async () => {
      const rows = [raw("p", { openedCount: 4, keptCount: 2 })];
      const txMock = setupRankingMocks({
        keptBase: { opened: 0, kept: 0 },
        performerStats: rows,
      });

      await rankingComputeService.recomputeAllRankings(1);

      const [want] = computeRankings(rows, {
        avgSceneDuration: 1200,
        keptBase: 1,
      });
      const [row] = getWrittenRankings(txMock, "performer");
      expect(must(row).affinity).toBeCloseTo(must(want).affinity, 9);
    });

    it("reads a library presence of 0 as 1", async () => {
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          raw("perf1", {
            instanceId: "inst1",
            playCount: 5,
            oCount: 1,
            playDuration: 1200,
            libraryPresence: 0, // Zero library presence
          }),
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(must(rankings[0]).libraryPresence).toBe(1);
      // Alone, the entity is the mean: score (1 × 5) + 1 + 5 = 11 a scene
      expect(must(rankings[0]).engagementRate).toBeCloseTo(11, 9);
    });
  });

  describe("percentile rank computation", () => {
    it("assigns 100 to top entity and 0 to bottom entity", async () => {
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          // High engagement
          raw("top", {
            instanceId: "i1",
            playCount: 100,
            oCount: 20,
            playDuration: 50000,
            libraryPresence: 1,
          }),
          // Medium engagement
          raw("mid", {
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 5000,
            libraryPresence: 1,
          }),
          // Low engagement
          raw("low", {
            instanceId: "i1",
            playCount: 1,
            oCount: 0,
            playDuration: 100,
            libraryPresence: 1,
          }),
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
          raw("only", {
            instanceId: "i1",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 1,
          }),
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      expect(rankings).toHaveLength(1);
      // One alone is the top, not the last
      expect(must(rankings[0]).percentileRank).toBe(100);
    });

    it("handles ties — entities with the same engagement score get the same percentile", async () => {
      // Two entities with identical stats should get the same percentile
      const txMock = setupRankingMocks({
        avgDuration: 1200,
        performerStats: [
          raw("a", {
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 2400,
            libraryPresence: 5,
          }),
          raw("b", {
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 2400,
            libraryPresence: 5,
          }),
          raw("c", {
            instanceId: "i1",
            playCount: 1,
            oCount: 0,
            playDuration: 100,
            libraryPresence: 10,
          }),
        ],
      });

      await rankingComputeService.recomputeAllRankings(1);

      const rankings = getWrittenRankings(txMock, "performer");
      const byId = Object.fromEntries(rankings.map((r) => [r.entityId, r]));

      // a and b have identical engagement scores, so they must share the same percentile
      expect(must(byId["a"]).percentileRank).toBe(
        must(byId["b"]).percentileRank
      );
      // c has a lower engagement score, so a lower percentile
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
          raw("perf1", {
            instanceId: "i1",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 3,
          }),
        ],
        studioStats: [], // Empty
        tagStats: [
          raw("tag1", {
            instanceId: "i1",
            playCount: 3,
            oCount: 0,
            playDuration: 300,
            libraryPresence: 10,
          }),
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
          raw("p1", {
            instanceId: "i1",
            playCount: 10,
            oCount: 2,
            playDuration: 5000,
            libraryPresence: 3,
          }),
        ],
        studioStats: [
          raw("s1", {
            instanceId: "i1",
            playCount: 8,
            oCount: 1,
            playDuration: 4000,
            libraryPresence: 5,
          }),
        ],
        tagStats: [
          raw("t1", {
            instanceId: "i1",
            playCount: 20,
            oCount: 5,
            playDuration: 10000,
            libraryPresence: 15,
          }),
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
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalledWith(
        objectContaining({ where: { userId: 1, entityType: "scene" } })
      );
    });
  });

  describe("a user deleted while the recompute runs", () => {
    const performerStats = [
      raw("p1", {
        instanceId: "i1",
        playCount: 1,
        oCount: 0,
        playDuration: 60,
        libraryPresence: 1,
      }),
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

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
      expect(most).toBe(1);
      mockPrisma.$queryRaw.mockReset();
    });
  });

  describe("average scene duration fallback", () => {
    it("defaults to 1200 when no scenes have duration", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ avgDuration: null }]) // No scenes
        .mockResolvedValueOnce([{ opened: 1, kept: 1 }])
        .mockResolvedValueOnce([
          raw("p1", {
            instanceId: "i1",
            playCount: 0,
            oCount: 0,
            playDuration: 2400,
            libraryPresence: 1,
          }),
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
          raw("perf1", {
            instanceId: "inst1",
            playCount: BigInt(5),
            oCount: BigInt(3),
            playDuration: 3600.5,
            libraryPresence: BigInt(10),
          }),
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
          raw("perf1", {
            instanceId: "inst1",
            playCount: 5.0000000001,
            oCount: 3.0,
            playDuration: 80.31500000000001,
            libraryPresence: 10.0000000001,
          }),
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
          raw("perf1", {
            instanceId: "inst-2",
            playCount: 5,
            oCount: 1,
            playDuration: 600,
            libraryPresence: 3,
          }),
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

    // One recompute is five queries: the average duration, the user's kept
    // rate and one per type
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

      // It read the average duration and the kept rate, then stopped before
      // the first type
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(mockPrisma.userEntityRanking.deleteMany).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        "Ranking recompute stopped: the user was forgotten",
        { userId: 109 }
      );

      // Not marked fresh: the next call recomputes, all three types
      await rankingComputeService.ensureFresh(109, { wait: true });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(
        2 + QUERIES_PER_RECOMPUTE
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
          if (!isPerformerRead(query)) return [];
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
          isPerformerRead(query) ? [performerStats("before-import")] : []
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
      // The average duration, the kept rate and the performers read; the
      // clear is queued
      await vi.waitFor(() => {
        expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
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

/**
 * One entity's history totals as a ranking query returns them. Unless given,
 * the plays and opens are recent (the decayed sums equal the totals) and
 * every opened scene was kept.
 */
function raw(
  entityId: string,
  stats: Partial<Omit<RawEntityStats, "entityId">> = {}
): RawEntityStats {
  const playCount = stats.playCount ?? 1;
  const oCount = stats.oCount ?? 0;
  const playDuration = stats.playDuration ?? 0;
  const openedCount = stats.openedCount ?? 1;
  const keptCount = stats.keptCount ?? openedCount;
  return {
    entityId,
    instanceId: "i1",
    playCount,
    oCount,
    playDuration,
    decayedPlayCount: playCount,
    decayedOCount: oCount,
    decayedPlayDuration: playDuration,
    openedCount,
    keptCount,
    decayedOpened: openedCount,
    decayedKept: keptCount,
    libraryPresence: 1,
    ...stats,
  };
}

function byEntity(rows: ReturnType<typeof computeRankings>) {
  return new Map(rows.map((r) => [r.entityId, r]));
}

describe("percentileRank", () => {
  it("is 100 for the first, 0 for the last of several, and 100 for one alone", () => {
    expect(percentileRank(0, 1)).toBe(100);
    expect(percentileRank(0, 3)).toBe(100);
    expect(percentileRank(1, 3)).toBe(50);
    expect(percentileRank(2, 3)).toBe(0);
    expect(percentileRank(1, 2)).toBe(0);
  });
});

describe("computeRankings", () => {
  const inputs = { avgSceneDuration: 1000, keptBase: 0.5 };

  it("ranks a one-scene entity with 3 plays below a 500-scene entity with 300 plays and 400 Os, and gives it no top affinity", () => {
    const rows = [
      raw("one-scene", {
        playCount: 3,
        playDuration: 3000,
        libraryPresence: 1,
      }),
      raw("favourite", {
        playCount: 300,
        oCount: 400,
        playDuration: 300_000,
        openedCount: 320,
        keptCount: 310,
        libraryPresence: 500,
      }),
      raw("mid", {
        playCount: 20,
        oCount: 5,
        playDuration: 20_000,
        openedCount: 25,
        keptCount: 20,
        libraryPresence: 40,
      }),
      raw("barely", {
        playCount: 1,
        playDuration: 500,
        openedCount: 6,
        keptCount: 1,
        libraryPresence: 30,
      }),
    ];

    const ranked = byEntity(computeRankings(rows, inputs));

    const oneScene = must(ranked.get("one-scene"));
    const favourite = must(ranked.get("favourite"));
    expect(favourite.percentileRank).toBe(100);
    expect(oneScene.percentileRank).toBeLessThan(favourite.percentileRank);
    const topAffinity = Math.max(
      ...[...ranked.values()].map((r) => r.affinity)
    );
    expect(oneScene.affinity).toBeLessThan(topAffinity);
  });

  it("an entity opened 20 times and never kept gets affinity -1; one kept 13 of 13 gets a positive affinity", () => {
    const rows = [
      raw("dropped", {
        playCount: 0,
        openedCount: 20,
        keptCount: 0,
        libraryPresence: 20,
      }),
      raw("kept", {
        playCount: 13,
        openedCount: 13,
        keptCount: 13,
        libraryPresence: 13,
      }),
    ];

    const ranked = byEntity(
      computeRankings(rows, { ...inputs, keptBase: 0.4 })
    );

    expect(must(ranked.get("dropped")).affinity).toBe(-1);
    expect(must(ranked.get("kept")).affinity).toBeGreaterThan(0);
  });

  it("an entity the user pressed O on is never disliked: 11 Os and 7 kept of 69 opens gives an affinity of at least 0", () => {
    const rows = [
      raw("oed", {
        playCount: 10,
        oCount: 11,
        playDuration: 20_000,
        openedCount: 69,
        keptCount: 7,
        libraryPresence: 76,
      }),
      // The same skips without an O
      raw("skipped", {
        playCount: 10,
        playDuration: 20_000,
        openedCount: 69,
        keptCount: 7,
        libraryPresence: 76,
      }),
      raw("others", { playCount: 30, libraryPresence: 10 }),
    ];

    const ranked = byEntity(
      computeRankings(rows, { ...inputs, keptBase: 0.6 })
    );

    expect(must(ranked.get("skipped")).affinity).toBeLessThan(0);
    expect(must(ranked.get("oed")).affinity).toBe(0);
  });

  it("undated or old skips move the affinity less than recent ones", () => {
    // Ten skips each; the undated ones decay to 0.25 an open
    const skips = { playCount: 0, openedCount: 10, keptCount: 0 };
    const rows = [
      raw("recent", { ...skips, libraryPresence: 10 }),
      raw("undated", {
        ...skips,
        decayedOpened: 2.5,
        decayedKept: 0,
        libraryPresence: 10,
      }),
    ];

    const ranked = byEntity(
      computeRankings(rows, { ...inputs, keptBase: 0.6 })
    );

    const recent = must(ranked.get("recent")).affinity;
    const undated = must(ranked.get("undated")).affinity;
    expect(recent).toBeLessThan(undated);
    expect(undated).toBeLessThan(0);
    // The raw counts are kept for display
    expect(must(ranked.get("undated")).openedCount).toBe(10);
  });

  it("every affinity lies in [-1, 1]", () => {
    const rows = [
      raw("hot", { playCount: 900, oCount: 900, libraryPresence: 1 }),
      raw("cold", { playCount: 0, openedCount: 500, keptCount: 0 }),
      raw("plain", { libraryPresence: 300 }),
    ];

    for (const r of computeRankings(rows, { ...inputs, keptBase: 0.9 })) {
      expect(r.affinity).toBeGreaterThanOrEqual(-1);
      expect(r.affinity).toBeLessThanOrEqual(1);
    }
  });

  it("smooths each rate toward the user's mean with k = max(5, median library presence)", () => {
    // eng = 5 × O + plays (no watch time); decayed equals it here
    const expectRates = (
      rows: RawEntityStats[],
      presences: number[],
      decayed: number[],
      k: number
    ) => {
      const mu =
        decayed.reduce((a, b) => a + b, 0) /
        presences.reduce((a, b) => a + b, 0);
      const ranked = computeRankings(rows, inputs);
      rows.forEach((row, i) => {
        const r = must(ranked.find((x) => x.entityId === row.entityId));
        expect(r.engagementRate).toBeCloseTo(
          (must(decayed[i]) + k * mu) / (must(presences[i]) + k),
          9
        );
      });
    };

    // Median 2: k is the floor of 5
    expectRates(
      [
        raw("a", { playCount: 4, libraryPresence: 1 }),
        raw("b", { playCount: 1, oCount: 1, libraryPresence: 2 }),
        raw("c", { playCount: 2, libraryPresence: 3 }),
      ],
      [1, 2, 3],
      [4, 6, 2],
      5
    );
    // Median of 10, 20, 30, 40 is 25
    expectRates(
      [
        raw("a", { playCount: 40, libraryPresence: 10 }),
        raw("b", { playCount: 10, libraryPresence: 20 }),
        raw("c", { playCount: 3, oCount: 1, libraryPresence: 30 }),
        raw("d", { playCount: 1, libraryPresence: 40 }),
      ],
      [10, 20, 30, 40],
      [40, 10, 8, 1],
      25
    );
  });

  it("weights each play by its decay: the decayed sums drive the rate, the totals the engagement score", () => {
    const [recent, old] = [
      raw("recent", { playCount: 4, libraryPresence: 10 }),
      raw("old", {
        playCount: 4,
        decayedPlayCount: 1,
        libraryPresence: 10,
      }),
    ];
    const ranked = byEntity(computeRankings([must(recent), must(old)], inputs));

    expect(must(ranked.get("recent")).engagementScore).toBe(4);
    expect(must(ranked.get("old")).engagementScore).toBe(4);
    expect(must(ranked.get("old")).engagementRate).toBeLessThan(
      must(ranked.get("recent")).engagementRate
    );
  });

  it("ties in engagement score share a percentile", () => {
    const rows = [
      raw("a", { playCount: 10, oCount: 2, libraryPresence: 5 }),
      raw("b", { playCount: 10, oCount: 2, libraryPresence: 50 }),
      raw("c", { playCount: 1, libraryPresence: 1 }),
    ];

    const ranked = byEntity(computeRankings(rows, inputs));

    expect(must(ranked.get("a")).percentileRank).toBe(100);
    expect(must(ranked.get("b")).percentileRank).toBe(100);
    expect(must(ranked.get("c")).percentileRank).toBe(0);
  });

  it("reads bigint and float columns as numbers, and the Int ones rounded", () => {
    const [r] = computeRankings(
      [
        raw("p", {
          playCount: BigInt(5),
          oCount: 3.0000000001,
          playDuration: BigInt(2000),
          decayedPlayCount: 5,
          decayedOCount: 3,
          decayedPlayDuration: 2000,
          openedCount: BigInt(7),
          keptCount: 4.9999999999,
          libraryPresence: BigInt(10),
        }),
      ],
      inputs
    );

    const ranking = must(r);
    expect(ranking.playCount).toBe(5);
    expect(ranking.oCount).toBe(3);
    expect(ranking.openedCount).toBe(7);
    expect(ranking.keptCount).toBe(5);
    expect(ranking.libraryPresence).toBe(10);
    // 5 × 3 + 2000 / 1000 + 5
    expect(ranking.engagementScore).toBeCloseTo(22, 6);
  });

  it("a user who kept nothing anywhere has no kept signal: keptBase 0 reads as no lift", () => {
    const [r] = computeRankings(
      [raw("p", { playCount: 0, openedCount: 3, keptCount: 0 })],
      { ...inputs, keptBase: 0 }
    );

    expect(Number.isFinite(must(r).affinity)).toBe(true);
    expect(must(r).affinity).toBe(0);
  });

  it("returns nothing for no rows", () => {
    expect(computeRankings([], inputs)).toEqual([]);
  });
});
