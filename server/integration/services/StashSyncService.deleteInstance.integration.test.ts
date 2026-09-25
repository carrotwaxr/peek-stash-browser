/**
 * Integration tests for deleting a Stash instance (item 18).
 *
 * Two made-up, disabled instances A and B hold the same ids ("1") for all
 * eight cached types, one row in each of the 13 junctions, and a test user's
 * own and derived rows. Deleting A must leave every row of B alone (the old
 * bare-id junction deletes removed B's links too), remove everything of A,
 * and leave no row pointing at a missing parent.
 *
 * The instances point at UNREACHABLE_STASH_URL and are disabled, so no sync
 * touches them; the server process never loads them either.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  SyncBusyError,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { UNREACHABLE_STASH_URL } from "../helpers/stashTarget.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "delete-it-a";
const B = "delete-it-b";
const GHOST = "delete-it-ghost";
const INSTANCES = [A, B, GHOST];
const USERNAME = "delete_it_user";
/** A second user whose selection is B only: A's deletion is not their business */
const USERNAME_B_ONLY = "delete_it_user_b_only";
const USERNAMES = [USERNAME, USERNAME_B_ONLY];
const ID = "1";

const ENTITY_TABLES = [
  "StashClip",
  "StashImage",
  "StashGallery",
  "StashScene",
  "StashGroup",
  "StashPerformer",
  "StashStudio",
  "StashTag",
] as const;

/** Each junction: table, left id and instance columns, right id and instance */
const JUNCTIONS = [
  ["SceneTag", "sceneId", "sceneInstanceId", "tagId", "tagInstanceId"],
  [
    "ScenePerformer",
    "sceneId",
    "sceneInstanceId",
    "performerId",
    "performerInstanceId",
  ],
  ["SceneGroup", "sceneId", "sceneInstanceId", "groupId", "groupInstanceId"],
  [
    "SceneGallery",
    "sceneId",
    "sceneInstanceId",
    "galleryId",
    "galleryInstanceId",
  ],
  ["ImageTag", "imageId", "imageInstanceId", "tagId", "tagInstanceId"],
  [
    "ImagePerformer",
    "imageId",
    "imageInstanceId",
    "performerId",
    "performerInstanceId",
  ],
  [
    "ImageGallery",
    "imageId",
    "imageInstanceId",
    "galleryId",
    "galleryInstanceId",
  ],
  ["GalleryTag", "galleryId", "galleryInstanceId", "tagId", "tagInstanceId"],
  [
    "GalleryPerformer",
    "galleryId",
    "galleryInstanceId",
    "performerId",
    "performerInstanceId",
  ],
  [
    "PerformerTag",
    "performerId",
    "performerInstanceId",
    "tagId",
    "tagInstanceId",
  ],
  ["StudioTag", "studioId", "studioInstanceId", "tagId", "tagInstanceId"],
  ["GroupTag", "groupId", "groupInstanceId", "tagId", "tagInstanceId"],
  ["ClipTag", "clipId", "clipInstanceId", "tagId", "tagInstanceId"],
] as const;

/** Per-user tables and the column naming the instance of each row */
const USER_TABLES = [
  "WatchHistory",
  "SceneRating",
  "PerformerRating",
  "StudioRating",
  "TagRating",
  "GalleryRating",
  "GroupRating",
  "ImageRating",
  "ImageViewHistory",
  "PlaylistItem",
  "UserHiddenEntity",
  "UserExcludedEntity",
  "UserEntityStats",
  "UserPerformerStats",
  "UserStudioStats",
  "UserTagStats",
  "UserEntityRanking",
  "Download",
  "UserStashInstance",
] as const;

async function count(sql: string, ...values: unknown[]): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    sql,
    ...values
  );
  return Number(rows[0]?.n ?? 0);
}

