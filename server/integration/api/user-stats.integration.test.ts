import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { arrayContaining } from "../../tests/helpers/matchers.js";
import { must } from "../../tests/helpers/must.js";
import type { UserStatsResponse } from "../../types/api/index.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import {
  TestClient,
  adminClient,
  findTestInstanceId,
} from "../helpers/testClient.js";

/** How long the server may take to answer a stats page, recompute included */
const SERVER_STATS_MS = 10_000;

/**
 * The user's stats page. It awaits the user's ranking recompute in the
 * server process (`ensureFresh` with `wait`), joining one a login started.
 */
async function statsOf(client: TestClient, who: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `GET /api/user-stats for ${who} did not answer within ${SERVER_STATS_MS} ms`
        )
      );
    }, SERVER_STATS_MS);
  });
  try {
    const response = await Promise.race([
      client.get<UserStatsResponse>("/api/user-stats"),
      timeout,
    ]);
    expect(response.status, `GET /api/user-stats for ${who}`).toBe(200);
    return response.data;
  } finally {
    clearTimeout(timer);
  }
}

describe("User Stats API Integration Tests", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("GET /api/user-stats", () => {
    it("should return user stats for authenticated user", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      // Verify response structure
      const data = response.data;

      // Library stats
      expect(data.library).toBeDefined();
      expect(typeof data.library.sceneCount).toBe("number");
      expect(typeof data.library.performerCount).toBe("number");
      expect(typeof data.library.studioCount).toBe("number");
      expect(typeof data.library.tagCount).toBe("number");
      expect(typeof data.library.galleryCount).toBe("number");
      expect(typeof data.library.imageCount).toBe("number");

      // Engagement stats
      expect(data.engagement).toBeDefined();
      expect(typeof data.engagement.totalWatchTime).toBe("number");
      expect(typeof data.engagement.totalPlayCount).toBe("number");
      expect(typeof data.engagement.totalOCount).toBe("number");
      expect(typeof data.engagement.totalImagesViewed).toBe("number");
      expect(typeof data.engagement.uniqueScenesWatched).toBe("number");

      // Top lists (arrays)
      expect(Array.isArray(data.topScenes)).toBe(true);
      expect(Array.isArray(data.topPerformers)).toBe(true);
      expect(Array.isArray(data.topStudios)).toBe(true);
      expect(Array.isArray(data.topTags)).toBe(true);

      // Highlights are null until the user has history; a set one has an
      // id and its count
      const {
        mostWatchedScene,
        mostViewedImage,
        mostOdScene,
        mostOdPerformer,
      } = data;
      expect(
        mostWatchedScene === null ||
          (typeof mostWatchedScene.id === "string" &&
            typeof mostWatchedScene.playCount === "number"),
        "mostWatchedScene is null or has an id and a playCount"
      ).toBe(true);
      expect(
        mostViewedImage === null ||
          (typeof mostViewedImage.id === "string" &&
            typeof mostViewedImage.viewCount === "number"),
        "mostViewedImage is null or has an id and a viewCount"
      ).toBe(true);
      expect(
        mostOdScene === null ||
          (typeof mostOdScene.id === "string" &&
            typeof mostOdScene.oCount === "number"),
        "mostOdScene is null or has an id and an oCount"
      ).toBe(true);
      expect(
        mostOdPerformer === null ||
          (typeof mostOdPerformer.id === "string" &&
            typeof mostOdPerformer.oCount === "number"),
        "mostOdPerformer is null or has an id and an oCount"
      ).toBe(true);
    });

    it("should reject unauthenticated requests", async () => {
      const client = new TestClient();
      const response = await client.get<{ error: string }>("/api/user-stats");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should return non-negative counts for library stats", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.library.sceneCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.performerCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.studioCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.tagCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.galleryCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.imageCount).toBeGreaterThanOrEqual(0);
    });

    it("should return non-negative values for engagement stats", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.engagement.totalWatchTime).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalPlayCount).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalOCount).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalImagesViewed).toBeGreaterThanOrEqual(
        0
      );
      expect(
        response.data.engagement.uniqueScenesWatched
      ).toBeGreaterThanOrEqual(0);
    });

    it("should return at most 10 items in top lists", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.topScenes.length).toBeLessThanOrEqual(10);
      expect(response.data.topPerformers.length).toBeLessThanOrEqual(10);
      expect(response.data.topStudios.length).toBeLessThanOrEqual(10);
      expect(response.data.topTags.length).toBeLessThanOrEqual(10);
    });

    it("should have proper structure for top scene items", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const scene of response.data.topScenes) {
        expect(scene.id).toBeDefined();
        expect(typeof scene.playCount).toBe("number");
        expect(typeof scene.playDuration).toBe("number");
        expect(typeof scene.oCount).toBe("number");
        // title and filePath can be null
        // imageUrl is a proxy URL, or null for an entity without an image
        expect(
          scene.imageUrl === null ||
            scene.imageUrl.includes("/api/proxy/stash"),
          `imageUrl ${String(scene.imageUrl)} is a proxy URL or null`
        ).toBe(true);
      }
    });

    it("should have proper structure for top performer items", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const performer of response.data.topPerformers) {
        expect(performer.id).toBeDefined();
        expect(typeof performer.name).toBe("string");
        expect(typeof performer.playCount).toBe("number");
        expect(typeof performer.playDuration).toBe("number");
        expect(typeof performer.oCount).toBe("number");
        // imageUrl is a proxy URL, or null for an entity without an image
        expect(
          performer.imageUrl === null ||
            performer.imageUrl.includes("/api/proxy/stash"),
          `imageUrl ${String(performer.imageUrl)} is a proxy URL or null`
        ).toBe(true);
      }
    });

    it("should have proper structure for top studio items", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const studio of response.data.topStudios) {
        expect(studio.id).toBeDefined();
        expect(typeof studio.name).toBe("string");
        expect(typeof studio.playCount).toBe("number");
        expect(typeof studio.playDuration).toBe("number");
        expect(typeof studio.oCount).toBe("number");
        // imageUrl is a proxy URL, or null for an entity without an image
        expect(
          studio.imageUrl === null ||
            studio.imageUrl.includes("/api/proxy/stash"),
          `imageUrl ${String(studio.imageUrl)} is a proxy URL or null`
        ).toBe(true);
      }
    });

    it("should have proper structure for top tag items", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const tag of response.data.topTags) {
        expect(tag.id).toBeDefined();
        expect(typeof tag.name).toBe("string");
        expect(typeof tag.playCount).toBe("number");
        expect(typeof tag.playDuration).toBe("number");
        expect(typeof tag.oCount).toBe("number");
        // imageUrl is a proxy URL, or null for an entity without an image
        expect(
          tag.imageUrl === null || tag.imageUrl.includes("/api/proxy/stash"),
          `imageUrl ${String(tag.imageUrl)} is a proxy URL or null`
        ).toBe(true);
      }
    });

    it("should proxy all image URLs (security check)", async () => {
      const response =
        await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      // Check all image URLs are proxied, not direct Stash URLs. An entity
      // without an image has none, and highlights are null without history.
      const data = response.data;
      const imageUrls = [
        ...data.topScenes.map((s) => s.imageUrl),
        ...data.topPerformers.map((p) => p.imageUrl),
        ...data.topStudios.map((s) => s.imageUrl),
        ...data.topTags.map((t) => t.imageUrl),
        data.mostWatchedScene?.imageUrl,
        data.mostViewedImage?.imageUrl,
        data.mostOdScene?.imageUrl,
        data.mostOdPerformer?.imageUrl,
      ].filter((url): url is string => Boolean(url));

      for (const url of imageUrls) {
        expect(url).not.toMatch(/^https?:\/\//);
        expect(url).toContain("/api/proxy/stash");
      }
    });
  });

  // The server keeps each user's rankings for an hour; a history clear
  // forgets them in the server process, reached here over HTTP
  describe("after clearing watch history", () => {
    const USERNAME = "stats_it_clear";
    const sceneId = TEST_ENTITIES.sceneWithRelations;
    let viewer: { id: number; client: TestClient } | undefined;
    let instanceId: string;

    beforeAll(async () => {
      instanceId = await findTestInstanceId();
      viewer = await createApiUser(USERNAME, "stats_it_clear_pass_1");
      // Joins the login's recompute: the viewer is fresh for an hour
      await statsOf(viewer.client, USERNAME);
    });

    afterAll(async () => {
      if (viewer) await adminClient.delete(`/api/user/${viewer.id}`);
    });

    it("the next stats page ranks new engagement at once", async () => {
      const { client } = must(viewer, USERNAME);
      const pressO = () =>
        client.post("/api/watch-history/increment-o", { sceneId, instanceId });
      const performers = (
        await prisma.scenePerformer.findMany({
          where: { sceneId, sceneInstanceId: instanceId },
          select: { performerId: true },
        })
      )
        .map((row) => `${row.performerId}:${instanceId}`)
        .sort();
      expect(
        performers.length,
        `performers of scene ${sceneId}`
      ).toBeGreaterThan(0);

      expect((await pressO()).status).toBe(200);
      // Within the hour, the O is not ranked yet
      expect((await statsOf(client, USERNAME)).topPerformers).toEqual([]);

      expect((await client.delete("/api/watch-history")).status).toBe(200);
      expect((await pressO()).status).toBe(200);

      const { topPerformers } = await statsOf(client, USERNAME);
      const ranked = topPerformers.map((p) => `${p.id}:${p.instanceId}`);
      expect(ranked).toHaveLength(Math.min(performers.length, 5));
      expect(performers).toEqual(arrayContaining(ranked));
    });
  });
});
