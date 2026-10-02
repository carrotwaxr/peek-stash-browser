/**
 * Scene Watched and In progress filters (media row 10), from the wire through
 * the parser into the scene builder, on seeded rows. One rule serves the
 * filters and the History page's views (owner answer 14).
 *
 * Two made-up instances reusing ids, as two Stash servers do: sws-x and
 * sws-y, both enabled and both selected by every viewer. Scene ids are
 * 7898000 + n; every scene is 1000 s long unless a case says otherwise.
 * Users: A, the viewer; B, who has history rows of their own and hid
 * scene 20@x. Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { findWatchedScenes } from "../../services/WatchHistoryQueryService.js";
import { parseListRequest } from "../../utils/listRequest.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const X = "sws-x";
const Y = "sws-y";
const INSTANCES = [X, Y];
const PREFIX = "sws-it";

const base = 7898000;
const sid = (n: number) => String(base + n);

interface Row {
  n: number;
  instance?: string;
  playCount?: number;
  resumeTime?: number | null;
  oCount?: number;
}

describeWithDb("Scene watch state filters (seeded)", () => {
  const user = { A: 0, B: 0 };

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: INSTANCES } },
    });
    await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
  }

  /** The seeded scenes a filter lists for a viewer, as numbers on one instance */
  async function ns(
    viewer: number,
    sceneFilter: Record<string, unknown>,
    instance = X
  ): Promise<number[]> {
    const request = parseListRequest(
      "scene",
      {
        filter: { per_page: 250 },
        // Only this file's scenes, so a library's own never fills the page
        scene_filter: {
          title: { value: "SWS", modifier: "INCLUDES" },
          ...sceneFilter,
        },
      },
      { userId: viewer }
    );
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
      request,
    });
    expect(total).toBe(items.length);
    return items
      .filter((s) => s.instanceId === instance)
      .map((s) => Number(s.id) - base)
      .sort((a, b) => a - b);
  }

  const watched = (viewer: number, on: boolean, instance = X) =>
    ns(viewer, { watched: on }, instance);
  const inProgress = (viewer: number, on: boolean, instance = X) =>
    ns(viewer, { in_progress: on }, instance);

  beforeAll(async () => {
    await removeRows();

    for (const [i, id] of INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: true,
          priority: 980 + i,
          firstSyncedAt: new Date(),
        },
      });
    }

    const makeUser = async (name: string) =>
      (
        await prisma.user.create({
          data: {
            username: `${PREFIX}-${name}`,
            password: "not-a-real-hash",
            role: "USER",
            stashInstances: {
              create: INSTANCES.map((instanceId) => ({ instanceId })),
            },
          },
        })
      ).id;
    user.A = await makeUser("a");
    user.B = await makeUser("b");

    // Scenes 1 to 14 and 20 on x; 1, 3, 12 and 14 on y; 7 has no known length
    const numbers = [...Array.from({ length: 14 }, (_, i) => i + 1), 20];
    await prisma.stashScene.createMany({
      data: [
        ...numbers.map((n) => ({
          id: sid(n),
          stashInstanceId: X,
          title: `SWS ${n} ${X}`,
          duration: n === 7 ? null : 1000,
        })),
        ...[1, 3, 12, 14].map((n) => ({
          id: sid(n),
          stashInstanceId: Y,
          title: `SWS ${n} ${Y}`,
          duration: 1000,
        })),
      ],
    });

    const history = (userId: number, rows: Row[]) =>
      prisma.watchHistory.createMany({
        data: rows.map((row) => ({
          userId,
          instanceId: row.instance ?? X,
          sceneId: sid(row.n),
          playCount: row.playCount ?? 0,
          resumeTime: row.resumeTime ?? null,
          oCount: row.oCount ?? 0,
        })),
      });

    await history(user.A, [
      // Completed: played and finished, or stopped in the last 10%
      { n: 1, playCount: 1, resumeTime: 0 },
      { n: 2, playCount: 2, resumeTime: 950 },
      { n: 13, playCount: 1, resumeTime: null },
      // Played, resume point before the last 10%: in progress
      { n: 3, playCount: 1, resumeTime: 500 },
      // Never played, a resume point at 1%: in progress (no 2% clause)
      { n: 4, resumeTime: 10 },
      // Resume point in the last 10% without a play: neither
      { n: 5, resumeTime: 950 },
      // An O only: neither
      { n: 6, oCount: 2 },
      // Unknown length: any resume point is in progress
      { n: 7, resumeTime: 50 },
      // 90% exactly, never played: not in progress, not completed
      { n: 8, resumeTime: 900 },
      // Just before 90%
      { n: 9, playCount: 1, resumeTime: 899 },
      // Another instance's row, on the same ids as scenes 12 and 14 here
      { n: 12, instance: Y, playCount: 1, resumeTime: 0 },
      { n: 14, instance: Y, resumeTime: 100 },
    ]);
    await history(user.B, [
      // B's rows never count for A
      { n: 10, playCount: 5, resumeTime: 0 },
      { n: 11, resumeTime: 100 },
      { n: 3, playCount: 1, resumeTime: 0 },
      // Scene 20, which B hid
      { n: 20, playCount: 1, resumeTime: 0 },
    ]);

    await prisma.userHiddenEntity.create({
      data: {
        userId: user.B,
        entityType: "scene",
        entityId: sid(20),
        instanceId: X,
      },
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: user.B,
        entityType: "scene",
        entityId: sid(20),
        instanceId: X,
        reason: "hidden",
      },
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  const ALL_X = [...Array.from({ length: 14 }, (_, i) => i + 1), 20];

  it("Watched lists the completed scenes: played and finished, or stopped in the last 10%", async () => {
    expect(await watched(user.A, true)).toEqual([1, 2, 13]);
  });

  it("Watched false lists the rest, scenes never opened included", async () => {
    expect(await watched(user.A, false)).toEqual(
      ALL_X.filter((n) => ![1, 2, 13].includes(n))
    );
  });

  it("In progress lists scenes with a resume point before the last 10%, played or not", async () => {
    // 3 and 9 were played; 4 stopped at 1%, which the History page's old 2% clause refused
    expect(await inProgress(user.A, true)).toEqual([3, 4, 7, 9]);
  });

  it("a resume point in the last 10% is not in progress", async () => {
    const found = await inProgress(user.A, true);
    expect(found).not.toContain(2);
    expect(found).not.toContain(5);
    // Exactly 90% is the last 10%
    expect(found).not.toContain(8);
  });

  it("a resume point with an unknown length is in progress", async () => {
    expect(await inProgress(user.A, true)).toContain(7);
  });

  it("In progress false is the negation: scenes with no row and with no resume point included", async () => {
    expect(await inProgress(user.A, false)).toEqual(
      ALL_X.filter((n) => ![3, 4, 7, 9].includes(n))
    );
  });

  it("the two filters together list the played scenes a viewer left part way: none are both", async () => {
    expect(await ns(user.A, { watched: true, in_progress: true })).toEqual([]);
    expect(await ns(user.A, { watched: true, in_progress: false })).toEqual([
      1, 2, 13,
    ]);
  });

  it("another user's history never counts", async () => {
    // B finished scene 10 and 3 and started 11: none of it is A's
    expect(await watched(user.A, true)).not.toContain(10);
    expect(await watched(user.A, false)).toContain(10);
    expect(await inProgress(user.A, true)).not.toContain(11);
    expect(await inProgress(user.A, false)).toContain(11);
    // And B's own view is B's rows
    expect(await watched(user.B, true)).toEqual([3, 10]);
    expect(await inProgress(user.B, true)).toEqual([11]);
  });

  it("a WatchHistory row on instance y never marks the same scene id on instance x watched or in progress", async () => {
    // Scene 12 and 14 on x have no row of A's; only their twins on y do
    expect(await watched(user.A, true)).not.toContain(12);
    expect(await watched(user.A, false)).toContain(12);
    expect(await inProgress(user.A, true)).not.toContain(14);
    expect(await watched(user.A, true, Y)).toEqual([12]);
    expect(await watched(user.A, false, Y)).toEqual([1, 3, 14]);
    expect(await inProgress(user.A, true, Y)).toEqual([14]);
    // Scenes 1 and 3 exist on y with no row there, though x's rows finish them
    expect(await watched(user.A, true, Y)).not.toContain(1);
  });

  it("a scene the viewer hid is never listed, in any form", async () => {
    // B's own row finished scene 20, and B hid it
    for (const on of [true, false]) {
      expect(await watched(user.B, on)).not.toContain(20);
      expect(await inProgress(user.B, on)).not.toContain(20);
    }
    // A hid nothing: 20 shows for A
    expect(await watched(user.A, false)).toContain(20);
  });

  it("the History page's In progress view lists the same scenes as the filter", async () => {
    for (const viewer of [user.A, user.B]) {
      const page = await findWatchedScenes({
        userId: viewer,
        allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
        request: {
          view: "in_progress",
          sort: "recent",
          page: 1,
          perPage: 100,
          count: true,
        },
      });
      const keys = page.scenes.map((s) => `${s.id}@${s.instanceId}`).sort();
      const filtered = [
        ...(await inProgress(viewer, true, X)).map((n) => `${sid(n)}@${X}`),
        ...(await inProgress(viewer, true, Y)).map((n) => `${sid(n)}@${Y}`),
      ].sort();
      expect(keys).toEqual(filtered);
      expect(page.total).toBe(filtered.length);
    }
  });

  it("the History page's Completed view lists the same scenes as Watched", async () => {
    const page = await findWatchedScenes({
      userId: user.A,
      allowedInstanceIds: await getUserAllowedInstanceIds(user.A),
      request: {
        view: "completed",
        sort: "recent",
        page: 1,
        perPage: 100,
        count: true,
      },
    });
    expect(page.scenes.map((s) => `${s.id}@${s.instanceId}`).sort()).toEqual(
      [
        ...(await watched(user.A, true, X)).map((n) => `${sid(n)}@${X}`),
        ...(await watched(user.A, true, Y)).map((n) => `${sid(n)}@${Y}`),
      ].sort()
    );
  });
});
