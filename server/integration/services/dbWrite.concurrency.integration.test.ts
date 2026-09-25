/**
 * Concurrent writes against real SQLite (item 69, the lock-starvation
 * finding).
 *
 * Every Peek write queues in-process through `dbWrite`, so writers wait in
 * Node, one at a time, instead of inside Prisma's query engine, where a few
 * waiting transactions occupy every engine worker and starve the one holding
 * the lock. These tests are the probe's two shapes: many interactive
 * transactions at once (a hide is one, with Node round trips inside it), and
 * a single-row user write while another connection holds the write lock for
 * longer than SQLite's busy_timeout.
 *
 * Rows live under a made-up, enabled StashInstance the real sync never
 * touches, with users named dbwrite_it_<n>; deleting the users cascades their
 * hides, exclusions and ratings.
 */
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { updateSceneRating } from "../../controllers/ratings.js";
import { getComputeClient } from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { logger } from "../../utils/logger.js";

const INSTANCE = "dbwrite-it";
const SCENE_ID = "7800001";
const USER_COUNT = 40;
/** The rater is not one of the hiders: a hidden scene answers 404 */
const RATER_USERNAME = "dbwrite_it_rater";
const USERNAME_PREFIX = "dbwrite_it_";
const HOLD_MS = 6_000;

async function clearFixture(): Promise<void> {
  await prisma.user.deleteMany({
    where: { username: { startsWith: USERNAME_PREFIX } },
  });
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: INSTANCE },
  });
  await prisma.stashInstance.deleteMany({ where: { id: INSTANCE } });
}

describe("dbWrite concurrency (integration)", () => {
  const userIds: number[] = [];
  let raterId = 0;
  let errorSpy: MockInstance<typeof logger.error>;

  beforeAll(async () => {
    await clearFixture();
    await prisma.stashInstance.create({
      data: {
        id: INSTANCE,
        name: INSTANCE,
        url: `http://${INSTANCE}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
      },
    });
    await prisma.stashScene.create({
      data: { id: SCENE_ID, stashInstanceId: INSTANCE, title: "dbWrite probe" },
    });
    for (let n = 1; n <= USER_COUNT; n++) {
      const user = await prisma.user.create({
        data: {
          username: `${USERNAME_PREFIX}${n}`,
          password: "not-a-real-hash",
          role: "USER",
        },
      });
      userIds.push(user.id);
    }
    const rater = await prisma.user.create({
      data: { username: RATER_USERNAME, password: "not-a-real-hash" },
    });
    raterId = rater.id;
  }, 60_000);

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, "error");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearFixture();
  }, 60_000);

  it("forty hides at once all land", async () => {
    const outcomes = await Promise.allSettled(
      userIds.map((userId) =>
        exclusionComputationService.addHiddenEntity(
          userId,
          "scene",
          SCENE_ID,
          INSTANCE
        )
      )
    );
    const rejected = outcomes.filter((o) => o.status === "rejected");
    const reasons = rejected.map((o) => {
      const reason: unknown = o.reason;
      return reason instanceof Error
        ? reason.message.split("\n")[0]
        : String(reason);
    });

    expect(reasons, `${rejected.length} of ${USER_COUNT} hides failed`).toEqual(
      []
    );
    const rows = await prisma.userExcludedEntity.count({
      where: {
        userId: { in: userIds },
        entityType: "scene",
        entityId: SCENE_ID,
        instanceId: INSTANCE,
        reason: "hidden",
      },
    });
    expect(rows).toBe(USER_COUNT);
  }, 120_000);

  it("a rating write during a six-second write hold succeeds", async () => {
    const userId = raterId;

    // Another connection takes the write lock for longer than busy_timeout
    const holder = await getComputeClient();
    await holder.$executeRawUnsafe("BEGIN IMMEDIATE");
    const release = new Promise<void>((resolve) => {
      setTimeout(() => {
        holder.$executeRawUnsafe("COMMIT").then(
          () => resolve(),
          () => resolve()
        );
      }, HOLD_MS);
    });

    const started = Date.now();
    const req = reqFor(updateSceneRating, {
      params: { sceneId: SCENE_ID },
      body: { rating: 80, instanceId: INSTANCE },
      user: testUser({ id: userId, username: RATER_USERNAME }),
    });
    const res = resFor(updateSceneRating);
    try {
      await updateSceneRating(req, res);
    } finally {
      await release;
    }
    const elapsed = Date.now() - started;

    const logged = errorSpy.mock.calls.map(([message, meta]) => {
      const error =
        meta && typeof meta === "object" && "error" in meta
          ? meta.error
          : undefined;
      return `${message}: ${error instanceof Error ? error.message.split("\n").slice(-1)[0] : ""}`;
    });
    expect(logged, `after ${elapsed} ms`).toEqual([]);
    expect(res._getStatus(), `after ${elapsed} ms`).toBe(200);
    expect(res._getOkBody().rating).toMatchObject({
      userId,
      instanceId: INSTANCE,
      sceneId: SCENE_ID,
      rating: 80,
    });
    expect(elapsed).toBeGreaterThanOrEqual(HOLD_MS - 100);

    const row = await prisma.sceneRating.findUnique({
      where: {
        userId_instanceId_sceneId: {
          userId,
          instanceId: INSTANCE,
          sceneId: SCENE_ID,
        },
      },
    });
    expect(row?.rating).toBe(80);
  }, 60_000);
});
