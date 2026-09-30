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
import type { StashInstance } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { hideEntities } from "../../controllers/user.js";
import { getComputeClient } from "../../prisma/computeClient.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { userHiddenEntityService } from "../../services/UserHiddenEntityService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { mirrorInheritedTags } from "../helpers/inheritedTags.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "exclusion-sql-it-instance";
const TEST_USERNAME = "exclusion-sql-it-user";
const SCENE_IDS = ["1", "2", "3"];
const INHERITED_TAG_ID = "900001";
const CHILD_TAG_ID = "900002";
const HOSTILE = "x') OR 1=1 OR je.value IN ('y";
/** Scenes for the bulk hide, apart from the inherited-tag scenes. */
const BULK_SCENE_IDS = Array.from({ length: 250 }, (_, i) => String(1000 + i));

const EXCLUSION_INSERT = /^INSERT OR IGNORE INTO UserExcludedEntity /;
const HIDDEN_INSERT = /^INSERT OR IGNORE INTO UserHiddenEntity /;
/** The hide's increment of the viewer's excluded links per entity (B13b) */
const COUNT_INCREMENT = /^INSERT INTO UserExcludedContentCount /;

/**
 * Record the statements the compute connection runs until `restore()`, and
 * throw from the ones `failOn` matches. vi.spyOn cannot see the method
 * through Prisma's client proxy (it finds no descriptor and installs a stub
 * that swallows the statements), so the wrapper is installed by hand around
 * the bound original.
 */
