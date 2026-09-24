/**
 * UserStatsService.updateStatsForScene against real SQLite (item 81).
 *
 * The per-user performer, studio and tag stats are bumped by one upsert each,
 * which Prisma sends as a single INSERT ... ON CONFLICT DO UPDATE with the
 * increment in it, so concurrent updates cannot lose counts. These tests keep
 * that true, and check that a failed write is logged with enough context to
 * find it while the other writes still land.
 *
 * Rows live under a made-up instance and user id: the stats tables have no
 * foreign key, and the real sync never touches the instance. The scene comes
 * from a spied stashEntityService.getScene.
 */
import { Prisma } from "@prisma/client";
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import type { NormalizedScene } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

const INSTANCE = "stats-it";
const USER_ID = 990_001;
const SCENE_ID = "s1";

/** Only the fields the stats update reads */
const SCENE = partialRow<NormalizedScene>({
  id: SCENE_ID,
  performers: [partialRow({ id: "p1" }), partialRow({ id: "p2" })],
  studio: partialRow({ id: "st1" }),
  tags: [partialRow({ id: "t1" }), partialRow({ id: "t2" })],
});

async function clearStats(): Promise<void> {
  const where = { instanceId: INSTANCE };
  await prisma.userPerformerStats.deleteMany({ where });
  await prisma.userStudioStats.deleteMany({ where });
  await prisma.userTagStats.deleteMany({ where });
}

/** Every stats row for the scene's entities, keyed "type:id". */
async function readCounts(): Promise<
  Record<string, { oCounter: number; playCount: number }>
> {
  const where = { userId: USER_ID, instanceId: INSTANCE };
  const select = { oCounter: true, playCount: true };
  const [performers, studios, tags] = await Promise.all([
    prisma.userPerformerStats.findMany({
      where,
      select: { ...select, performerId: true },
    }),
    prisma.userStudioStats.findMany({
      where,
      select: { ...select, studioId: true },
    }),
    prisma.userTagStats.findMany({ where, select: { ...select, tagId: true } }),
  ]);
  const counts: Record<string, { oCounter: number; playCount: number }> = {};
  for (const r of performers) {
    counts[`performer:${r.performerId}`] = {
      oCounter: r.oCounter,
      playCount: r.playCount,
    };
  }
  for (const r of studios) {
    counts[`studio:${r.studioId}`] = {
      oCounter: r.oCounter,
      playCount: r.playCount,
    };
  }
  for (const r of tags) {
    counts[`tag:${r.tagId}`] = { oCounter: r.oCounter, playCount: r.playCount };
  }
  return counts;
}

describe("UserStatsService.updateStatsForScene concurrency (integration)", () => {
  let errorSpy: MockInstance<typeof logger.error>;

  beforeEach(async () => {
    await clearStats();
    vi.spyOn(stashEntityService, "getScene").mockResolvedValue(SCENE);
    errorSpy = vi.spyOn(logger, "error");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearStats();
  });

  it("ten stats updates at once all count", async () => {
    const now = new Date();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        userStatsService.updateStatsForScene(
          USER_ID,
          SCENE_ID,
          1,
          1,
          now,
          now,
          INSTANCE
        )
      )
    );

    const ten = { oCounter: 10, playCount: 10 };
    expect(await readCounts()).toEqual({
      "performer:p1": ten,
      "performer:p2": ten,
      "studio:st1": ten,
      "tag:t1": ten,
      "tag:t2": ten,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("a failed stats write is logged with its context and the others still land", async () => {
    // The first tag upsert (t1) fails; every other write goes to the
    // database. vi.spyOn can't read the method through Prisma's delegate
    // proxy (its default would return undefined), so pass the real one on.
    const realUpsert = prisma.userTagStats.upsert;
    vi.spyOn(prisma.userTagStats, "upsert")
      .mockImplementation(realUpsert)
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          "Foreign key constraint violated",
          { code: "P2003", clientVersion: Prisma.prismaVersion.client }
        )
      );

    const now = new Date();
    await userStatsService.updateStatsForScene(
      USER_ID,
      SCENE_ID,
      1,
      1,
      now,
      now,
      INSTANCE
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Error updating stats for scene",
      expect.objectContaining({
        userId: USER_ID,
        sceneId: SCENE_ID,
        instanceId: INSTANCE,
        entityType: "tag",
        entityId: "t1",
        code: "P2003",
      })
    );

    const one = { oCounter: 1, playCount: 1 };
    expect(await readCounts()).toEqual({
      "performer:p1": one,
      "performer:p2": one,
      "studio:st1": one,
      "tag:t2": one,
    });
  });
});
