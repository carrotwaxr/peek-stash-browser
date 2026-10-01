/**
 * Recommended scenes against the real test SQLite database (item 41.3,
 * QUERIES-13, UD-11, EXCL-20).
 *
 * On the access fixture's instances (A and B enabled, OFF disabled), the
 * scenes get performers: performer SAME is on every fixture scene of its
 * instance, and VISIBLE_A@A is on SAME@A and on an extra scene EXTRA@A.
 * Every user favorites performers, so the fixture's exclusions, instance
 * selection and watch history decide what is recommended. Every seeded row
 * is deleted before the file ends.
 *
 * Each viewer logs in, and the login starts a ranking recompute in the
 * server process (global setup's), which this worker cannot await: a viewer
 * is ready once that recompute has finished (`createViewer`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRecommendedScenes } from "../../controllers/library/scenes.js";
import prisma from "../../prisma/singleton.js";
import rankingComputeService from "../../services/RankingComputeService.js";
import { recommendationService } from "../../services/RecommendationService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { userStatsService } from "../../services/UserStatsService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFixtureDefaults,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { type TestClient, adminClient } from "../helpers/testClient.js";

const { A, B, OFF } = FX;
const { SAME, GLOBAL, DELETED, ON_OFF, B_ONLY, VISIBLE_A } = FX_ID;
/** A second scene of VISIBLE_A on A; deleted with the fixture (by instance) */
const EXTRA = "7700011";
/** A scene "synced" during the file */
const NEW = "7700012";
const PASSWORD = "access_it_rec_pass_1";
/** How long the server may take to finish a viewer's ranking recompute */
const SERVER_RANKINGS_MS = 10_000;

interface Viewer {
  id: number;
  username: string;
  client: TestClient;
}

const users: Viewer[] = [];

/**
 * Waits until the ranking recompute the viewer's login started in the
 * server process has finished (routes/auth.ts starts it without awaiting).
 * Left running, it lands between a test's steps and rewrites the viewer's
 * UserEntityRanking rows (it deletes a row a test added, as the viewer has
 * no stats), which is part of the Recommended stamp. GET /api/user-stats
 * awaits the same recompute (`ensureFresh` with `wait` joins the running
 * one) and leaves the viewer fresh for an hour, so the server starts no
 * other during the file. Polling the ranking rows cannot tell: with nothing
 * to rank, the recompute writes nothing.
 */
async function awaitServerRankings(viewer: Viewer): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `The server's ranking recompute for ${viewer.username} did not finish within ${SERVER_RANKINGS_MS} ms`
        )
      );
    }, SERVER_RANKINGS_MS);
  });
  try {
    const stats = await Promise.race([
      viewer.client.get("/api/user-stats"),
      timeout,
    ]);
    expect(
      stats.status,
      "GET /api/user-stats, which awaits the server's ranking recompute"
    ).toBe(200);
  } finally {
    clearTimeout(timer);
  }
}

async function createViewer(username: string): Promise<Viewer> {
  const { id, client } = await createApiUser(username, PASSWORD);
  const viewer = { id, username, client };
  users.push(viewer);
  await awaitServerRankings(viewer);
  return viewer;
}

async function favoritePerformer(
  userId: number,
  performerId: string,
  instanceId: string
): Promise<void> {
  await prisma.performerRating.create({
    data: { userId, performerId, instanceId, favorite: true },
  });
}

async function recommended(viewer: Viewer, page: number, perPage: number) {
  const req = reqFor(getRecommendedScenes, {
    query: { page: String(page), per_page: String(perPage) },
    user: testUser({ id: viewer.id, username: viewer.username }),
    allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
  });
  const res = resFor(getRecommendedScenes);
  await getRecommendedScenes(req, res);
  expect(res._getStatus()).toBe(200);
  return res._getOkBody();
}

const key = (scene: { id: string; instanceId: string }) =>
  `${scene.id}:${scene.instanceId}`;

const rankedKeys = async (viewer: Viewer, instances: string[]) => {
  const ranked = await recommendationService.getRankedRefs(
    viewer.id,
    instances
  );
  return ranked.refs.map(key).sort();
};

async function removeOwnRows(): Promise<void> {
  await prisma.userEntityRanking.deleteMany({
    where: { userId: { in: users.map((u) => u.id) } },
  });
  await prisma.syncState.deleteMany({
    where: { stashInstanceId: { in: [A, B, OFF] } },
  });
}

