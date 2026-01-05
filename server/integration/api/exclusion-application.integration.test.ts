import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Exclusion Application Integration Tests
 *
 * Tests content restriction and exclusion features:
 * - User-level exclusions (tags, performers, studios)
 * - Content filtering based on exclusions
 * - Restriction tag application
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      tags?: Array<{ id: string; name?: string }>;
      performers?: Array<{ id: string; name?: string }>;
      studio?: { id: string; name?: string } | null;
    }>;
    count: number;
  };
}

interface UserExclusionsResponse {
  exclusions: {
    excludedTags: string[];
    excludedPerformers: string[];
    excludedStudios: string[];
  };
}

describe("Exclusion Application", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("restriction tag filtering", () => {
    it("can filter scenes by restrictable tag with INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.restrictableTag],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("can filter scenes by restrictable tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.restrictableTag],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("performer exclusions", () => {
    it("can filter scenes excluding specific performer", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Verify excluded performer not in results
      for (const scene of response.data.findScenes.scenes) {
        if (scene.performers) {
          const performerIds = scene.performers.map((p) => p.id);
          expect(performerIds).not.toContain(TEST_ENTITIES.performerWithScenes);
        }
      }
    });

    it("EXCLUDES returns different count than INCLUDES for same performer", async () => {
      const includesResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      const excludesResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(includesResponse.ok).toBe(true);
      expect(excludesResponse.ok).toBe(true);

      // The two counts should be different (unless performer is in all or no scenes)
      const includesCount = includesResponse.data.findScenes.count;
      const excludesCount = excludesResponse.data.findScenes.count;

      // At minimum, includes + excludes should not both be 0 if performer has scenes
      if (includesCount > 0) {
        expect(includesCount).not.toBe(excludesCount);
      }
    });
  });

  describe("studio exclusions", () => {
    it("can filter scenes excluding specific studio", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Verify excluded studio not in results
      for (const scene of response.data.findScenes.scenes) {
        if (scene.studio) {
          expect(scene.studio.id).not.toBe(TEST_ENTITIES.studioWithScenes);
        }
      }
    });
  });

  describe("tag exclusions", () => {
    it("can filter scenes excluding specific tag", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Verify excluded tag not in results
      for (const scene of response.data.findScenes.scenes) {
        if (scene.tags) {
          const tagIds = scene.tags.map((t) => t.id);
          expect(tagIds).not.toContain(TEST_ENTITIES.tagWithEntities);
        }
      }
    });
  });

  describe("combined exclusions", () => {
    it("can apply multiple exclusion types simultaneously", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "EXCLUDES",
          },
          tags: {
            value: [TEST_ENTITIES.restrictableTag],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("can combine INCLUDES and EXCLUDES on different entity types", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          tags: {
            value: [TEST_ENTITIES.restrictableTag],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Should have scenes from the studio but without the excluded tag
      for (const scene of response.data.findScenes.scenes) {
        if (scene.tags) {
          const tagIds = scene.tags.map((t) => t.id);
          expect(tagIds).not.toContain(TEST_ENTITIES.restrictableTag);
        }
      }
    });
  });

  describe("authentication requirements", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {
        filter: { per_page: 10 },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe("count filters with exclusions", () => {
    it("combines performer_count with exclusions", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performer_count: {
            value: 1,
            modifier: "GREATER_THAN",
          },
          tags: {
            value: [TEST_ENTITIES.restrictableTag],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
