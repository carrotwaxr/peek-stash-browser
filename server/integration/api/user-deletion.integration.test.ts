/**
 * Deleting a user deletes all their data (invariant 6).
 *
 * Every table with a `userId` column holds per-user data. The list is read
 * from the database, so a table added later fails the first check here
 * until the test seeds it, and the delete is then proven for it too. Most
 * of these tables cascade from User through a foreign key;
 * UserPerformerStats, UserStudioStats, UserTagStats and UserEntityRanking
 * have none, so `deleteUser` deletes their rows itself, and data migration
 * 008 deletes the rows earlier deletes left behind.
 *
 * The users here never log in, so the server starts no ranking recompute
 * for them (routes/auth.ts) that could land between the steps.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { deleteOrphanedUserRows } from "../../services/DataMigrationService.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

const PASSWORD = "user_delete_it_pass_1";
const GROUP_NAME = "user_delete_it_group";
/** The per-user tables with no foreign key to User */
const UNLINKED_TABLES = [
  "UserPerformerStats",
  "UserStudioStats",
  "UserTagStats",
  "UserEntityRanking",
] as const;

/** Every table with a userId column, from the database's own schema */
async function userIdTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT m.name FROM sqlite_master m
    WHERE m.type = 'table'
      AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) c WHERE c.name = 'userId')
    ORDER BY m.name
  `;
  return rows.map((row) => row.name);
}

/** The user's row count in each table */
async function rowsOf(
  tables: readonly string[],
  userId: number
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT COUNT(*) AS n FROM "${table}" WHERE userId = ?`,
      userId
    );
    counts[table] = Number(must(rows[0], `the count of ${table}`).n);
  }
  return counts;
}

async function createUser(username: string): Promise<number> {
  const created = await adminClient.post<{ user?: { id: number } }>(
    "/api/user/create",
    { username, password: PASSWORD, role: "USER" }
  );
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  return must(created.data.user, `the created user ${username}`).id;
}

/**
 * One row of the user's in every table with a userId column, keyed by
 * table. The instance only needs to exist for UserStashInstance's key.
 */
function seeders(
  userId: number,
  instanceId: string,
  groupId: number
): Record<string, () => Promise<unknown>> {
  const entity = { userId, instanceId };
  return {
    CustomTheme: () =>
      prisma.customTheme.create({
        data: { userId, name: "user-delete-it", config: {} },
      }),
    Download: () =>
      prisma.download.create({
        data: { ...entity, type: "SCENE", fileName: "user-delete-it.mp4" },
      }),
    GalleryRating: () =>
      prisma.galleryRating.create({ data: { ...entity, galleryId: "1" } }),
    GroupRating: () =>
      prisma.groupRating.create({ data: { ...entity, groupId: "1" } }),
    ImageRating: () =>
      prisma.imageRating.create({ data: { ...entity, imageId: "1" } }),
    ImageViewHistory: () =>
      prisma.imageViewHistory.create({ data: { ...entity, imageId: "1" } }),
    MergeRecord: () =>
      prisma.mergeRecord.create({
        data: { userId, sourceSceneId: "1", targetSceneId: "2" },
      }),
    PerformerRating: () =>
      prisma.performerRating.create({
        data: { ...entity, performerId: "1" },
      }),
    Playlist: () =>
      prisma.playlist.create({
        data: {
          userId,
          name: "user-delete-it",
          items: { create: { sceneId: "1", instanceId, position: 0 } },
          shares: { create: { groupId } },
        },
      }),
    SceneRating: () =>
      prisma.sceneRating.create({ data: { ...entity, sceneId: "1" } }),
    StudioRating: () =>
      prisma.studioRating.create({ data: { ...entity, studioId: "1" } }),
    TagRating: () =>
      prisma.tagRating.create({ data: { ...entity, tagId: "1" } }),
    UserCarousel: () =>
      prisma.userCarousel.create({
        data: { userId, title: "user-delete-it", rules: {} },
      }),
    UserContentRestriction: () =>
      prisma.userContentRestriction.create({
        data: { userId, entityType: "tags", mode: "EXCLUDE", entityIds: "[]" },
      }),
    UserEntityRanking: () =>
      prisma.userEntityRanking.create({
        data: { ...entity, entityType: "performer", entityId: "1" },
      }),
    UserEntityStats: () =>
      prisma.userEntityStats.create({
        data: { ...entity, entityType: "scene", visibleCount: 1 },
      }),
    UserExcludedEntity: () =>
      prisma.userExcludedEntity.create({
        data: {
          ...entity,
          entityType: "scene",
          entityId: "1",
          reason: "hidden",
        },
      }),
    UserGroupMembership: () =>
      prisma.userGroupMembership.create({ data: { userId, groupId } }),
    UserHiddenEntity: () =>
      prisma.userHiddenEntity.create({
        data: { ...entity, entityType: "scene", entityId: "1" },
      }),
    UserPerformerStats: () =>
      prisma.userPerformerStats.create({
        data: { ...entity, performerId: "1" },
      }),
    UserStashInstance: () => prisma.userStashInstance.create({ data: entity }),
    UserStudioStats: () =>
      prisma.userStudioStats.create({ data: { ...entity, studioId: "1" } }),
    UserTagStats: () =>
      prisma.userTagStats.create({ data: { ...entity, tagId: "1" } }),
    WatchHistory: () =>
      prisma.watchHistory.create({ data: { ...entity, sceneId: "1" } }),
  };
}

