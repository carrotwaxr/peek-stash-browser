/**
 * Integration tests for merge reconciliation on (id, instance) (item 19).
 *
 * Two made-up instances A and B both hold a scene "5" with the same phash
 * (the same file on two Stash servers), and user U has a play history and a
 * rating on each. Sync's scene cleanup on A drives the automatic path: the
 * stubbed `findSceneIDs` answers with the scenes Stash still has. B's id
 * sorts before A's, so the old bare-id lookups (`getEntityInstanceId`,
 * `findFirst({ id })`) resolve "5" to B and not to the scene that left.
 *
 * Neither instance has a `StashInstance` row, so no sync touches them and
 * their names fall back to their ids.
 */
import type { SceneRating, WatchHistory } from "@prisma/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import prisma from "../../prisma/singleton.js";
import { mergeReconciliationService } from "../../services/MergeReconciliationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { objectContaining } from "../../tests/helpers/matchers.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "merge-it-2-a";
const B = "merge-it-1-b";
const INSTANCES = [A, B];
const USERNAMES = ["merge_it_user", "merge_it_viewer"];
const PHASH = "merge-it-phash-5";
const HOUR_MS = 60 * 60 * 1000;
/** Live scenes of A without a phash, so no test trips the 50 % delete guard */
const FILLER = ["100", "101", "102", "103"];

async function clearSeed(): Promise<void> {
  // Merge records, history, ratings and playlists cascade with their user
  await prisma.user.deleteMany({ where: { username: { in: USERNAMES } } });
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: { in: INSTANCES } },
  });
}

async function seedScene(
  instanceId: string,
  id: string,
  phash: string | null,
  deletedAt: Date | null = null
): Promise<void> {
  await prisma.stashScene.create({
    data: {
      id,
      stashInstanceId: instanceId,
      title: `Scene ${id} on ${instanceId}`,
      phash,
      deletedAt,
    },
  });
}

async function seedActivity(
  userId: number,
  instanceId: string,
  sceneId: string,
  playCount: number,
  rating: number
): Promise<void> {
  await prisma.watchHistory.create({
    data: {
      userId,
      instanceId,
      sceneId,
      playCount,
      playDuration: playCount * 100,
      oCount: 1,
    },
  });
  await prisma.sceneRating.create({
    data: { userId, instanceId, sceneId, rating, favorite: true },
  });
}

async function clearActivity(
  userId: number,
  instanceId: string,
  sceneId: string
): Promise<void> {
  await prisma.watchHistory.deleteMany({
    where: { userId, instanceId, sceneId },
  });
  await prisma.sceneRating.deleteMany({
    where: { userId, instanceId, sceneId },
  });
}

function history(
  userId: number,
  instanceId: string,
  sceneId: string
): Promise<WatchHistory | null> {
  return prisma.watchHistory.findUnique({
    where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
  });
}

function rating(
  userId: number,
  instanceId: string,
  sceneId: string
): Promise<SceneRating | null> {
  return prisma.sceneRating.findUnique({
    where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
  });
}

