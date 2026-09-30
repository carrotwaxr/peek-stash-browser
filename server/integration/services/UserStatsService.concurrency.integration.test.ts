/**
 * A play and its per-user stats against real SQLite (item 81, item 33).
 *
 * A play or an O press bumps the performer, studio and tag stats of its
 * scene inside the history transaction, one upsert each (Prisma sends each
 * as a single INSERT ... ON CONFLICT DO UPDATE with the increment in it), so
 * concurrent plays cannot lose counts and a play is stored with its stats or
 * not at all. A stats rebuild replaces the stats from the history it read,
 * and gives way to a play that commits after that read: it reads again.
 *
 * Rows live under a made-up instance, which the real sync never touches, and
 * a user of the file's own: the stats and history tables have a foreign key
 * to User, and deleting the user at the end deletes its rows. The scene's
 * relations come from a spied stashEntityService; its row exists so the
 * access check finds it.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { incrementPlayCount } from "../../controllers/watchHistory.js";
import prisma from "../../prisma/singleton.js";
import { stashEntityService } from "../../services/StashEntityService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { objectContaining } from "../../tests/helpers/matchers.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import type { NormalizedScene } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

const INSTANCE = "stats-it";
const USERNAME = "stats_concurrency_it";
const SCENE_ID = "7810001";
/** The file's user, created in beforeAll */
let userId = 0;

/** Only the fields the stats writes and the rebuild read */
const SCENE = partialRow<NormalizedScene>({
  id: SCENE_ID,
  instanceId: INSTANCE,
  performers: [partialRow({ id: "p1" }), partialRow({ id: "p2" })],
  studio: partialRow({ id: "st1" }),
  tags: [partialRow({ id: "t1" }), partialRow({ id: "t2" })],
});

async function clearRows(): Promise<void> {
  const where = { userId };
  await prisma.watchHistory.deleteMany({ where });
  await prisma.userPerformerStats.deleteMany({ where });
  await prisma.userStudioStats.deleteMany({ where });
  await prisma.userTagStats.deleteMany({ where });
}

async function clearFixture(): Promise<void> {
  // The user's history and stats cascade
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: INSTANCE } });
  await prisma.stashInstance.deleteMany({ where: { id: INSTANCE } });
}

/** Every stats row of the user, keyed "type:id". */
async function readCounts(): Promise<
  Record<string, { oCounter: number; playCount: number }>
> {
  const where = { userId, instanceId: INSTANCE };
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

/** The same counts on every entity of the scene */
function everyEntity(counts: { oCounter: number; playCount: number }) {
  return {
    "performer:p1": counts,
    "performer:p2": counts,
    "studio:st1": counts,
    "tag:t1": counts,
    "tag:t2": counts,
  };
}

/** One play of the scene, through the handler, as the file's user. */
async function play(): Promise<number> {
  const req = reqFor(incrementPlayCount, {
    body: { sceneId: SCENE_ID, instanceId: INSTANCE },
    user: testUser({ id: userId, username: USERNAME, role: "USER" }),
  });
  const res = resFor(incrementPlayCount);
  await incrementPlayCount(req, res);
  return res._getStatus();
}

/** A history row of the scene with plays and O presses already counted. */
async function seedHistory(playCount: number, oCount: number): Promise<void> {
  await prisma.watchHistory.create({
    data: {
      userId,
      instanceId: INSTANCE,
      sceneId: SCENE_ID,
      playCount,
      oCount,
      playHistory: Array.from({ length: playCount }, (_, i) =>
        new Date(Date.UTC(2026, 0, 1 + i)).toISOString()
      ),
      oHistory: Array.from({ length: oCount }, (_, i) =>
        new Date(Date.UTC(2026, 1, 1 + i)).toISOString()
      ),
    },
  });
}

describe("a play and its stats (integration)", () => {
  beforeAll(async () => {
    await clearFixture();
    await prisma.stashInstance.create({
      data: {
        id: INSTANCE,
        name: INSTANCE,
        url: `http://${INSTANCE}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
        firstSyncedAt: new Date(),
      },
    });
    await prisma.stashScene.create({
      data: { id: SCENE_ID, stashInstanceId: INSTANCE, title: "stats probe" },
    });
    userId = (
      await prisma.user.create({
        data: { username: USERNAME, password: "x", role: "USER" },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    await clearRows();
    vi.spyOn(stashEntityService, "getScene").mockResolvedValue(SCENE);
    vi.spyOn(
      stashEntityService,
      "getScenesByIdsWithRelations"
    ).mockResolvedValue([SCENE]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearFixture();
  });

  it("ten plays at once all count", async () => {
    const statuses = await Promise.all(Array.from({ length: 10 }, play));

    expect(statuses).toEqual(Array(10).fill(200));
    expect(await readCounts()).toEqual(
      everyEntity({ oCounter: 0, playCount: 10 })
    );
    const history = await prisma.watchHistory.findUnique({
      where: {
        userId_instanceId_sceneId: {
          userId,
          instanceId: INSTANCE,
          sceneId: SCENE_ID,
        },
      },
    });
    expect(history?.playCount).toBe(10);
  });

  it("a play and its performer, studio and tag stats commit together: when a stats upsert fails, the play is not stored", async () => {
    // The database refuses the first tag's stats row (t1), inside the
    // play's transaction
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER stats_it_refuse_tag BEFORE INSERT ON UserTagStats
       WHEN NEW.userId = ${userId} AND NEW.tagId = 't1'
       BEGIN SELECT RAISE(ABORT, 'stats-it: tag stats refused'); END`
    );
    try {
      await expect(play()).rejects.toThrow(/userTagStats\.upsert/);
    } finally {
      await prisma.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS stats_it_refuse_tag"
      );
    }

    expect(await prisma.watchHistory.count({ where: { userId } })).toBe(0);
    expect(await readCounts()).toEqual({});

    // The player retries: the play lands with every stat
    expect(await play()).toBe(200);
    expect(await readCounts()).toEqual(
      everyEntity({ oCounter: 0, playCount: 1 })
    );
  });

  it("a play landing between a rebuild's read and its write is kept: the rebuild reads again", async () => {
    await seedHistory(2, 1);
    // The rebuild stops after its history read, at its scene read
    let arrive = () => {};
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scenesSpy = vi
      .spyOn(stashEntityService, "getScenesByIdsWithRelations")
      .mockImplementationOnce(async () => {
        arrive();
        await gate;
        return [SCENE];
      })
      .mockResolvedValue([SCENE]);

    const rebuild = userStatsService.rebuildAllStatsForUser(userId);
    await arrived;
    expect(await play()).toBe(200);
    release();
    await rebuild;

    // Two plays read by the rebuild and the one that landed meanwhile
    expect(await readCounts()).toEqual(
      everyEntity({ oCounter: 1, playCount: 3 })
    );
    expect(scenesSpy).toHaveBeenCalledTimes(2);
  });

  it("a rebuild with nothing landing writes once", async () => {
    await seedHistory(2, 1);
    const scenesSpy = vi
      .spyOn(stashEntityService, "getScenesByIdsWithRelations")
      .mockResolvedValue([SCENE]);
    const infoSpy = vi.spyOn(logger, "info");

    await userStatsService.rebuildAllStatsForUser(userId);

    expect(await readCounts()).toEqual(
      everyEntity({ oCounter: 1, playCount: 2 })
    );
    // One read, and its batch written
    expect(scenesSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      "Stats rebuild complete",
      objectContaining({ userId, attempt: 1 })
    );
  });
});