/** One row in each unlinked table, for the user id given */
async function seedUnlinked(userId: number, instanceId: string) {
  const entity = { userId, instanceId };
  await prisma.userPerformerStats.create({
    data: { ...entity, performerId: "1" },
  });
  await prisma.userStudioStats.create({ data: { ...entity, studioId: "1" } });
  await prisma.userTagStats.create({ data: { ...entity, tagId: "1" } });
  await prisma.userEntityRanking.create({
    data: { ...entity, entityType: "performer", entityId: "1" },
  });
}

describe("Deleting a user (integration)", () => {
  let instanceId: string;
  let groupId: number;
  const createdUserIds: number[] = [];
  const orphanIds: number[] = [];

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    instanceId = (
      await prisma.stashInstance.findFirstOrThrow({ select: { id: true } })
    ).id;
    groupId = (await prisma.userGroup.create({ data: { name: GROUP_NAME } }))
      .id;
  });

  afterAll(async () => {
    // Whatever a failed test left: the users (their linked rows cascade),
    // then every userId row of theirs and of the orphan ids
    const ids = [...createdUserIds, ...orphanIds];
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    for (const table of await userIdTables()) {
      for (const id of ids) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE userId = ?`,
          id
        );
      }
    }
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
  });

  it("deleting a user leaves no row of theirs in any per-user table", async () => {
    const userId = await createUser("user_delete_it");
    createdUserIds.push(userId);
    const seed = seeders(userId, instanceId, groupId);
    const tables = await userIdTables();

    // A table added later has no seeder yet: seed it, then this test
    // proves the delete reaches it
    expect(
      tables.filter((table) => !(table in seed)),
      "tables with a userId column that this test does not seed"
    ).toEqual([]);
    for (const table of tables) {
      await must(seed[table], `the seeder for ${table}`)();
    }
    const playlist = await prisma.playlist.findFirstOrThrow({
      where: { userId },
      select: { id: true },
    });
    const before = await rowsOf(tables, userId);
    expect(
      tables.filter((table) => before[table] === 0),
      "tables the seed left empty"
    ).toEqual([]);

    const deleted = await adminClient.delete(`/api/user/${userId}`);
    expect(deleted.status, JSON.stringify(deleted.data)).toBe(200);

    const after = await rowsOf(tables, userId);
    expect(
      Object.entries(after).filter(([, n]) => n > 0),
      "tables still holding the deleted user's rows"
    ).toEqual([]);
    // What hangs off the user's playlist goes with it
    expect(
      await prisma.playlistItem.count({ where: { playlistId: playlist.id } })
    ).toBe(0);
    expect(
      await prisma.playlistShare.count({ where: { playlistId: playlist.id } })
    ).toBe(0);
  });

  it("the data migration deletes only rows whose user no longer exists", async () => {
    const liveId = await createUser("user_delete_it_live");
    createdUserIds.push(liveId);
    const newest = await prisma.user.findFirstOrThrow({
      orderBy: { id: "desc" },
      select: { id: true },
    });
    // Ids no user holds (User ids are never reused)
    const orphanA = newest.id + 1000;
    const orphanB = newest.id + 1001;
    orphanIds.push(orphanA, orphanB);
    await seedUnlinked(liveId, instanceId);
    await seedUnlinked(orphanA, instanceId);
    await seedUnlinked(orphanB, instanceId);

    // Data migration 008's body, one row per unit, so each table takes
    // more than one chunk
    await deleteOrphanedUserRows(1);

    const one = Object.fromEntries(UNLINKED_TABLES.map((t) => [t, 1]));
    const none = Object.fromEntries(UNLINKED_TABLES.map((t) => [t, 0]));
    expect(await rowsOf(UNLINKED_TABLES, orphanA)).toEqual(none);
    expect(await rowsOf(UNLINKED_TABLES, orphanB)).toEqual(none);
    expect(await rowsOf(UNLINKED_TABLES, liveId)).toEqual(one);
  });
});
