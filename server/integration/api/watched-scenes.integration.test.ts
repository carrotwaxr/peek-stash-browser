/**
 * GET /api/watch-history/scenes: the viewer's watched scenes, paged, sorted
 * and filtered in SQL (item 49; UD-07, UD-08).
 *
 * The rows live on the access fixture's two instances (helpers/accessFixture.ts),
 * which share scene ids: SAME is a scene on A and on B. The viewer selects A
 * and B only, so the test instance's scenes are on a deselected instance.
 * Each test replaces the viewer's history with its own rows.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { watchedScenesStatements } from "../../services/WatchHistoryQueryService.js";
import type { GetWatchedScenesResponse } from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import {
  type LargeLibraryPlanner,
  largeLibraryPlanner,
} from "../helpers/largeLibraryPlanner.js";
import { expectRefused } from "../helpers/refused.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

/** A scene id of this file's, on the fixture instances */
const sid = (n: number) => String(7710000 + n);

/** Scenes this file seeds on A (1 to 40) and B (1 to 5), each 1,000 s long */
const SCENES_A = 40;
const SCENES_B = 5;
const DURATION = 1000;
/** A scene on A with no duration */
const NO_DURATION = sid(99);

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

interface Row {
  sceneId: string;
  instanceId?: string;
  playCount?: number;
  playDuration?: number;
  resumeTime?: number | null;
  lastPlayedAt?: Date | null;
  oCount?: number;
}

