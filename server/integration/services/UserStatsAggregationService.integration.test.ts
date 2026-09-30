/**
 * User Stats by (id, instance) (item 77, UD-14), against the real test
 * SQLite database: every number and list is the viewer's own, looked up on
 * its own instance, and counts only what the viewer may see (live, not
 * excluded on that instance, on an allowed instance).
 *
 * Two made-up instances reuse the same ids, as two Stash servers do. B's
 * rows are written first and B's id sorts first, so a lookup by bare id that
 * keeps the last row it reads takes A's, whichever order SQLite reads them in.
 * - performers 12 ("A-12" / "B-12") and 13 ("A-13" / "B-13") on both; 14 on
 *   A soft-deleted
 * - scene 5 on both, 6 on A soft-deleted, 7 on B
 * - image 8 on both, A's soft-deleted
 *
 * User U hid scene 5 and performer 12 on A only, and has history, stats and
 * rankings on both. Every seeded row is deleted before the file ends.
 *
 * The Library counts (item 36) are checked over HTTP against the test
 * library: each equals the list total the same user gets.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { userStatsAggregationService } from "../../services/UserStatsAggregationService.js";
import { must } from "../../tests/helpers/must.js";
import type {
  FindGalleriesResponse,
  FindImagesResponse,
  FindPerformersResponse,
  FindScenesResponse,
  FindStudiosResponse,
  FindTagsResponse,
  GetClipsResponse,
  UserStatsResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser, hideFor } from "../helpers/accessFixture.js";
import {
  type TestClient,
  adminClient,
  findTestInstanceId,
} from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "stats-it-2";
const B = "stats-it-1";
const USERNAME = "stats-it-u";

let u: number;

async function removeRows(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { username: USERNAME } });
  if (user) {
    // No relation to User on these two: they are deleted by hand. History
    // and exclusions go with the user.
    const own = { where: { userId: user.id } };
    await prisma.userPerformerStats.deleteMany(own);
    await prisma.userEntityRanking.deleteMany(own);
    await prisma.user.delete({ where: { id: user.id } });
  }
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashImage.deleteMany({ where });
}

async function seed(): Promise<void> {
  const deletedAt = new Date();
  const performer = (id: string, instance: string, gone = false) => ({
    id,
    stashInstanceId: instance,
    name: `${instance === A ? "A" : "B"}-${id}`,
    imagePath: `/performer/${id}/image?side=${instance}`,
    ...(gone ? { deletedAt } : {}),
  });
  await prisma.stashPerformer.createMany({
    data: [
      performer("12", B),
      performer("13", B),
      performer("12", A),
      performer("13", A),
      performer("14", A, true),
    ],
  });
  const scene = (id: string, instance: string, gone = false) => ({
    id,
    stashInstanceId: instance,
    title: `${instance === A ? "A" : "B"} scene ${id}`,
    pathScreenshot: `/scene/${id}/screenshot?side=${instance}`,
    duration: 600,
    ...(gone ? { deletedAt } : {}),
  });
  await prisma.stashScene.createMany({
    data: [scene("5", B), scene("7", B), scene("5", A), scene("6", A, true)],
  });
  await prisma.stashImage.createMany({
    data: [
      { id: "8", stashInstanceId: B, title: "B image 8" },
      { id: "8", stashInstanceId: A, title: "A image 8", deletedAt },
    ],
  });

  u = (
    await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    })
  ).id;

  await prisma.userExcludedEntity.createMany({
    data: [
      {
        userId: u,
        entityType: "scene",
        entityId: "5",
        instanceId: A,
        reason: "hidden",
      },
      {
        userId: u,
        entityType: "performer",
        entityId: "12",
        instanceId: A,
        reason: "hidden",
      },
    ],
  });

  // The deleted and hidden rows are the most engaged, so a page that
  // counted them would lead with them
  await prisma.watchHistory.createMany({
    data: [
      {
        userId: u,
        instanceId: A,
        sceneId: "5",
        playCount: 1,
        oCount: 1,
        playDuration: 100,
      },
      {
        userId: u,
        instanceId: B,
        sceneId: "5",
        playCount: 2,
        oCount: 2,
        playDuration: 200,
      },
      {
        userId: u,
        instanceId: A,
        sceneId: "6",
        playCount: 10,
        oCount: 5,
        playDuration: 5000,
      },
      {
        userId: u,
        instanceId: B,
        sceneId: "7",
        playCount: 1,
        playDuration: 50,
      },
    ],
  });
  await prisma.imageViewHistory.createMany({
    data: [
      { userId: u, instanceId: A, imageId: "8", viewCount: 5, oCount: 4 },
      { userId: u, instanceId: B, imageId: "8", viewCount: 2, oCount: 1 },
    ],
  });
  await prisma.userPerformerStats.createMany({
    data: [
      { userId: u, instanceId: B, performerId: "12", oCounter: 3 },
      { userId: u, instanceId: A, performerId: "12", oCounter: 9 },
      { userId: u, instanceId: A, performerId: "13", oCounter: 2 },
      { userId: u, instanceId: A, performerId: "14", oCounter: 8 },
    ],
  });

  const ranking = (
    entityId: string,
    instanceId: string,
    percentileRank: number,
    oCount: number
  ) => ({
    userId: u,
    instanceId,
    entityType: "performer",
    entityId,
    percentileRank,
    oCount,
    playCount: 1,
  });
  await prisma.userEntityRanking.createMany({
    data: [
      ranking("12", B, 100, 3),
      // Hidden on A: B's 12 above still shows
      ranking("12", A, 90, 9),
      // Soft-deleted since the recompute
      ranking("14", A, 80, 8),
      // Written before the instance was carried: it names no entity
      ranking("13", "", 70, 7),
      ranking("13", A, 50, 2),
    ],
  });
}

const statsFor = (allowedInstanceIds: string[] = [A, B]) =>
  userStatsAggregationService.getUserStats(u, { allowedInstanceIds });

describeWithDb("User Stats by (id, instance) (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  }, 60000);

  afterAll(async () => {
    await removeRows();
  }, 60000);

  it("the top performer is B's performer 12, with B's name, image and instance", async () => {
    const { topPerformers } = await statsFor();

    const top = must(topPerformers[0], "the top performer");
    expect(top.name).toBe("B-12");
    expect(top.instanceId).toBe(B);
    expect(top.imageUrl).toContain(
      encodeURIComponent(`/performer/12/image?side=${B}`)
    );
    expect(top.imageUrl).toContain(`instanceId=${B}`);
  });

  it("a top list leaves out what the viewer hid on that instance, deleted entities and rankings with no instance", async () => {
    const { topPerformers } = await statsFor();

    expect(topPerformers.map((p) => [p.name, p.instanceId])).toEqual([
      ["B-12", B],
      ["A-13", A],
    ]);
  });

  it("scene 5 hidden on instance A leaves instance B's scene 5 in the engagement totals, and a deleted scene counts nothing", async () => {
    const { engagement } = await statsFor();

    // B's scenes 5 and 7, and B's image 8: A's 5 is hidden, A's 6 and
    // image 8 deleted
    expect(engagement).toEqual({
      totalWatchTime: 250,
      totalPlayCount: 3,
      totalOCount: 2 + 1,
      totalImagesViewed: 1,
      uniqueScenesWatched: 2,
    });
  });

  it("a soft-deleted scene is never most watched or most O'd", async () => {
    const { mostWatchedScene, mostOdScene } = await statsFor();

    expect(mostWatchedScene).toMatchObject({
      id: "5",
      instanceId: B,
      title: "B scene 5",
      playCount: 2,
    });
    expect(mostOdScene).toMatchObject({
      id: "5",
      instanceId: B,
      title: "B scene 5",
      oCount: 2,
    });
  });

  it("the most viewed image and most O'd performer are looked up on their own instance", async () => {
    const { mostViewedImage, mostOdPerformer } = await statsFor();

    expect(mostViewedImage).toMatchObject({
      id: "8",
      instanceId: B,
      title: "B image 8",
      viewCount: 2,
    });
    // A's 12 is hidden and A's 14 deleted, whatever their counts
    expect(mostOdPerformer).toMatchObject({
      id: "12",
      instanceId: B,
      name: "B-12",
      oCount: 3,
    });
  });

  it("top scenes are ranked from the viewer's history: live, visible, on their own instance", async () => {
    const { topScenes } = await statsFor();

    expect(
      topScenes.map((s) => [s.id, s.instanceId, s.title, s.score])
    ).toEqual([
      ["5", B, "B scene 5", 100],
      ["7", B, "B scene 7", 0],
    ]);
    expect(must(topScenes[0]).imageUrl).toContain(`instanceId=${B}`);
  });

  it("an instance the viewer does not see counts nothing", async () => {
    const stats = await statsFor([A]);

    expect(stats.topPerformers.map((p) => [p.name, p.instanceId])).toEqual([
      ["A-13", A],
    ]);
    expect(stats.topScenes).toEqual([]);
    expect(stats.engagement).toEqual({
      totalWatchTime: 0,
      totalPlayCount: 0,
      totalOCount: 0,
      totalImagesViewed: 0,
      uniqueScenesWatched: 0,
    });
    expect(stats.mostWatchedScene).toBeNull();
    expect(stats.mostViewedImage).toBeNull();
    expect(stats.mostOdPerformer).toMatchObject({ name: "A-13", oCount: 2 });

    const none = await statsFor([]);
    expect(none.topPerformers).toEqual([]);
    expect(none.mostOdPerformer).toBeNull();
  });
});

/** An enabled instance still on its first sync, holding one scene */
const FIRST = "stats-it-first";
const FIRST_SCENE = "7710001";
const LIBRARY_USER = "stats-it-library";

