import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Integration tests for minimal endpoint count_filter functionality.
 *
 * Tests that the count_filter parameter correctly filters entities
 * based on their content counts (scene_count, gallery_count, etc.)
 */

interface MinimalPerformerResponse {
  performers: Array<{ id: string; name: string }>;
}

interface MinimalStudioResponse {
  studios: Array<{ id: string; name: string }>;
}

interface MinimalTagResponse {
  tags: Array<{ id: string; name: string }>;
}

interface MinimalGalleryResponse {
  galleries: Array<{ id: string; title: string }>;
}

interface MinimalGroupResponse {
  groups: Array<{ id: string; name: string }>;
}

describe("Minimal Endpoint Count Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/performers/minimal with count_filter", () => {
    it("filters performers with min_scene_count", async () => {
      // Without filter - should return all performers
      const allResponse = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.performers.length;

      // With min_scene_count: 1 - should return fewer performers
      const filteredResponse = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.performers.length).toBeLessThanOrEqual(totalCount);

      // Known performer with scenes should be in filtered results
      const hasPerformerWithScenes = filteredResponse.data.performers.some(
        (p) => p.id === TEST_ENTITIES.performerWithScenes
      );
      expect(hasPerformerWithScenes).toBe(true);
    });

    it("returns all performers when count_filter is empty", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: {},
        }
      );
      expect(response.ok).toBe(true);
      expect(response.data.performers.length).toBeGreaterThan(0);
    });

    it("supports min_gallery_count filter", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: { min_gallery_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
      // Should return performers with at least 1 gallery
    });
  });

  describe("POST /api/library/studios/minimal with count_filter", () => {
    it("filters studios with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.studios.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.studios.length).toBeLessThanOrEqual(totalCount);

      // Known studio with scenes should be in filtered results
      const hasStudioWithScenes = filteredResponse.data.studios.some(
        (s) => s.id === TEST_ENTITIES.studioWithScenes
      );
      expect(hasStudioWithScenes).toBe(true);
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("POST /api/library/tags/minimal with count_filter", () => {
    it("filters tags with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.tags.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.tags.length).toBeLessThanOrEqual(totalCount);

      // Known tag with entities should be in filtered results
      const hasTagWithEntities = filteredResponse.data.tags.some(
        (t) => t.id === TEST_ENTITIES.tagWithEntities
      );
      expect(hasTagWithEntities).toBe(true);
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("POST /api/library/galleries/minimal with count_filter", () => {
    it("filters galleries with min_image_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalGalleryResponse>(
        "/api/library/galleries/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.galleries.length;

      // With min_image_count: 1
      const filteredResponse = await adminClient.post<MinimalGalleryResponse>(
        "/api/library/galleries/minimal",
        {
          count_filter: { min_image_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      // Filtered count should be <= total (some galleries may have 0 images)
      expect(filteredResponse.data.galleries.length).toBeLessThanOrEqual(totalCount);
    });
  });

  describe("POST /api/library/groups/minimal with count_filter", () => {
    it("filters groups with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.groups.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.groups.length).toBeLessThanOrEqual(totalCount);
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("OR logic for multiple count filters", () => {
    it("uses OR logic when multiple filters provided", async () => {
      // This test verifies that when multiple count filters are provided,
      // entities matching ANY filter are included (OR logic, not AND)

      // Get results with only scene filter
      const scenesOnlyResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );

      // Get results with only performer filter
      const performersOnlyResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );

      // Get results with both filters (OR logic)
      const bothFiltersResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1, min_performer_count: 1 },
        }
      );

      expect(scenesOnlyResponse.ok).toBe(true);
      expect(performersOnlyResponse.ok).toBe(true);
      expect(bothFiltersResponse.ok).toBe(true);

      // With OR logic, combined should be >= each individual filter
      // (unless there's perfect overlap)
      const scenesOnlyCount = scenesOnlyResponse.data.tags.length;
      const performersOnlyCount = performersOnlyResponse.data.tags.length;
      const bothCount = bothFiltersResponse.data.tags.length;

      // Combined should be at least as big as the larger individual result
      expect(bothCount).toBeGreaterThanOrEqual(Math.max(scenesOnlyCount, performersOnlyCount));
    });
  });

  describe("Authentication", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers/minimal", {
        count_filter: { min_scene_count: 1 },
      });
      expect(response.status).toBe(401);
    });
  });

  describe("Backward compatibility", () => {
    it("works without count_filter parameter", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          filter: { per_page: 10 },
        }
      );
      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
    });

    it("combines with search query", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          filter: { q: "a" },
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
      // Should only return performers matching search AND having scenes
    });
  });
});
