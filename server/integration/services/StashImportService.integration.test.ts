/**
 * Integration tests for the admin's Sync from Stash import against the real
 * test SQLite database (the mocked unit tests are in
 * tests/controllers/syncFromStash.test.ts).
 *
 * Strategy: two made-up instances, A and B, whose stubbed Stash clients
 * answer the same scene id, so the import must key every row by instance;
 * a throwaway user owns the rows and is deleted afterwards (cascade).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import prisma from "../../prisma/singleton.js";
import {
  defaultImportOptions,
  importFromStash,
} from "../../services/StashImportService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import { readHistory } from "../../utils/historyJson.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// Made-up instances: no real Stash, so background sync never touches them.
const INSTANCE_A = "import-it-a";
const INSTANCE_B = "import-it-b";
const SCENE_ID = "7";

// Stash's offset form and its stored form; U is Peek's own O
const STASH_T = "2021-10-12T18:02:42-05:00";
const T = "2021-10-12T23:02:42.000Z";
const T_PLUS_2S = "2021-10-12T23:02:44.000Z";
const U = "2021-11-01T10:00:00.000Z";

/** A Stash whose findScenes answers one scene for any filter. */
function stubClient(scene: {
  rating100: number | null;
  o_counter: number;
  o_history: string[];
}): StashClient {
  return partialRow<StashClient>({
    findScenes: () =>
      Promise.resolve({
        findScenes: {
          count: 1,
          duration: 0,
          filesize: 0,
          scenes: [
            partialRow({
              id: SCENE_ID,
              play_count: 0,
              play_history: [],
              ...scene,
            }),
          ],
        },
      }),
  });
}

/** A scene with watch time and a resume point in Stash, and no plays. */
interface WatchedScene {
  id: string;
  play_duration: number;
  resume_time: number;
}

/** A Stash whose findScenes answers `scenes` for any filter. */
function stubWatched(scenes: WatchedScene[]): StashClient {
  return partialRow<StashClient>({
    findScenes: () =>
      Promise.resolve({
        findScenes: {
          count: scenes.length,
          duration: 0,
          filesize: 0,
          scenes: scenes.map((scene) =>
            partialRow({
              rating100: null,
              o_counter: 0,
              o_history: [],
              play_count: 0,
              play_history: [],
              ...scene,
            })
          ),
        },
      }),
  });
}

