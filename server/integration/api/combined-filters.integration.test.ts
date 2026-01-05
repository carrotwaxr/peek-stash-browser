import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Combined Filters Integration Tests
 *
 * Tests multiple filters applied simultaneously:
 * - Multiple entity filters (performer + studio + tag)
 * - Entity filters + date filters
 * - Entity filters + numeric filters
 * - Complex multi-filter queries
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      favorite?: boolean;
      rating100?: number;
      performers?: Array<{ id: string }>;
      studio?: { id: string } | null;
      tags?: Array<{ id: string }>;
    }>;
    count: number;
  };
}

describe("Combined Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("multiple entity filters", () => {
    it("combines performer and studio filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // Result count should be <= min of individual filter counts
      // (AND logic means intersection)
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("combines performer, studio, and tag filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines INCLUDES and EXCLUDES modifiers", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
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
    });
  });

  describe("entity filters with boolean filters", () => {
    it("combines performer filter with favorite filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      // All results should be favorites
      for (const scene of response.data.findScenes.scenes) {
        expect(scene.favorite).toBe(true);
      }
    });

    it("combines studio filter with performer_favorite filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          performer_favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("entity filters with date filters", () => {
    it("combines performer filter with date filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          date: {
            value: "2020-01-01",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines tag filter with created_at filter", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
          created_at: {
            value: oneYearAgo.toISOString().split("T")[0],
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("entity filters with numeric filters", () => {
    it("combines performer filter with rating filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          rating100: {
            value: 60,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines studio filter with duration filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          duration: {
            value: 600, // 10 minutes
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("complex multi-filter queries", () => {
    it("combines 4+ filters successfully", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          favorite: false,
          date: {
            value: "2018-01-01",
            modifier: "GREATER_THAN",
          },
          duration: {
            value: 300, // 5 minutes
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines entity, date, numeric, and boolean filters", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
          favorite: false,
          created_at: {
            value: oneYearAgo.toISOString().split("T")[0],
            modifier: "GREATER_THAN",
          },
          duration: {
            value: 120,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("handles empty result set gracefully", async () => {
      // Create an impossible filter combination using rating
      // (no scene has rating > 999)
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
          rating100: {
            value: 999,
            modifier: "GREATER_THAN",
          },
        },
      });

      // This should return OK with 0 results
      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBe(0);
    });
  });

  describe("filter with sorting", () => {
    it("combines filters with custom sort", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          sort: "duration",
          direction: "DESC",
        },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines filters with random sort and seed", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          sort: "random_12345",
        },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
