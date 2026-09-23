/**
 * Integration tests for hidden tag ids in the inherited-tag cascade (item 4).
 *
 * UserHiddenEntity.entityId is user-written. A row stored before hide
 * validation existed, or through the bulk path that skipped it, can hold any
 * text. These tests run a full recompute against the real test SQLite
 * database and check that such an id is matched as a value, never run as SQL.
 *
 * Scenes are seeded under a made-up stashInstanceId so the real sync and
 * other tests never touch them. A full recompute also runs the empty-entity
 * phase over the whole test library, hence the 60 s timeouts.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "exclusion-sql-it-instance";
const TEST_USERNAME = "exclusion-sql-it-user";
const SCENE_IDS = ["1", "2", "3"];
const INHERITED_TAG_ID = "900001";
const HOSTILE = "x') OR 1=1 OR je.value IN ('y";

async function clearTestScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
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
});
