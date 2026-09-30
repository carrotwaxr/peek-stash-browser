/**
 * A history clear forgets the user's rankings inside its own write unit
 * (`afterCommit`), so a ranking recompute whose write was queued right
 * behind the clear, having read the history from before it, writes nothing:
 * its "still current" check runs when its unit starts, after the forget.
 *
 * The real writer queue and ranking service, over a mocked Prisma. Kept
 * apart from RankingComputeService.test.ts, which mocks less of the
 * controller's imports.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAllWatchHistory } from "../../controllers/watchHistory.js";
import prisma from "../../prisma/singleton.js";
import { rankingComputeService } from "../../services/RankingComputeService.js";
import { dbWrite } from "../../utils/dbWrite.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);
// Imported by the controller, not used by a clear
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {},
}));
vi.mock("../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn(),
}));
vi.mock("../../services/UserStatsService.js", () => ({
  userStatsService: {},
}));
vi.mock("../../services/RecommendationService.js", () => ({
  recommendationService: { forget: vi.fn() },
}));
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("ranking forget order", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a ranking batch queued right behind a history clear writes nothing", async () => {
    const userId = 7;
    for (const table of [
      mockPrisma.watchHistory,
      mockPrisma.userPerformerStats,
      mockPrisma.userStudioStats,
      mockPrisma.userTagStats,
      mockPrisma.userEntityRanking,
    ]) {
      table.deleteMany.mockResolvedValue({ count: 1 });
    }
    mockPrisma.userEntityRanking.createMany.mockResolvedValue({ count: 1 });
    // The average duration, then one performer to rank from the old history
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([{ avgDuration: 600 }])
      .mockResolvedValueOnce([
        {
          entityId: "p1",
          instanceId: "inst-a",
          playCount: 3,
          oCount: 1,
          playDuration: 1200,
          libraryPresence: 4,
        },
      ])
      .mockResolvedValue([]);

    // Something holds the writer while both units line up behind it
    let release = () => {};
    const holder = dbWrite(
      "holder",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    // Known and stale: the recompute starts without reading the table's age
    rankingComputeService.forget(userId);

    const res = resFor(clearAllWatchHistory);
    const clear = clearAllWatchHistory(
      reqFor(clearAllWatchHistory, { user: testUser({ id: userId }) }),
      res
    );
    const recompute = rankingComputeService.ensureFresh(userId, {
      wait: true,
    });
    await flush();
    // The ranking batch is queued: its statements are built
    expect(mockPrisma.userEntityRanking.createMany).toHaveBeenCalledTimes(1);

    release();
    await holder;
    await clear;
    await recompute;

    // One transaction: the clear's. The ranking batch found the user
    // forgotten when it started, so the old rankings are not written back.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res._getOkBody()).toEqual(
      expect.objectContaining({ success: true })
    );
  });
});