describe("Recommended scenes (integration)", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    await prisma.stashPerformer.create({
      data: { id: SAME, stashInstanceId: OFF, name: "OFF-performer" },
    });
    await prisma.stashScene.create({
      data: { id: EXTRA, stashInstanceId: A, title: `A-${EXTRA}` },
    });
    const perf = (
      sceneId: string,
      instanceId: string,
      performerId: string
    ) => ({
      sceneId,
      sceneInstanceId: instanceId,
      performerId,
      performerInstanceId: instanceId,
    });
    await prisma.scenePerformer.createMany({
      data: [
        perf(SAME, A, SAME),
        perf(GLOBAL, A, SAME),
        perf(DELETED, A, SAME),
        perf(SAME, B, SAME),
        perf(GLOBAL, B, SAME),
        perf(B_ONLY, B, SAME),
        perf(ON_OFF, OFF, SAME),
        perf(SAME, A, VISIBLE_A),
        perf(EXTRA, A, VISIBLE_A),
      ],
    });
    recommendationService.clear();
  }, 60000);

  afterAll(async () => {
    // Let the handler's background ranking refreshes finish before their rows go
    await Promise.all(
      users.map((u) => rankingComputeService.ensureFresh(u.id, { wait: true }))
    );
    await removeOwnRows();
    await clearAccessFixture();
  }, 60000);

  it("excluded scenes are never recommended and not counted", async () => {
    const viewer = await createViewer("access_it_rec_hides");
    await hideFixtureDefaults(viewer.id);
    await favoritePerformer(viewer.id, SAME, A);
    await favoritePerformer(viewer.id, SAME, B);

    const body = await recommended(viewer, 1, 24);

    // SAME@B is hidden, GLOBAL is hidden on every instance, DELETED is gone
    // and ON_OFF's instance is disabled
    expect(body.scenes.map(key).sort()).toEqual([
      `${SAME}:${A}`,
      `${B_ONLY}:${B}`,
    ]);
    expect(body.count).toBe(2);
  });

  it("a user who sees only A gets full pages from A, and count matches", async () => {
    const viewer = await createViewer("access_it_rec_a");
    await prisma.userStashInstance.create({
      data: { userId: viewer.id, instanceId: A },
    });
    await favoritePerformer(viewer.id, SAME, A);
    await favoritePerformer(viewer.id, SAME, B);

    const page1 = await recommended(viewer, 1, 1);
    const page2 = await recommended(viewer, 2, 1);
    const page3 = await recommended(viewer, 3, 1);

    expect(page1.count).toBe(2);
    expect(page2.count).toBe(2);
    expect(page1.scenes).toHaveLength(1);
    expect(page2.scenes).toHaveLength(1);
    expect(page3.scenes).toHaveLength(0);
    const seen = [...page1.scenes, ...page2.scenes].map(key).sort();
    expect(seen).toEqual([`${SAME}:${A}`, `${GLOBAL}:${A}`]);
    for (const scene of [...page1.scenes, ...page2.scenes]) {
      expect(scene.instanceId).toBe(A);
    }
  });

  it("watch history on B's scene 7700001 does not change A's 7700001", async () => {
    const viewer = await createViewer("access_it_rec_watch");
    await favoritePerformer(viewer.id, SAME, A);
    await favoritePerformer(viewer.id, SAME, B);
    // Played on B within the day: marked down below zero there
    await prisma.watchHistory.create({
      data: {
        userId: viewer.id,
        instanceId: B,
        sceneId: SAME,
        playCount: 1,
        lastPlayedAt: new Date(),
      },
    });

    const body = await recommended(viewer, 1, 24);

    const keys = body.scenes.map(key).sort();
    expect(keys).toContain(`${SAME}:${A}`);
    expect(keys).not.toContain(`${SAME}:${B}`);
    expect(keys).toEqual([
      `${SAME}:${A}`,
      `${GLOBAL}:${A}`,
      `${GLOBAL}:${B}`,
      `${B_ONLY}:${B}`,
    ]);
    expect(body.count).toBe(4);
  });

  it("one scored scene answers 200", async () => {
    const viewer = await createViewer("access_it_rec_one");
    await prisma.userStashInstance.create({
      data: { userId: viewer.id, instanceId: A },
    });
    // VISIBLE_A is on SAME@A and EXTRA@A; EXTRA hidden leaves one match
    await hideFor(viewer.id, "scene", EXTRA, A);
    await favoritePerformer(viewer.id, VISIBLE_A, A);

    const body = await recommended(viewer, 1, 24);

    expect(body.count).toBe(1);
    expect(body.scenes.map(key)).toEqual([`${SAME}:${A}`]);
  });

  it("the ranked list is kept until a hide, a rating, a play, a ranking or a scene sync", async () => {
    const viewer = await createViewer("access_it_rec_stamp");
    const instances = [A, B];
    await favoritePerformer(viewer.id, SAME, A);
    expect(await rankedKeys(viewer, instances)).toEqual([
      `${SAME}:${A}`,
      `${GLOBAL}:${A}`,
    ]);

    // A hide
    await hideFor(viewer.id, "scene", GLOBAL, A);
    expect(await rankedKeys(viewer, instances)).toEqual([`${SAME}:${A}`]);

    // A favorite
    await favoritePerformer(viewer.id, VISIBLE_A, A);
    expect(await rankedKeys(viewer, instances)).toEqual([
      `${SAME}:${A}`,
      `${EXTRA}:${A}`,
    ]);

    // A play, within the day
    await prisma.watchHistory.create({
      data: {
        userId: viewer.id,
        instanceId: A,
        sceneId: EXTRA,
        playCount: 1,
        lastPlayedAt: new Date(),
      },
    });
    expect(await rankedKeys(viewer, instances)).toEqual([`${SAME}:${A}`]);

    // A ranking recompute: performer SAME on B now ranks in the top half
    await prisma.userEntityRanking.create({
      data: {
        userId: viewer.id,
        instanceId: B,
        entityType: "performer",
        entityId: SAME,
        engagementRate: 1,
        percentileRank: 100,
      },
    });
    expect(await rankedKeys(viewer, instances)).toEqual([
      `${SAME}:${A}`,
      `${SAME}:${B}`,
      `${GLOBAL}:${B}`,
      `${B_ONLY}:${B}`,
    ]);

    // A scene sync: the new scene shows once the sync state moves
    await prisma.stashScene.create({
      data: { id: NEW, stashInstanceId: A, title: `A-${NEW}` },
    });
    await prisma.scenePerformer.create({
      data: {
        sceneId: NEW,
        sceneInstanceId: A,
        performerId: SAME,
        performerInstanceId: A,
      },
    });
    expect(await rankedKeys(viewer, instances)).not.toContain(`${NEW}:${A}`);
    await prisma.syncState.create({
      data: {
        stashInstanceId: A,
        entityType: "scene",
        lastIncrementalSyncActual: new Date(),
      },
    });
    expect(await rankedKeys(viewer, instances)).toContain(`${NEW}:${A}`);
  });

  it("the ranked list is the same object while nothing changed", async () => {
    const viewer = must(users[0], "the first viewer");
    const first = await recommendationService.getRankedRefs(viewer.id, [A, B]);
    const second = await recommendationService.getRankedRefs(viewer.id, [A, B]);
    expect(second).toBe(first);
  });

  it("an O press rescores: the stamp moves with the viewer's O count", async () => {
    const viewer = must(users[0], "the first viewer");
    const where = {
      userId_instanceId_sceneId: {
        userId: viewer.id,
        instanceId: A,
        sceneId: VISIBLE_A,
      },
    };
    await prisma.watchHistory.upsert({
      where,
      create: { userId: viewer.id, instanceId: A, sceneId: VISIBLE_A },
      update: {},
    });
    const before = await recommendationService.getRankedRefs(viewer.id, [A, B]);

    await prisma.watchHistory.update({ where, data: { oCount: 1 } });

    const after = await recommendationService.getRankedRefs(viewer.id, [A, B]);
    expect(after).not.toBe(before);
  });

  it("a viewer who only saved activity on three scenes gets a non-empty Recommended page after the stats recompute", async () => {
    const viewer = await createViewer("access_it_rec_watch_only");
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // No ratings or favorites: three plays of scenes with performers SAME and
    // VISIBLE_A on A (SAME is on SAME and GLOBAL, VISIBLE_A on SAME and EXTRA)
    await prisma.watchHistory.createMany({
      data: [SAME, GLOBAL, EXTRA].map((sceneId) => ({
        userId: viewer.id,
        instanceId: A,
        sceneId,
        playCount: 1,
        playDuration: 600,
        lastPlayedAt: monthAgo,
      })),
    });
    expect((await recommended(viewer, 1, 24)).scenes).toEqual([]);

    // What the stats page does: the stats from the history, then the rankings
    await userStatsService.rebuildAllStatsForUser(viewer.id);
    await rankingComputeService.recomputeAllRankings(viewer.id);
    recommendationService.forget(viewer.id);

    const body = await recommended(viewer, 1, 24);
    expect(body.scenes.length).toBeGreaterThan(0);
    expect(body.count).toBe(body.scenes.length);
    // VISIBLE_A ranks in the top half (its two plays over two library scenes
    // beat SAME's over four), so its two scenes are listed; SAME ranks below
    // the 50th percentile, so GLOBAL, which only it is on, is not
    expect(body.scenes.map(key).sort()).toEqual([
      `${SAME}:${A}`,
      `${EXTRA}:${A}`,
    ]);
  });
});
