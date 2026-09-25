/**
 * Integration tests for hidden tag ids in the inherited-tag cascade (item 4).
 *
 * UserHiddenEntity.entityId is user-written. A row stored before hide
 * validation existed, or through the bulk path that skipped it, can hold any
 * text. These tests run a full recompute against the real test SQLite
 * database and check that such an id is matched as a value, never run as SQL.
 *
 * Scenes, the inherited tag and an enabled StashInstance row are seeded under
 * a made-up stashInstanceId so the real sync and other tests never touch
 * them. A hide resolves through StashTag on the user's allowed instances
 * (the user has no UserStashInstance rows, so every enabled instance is
 * allowed), and the cascade query filters by allowed instance. A full
 * recompute also runs the empty-entity phase over the whole test library,
 * hence the 60 s timeouts.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getComputeClient } from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "exclusion-sql-it-instance";
const TEST_USERNAME = "exclusion-sql-it-user";
const SCENE_IDS = ["1", "2", "3"];
const INHERITED_TAG_ID = "900001";
const CHILD_TAG_ID = "900002";
const HOSTILE = "x') OR 1=1 OR je.value IN ('y";

async function clearTestScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashTag.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashInstance.deleteMany({ where: { id: TEST_INSTANCE } });
}

describeWithDb("ExclusionComputationService hidden ids (integration)", () => {
  let userId: number;

  beforeAll(async () => {
    // Remove leftovers from an interrupted run; the user cascade clears its rows.
    await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
    await clearTestScenes();

    const user = await prisma.user.create({
      data: {
        username: TEST_USERNAME,
        password: "not-a-real-hash",
        role: "USER",
      },
    });
    userId = user.id;

    await prisma.stashInstance.create({
      data: {
        id: TEST_INSTANCE,
        name: TEST_INSTANCE,
        url: `http://${TEST_INSTANCE}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
      },
    });
    await prisma.stashTag.createMany({
      data: [
        {
          id: INHERITED_TAG_ID,
          stashInstanceId: TEST_INSTANCE,
          name: "Inherited (integration)",
        },
        {
          id: CHILD_TAG_ID,
          stashInstanceId: TEST_INSTANCE,
          name: "Child of inherited (integration)",
          parentIds: JSON.stringify([INHERITED_TAG_ID]),
        },
      ],
    });
    await prisma.stashScene.createMany({
      data: SCENE_IDS.map((id) => ({
        id,
        stashInstanceId: TEST_INSTANCE,
        inheritedTagIds: JSON.stringify([INHERITED_TAG_ID]),
      })),
    });
  }, 60000);

  afterEach(async () => {
    await prisma.userHiddenEntity.deleteMany({ where: { userId } });
    await prisma.userExcludedEntity.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: TEST_USERNAME } });
    await clearTestScenes();
  }, 60000);

  it("a hostile hidden tag id excludes nothing", async () => {
    await prisma.userHiddenEntity.create({
      data: {
        userId,
        entityType: "tag",
        entityId: HOSTILE,
        instanceId: TEST_INSTANCE,
      },
    });

    await exclusionComputationService.recomputeForUser(userId);

    const count = await prisma.userExcludedEntity.count({
      where: { userId, entityType: "scene", instanceId: TEST_INSTANCE },
    });
    expect(count).toBe(0);
  }, 60000);

  it("a real hidden tag id still cascades to the scenes that inherit it", async () => {
    await prisma.userHiddenEntity.create({
      data: {
        userId,
        entityType: "tag",
        entityId: INHERITED_TAG_ID,
        instanceId: TEST_INSTANCE,
      },
    });

    await exclusionComputationService.recomputeForUser(userId);

    const rows = await prisma.userExcludedEntity.findMany({
      where: { userId, entityType: "scene", instanceId: TEST_INSTANCE },
      select: { entityId: true, reason: true },
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.entityId))).toEqual(new Set(SCENE_IDS));
    expect(rows.every((r) => r.reason === "cascade")).toBe(true);
  }, 60000);

  it("hiding a tag inserts its descendants and cascades with one statement and never overwrites an existing row", async () => {
    // A row a restriction already stored for one of the cascaded scenes
    await prisma.userExcludedEntity.create({
      data: {
        userId,
        entityType: "scene",
        entityId: "2",
        instanceId: TEST_INSTANCE,
        reason: "restricted",
      },
    });
    // Record the statements the compute connection runs. vi.spyOn cannot
    // see the method through Prisma's client proxy (it finds no descriptor
    // and installs a stub that swallows the statements), so the wrapper is
    // installed by hand around the bound original.
    const computeClient = await getComputeClient();
    const original = computeClient.$executeRawUnsafe.bind(computeClient);
    const exec = vi.fn(original);
    computeClient.$executeRawUnsafe = exec;
    try {
      await exclusionComputationService.addHiddenEntity(
        userId,
        "tag",
        INHERITED_TAG_ID,
        TEST_INSTANCE
      );
    } finally {
      computeClient.$executeRawUnsafe = original;
    }

    const rows = await prisma.userExcludedEntity.findMany({
      where: { userId, instanceId: TEST_INSTANCE },
      select: { entityType: true, entityId: true, reason: true },
    });
    expect(
      new Set(rows.map((r) => `${r.entityType}:${r.entityId}:${r.reason}`))
    ).toEqual(
      new Set([
        `tag:${INHERITED_TAG_ID}:hidden`,
        `tag:${CHILD_TAG_ID}:hidden`,
        "scene:1:cascade",
        "scene:2:restricted",
        "scene:3:cascade",
      ])
    );
    // One INSERT OR IGNORE ... SELECT from the TEMP result, not one upsert
    // per row
    const writes = exec.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => /UserExcludedEntity/.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(
      /^INSERT OR IGNORE INTO UserExcludedEntity \(.*\) SELECT .* FROM _peek_result$/
    );
  }, 60000);
});