/** Rows of `instanceId` in each entity table, keyed by table */
async function entityCounts(
  instanceId: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ENTITY_TABLES) {
    counts[table] = await count(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE "stashInstanceId" = ?`,
      instanceId
    );
  }
  return counts;
}

/** Rows of `instanceId` in each junction (by its left side), keyed by table */
async function junctionCounts(
  instanceId: string
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, , leftInstance] of JUNCTIONS) {
    counts[table] = await count(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE "${leftInstance}" = ?`,
      instanceId
    );
  }
  return counts;
}

/** Rows of `instanceId` in each per-user table, plus merge records */
async function userCounts(instanceId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of USER_TABLES) {
    counts[table] = await count(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE "instanceId" = ?`,
      instanceId
    );
  }
  counts.MergeRecord = await count(
    `SELECT COUNT(*) AS n FROM "MergeRecord"
     WHERE "sourceInstanceId" = ? OR "targetInstanceId" = ?`,
    instanceId,
    instanceId
  );
  return counts;
}

function all(
  tables: readonly string[],
  n: number,
  extra: Record<string, number> = {}
): Record<string, number> {
  return { ...Object.fromEntries(tables.map((t) => [t, n])), ...extra };
}

async function clearSeed(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { username: { in: USERNAMES } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  // Stats and rankings have no foreign key to User
  await prisma.userPerformerStats.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userStudioStats.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userTagStats.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userEntityRanking.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({ where: { username: { in: USERNAMES } } });

  // Junction rows cascade from their entities; clips from their scene
  for (const table of ENTITY_TABLES) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "stashInstanceId" IN (?, ?, ?)`,
      ...INSTANCES
    );
  }
  await prisma.syncState.deleteMany({
    where: { stashInstanceId: { in: INSTANCES } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
}

/** One row of each cached type, all with id "1", and one row per junction */
async function seedLibrary(instanceId: string): Promise<void> {
  const base = { id: ID, stashInstanceId: instanceId };
  await prisma.stashTag.create({ data: { ...base, name: "Tag" } });
  await prisma.stashStudio.create({ data: { ...base, name: "Studio" } });
  await prisma.stashPerformer.create({ data: { ...base, name: "Performer" } });
  await prisma.stashGroup.create({ data: { ...base, name: "Group" } });
  await prisma.stashGallery.create({
    data: { ...base, studioId: ID, studioInstanceId: instanceId },
  });
  await prisma.stashImage.create({
    data: { ...base, studioId: ID, studioInstanceId: instanceId },
  });
  await prisma.stashScene.create({
    data: { ...base, studioId: ID, title: "Scene" },
  });
  await prisma.stashClip.create({
    data: {
      ...base,
      sceneId: ID,
      sceneInstanceId: instanceId,
      seconds: 0,
      primaryTagId: ID,
      primaryTagInstanceId: instanceId,
    },
  });
  for (const [
    table,
    leftId,
    leftInstance,
    rightId,
    rightInstance,
  ] of JUNCTIONS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("${leftId}", "${leftInstance}", "${rightId}", "${rightInstance}")
       VALUES (?, ?, ?, ?)`,
      ID,
      instanceId,
      ID,
      instanceId
    );
  }
  await prisma.syncState.create({
    data: { stashInstanceId: instanceId, entityType: "scene" },
  });
}

/** The user's own and derived rows for one instance */
async function seedUserRows(userId: number, instanceId: string): Promise<void> {
  const own = { userId, instanceId };
  await prisma.watchHistory.create({ data: { ...own, sceneId: ID } });
  await prisma.sceneRating.create({
    data: { ...own, sceneId: ID, rating: 80 },
  });
  await prisma.performerRating.create({
    data: { ...own, performerId: ID, favorite: true },
  });
  await prisma.studioRating.create({ data: { ...own, studioId: ID } });
  await prisma.tagRating.create({ data: { ...own, tagId: ID } });
  await prisma.galleryRating.create({ data: { ...own, galleryId: ID } });
  await prisma.groupRating.create({ data: { ...own, groupId: ID } });
  await prisma.imageRating.create({ data: { ...own, imageId: ID } });
  await prisma.imageViewHistory.create({ data: { ...own, imageId: ID } });
  const playlist = await prisma.playlist.create({
    data: { userId, name: `delete-it ${instanceId}` },
  });
  await prisma.playlistItem.create({
    data: { playlistId: playlist.id, instanceId, sceneId: ID, position: 0 },
  });
  await prisma.userHiddenEntity.create({
    data: { ...own, entityType: "scene", entityId: ID },
  });
  await prisma.userExcludedEntity.create({
    data: { ...own, entityType: "scene", entityId: ID, reason: "hidden" },
  });
  await prisma.userEntityStats.create({
    data: { ...own, entityType: "scene", visibleCount: 1 },
  });
  await prisma.userPerformerStats.create({ data: { ...own, performerId: ID } });
  await prisma.userStudioStats.create({ data: { ...own, studioId: ID } });
  await prisma.userTagStats.create({ data: { ...own, tagId: ID } });
  await prisma.userEntityRanking.create({
    data: { ...own, entityType: "performer", entityId: ID },
  });
  await prisma.download.create({
    data: {
      ...own,
      type: "SCENE",
      entityType: "scene",
      entityId: ID,
      fileName: `scene-${instanceId}.mp4`,
    },
  });
  await prisma.userStashInstance.create({ data: own });
  await prisma.mergeRecord.create({
    data: {
      userId,
      sourceSceneId: ID,
      targetSceneId: "2",
      sourceInstanceId: instanceId,
      targetInstanceId: instanceId,
    },
  });
}

describeWithDb("StashSyncService.deleteInstance (integration)", () => {
  let userId = 0;

  beforeEach(async () => {
    await clearSeed();
    for (const [priority, id] of [A, B].entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: UNREACHABLE_STASH_URL,
          apiKey: "delete-it-key",
          enabled: false,
          priority: 950 + priority,
          firstSyncedAt: new Date(),
        },
      });
      await seedLibrary(id);
    }
    const user = await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash" },
    });
    userId = user.id;
    await seedUserRows(userId, A);
    await seedUserRows(userId, B);
    // Rows for every instance ('') stay whatever is deleted
    await prisma.userHiddenEntity.create({
      data: { userId, entityType: "tag", entityId: "9", instanceId: "" },
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId,
        entityType: "tag",
        entityId: "9",
        instanceId: "",
        reason: "hidden",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearSeed();
    await stashInstanceManager.reload();
  });

  it("deleting an instance recomputes the users whose selection contained it", async () => {
    const bOnly = await prisma.user.create({
      data: { username: USERNAME_B_ONLY, password: "not-a-real-hash" },
    });
    const bOnlyUserId = bOnly.id;
    await prisma.userStashInstance.create({
      data: { userId: bOnlyUserId, instanceId: B },
    });
    const recompute = vi
      .spyOn(exclusionComputationService, "recomputeForUser")
      .mockResolvedValue(undefined);

    const { purged } = await stashSyncService.deleteInstance(A);
    await purged;

    const recomputed = recompute.mock.calls.map((call) => call[0]);
    // The test user selected A and B; the other user only B
    expect(recomputed).toContain(userId);
    expect(recomputed).not.toContain(bOnlyUserId);
    // Once each
    expect(recomputed.filter((id) => id === userId)).toHaveLength(1);
  });

  it("deleting instance A keeps every junction row of instance B", async () => {
    const { purged } = await stashSyncService.deleteInstance(A);
    await purged;

    expect(await junctionCounts(B)).toEqual(
      all(
        JUNCTIONS.map(([table]) => table),
        1
      )
    );
    expect(await entityCounts(B)).toEqual(all(ENTITY_TABLES, 1));
  });

  it("deleting instance A removes its instance row, SyncState, entity rows and junction rows, and pragma_foreign_key_check is empty", async () => {
    const { purged } = await stashSyncService.deleteInstance(A);
    await purged;

    expect(await prisma.stashInstance.count({ where: { id: A } })).toBe(0);
    expect(
      await prisma.syncState.count({ where: { stashInstanceId: A } })
    ).toBe(0);
    expect(await entityCounts(A)).toEqual(all(ENTITY_TABLES, 0));
    expect(await junctionCounts(A)).toEqual(
      all(
        JUNCTIONS.map(([table]) => table),
        0
      )
    );
    expect(
      await prisma.$queryRawUnsafe<unknown[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
    expect(stashInstanceManager.get(A)).toBeUndefined();
    expect(stashSyncService.isSyncing()).toBe(false);
  });

  it("deleting instance A removes A's per-user rows and keeps B's", async () => {
    const { purged } = await stashSyncService.deleteInstance(A);
    await purged;

    expect(await userCounts(A)).toEqual(
      all(USER_TABLES, 0, { MergeRecord: 0 })
    );
    expect(await userCounts(B)).toEqual(
      all(USER_TABLES, 1, { MergeRecord: 1 })
    );
    // The user's rows for every instance ('') stay
    const everyInstance = { userId, instanceId: "" };
    expect(await prisma.userHiddenEntity.count({ where: everyInstance })).toBe(
      1
    );
    expect(
      await prisma.userExcludedEntity.count({ where: everyInstance })
    ).toBe(1);
    // The playlist stays; only its entry for A goes
    expect(await prisma.playlist.count({ where: { userId } })).toBe(2);
  });

  it("refuses while a sync runs and deletes nothing", async () => {
    stashSyncService["activeJob"] = "sync";
    try {
      await expect(stashSyncService.deleteInstance(A)).rejects.toBeInstanceOf(
        SyncBusyError
      );
    } finally {
      stashSyncService["activeJob"] = null;
    }

    expect(await prisma.stashInstance.count({ where: { id: A } })).toBe(1);
    expect(await entityCounts(A)).toEqual(all(ENTITY_TABLES, 1));
    expect(await userCounts(A)).toEqual(
      all(USER_TABLES, 1, { MergeRecord: 1 })
    );
  });

  it("an aborted purge stops between chunks and releases the lock; the startup sweep removes the rest", async () => {
    const { purged } = await stashSyncService.deleteInstance(A);
    stashSyncService.abort();
    await purged;

    expect(stashSyncService.isSyncing()).toBe(false);
    const left = await entityCounts(A);
    expect(Object.values(left).some((n) => n > 0)).toBe(true);

    expect(await stashSyncService.purgeUnknownInstanceCaches()).toContain(A);
    expect(await entityCounts(A)).toEqual(all(ENTITY_TABLES, 0));
    expect(await entityCounts(B)).toEqual(all(ENTITY_TABLES, 1));
  });

  it("purgeUnknownInstanceCaches removes cache rows of an instance id with no StashInstance row and keeps the others", async () => {
    await prisma.stashTag.create({
      data: { id: ID, stashInstanceId: GHOST, name: "Ghost tag" },
    });
    await prisma.stashScene.create({
      data: { id: ID, stashInstanceId: GHOST, title: "Ghost scene" },
    });
    await prisma.sceneTag.create({
      data: {
        sceneId: ID,
        sceneInstanceId: GHOST,
        tagId: ID,
        tagInstanceId: GHOST,
      },
    });
    const otherScenes = await prisma.stashScene.count({
      where: { stashInstanceId: { notIn: INSTANCES } },
    });

    expect(await stashSyncService.purgeUnknownInstanceCaches()).toContain(
      GHOST
    );

    expect(await entityCounts(GHOST)).toEqual(all(ENTITY_TABLES, 0));
    expect(await junctionCounts(GHOST)).toEqual(
      all(
        JUNCTIONS.map(([table]) => table),
        0
      )
    );
    expect(await entityCounts(A)).toEqual(all(ENTITY_TABLES, 1));
    expect(await entityCounts(B)).toEqual(all(ENTITY_TABLES, 1));
    expect(await junctionCounts(B)).toEqual(
      all(
        JUNCTIONS.map(([table]) => table),
        1
      )
    );
    expect(
      await prisma.stashScene.count({
        where: { stashInstanceId: { notIn: INSTANCES } },
      })
    ).toBe(otherScenes);
  });
});
