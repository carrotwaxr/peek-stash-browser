import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

/**
 * Scene Favorite Filters Integration Tests
 *
 * Tests the favorite-related filters:
 * - favorite: Filter scenes the user has marked as favorite
 * - performer_favorite: Filter scenes with performers the user has favorited
 * - studio_favorite: Filter scenes from studios the user has favorited
 * - tag_favorite: Filter scenes with tags the user has favorited
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      favorite?: boolean;
      performers?: Array<{ id: string; name?: string; favorite?: boolean }>;
      studio?: { id: string; name?: string; favorite?: boolean } | null;
      tags?: Array<{ id: string; name?: string; favorite?: boolean }>;
    }>;
    count: number;
  };
}

describe("Scene Favorite Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("returns only favorite scenes when favorite=true", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { favorite: true },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should be favorites
      // Note: The scene.favorite field indicates user's favorite status
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(true);
      }
    });

    it("returns only non-favorite scenes when favorite=false", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { favorite: false },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should NOT be favorites
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(false);
      }
    });

    it("returns different counts for favorite vs non-favorite", async () => {
      const favResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: { favorite: true },
        }
      );

      const nonFavResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: { favorite: false },
        }
      );

      const allResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
        }
      );

      expect(favResponse.ok).toBe(true);
      expect(nonFavResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      // Total should equal favorites + non-favorites
      const favCount = favResponse.data.findScenes.count;
      const nonFavCount = nonFavResponse.data.findScenes.count;
      const allCount = allResponse.data.findScenes.count;

      expect(favCount + nonFavCount).toBe(allCount);
    });
  });

  describe("performer_favorite filter", () => {
    it("returns scenes with favorite performers when performer_favorite=true", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { performer_favorite: true },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite performers
      // The actual count depends on user's favorites
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by performer_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: { performer_favorite: true },
        }
      );

      const allResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
        }
      );

      expect(filteredResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      // Filtered count should be <= total count
      expect(filteredResponse.data.findScenes.count).toBeLessThanOrEqual(
        allResponse.data.findScenes.count
      );
    });
  });

  describe("studio_favorite filter", () => {
    it("returns scenes from favorite studios when studio_favorite=true", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { studio_favorite: true },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite studios
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by studio_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: { studio_favorite: true },
        }
      );

      const allResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
        }
      );

      expect(filteredResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      expect(filteredResponse.data.findScenes.count).toBeLessThanOrEqual(
        allResponse.data.findScenes.count
      );
    });
  });

  describe("tag_favorite filter", () => {
    it("returns scenes with favorite tags when tag_favorite=true", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: { tag_favorite: true },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite tags
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by tag_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: { tag_favorite: true },
        }
      );

      const allResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
        }
      );

      expect(filteredResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      expect(filteredResponse.data.findScenes.count).toBeLessThanOrEqual(
        allResponse.data.findScenes.count
      );
    });
  });

  describe("combined favorite filters", () => {
    it("can combine favorite with performer_favorite", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            favorite: true,
            performer_favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should be favorites (AND logic)
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(true);
      }
    });

    it("can combine all favorite filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            favorite: true,
            performer_favorite: true,
            studio_favorite: true,
            tag_favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // This is a very restrictive filter - may return 0 results
      // but the query should still succeed
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });
  });
});

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * The three favourite filters on seeded rows. A favourite tag counts on a
 * scene through its own tags, its inherited tags and its sub-tags; a
 * favourite studio through its sub-studios; `false` is the negation of the
 * same clause, so `true` and `false` together are the viewer's library.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do. The
 * viewer favourites tag 7895001, studio 7895101 and performer 7895201 on
 * sf-a only; another user favourites the plain ones.
 * - sf-a tags: 7895001 (favourite), 7895002 (its child), 7895003 (plain)
 * - sf-a studios: 7895101 (favourite), 7895102 (its sub-studio), 7895103
 * - sf-a performers: 7895201 (favourite), 7895202
 * - sf-a scenes: 7895301 tag 1, studio 1, performer 1; 7895302 tag 2 (the
 *   child), studio 2 (the sub-studio), performer 2; 7895303 inherits tag 1,
 *   studio 3, no performer; 7895304 tag 3, no studio, performer 2; 7895305
 *   nothing; 7895306 as 7895301 but hidden by the viewer
 * - sf-b: tag, studio and performer 7895001, 7895101 and 7895201 (the ids
 *   the viewer favourited on sf-a) on scene 7895301
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Scene favourite filters (seeded)", () => {
  const A = "sf-a";
  const B = "sf-b";
  const VIEWER = "sf-viewer";
  const OTHER = "sf-other";
  const NONE = "sf-none";
  let viewerId = 0;
  let otherId = 0;
  let noneId = 0;

  const key = (id: string, instance: string) => `${id}:${instance}`;
  const VISIBLE = [
    key("7895301", A),
    key("7895302", A),
    key("7895303", A),
    key("7895304", A),
    key("7895305", A),
    key("7895301", B),
  ].sort();

  async function removeRows(): Promise<void> {
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashTag.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashStudio.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashPerformer.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, OTHER, NONE] } },
    });
  }

  /** The scenes a favourite filter lists for a viewer, as sorted keys */
  async function scenesFor(
    userId: number,
    field: "tag_favorite" | "studio_favorite" | "performer_favorite",
    on: boolean,
    sortField: "created_at" | "rating" = "created_at"
  ): Promise<string[]> {
    const { items, total } = await sceneQueryBuilder.execute({
      userId,
      applyExclusions: true,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", {
        perPage: 50,
        sort: { field: sortField, direction: "DESC", seed: undefined },
        filter: { [field]: on },
      }),
    });
    expect(total).toBe(items.length);
    return items.map((s) => `${s.id}:${s.instanceId}`).sort();
  }

  beforeAll(async () => {
    await removeRows();
    const make = (username: string) =>
      prisma.user.create({
        data: { username, password: "not-a-real-hash", role: "USER" },
      });
    viewerId = (await make(VIEWER)).id;
    otherId = (await make(OTHER)).id;
    noneId = (await make(NONE)).id;

    const tag = (id: string, instance: string, parents: string[] = []) => ({
      id,
      stashInstanceId: instance,
      name: `SF tag ${id} ${instance}`,
      parentIds: JSON.stringify(parents),
    });
    await prisma.stashTag.createMany({
      data: [
        tag("7895001", A),
        tag("7895002", A, ["7895001"]),
        tag("7895003", A),
        tag("7895001", B),
      ],
    });
    const studio = (id: string, instance: string, parentId: string | null) => ({
      id,
      stashInstanceId: instance,
      name: `SF studio ${id} ${instance}`,
      parentId,
    });
    await prisma.stashStudio.createMany({
      data: [
        studio("7895101", A, null),
        studio("7895102", A, "7895101"),
        studio("7895103", A, null),
        studio("7895101", B, null),
      ],
    });
    await prisma.stashPerformer.createMany({
      data: ["7895201", "7895202"]
        .map((id) => ({
          id,
          stashInstanceId: A,
          name: `SF performer ${id} ${A}`,
        }))
        .concat([
          {
            id: "7895201",
            stashInstanceId: B,
            name: `SF performer 7895201 ${B}`,
          },
        ]),
    });
    const scene = (id: string, instance: string, studioId: string | null) => ({
      id,
      stashInstanceId: instance,
      title: `SF ${id} ${instance}`,
      studioId,
    });
    await prisma.stashScene.createMany({
      data: [
        scene("7895301", A, "7895101"),
        scene("7895302", A, "7895102"),
        scene("7895303", A, "7895103"),
        scene("7895304", A, null),
        scene("7895305", A, null),
        scene("7895306", A, "7895101"),
        scene("7895301", B, "7895101"),
      ],
    });
    const sceneTag = (scene: string, instance: string, tagId: string) => ({
      sceneId: scene,
      sceneInstanceId: instance,
      tagId,
      tagInstanceId: instance,
    });
    await prisma.sceneTag.createMany({
      data: [
        sceneTag("7895301", A, "7895001"),
        sceneTag("7895302", A, "7895002"),
        sceneTag("7895304", A, "7895003"),
        sceneTag("7895306", A, "7895001"),
        sceneTag("7895301", B, "7895001"),
      ],
    });
    await prisma.sceneInheritedTag.create({
      data: {
        sceneId: "7895303",
        sceneInstanceId: A,
        tagId: "7895001",
        tagInstanceId: A,
      },
    });
    const link = (scene: string, instance: string, performerId: string) => ({
      sceneId: scene,
      sceneInstanceId: instance,
      performerId,
      performerInstanceId: instance,
    });
    await prisma.scenePerformer.createMany({
      data: [
        link("7895301", A, "7895201"),
        link("7895302", A, "7895202"),
        link("7895304", A, "7895202"),
        link("7895306", A, "7895201"),
        link("7895301", B, "7895201"),
      ],
    });

    await prisma.tagRating.createMany({
      data: [
        { userId: viewerId, instanceId: A, tagId: "7895001", favorite: true },
        { userId: viewerId, instanceId: A, tagId: "7895003", favorite: false },
        { userId: otherId, instanceId: A, tagId: "7895003", favorite: true },
        { userId: otherId, instanceId: B, tagId: "7895001", favorite: true },
      ],
    });
    await prisma.studioRating.createMany({
      data: [
        {
          userId: viewerId,
          instanceId: A,
          studioId: "7895101",
          favorite: true,
        },
        { userId: otherId, instanceId: A, studioId: "7895103", favorite: true },
      ],
    });
    await prisma.performerRating.createMany({
      data: [
        {
          userId: viewerId,
          instanceId: A,
          performerId: "7895201",
          favorite: true,
        },
        {
          userId: otherId,
          instanceId: A,
          performerId: "7895202",
          favorite: true,
        },
      ],
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "scene",
        entityId: "7895306",
        instanceId: A,
        reason: "hidden",
      },
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("Favourite Tags lists a scene that has the tag only by inheritance", async () => {
    expect(await scenesFor(viewerId, "tag_favorite", true)).toContain(
      key("7895303", A)
    );
  });

  it("Favourite Tags lists a scene tagged with a child of a favourite tag", async () => {
    expect(await scenesFor(viewerId, "tag_favorite", true)).toEqual(
      [key("7895301", A), key("7895302", A), key("7895303", A)].sort()
    );
  });

  it("Favourite Tags answers the same under a sort without an index", async () => {
    expect(await scenesFor(viewerId, "tag_favorite", true, "rating")).toEqual(
      await scenesFor(viewerId, "tag_favorite", true)
    );
  });

  it("Favourite Studios lists a sub-studio's scenes", async () => {
    expect(await scenesFor(viewerId, "studio_favorite", true)).toEqual(
      [key("7895301", A), key("7895302", A)].sort()
    );
  });

  it("Favourite Performers lists the scenes of a favourite performer", async () => {
    expect(await scenesFor(viewerId, "performer_favorite", true)).toEqual([
      key("7895301", A),
    ]);
  });

  it("tag_favorite false lists scenes with no favourite tag, own or inherited", async () => {
    expect(await scenesFor(viewerId, "tag_favorite", false)).toEqual(
      [key("7895304", A), key("7895305", A), key("7895301", B)].sort()
    );
  });

  it("studio_favorite false lists scenes without a studio", async () => {
    expect(await scenesFor(viewerId, "studio_favorite", false)).toEqual(
      [
        key("7895303", A),
        key("7895304", A),
        key("7895305", A),
        key("7895301", B),
      ].sort()
    );
  });

  it("performer_favorite false lists scenes without performers", async () => {
    const listed = await scenesFor(viewerId, "performer_favorite", false);
    expect(listed).toContain(key("7895303", A));
    expect(listed).toContain(key("7895305", A));
    expect(listed).toEqual(
      [
        key("7895302", A),
        key("7895303", A),
        key("7895304", A),
        key("7895305", A),
        key("7895301", B),
      ].sort()
    );
  });

  it.each(["tag_favorite", "studio_favorite", "performer_favorite"] as const)(
    "%s false plus true is the viewer's library, and a hidden scene is under neither",
    async (field) => {
      const on = await scenesFor(viewerId, field, true);
      const off = await scenesFor(viewerId, field, false);
      expect([...on, ...off].sort()).toEqual(VISIBLE);
      expect(on.filter((k) => off.includes(k))).toEqual([]);
      expect([...on, ...off]).not.toContain(key("7895306", A));
    }
  );

  it("a favourite on one instance never matches the same id on the other", async () => {
    for (const field of [
      "tag_favorite",
      "studio_favorite",
      "performer_favorite",
    ] as const) {
      expect(await scenesFor(viewerId, field, true)).not.toContain(
        key("7895301", B)
      );
      expect(await scenesFor(viewerId, field, false)).toContain(
        key("7895301", B)
      );
    }
  });

  it("another user's favourites never count", async () => {
    // The other user favourited tag 3, studio 3 and performer 2 on sf-a
    // and tag 1 on sf-b; the viewer's lists are unchanged
    expect(await scenesFor(viewerId, "tag_favorite", true)).not.toContain(
      key("7895304", A)
    );
    expect(await scenesFor(viewerId, "studio_favorite", true)).not.toContain(
      key("7895303", A)
    );
    expect(await scenesFor(viewerId, "performer_favorite", true)).not.toContain(
      key("7895302", A)
    );
    // And the other user sees their own
    expect(await scenesFor(otherId, "tag_favorite", true)).toEqual(
      [key("7895304", A), key("7895301", B)].sort()
    );
  });

  it("with no favourites, true lists nothing and false lists everything", async () => {
    for (const field of [
      "tag_favorite",
      "studio_favorite",
      "performer_favorite",
    ] as const) {
      expect(await scenesFor(noneId, field, true)).toEqual([]);
      expect(await scenesFor(noneId, field, false)).toEqual(
        [...VISIBLE, key("7895306", A)].sort()
      );
    }
  });
});