describeWithDb("MergeReconciliationService (integration)", () => {
  /** The scene ids Stash still has on A */
  let keepSet: string[] = [];
  let u = 0;
  let v = 0;

  const cleanupA = () => stashSyncService["cleanupDeletedEntities"]("scene", A);

  const mergeRecords = () =>
    prisma.mergeRecord.findMany({
      where: { userId: { in: [u, v] } },
      orderBy: { createdAt: "asc" },
    });

  beforeAll(async () => {
    // The instances the server knows (the test Stash), as in production
    await stashInstanceManager.reload();
  });

  beforeEach(async () => {
    await clearSeed();
    u = (
      await prisma.user.create({
        data: { username: "merge_it_user", password: "not-a-real-hash" },
      })
    ).id;
    v = (
      await prisma.user.create({
        data: { username: "merge_it_viewer", password: "not-a-real-hash" },
      })
    ).id;
    await seedScene(A, "5", PHASH);
    await seedScene(B, "5", PHASH);
    for (const id of FILLER) await seedScene(A, id, null);
    await seedActivity(u, A, "5", 3, 60);
    await seedActivity(u, B, "5", 10, 90);

    // Only A gets the stub; any other instance keeps its real client
    const realGet = stashInstanceManager.get.bind(stashInstanceManager);
    vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
      id === A
        ? partialRow<StashClient>({
            findSceneIDs: () =>
              Promise.resolve({
                findScenes: {
                  scenes: keepSet.map((sceneId) => ({ id: sceneId })),
                  count: keepSet.length,
                },
              }),
          })
        : realGet(id)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearSeed();
  });

  it("a deleted A:5 merges into the same-phash live A:7 and B:5's history is untouched", async () => {
    await seedScene(A, "7", PHASH);
    keepSet = ["7", ...FILLER];

    expect(await cleanupA()).toBe(1);

    expect(await history(u, A, "7")).toMatchObject({
      playCount: 3,
      playDuration: 300,
    });
    expect(await rating(u, A, "7")).toMatchObject({ rating: 60 });
    expect(await history(u, A, "5")).toBeNull();
    expect(await rating(u, A, "5")).toBeNull();
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
    expect(await rating(u, B, "5")).toMatchObject({ rating: 90 });
  });

  it("a phash match on another instance is not a merge target", async () => {
    // No other scene of A has the phash; B:9 does
    await seedScene(B, "9", PHASH);
    keepSet = [...FILLER];

    expect(await cleanupA()).toBe(1);

    expect(await mergeRecords()).toEqual([]);
    expect(await history(u, A, "5")).toMatchObject({ playCount: 3 });
    expect(await history(u, B, "9")).toBeNull();
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
  });

  it("scenes deleted in the same cleanup pass are never targets", async () => {
    await seedScene(A, "6", PHASH);
    keepSet = [...FILLER];

    expect(await cleanupA()).toBe(2);

    expect(await mergeRecords()).toEqual([]);
    expect(await history(u, A, "5")).toMatchObject({ playCount: 3 });
    expect(await rating(u, A, "5")).toMatchObject({ rating: 60 });
    expect(await history(u, A, "6")).toBeNull();
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
  });

  it("a merge record carries both instance ids", async () => {
    await seedScene(A, "7", PHASH);
    keepSet = ["7", ...FILLER];

    await cleanupA();

    const records = await mergeRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      userId: u,
      sourceSceneId: "5",
      sourceInstanceId: A,
      targetSceneId: "7",
      targetInstanceId: A,
      matchedByPhash: PHASH,
      playCountTransferred: 3,
      ratingTransferred: 60,
      automatic: true,
      reconciledBy: null,
    });
  });

  it("discarding A:5 deletes A:5's history and rating only", async () => {
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: "5", stashInstanceId: A } },
      data: { deletedAt: new Date() },
    });

    const result = await mergeReconciliationService.discardOrphanedData({
      id: "5",
      instanceId: A,
    });

    expect(result).toEqual({ watchHistoryDeleted: 1, ratingsDeleted: 1 });
    expect(await history(u, A, "5")).toBeNull();
    expect(await rating(u, A, "5")).toBeNull();
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
    expect(await rating(u, B, "5")).toMatchObject({ rating: 90 });
  });

  it("the orphan list counts only same-instance activity", async () => {
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: "5", stashInstanceId: A } },
      data: { deletedAt: new Date() },
    });
    await clearActivity(u, A, "5");

    // Only B:5 (live) has activity: A:5 is no orphan
    const without =
      await mergeReconciliationService.findOrphanedScenesWithActivity();
    expect(without.filter((o) => o.id === "5")).toEqual([]);

    await seedActivity(u, A, "5", 3, 60);
    const withActivity =
      await mergeReconciliationService.findOrphanedScenesWithActivity();
    expect(withActivity.filter((o) => o.id === "5")).toEqual([
      objectContaining({
        id: "5",
        instanceId: A,
        instanceName: A,
        phash: PHASH,
        userActivityCount: 2,
        totalPlayCount: 3,
        hasRatings: true,
        hasFavorites: true,
      }),
    ]);
  });

  it("with two live same-instance candidates nothing merges automatically", async () => {
    await seedScene(A, "7", PHASH);
    await seedScene(A, "8", PHASH);
    keepSet = ["7", "8", ...FILLER];

    expect(await cleanupA()).toBe(1);

    expect(await mergeRecords()).toEqual([]);
    expect(await history(u, A, "5")).toMatchObject({ playCount: 3 });
    expect(await history(u, A, "7")).toBeNull();
    expect(await history(u, A, "8")).toBeNull();
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
  });

  it("a scene in a user's playlist but with no history moves with the merge", async () => {
    await seedScene(A, "7", PHASH);
    // A:5 is only in V's playlist: nobody played or rated it on A
    await clearActivity(u, A, "5");
    const playlist = await prisma.playlist.create({
      data: {
        userId: v,
        name: "merge-it playlist",
        items: { create: [{ sceneId: "5", instanceId: A, position: 0 }] },
      },
    });
    keepSet = ["7", ...FILLER];

    expect(await cleanupA()).toBe(1);

    const items = await prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      select: { sceneId: true, instanceId: true },
    });
    expect(items).toEqual([{ sceneId: "7", instanceId: A }]);
    expect(await mergeRecords()).toEqual([
      objectContaining({
        userId: v,
        sourceSceneId: "5",
        sourceInstanceId: A,
        targetSceneId: "7",
        targetInstanceId: A,
        playCountTransferred: 0,
      }),
    ]);
    expect(await history(u, B, "5")).toMatchObject({ playCount: 10 });
    expect(await history(u, A, "7")).toBeNull();
  });

  it("a scene soft-deleted by an interrupted cleanup is reconciled by the next one", async () => {
    await seedScene(A, "7", PHASH);
    // A:5 left Stash in a cleanup that stopped before reconciling it
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: "5", stashInstanceId: A } },
      data: { deletedAt: new Date(Date.now() - HOUR_MS) },
    });
    // Deleted two days ago: outside the catch-up window
    await seedScene(A, "6", PHASH, new Date(Date.now() - 48 * HOUR_MS));
    await seedActivity(u, A, "6", 4, 40);
    // Deleted recently but already reconciled once: left alone
    await seedScene(A, "4", PHASH, new Date(Date.now() - HOUR_MS));
    await seedActivity(u, A, "4", 2, 20);
    await prisma.mergeRecord.create({
      data: {
        userId: u,
        sourceSceneId: "4",
        sourceInstanceId: A,
        targetSceneId: "7",
        targetInstanceId: A,
      },
    });
    keepSet = ["7", ...FILLER];

    // Nothing new leaves Stash; the catch-up still merges A:5
    expect(await cleanupA()).toBe(0);

    expect(await history(u, A, "7")).toMatchObject({ playCount: 3 });
    expect(await history(u, A, "5")).toBeNull();
    expect(await history(u, A, "6")).toMatchObject({ playCount: 4 });
    expect(await history(u, A, "4")).toMatchObject({ playCount: 2 });
    const fromFive = (await mergeRecords()).filter(
      (r) => r.sourceSceneId === "5"
    );
    expect(fromFive).toHaveLength(1);

    // Idempotent: the next cleanup finds nothing more to do
    await cleanupA();
    expect(
      (await mergeRecords()).filter((r) => r.sourceSceneId === "5")
    ).toHaveLength(1);
    expect(await history(u, A, "7")).toMatchObject({ playCount: 3 });
  });
});