describe("Watched scenes (integration)", () => {
  let viewer: { id: number; client: TestClient };

  /** Replaces the viewer's history with these rows (A unless named) */
  async function seed(rows: readonly Row[]): Promise<void> {
    await prisma.watchHistory.deleteMany({ where: { userId: viewer.id } });
    await prisma.watchHistory.createMany({
      data: rows.map((row) => ({
        userId: viewer.id,
        sceneId: row.sceneId,
        instanceId: row.instanceId ?? FX.A,
        playCount: row.playCount ?? 0,
        playDuration: row.playDuration ?? 0,
        resumeTime: row.resumeTime ?? null,
        lastPlayedAt: row.lastPlayedAt ?? null,
        oCount: row.oCount ?? 0,
      })),
    });
  }

  async function watched(query: string) {
    return viewer.client.get<GetWatchedScenesResponse>(
      `/api/watch-history/scenes?${query}`
    );
  }

  /** The answer's scenes as "id@instance", in order */
  async function keysOf(query: string): Promise<string[]> {
    const res = await watched(query);
    expect(res.status).toBe(200);
    return res.data.scenes.map((s) => `${s.id}@${s.instanceId}`);
  }

  const a = (n: number) => `${sid(n)}@${FX.A}`;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    await prisma.stashScene.createMany({
      data: [
        ...Array.from({ length: SCENES_A }, (_, i) => ({
          id: sid(i + 1),
          stashInstanceId: FX.A,
          title: `watched-${i + 1}`,
          duration: DURATION,
        })),
        ...Array.from({ length: SCENES_B }, (_, i) => ({
          id: sid(i + 1),
          stashInstanceId: FX.B,
          title: `watched-b-${i + 1}`,
          duration: DURATION,
        })),
        { id: NO_DURATION, stashInstanceId: FX.A, title: "no duration" },
      ],
    });
    viewer = await createApiUser("access_it_watched", "access_it_pass_1");
    await prisma.userStashInstance.createMany({
      data: [FX.A, FX.B].map((instanceId) => ({
        userId: viewer.id,
        instanceId,
      })),
    });
  }, 60000);

  afterAll(async () => {
    // beforeAll may have failed before it set viewer
    const created = viewer as typeof viewer | undefined;
    if (created) {
      await adminClient.delete(`/api/user/${created.id}`);
    }
    await clearAccessFixture();
  }, 60000);

  beforeEach(async () => {
    await prisma.userExcludedEntity.deleteMany({
      where: { userId: viewer.id },
    });
    await prisma.userHiddenEntity.deleteMany({ where: { userId: viewer.id } });
  });

  it("in_progress lists scenes with a resume point between 0 and 90% of the length and at least 2% watched, newest played first; a finished scene (resume 0) is not in progress", async () => {
    await seed([
      // in progress
      {
        sceneId: sid(1),
        resumeTime: 500,
        playDuration: 100,
        lastPlayedAt: hoursAgo(3),
      },
      {
        sceneId: sid(2),
        resumeTime: 100,
        playDuration: 20,
        lastPlayedAt: hoursAgo(1),
      },
      {
        sceneId: NO_DURATION,
        resumeTime: 50,
        playDuration: 1,
        lastPlayedAt: hoursAgo(2),
      },
      // finished: resume 0
      {
        sceneId: sid(3),
        playCount: 1,
        resumeTime: 0,
        playDuration: 1000,
        lastPlayedAt: hoursAgo(0.5),
      },
      // past 90%
      {
        sceneId: sid(4),
        playCount: 1,
        resumeTime: 950,
        playDuration: 900,
        lastPlayedAt: hoursAgo(0.5),
      },
      // under 2% watched
      {
        sceneId: sid(5),
        resumeTime: 100,
        playDuration: 10,
        lastPlayedAt: hoursAgo(0.5),
      },
      // an O only
      { sceneId: sid(6), oCount: 1, lastPlayedAt: hoursAgo(0.5) },
    ]);

    const res = await watched("view=in_progress");

    expect(res.status).toBe(200);
    expect(res.data.scenes.map((s) => `${s.id}@${s.instanceId}`)).toEqual([
      a(2),
      `${NO_DURATION}@${FX.A}`,
      a(1),
    ]);
    expect(res.data.total).toBe(3);
    expect(res.data.totalPlayDuration).toBe(121);
  });

  it("the limit applies after filtering: 12 asked with 8 recent finished or excluded rows still returns 12", async () => {
    const recent: Row[] = [
      ...[1, 2, 3, 4].map((n) => ({
        sceneId: sid(n),
        playCount: 1,
        resumeTime: 0,
        playDuration: 1000,
        lastPlayedAt: hoursAgo(n / 10),
      })),
      // in progress, but hidden or deleted
      ...[5, 6, 7].map((n) => ({
        sceneId: sid(n),
        resumeTime: 500,
        playDuration: 500,
        lastPlayedAt: hoursAgo(n / 10),
      })),
      {
        sceneId: FX_ID.DELETED,
        resumeTime: 5,
        playDuration: 5,
        lastPlayedAt: hoursAgo(0.8),
      },
    ];
    const older: Row[] = Array.from({ length: 14 }, (_, i) => ({
      sceneId: sid(11 + i),
      resumeTime: 300,
      playDuration: 300,
      lastPlayedAt: hoursAgo(10 + i),
    }));
    await seed([...recent, ...older]);
    for (const n of [5, 6, 7]) {
      await hideFor(viewer.id, "scene", sid(n), FX.A);
    }

    const res = await watched("view=in_progress&per_page=12");

    expect(res.status).toBe(200);
    expect(res.data.scenes.map((s) => s.id)).toEqual(
      older.slice(0, 12).map((row) => row.sceneId)
    );
    expect(res.data.total).toBe(14);
  });

  it("a deleted scene, a hidden scene, a restricted scene and a scene on a deselected instance are neither listed nor counted", async () => {
    const testInstanceId = await findTestInstanceId();
    await seed([
      {
        sceneId: sid(1),
        playCount: 1,
        playDuration: 10,
        lastPlayedAt: hoursAgo(1),
      },
      { sceneId: FX_ID.DELETED, playCount: 1, playDuration: 100 },
      { sceneId: sid(2), playCount: 1, playDuration: 200 },
      { sceneId: sid(3), playCount: 1, playDuration: 400 },
      {
        sceneId: TEST_ENTITIES.sceneWithRelations,
        instanceId: testInstanceId,
        playCount: 1,
        playDuration: 800,
      },
      // on the disabled instance
      {
        sceneId: FX_ID.ON_OFF,
        instanceId: FX.OFF,
        playCount: 1,
        playDuration: 1600,
      },
      // no scene row at all
      { sceneId: sid(98), playCount: 1, playDuration: 3200 },
    ]);
    await hideFor(viewer.id, "scene", sid(2), FX.A);
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewer.id,
        entityType: "scene",
        entityId: sid(3),
        instanceId: FX.A,
        reason: "restricted",
      },
    });

    const res = await watched("view=all");

    expect(res.status).toBe(200);
    expect(res.data.scenes.map((s) => `${s.id}@${s.instanceId}`)).toEqual([
      a(1),
    ]);
    expect(res.data.total).toBe(1);
    expect(res.data.totalPlayDuration).toBe(10);
  });

  it("the same scene id on two instances is two entries", async () => {
    await seed([
      {
        sceneId: FX_ID.SAME,
        instanceId: FX.A,
        playCount: 1,
        lastPlayedAt: hoursAgo(2),
      },
      {
        sceneId: FX_ID.SAME,
        instanceId: FX.B,
        playCount: 1,
        lastPlayedAt: hoursAgo(1),
      },
    ]);

    const res = await watched("view=all");

    expect(res.status).toBe(200);
    expect(res.data.scenes.map((s) => `${s.id}@${s.instanceId}`)).toEqual([
      `${FX_ID.SAME}@${FX.B}`,
      `${FX_ID.SAME}@${FX.A}`,
    ]);
    expect(res.data.total).toBe(2);
  });

  it("completed lists scenes played at least once whose last session finished (resume 0) or stopped within the final 10%", async () => {
    await seed([
      // completed
      {
        sceneId: sid(1),
        playCount: 1,
        resumeTime: 0,
        lastPlayedAt: hoursAgo(1),
      },
      {
        sceneId: sid(2),
        playCount: 3,
        resumeTime: null,
        lastPlayedAt: hoursAgo(2),
      },
      {
        sceneId: sid(3),
        playCount: 2,
        resumeTime: 950,
        lastPlayedAt: hoursAgo(3),
      },
      {
        sceneId: sid(4),
        playCount: 1,
        resumeTime: 900,
        lastPlayedAt: hoursAgo(4),
      },
      // stopped before the final 10%
      {
        sceneId: sid(5),
        playCount: 1,
        resumeTime: 500,
        lastPlayedAt: hoursAgo(0.5),
      },
      // never played to a count
      {
        sceneId: sid(6),
        resumeTime: 0,
        playDuration: 600,
        lastPlayedAt: hoursAgo(0.5),
      },
      {
        sceneId: sid(7),
        resumeTime: 990,
        playDuration: 990,
        lastPlayedAt: hoursAgo(0.5),
      },
      // past 90% of an unknown length
      {
        sceneId: NO_DURATION,
        playCount: 1,
        resumeTime: 990,
        lastPlayedAt: hoursAgo(0.5),
      },
    ]);

    expect(await keysOf("view=completed")).toEqual([a(1), a(2), a(3), a(4)]);
  });

  it("sort=most_watched orders by play count, longest_duration by watch time, recent by last played with never-dated rows last", async () => {
    await seed([
      {
        sceneId: sid(1),
        playCount: 1,
        playDuration: 300,
        lastPlayedAt: hoursAgo(2),
      },
      { sceneId: sid(2), playCount: 5, playDuration: 100, lastPlayedAt: null },
      {
        sceneId: sid(3),
        playCount: 3,
        playDuration: 200,
        lastPlayedAt: hoursAgo(1),
      },
      { sceneId: sid(4), playCount: 2, playDuration: 400, lastPlayedAt: null },
    ]);

    expect(await keysOf("sort=most_watched")).toEqual([a(2), a(3), a(4), a(1)]);
    expect(await keysOf("sort=longest_duration")).toEqual([
      a(4),
      a(1),
      a(3),
      a(2),
    ]);
    // The two never-dated rows last, in key order
    expect(await keysOf("sort=recent")).toEqual([a(3), a(1), a(2), a(4)]);
    expect(await keysOf("")).toEqual([a(3), a(1), a(2), a(4)]);
  });

  it("page 2 continues page 1 with no repeats; total and totalPlayDuration cover the whole view", async () => {
    // Equal play counts: the order falls to the key
    await seed(
      Array.from({ length: 5 }, (_, i) => ({
        sceneId: sid(i + 1),
        playCount: 1,
        playDuration: 10 * (i + 1),
        lastPlayedAt: hoursAgo(1),
      }))
    );

    const pages = [];
    for (const page of [1, 2, 3]) {
      const res = await watched(`sort=most_watched&per_page=2&page=${page}`);
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(5);
      expect(res.data.totalPlayDuration).toBe(150);
      pages.push(res.data.scenes.map((s) => `${s.id}@${s.instanceId}`));
    }

    expect(pages).toEqual([[a(1), a(2)], [a(3), a(4)], [a(5)]]);

    const uncounted = await watched("sort=most_watched&per_page=2&count=false");
    expect(uncounted.status).toBe(200);
    expect(uncounted.data.scenes).toHaveLength(2);
    expect(uncounted.data.total).toBeNull();
    expect(uncounted.data.totalPlayDuration).toBeNull();
  });

  it("per_page above 250 is a 400", async () => {
    expectRefused(await watched(`per_page=${PER_PAGE_MAX + 1}`), ["per_page"]);
    expectRefused(await watched("view=watched&sort=oldest"), ["view", "sort"]);
    expectRefused(await watched("page=0&count=maybe&q=x"), [
      "page",
      "count",
      "q",
    ]);
  });

  describe("page statement plan", () => {
    let planner: LargeLibraryPlanner;

    beforeAll(async () => {
      planner = await largeLibraryPlanner();
    }, 60000);

    afterAll(async () => {
      await planner.close();
    });

    it("drives from the viewer's history rows and finds each scene by its key", async () => {
      const { page } = watchedScenesStatements({
        userId: viewer.id,
        allowedInstanceIds: [FX.A, FX.B],
        view: "in_progress",
        sort: "recent",
        page: 1,
        perPage: 12,
      });

      const plan = await planner.planOf(page.sql, ...page.params);

      const line = (alias: string) =>
        plan.find((detail) => detail.startsWith(`SEARCH ${alias} `)) ??
        plan.join("\n");

      expect(plan[0]).toMatch(/^SEARCH w USING .*\(userId=\?/);
      expect(line("s")).toMatch(
        /^SEARCH s USING .*\(id=\? AND stashInstanceId=\?\)/
      );
      expect(line("e")).toMatch(/^SEARCH e USING /);
    });
  });
});
