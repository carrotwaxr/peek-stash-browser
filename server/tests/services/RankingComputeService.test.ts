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

describe("RankingComputeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recomputeAllRankings - Int field rounding", () => {
    it("rounds playCount, oCount, and libraryPresence to integers before writing", async () => {
      // Mock getAverageSceneDuration to return 1200
      const queryRawMock = mockPrisma.$queryRaw as ReturnType<typeof vi.fn>;
      queryRawMock
        // First call: getAverageSceneDuration
        .mockResolvedValueOnce([{ avgDuration: 1200 }])
        // computePerformerRankings - return stats with float-like values from SQLite
        .mockResolvedValueOnce([
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: BigInt(5),
            oCount: BigInt(3),
            playDuration: 3600.5,
            libraryPresence: BigInt(10),
          },
        ])
        // computeStudioRankings
        .mockResolvedValueOnce([])
        // computeTagRankings
        .mockResolvedValueOnce([])
        // computeSceneRankings
        .mockResolvedValueOnce([]);

      // Mock transaction to execute the callback
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

      // Verify createMany was called with integer values for Int fields
      const createManyCall = txMock.userEntityRanking.createMany.mock.calls[0];
      expect(createManyCall).toBeDefined();
      const data = createManyCall[0].data;
      expect(data).toHaveLength(1);

      const record = data[0];
      // Int fields must be integers (Number.isInteger)
      expect(Number.isInteger(record.playCount)).toBe(true);
      expect(Number.isInteger(record.oCount)).toBe(true);
      expect(Number.isInteger(record.libraryPresence)).toBe(true);
    });

    it("handles floating-point values from SQL without BigInt conversion errors", async () => {
      // Simulate the exact scenario from issue #410:
      // SQLite returns values that after Number() conversion have floating-point artifacts
      const queryRawMock = mockPrisma.$queryRaw as ReturnType<typeof vi.fn>;
      queryRawMock
        .mockResolvedValueOnce([{ avgDuration: 1200 }])
        // Stats where playCount/oCount come as floats (SQLite type affinity edge case)
        .mockResolvedValueOnce([
          {
            entityId: "perf1",
            instanceId: "inst1",
            playCount: 5.0000000001,  // Float artifact from SQLite
            oCount: 3.0,
            playDuration: 80.31500000000001,  // The exact value from the bug report
            libraryPresence: 10.0000000001,   // Float artifact
          },
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

      // This should NOT throw "cannot be converted to a BigInt"
      await rankingComputeService.recomputeAllRankings(1);

      const createManyCall = txMock.userEntityRanking.createMany.mock.calls[0];
      const record = createManyCall[0].data[0];

      // Int fields must be exact integers
      expect(record.playCount).toBe(5);
      expect(record.oCount).toBe(3);
      expect(record.libraryPresence).toBe(10);
    });
  });
});
