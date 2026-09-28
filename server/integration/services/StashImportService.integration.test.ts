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
    const stats = await importFromStash(userId, options, [
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
});