describeWithDb("importFromStash (real SQLite)", () => {
  let userId: number;

  beforeAll(async () => {
    // The per-entity stats rebuild needs a configured instance; not the subject here
    vi.spyOn(userStatsService, "rebuildAllStatsForUser").mockResolvedValue(
      undefined
    );
    const user = await prisma.user.create({
      data: { username: `import-it-${Date.now()}`, password: "unused" },
    });
    userId = user.id;
    // A's scene is already rated in Peek, so A's import is an update and B's a create
    await prisma.sceneRating.create({
      data: { userId, instanceId: INSTANCE_A, sceneId: SCENE_ID, rating: 50 },
    });
    // Peek already holds an O on A's scene, pushed to Stash 2 s before T_PLUS_2S
    await prisma.watchHistory.create({
      data: {
        userId,
        instanceId: INSTANCE_A,
        sceneId: SCENE_ID,
        oCount: 2,
        oHistory: [T, U],
      },
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.user.delete({ where: { id: userId } });
  });

  it("imports the same scene id on two instances into two rating rows and two history rows, merged per instance", async () => {
    const options = defaultImportOptions();
    options.scenes.oCounter = true;
    const { stats } = await importFromStash(userId, options, [
      [
        INSTANCE_A,
        stubClient({ rating100: 80, o_counter: 1, o_history: [T_PLUS_2S] }),
      ],
      [
        INSTANCE_B,
        stubClient({ rating100: 60, o_counter: 1, o_history: [STASH_T] }),
      ],
    ]);

    expect(stats.scenes).toEqual({ checked: 2, created: 1, updated: 1 });

    const ratings = await prisma.sceneRating.findMany({
      where: { userId, sceneId: SCENE_ID },
      orderBy: { instanceId: "asc" },
    });
    expect(ratings.map((r) => [r.instanceId, r.rating])).toEqual([
      [INSTANCE_A, 80],
      [INSTANCE_B, 60],
    ]);

    const history = await prisma.watchHistory.findMany({
      where: { userId, sceneId: SCENE_ID },
      orderBy: { instanceId: "asc" },
    });
    expect(history).toHaveLength(2);
    const a = must(history[0]);
    const b = must(history[1]);
    // A: Peek's T is within 60 s of Stash's T_PLUS_2S, so it is one event; U survives
    expect(a.instanceId).toBe(INSTANCE_A);
    expect(readHistory(a.oHistory)).toEqual([T_PLUS_2S, U]);
    expect(a.oCount).toBe(2);
    // B: a new row from Stash's history alone, stored in toISOString form
    expect(b.instanceId).toBe(INSTANCE_B);
    expect(readHistory(b.oHistory)).toEqual([T]);
    expect(b.oCount).toBe(1);
  });

  it("imports watch time and resume points: the larger watch time, a Peek resume point kept, Stash's taken when Peek has none", async () => {
    // Peek watched 8 for less and has no resume point; 9 longer, with one
    await prisma.watchHistory.createMany({
      data: [
        { userId, instanceId: INSTANCE_A, sceneId: "8", playDuration: 500 },
        {
          userId,
          instanceId: INSTANCE_A,
          sceneId: "9",
          playDuration: 800,
          resumeTime: 120,
        },
      ],
    });
    const options = defaultImportOptions();
    for (const key of Object.keys(options) as Array<keyof typeof options>) {
      const fields: Record<string, boolean> = options[key];
      for (const field of Object.keys(fields)) fields[field] = false;
    }
    options.scenes.playCount = true;

    const { stats } = await importFromStash(userId, options, [
      [
        INSTANCE_A,
        stubWatched([
          { id: "8", play_duration: 900, resume_time: 60 },
          { id: "9", play_duration: 300, resume_time: 50 },
          { id: "10", play_duration: 400, resume_time: 30 },
        ]),
      ],
    ]);

    // 9 already holds more: nothing to write
    expect(stats.scenes).toEqual({ checked: 3, created: 1, updated: 1 });
    const rows = await prisma.watchHistory.findMany({
      where: {
        userId,
        instanceId: INSTANCE_A,
        sceneId: { in: ["8", "9", "10"] },
      },
      orderBy: { sceneId: "asc" },
    });
    expect(
      rows.map((row) => [
        row.sceneId,
        row.playDuration,
        row.resumeTime,
        row.playCount,
      ])
    ).toEqual([
      ["10", 400, 30, 0],
      ["8", 900, 60, 0],
      ["9", 800, 120, 0],
    ]);
  });
});

describeWithDb("importFromStash stats (real SQLite)", () => {
  // A scene with a performer, a studio and a tag in the cache, on an
  // instance of its own
  const INSTANCE = "import-it-stats";
  const SCENE = "70";
  const STUDIO = "71";
  const PERFORMER = "72";
  const TAG = "73";
  let userId: number;

  async function removeRows(): Promise<void> {
    const where = { sceneInstanceId: INSTANCE };
    await prisma.scenePerformer.deleteMany({ where });
    await prisma.sceneTag.deleteMany({ where });
    const own = { stashInstanceId: INSTANCE };
    await prisma.stashScene.deleteMany({ where: own });
    await prisma.stashPerformer.deleteMany({ where: own });
    await prisma.stashTag.deleteMany({ where: own });
    await prisma.stashStudio.deleteMany({ where: own });
  }

  beforeAll(async () => {
    await removeRows();
    const own = { stashInstanceId: INSTANCE };
    await prisma.stashStudio.create({
      data: { id: STUDIO, ...own, name: "Import studio" },
    });
    await prisma.stashPerformer.create({
      data: { id: PERFORMER, ...own, name: "Import performer" },
    });
    await prisma.stashTag.create({
      data: { id: TAG, ...own, name: "Import tag" },
    });
    await prisma.stashScene.create({
      data: { id: SCENE, ...own, title: "Import scene", studioId: STUDIO },
    });
    const scene = { sceneId: SCENE, sceneInstanceId: INSTANCE };
    await prisma.scenePerformer.create({
      data: { ...scene, performerId: PERFORMER, performerInstanceId: INSTANCE },
    });
    await prisma.sceneTag.create({
      data: { ...scene, tagId: TAG, tagInstanceId: INSTANCE },
    });
    const user = await prisma.user.create({
      data: { username: `import-it-stats-${Date.now()}`, password: "unused" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.user.delete({ where: { id: userId } });
    await removeRows();
  });

  it("an import whose stats rebuild loses the race to other plays still leaves the imported plays in the stats", async () => {
    // Every read of the rebuild is overtaken by another play (the user's
    // write generation moves), so it keeps the stats as they are
    const buildRebuild = userStatsService["buildRebuild"];
    const rebuildReads = vi.fn();
    userStatsService["buildRebuild"] = async (id) => {
      const batch = await buildRebuild.call(userStatsService, id);
      rebuildReads();
      userStatsService.bumpWriteGeneration(id);
      return batch;
    };
    const options = defaultImportOptions();
    for (const key of Object.keys(options) as Array<keyof typeof options>) {
      const fields: Record<string, boolean> = options[key];
      for (const field of Object.keys(fields)) fields[field] = false;
    }
    options.scenes.oCounter = true;
    options.scenes.playCount = true;
    const client = partialRow<StashClient>({
      findScenes: () =>
        Promise.resolve({
          findScenes: {
            count: 1,
            duration: 0,
            filesize: 0,
            scenes: [
              partialRow({
                id: SCENE,
                rating100: null,
                o_counter: 1,
                o_history: [U],
                play_count: 2,
                play_history: [T, T_PLUS_2S],
              }),
            ],
          },
        }),
    });

    try {
      await importFromStash(userId, options, [[INSTANCE, client]]);
      // Again: nothing new to write, so nothing counted twice
      await importFromStash(userId, options, [[INSTANCE, client]]);
    } finally {
      userStatsService["buildRebuild"] = buildRebuild;
    }

    expect(rebuildReads).toHaveBeenCalledTimes(4);
    const key = { userId, instanceId: INSTANCE };
    expect(
      await prisma.userPerformerStats.findMany({
        where: key,
        select: {
          performerId: true,
          playCount: true,
          oCounter: true,
          lastPlayedAt: true,
          lastOAt: true,
        },
      })
    ).toEqual([
      {
        performerId: PERFORMER,
        playCount: 2,
        oCounter: 1,
        lastPlayedAt: new Date(T_PLUS_2S),
        lastOAt: new Date(U),
      },
    ]);
    expect(
      await prisma.userStudioStats.findMany({
        where: key,
        select: { studioId: true, playCount: true, oCounter: true },
      })
    ).toEqual([{ studioId: STUDIO, playCount: 2, oCounter: 1 }]);
    expect(
      await prisma.userTagStats.findMany({
        where: key,
        select: { tagId: true, playCount: true, oCounter: true },
      })
    ).toEqual([{ tagId: TAG, playCount: 2, oCounter: 1 }]);
  });
});
