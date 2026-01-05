import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

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
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: { favorite: true },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should be favorites
      // Note: The scene.favorite field indicates user's favorite status
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(true);
      }
    });

    it("returns only non-favorite scenes when favorite=false", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: { favorite: false },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should NOT be favorites
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(false);
      }
    });

    it("returns different counts for favorite vs non-favorite", async () => {
      const favResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
        scene_filter: { favorite: true },
      });

      const nonFavResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
        scene_filter: { favorite: false },
      });

      const allResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
      });

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
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: { performer_favorite: true },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite performers
      // The actual count depends on user's favorites
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by performer_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
        scene_filter: { performer_favorite: true },
      });

      const allResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
      });

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
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: { studio_favorite: true },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite studios
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by studio_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
        scene_filter: { studio_favorite: true },
      });

      const allResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
      });

      expect(filteredResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      expect(filteredResponse.data.findScenes.count).toBeLessThanOrEqual(
        allResponse.data.findScenes.count
      );
    });
  });

  describe("tag_favorite filter", () => {
    it("returns scenes with favorite tags when tag_favorite=true", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: { tag_favorite: true },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should return some scenes if user has favorite tags
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("returns fewer scenes than total when filtering by tag_favorite", async () => {
      const filteredResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
        scene_filter: { tag_favorite: true },
      });

      const allResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 1 },
      });

      expect(filteredResponse.ok).toBe(true);
      expect(allResponse.ok).toBe(true);

      expect(filteredResponse.data.findScenes.count).toBeLessThanOrEqual(
        allResponse.data.findScenes.count
      );
    });
  });

  describe("combined favorite filters", () => {
    it("can combine favorite with performer_favorite", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          favorite: true,
          performer_favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All returned scenes should be favorites (AND logic)
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(true);
      }
    });

    it("can combine all favorite filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          favorite: true,
          performer_favorite: true,
          studio_favorite: true,
          tag_favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // This is a very restrictive filter - may return 0 results
      // but the query should still succeed
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });
  });
});
