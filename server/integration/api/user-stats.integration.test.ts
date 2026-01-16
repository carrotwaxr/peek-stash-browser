import { describe, it, expect, beforeAll } from "vitest";
import { TestClient, adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import type { UserStatsResponse } from "../../types/api/index.js";

describe("User Stats API Integration Tests", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("GET /api/user-stats", () => {
    it("should return user stats for authenticated user", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

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

      // Highlights (nullable)
      // These may be null if no watch history exists
      if (data.mostWatchedScene) {
        expect(data.mostWatchedScene.id).toBeDefined();
        expect(typeof data.mostWatchedScene.playCount).toBe("number");
      }

      if (data.mostViewedImage) {
        expect(data.mostViewedImage.id).toBeDefined();
        expect(typeof data.mostViewedImage.viewCount).toBe("number");
      }

      if (data.mostOdScene) {
        expect(data.mostOdScene.id).toBeDefined();
        expect(typeof data.mostOdScene.oCount).toBe("number");
      }

      if (data.mostOdPerformer) {
        expect(data.mostOdPerformer.id).toBeDefined();
        expect(typeof data.mostOdPerformer.oCount).toBe("number");
      }
    });

    it("should reject unauthenticated requests", async () => {
      const client = new TestClient();
      const response = await client.get<{ error: string }>("/api/user-stats");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should return non-negative counts for library stats", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.library.sceneCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.performerCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.studioCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.tagCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.galleryCount).toBeGreaterThanOrEqual(0);
      expect(response.data.library.imageCount).toBeGreaterThanOrEqual(0);
    });

    it("should return non-negative values for engagement stats", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.engagement.totalWatchTime).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalPlayCount).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalOCount).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.totalImagesViewed).toBeGreaterThanOrEqual(0);
      expect(response.data.engagement.uniqueScenesWatched).toBeGreaterThanOrEqual(0);
    });

    it("should return at most 5 items in top lists", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);
      expect(response.data.topScenes.length).toBeLessThanOrEqual(5);
      expect(response.data.topPerformers.length).toBeLessThanOrEqual(5);
      expect(response.data.topStudios.length).toBeLessThanOrEqual(5);
      expect(response.data.topTags.length).toBeLessThanOrEqual(5);
    });

    it("should have proper structure for top scene items", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const scene of response.data.topScenes) {
        expect(scene.id).toBeDefined();
        expect(typeof scene.playCount).toBe("number");
        expect(typeof scene.playDuration).toBe("number");
        expect(typeof scene.oCount).toBe("number");
        // title and filePath can be null
        // imageUrl should be a proxy URL or null
        if (scene.imageUrl) {
          expect(scene.imageUrl).toContain("/api/proxy/stash");
        }
      }
    });

    it("should have proper structure for top performer items", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const performer of response.data.topPerformers) {
        expect(performer.id).toBeDefined();
        expect(typeof performer.name).toBe("string");
        expect(typeof performer.playCount).toBe("number");
        expect(typeof performer.playDuration).toBe("number");
        expect(typeof performer.oCount).toBe("number");
        // imageUrl should be a proxy URL or null
        if (performer.imageUrl) {
          expect(performer.imageUrl).toContain("/api/proxy/stash");
        }
      }
    });

    it("should have proper structure for top studio items", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const studio of response.data.topStudios) {
        expect(studio.id).toBeDefined();
        expect(typeof studio.name).toBe("string");
        expect(typeof studio.playCount).toBe("number");
        expect(typeof studio.playDuration).toBe("number");
        expect(typeof studio.oCount).toBe("number");
        // imageUrl should be a proxy URL or null
        if (studio.imageUrl) {
          expect(studio.imageUrl).toContain("/api/proxy/stash");
        }
      }
    });

    it("should have proper structure for top tag items", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      for (const tag of response.data.topTags) {
        expect(tag.id).toBeDefined();
        expect(typeof tag.name).toBe("string");
        expect(typeof tag.playCount).toBe("number");
        expect(typeof tag.playDuration).toBe("number");
        expect(typeof tag.oCount).toBe("number");
        // imageUrl should be a proxy URL or null
        if (tag.imageUrl) {
          expect(tag.imageUrl).toContain("/api/proxy/stash");
        }
      }
    });

    it("should proxy all image URLs (security check)", async () => {
      const response = await adminClient.get<UserStatsResponse>("/api/user-stats");

      expect(response.ok).toBe(true);

      // Check all image URLs are proxied, not direct Stash URLs
      const checkProxyUrl = (url: string | null) => {
        if (url) {
          expect(url).not.toMatch(/^https?:\/\//);
          expect(url).toContain("/api/proxy/stash");
        }
      };

      // Top scenes
      response.data.topScenes.forEach((s) => checkProxyUrl(s.imageUrl));

      // Top performers
      response.data.topPerformers.forEach((p) => checkProxyUrl(p.imageUrl));

      // Top studios
      response.data.topStudios.forEach((s) => checkProxyUrl(s.imageUrl));

      // Top tags
      response.data.topTags.forEach((t) => checkProxyUrl(t.imageUrl));

      // Highlights
      if (response.data.mostWatchedScene) {
        checkProxyUrl(response.data.mostWatchedScene.imageUrl);
      }
      if (response.data.mostViewedImage) {
        checkProxyUrl(response.data.mostViewedImage.imageUrl);
      }
      if (response.data.mostOdScene) {
        checkProxyUrl(response.data.mostOdScene.imageUrl);
      }
      if (response.data.mostOdPerformer) {
        checkProxyUrl(response.data.mostOdPerformer.imageUrl);
      }
    });
  });
});