async function removeLibraryRows(): Promise<void> {
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: FIRST } });
  await prisma.stashInstance.deleteMany({ where: { id: FIRST } });
}

describe("Library counts on the stats page (integration)", () => {
  let viewer: { id: number; client: TestClient } | undefined;
  let testInstance: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    testInstance = await findTestInstanceId();
    await removeLibraryRows();
    await prisma.stashInstance.create({
      data: {
        id: FIRST,
        name: FIRST,
        url: "http://127.0.0.1:9/graphql",
        apiKey: "fixture-key",
        enabled: true,
        priority: 950,
        firstSyncedAt: null,
      },
    });
    await prisma.stashScene.create({
      data: { id: FIRST_SCENE, stashInstanceId: FIRST, title: "first sync" },
    });

    const user = await createApiUser(LIBRARY_USER, "stats_it_password_123");
    viewer = user;
    // The test library and the first-syncing instance: the compute's scope
    // holds both, the lists only the synced one
    await prisma.userStashInstance.deleteMany({ where: { userId: user.id } });
    await prisma.userStashInstance.createMany({
      data: [
        { userId: user.id, instanceId: testInstance },
        { userId: user.id, instanceId: FIRST },
      ],
    });

    // A legacy global hide: the recompute adds its per-instance copy
    await hideFor(user.id, "scene", TEST_ENTITIES.sceneWithRelations, "");

    // A restriction save recomputes the viewer's exclusions
    const saved = await adminClient.put(`/api/user/${user.id}/restrictions`, {
      restrictions: [
        {
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: [`${TEST_ENTITIES.restrictableTag}:${testInstance}`],
          restrictEmpty: false,
        },
      ],
    });
    expect(saved.status).toBe(200);

    // A hide after the recompute
    const hidden = await user.client.post("/api/user/hidden-entities", {
      entityType: "performer",
      entityId: TEST_ENTITIES.performerWithScenes,
      instanceId: testInstance,
    });
    expect(hidden.status).toBe(200);

    // A sync batch's hold on a scene the viewer still sees
    const first = await user.client.post<FindScenesResponse>(
      "/api/library/scenes",
      { filter: { per_page: 1 } }
    );
    const held = must(first.data.findScenes.scenes[0], "a visible scene");
    await prisma.userExcludedEntity.create({
      data: {
        userId: user.id,
        entityType: "scene",
        entityId: held.id,
        instanceId: held.instanceId,
        reason: "pending",
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (viewer) await adminClient.delete(`/api/user/${viewer.id}`);
    await removeLibraryRows();
  }, 60_000);

  it("each Library count equals the list total the user gets", async () => {
    const { client } = must(viewer, "the viewer");
    const list = { filter: { per_page: 1 } };
    const stats = await client.get<UserStatsResponse>("/api/user-stats");
    expect(stats.status).toBe(200);

    const scenes = await client.post<FindScenesResponse>(
      "/api/library/scenes",
      list
    );
    const performers = await client.post<FindPerformersResponse>(
      "/api/library/performers",
      list
    );
    const studios = await client.post<FindStudiosResponse>(
      "/api/library/studios",
      list
    );
    const tags = await client.post<FindTagsResponse>("/api/library/tags", list);
    const galleries = await client.post<FindGalleriesResponse>(
      "/api/library/galleries",
      list
    );
    const images = await client.post<FindImagesResponse>(
      "/api/library/images",
      list
    );
    // The Clips page's default request: clips with a preview
    const clips = await client.get<GetClipsResponse>(
      "/api/clips?isGenerated=true&perPage=1"
    );

    expect(stats.data.library).toEqual({
      sceneCount: scenes.data.findScenes.count,
      performerCount: performers.data.findPerformers.count,
      studioCount: studios.data.findStudios.count,
      tagCount: tags.data.findTags.count,
      galleryCount: galleries.data.findGalleries.count,
      imageCount: images.data.findImages.count,
      clipCount: clips.data.total,
    });
    // The fixture holds something of each, so equal is not 0 = 0
    expect(scenes.data.findScenes.count).toBeGreaterThan(0);
  }, 60_000);
});