async function recordCompute(failOn?: RegExp) {
  const computeClient = await getComputeClient();
  const original = computeClient.$executeRawUnsafe.bind(computeClient);
  const exec = vi.fn((...args: Parameters<typeof original>) => {
    if (failOn?.test(args[0])) {
      throw new Error("statement failed (test)");
    }
    return original(...args);
  });
  computeClient.$executeRawUnsafe = exec;
  return {
    sqls: () => exec.mock.calls.map(([sql]) => sql),
    restore: () => {
      computeClient.$executeRawUnsafe = original;
    },
  };
}

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
  let instanceRow: StashInstance;

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

    instanceRow = await prisma.stashInstance.create({
      data: {
        id: TEST_INSTANCE,
        name: TEST_INSTANCE,
        url: `http://${TEST_INSTANCE}.invalid/graphql`,
        apiKey: "x",
        enabled: true,
        firstSyncedAt: new Date(),
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
    await mirrorInheritedTags([TEST_INSTANCE]);
    await prisma.stashScene.createMany({
      data: BULK_SCENE_IDS.map((id) => ({
        id,
        stashInstanceId: TEST_INSTANCE,
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
      await exclusionComputationService.addHiddenEntities(userId, [
        {
          entityType: "tag",
          entityId: INHERITED_TAG_ID,
          instanceId: TEST_INSTANCE,
        },
      ]);
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
    // per row; the excluded-count increment in the same unit
    const sqls = exec.mock.calls.map(([sql]) => sql);
    const writes = sqls.filter((sql) => /INTO UserExcludedEntity/.test(sql));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(
      /^INSERT OR IGNORE INTO UserExcludedEntity \(.*\) SELECT .* FROM _peek_result$/
    );
    const begin = sqls.lastIndexOf("BEGIN IMMEDIATE");
    const unit = sqls.slice(begin, sqls.indexOf("COMMIT", begin) + 1);
    expect(unit.filter((sql) => COUNT_INCREMENT.test(sql))).toHaveLength(1);
    expect(unit[unit.length - 1]).toBe("COMMIT");
  }, 60000);
  it("a hide whose exclusion write fails leaves no hidden row and no exclusion", async () => {
    const recorder = await recordCompute(EXCLUSION_INSERT);
    try {
      await expect(
        userHiddenEntityService.hideEntity(
          userId,
          "tag",
          INHERITED_TAG_ID,
          TEST_INSTANCE
        )
      ).rejects.toThrow("statement failed (test)");
    } finally {
      recorder.restore();
    }

    expect(await prisma.userHiddenEntity.count({ where: { userId } })).toBe(0);
    expect(await prisma.userExcludedEntity.count({ where: { userId } })).toBe(
      0
    );
  }, 60000);

  it("a hide whose hidden-row write fails leaves no exclusion either", async () => {
    const recorder = await recordCompute(HIDDEN_INSERT);
    try {
      await expect(
        userHiddenEntityService.hideEntity(
          userId,
          "tag",
          INHERITED_TAG_ID,
          TEST_INSTANCE
        )
      ).rejects.toThrow("statement failed (test)");
    } finally {
      recorder.restore();
    }

    expect(await prisma.userHiddenEntity.count({ where: { userId } })).toBe(0);
    expect(await prisma.userExcludedEntity.count({ where: { userId } })).toBe(
      0
    );
  }, 60000);

  it("a bulk hide of 250 scenes runs one compute and one exclusions.hide unit", async () => {
    const entities = BULK_SCENE_IDS.map((entityId) => ({
      entityType: "scene",
      entityId,
      instanceId: TEST_INSTANCE,
    }));
    const req = reqFor(hideEntities, {
      body: { entities },
      user: testUser({ id: userId, username: TEST_USERNAME }),
    });
    const res = resFor(hideEntities);

    // The handler checks each instance against the manager's loaded
    // configs, which never hold this seeded one
    const loadedConfig =
      stashInstanceManager.getConfig.bind(stashInstanceManager);
    const getConfig = vi
      .spyOn(stashInstanceManager, "getConfig")
      .mockImplementation((id) =>
        id === TEST_INSTANCE ? instanceRow : loadedConfig(id)
      );
    const recorder = await recordCompute();
    try {
      await hideEntities(req, res);
    } finally {
      recorder.restore();
      getConfig.mockRestore();
    }

    expect(res._getOkBody()).toMatchObject({
      successCount: 250,
      failCount: 0,
    });
    const sqls = recorder.sqls();
    // One read snapshot, one merge statement, one hidden-rows statement,
    // one excluded-count increment
    expect(sqls.filter((sql) => sql === "BEGIN")).toHaveLength(1);
    expect(sqls.filter((sql) => EXCLUSION_INSERT.test(sql))).toHaveLength(1);
    expect(sqls.filter((sql) => HIDDEN_INSERT.test(sql))).toHaveLength(1);
    expect(sqls.filter((sql) => COUNT_INCREMENT.test(sql))).toHaveLength(1);
    expect(sqls.filter((sql) => sql === "BEGIN IMMEDIATE")).toHaveLength(1);

    expect(await prisma.userHiddenEntity.count({ where: { userId } })).toBe(
      250
    );
    expect(
      await prisma.userExcludedEntity.count({
        where: {
          userId,
          entityType: "scene",
          instanceId: TEST_INSTANCE,
          reason: "hidden",
        },
      })
    ).toBe(250);
  }, 60000);

  it("a hide requested while the user's recompute runs is in the exclusions after both finish", async () => {
    const recompute = exclusionComputationService.recomputeForUser(userId);
    const hide = userHiddenEntityService.hideEntity(
      userId,
      "tag",
      INHERITED_TAG_ID,
      TEST_INSTANCE
    );
    await Promise.all([recompute, hide]);

    expect(
      await prisma.userHiddenEntity.count({
        where: { userId, entityType: "tag", entityId: INHERITED_TAG_ID },
      })
    ).toBe(1);
    // Whichever ran first, every key the hide covers is excluded. The
    // reason can differ: the recompute's empty phase may store the childless
    // tag as `empty` first, and the merge never overwrites a row.
    const rows = await prisma.userExcludedEntity.findMany({
      where: { userId, instanceId: TEST_INSTANCE },
      select: { entityType: true, entityId: true },
    });
    expect(new Set(rows.map((r) => `${r.entityType}:${r.entityId}`))).toEqual(
      new Set([
        `tag:${INHERITED_TAG_ID}`,
        `tag:${CHILD_TAG_ID}`,
        "scene:1",
        "scene:2",
        "scene:3",
      ])
    );
  }, 60000);

  it("a merge above MERGE_CHUNK writes the hidden rows in its last unit", async () => {
    // Five rows (two hidden tags, three cascaded scenes) in chunks of two
    const chunk = exclusionComputationService["mergeChunk"];
    exclusionComputationService["mergeChunk"] = 2;
    const recorder = await recordCompute();
    try {
      await userHiddenEntityService.hideEntity(
        userId,
        "tag",
        INHERITED_TAG_ID,
        TEST_INSTANCE
      );
    } finally {
      recorder.restore();
      exclusionComputationService["mergeChunk"] = chunk;
    }

    const writes = recorder
      .sqls()
      .flatMap((sql) =>
        sql === "BEGIN IMMEDIATE" || sql === "COMMIT"
          ? [sql]
          : EXCLUSION_INSERT.test(sql)
            ? ["exclusions"]
            : HIDDEN_INSERT.test(sql)
              ? ["hidden"]
              : COUNT_INCREMENT.test(sql)
                ? ["counts"]
                : []
      );
    // The snapshot's own COMMIT comes first; then three units, the hidden
    // rows and the excluded-count increment in the last
    expect(writes.slice(writes.indexOf("BEGIN IMMEDIATE"))).toEqual([
      "BEGIN IMMEDIATE",
      "exclusions",
      "COMMIT",
      "BEGIN IMMEDIATE",
      "exclusions",
      "COMMIT",
      "BEGIN IMMEDIATE",
      "exclusions",
      "hidden",
      "counts",
      "COMMIT",
    ]);

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
        "scene:2:cascade",
        "scene:3:cascade",
      ])
    );
    expect(await prisma.userHiddenEntity.count({ where: { userId } })).toBe(1);
  }, 60000);
});
