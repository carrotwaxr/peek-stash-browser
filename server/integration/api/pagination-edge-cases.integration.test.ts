import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, selectTestInstanceOnly } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Pagination Edge Cases Integration Tests
 *
 * Tests pagination behavior including:
 * - Various per_page values (1, 10, 100, 1000)
 * - Empty result sets
 * - Last page handling
 * - Beyond-range page numbers
 * - Page navigation consistency
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
    }>;
    count: number;
  };
}

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  };
}

describe("Pagination Edge Cases", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance for consistent pagination counts
    await selectTestInstanceOnly();
  });

  describe("per_page variations", () => {
    it("handles per_page of 1", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 1,
          page: 1,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(1);
    });

    it("handles per_page of 10", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 1,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(10);
    });

    it("handles per_page of 100", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 100,
          page: 1,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(100);
    });

    it("handles per_page of 1000", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 1000,
          page: 1,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(1000);
    });

    it("handles default per_page when not specified", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {},
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("empty result sets", () => {
    it("returns empty array for impossible filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          // Filter that should return no results
          rating100: {
            value: 999, // Impossible rating
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      expect(response.data.findScenes.count).toBe(0);
    });

    it("returns empty array for non-existent ID", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: ["999999999"], // Non-existent ID
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
    });

    it("returns empty array for text search with no matches", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          q: "xyznonexistentquerystring12345",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      expect(response.data.findScenes.count).toBe(0);
    });
  });

  describe("page navigation", () => {
    it("returns correct items for page 1", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
          page: 1,
          sort: "id",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(5);
    });

    it("returns different items for page 2", async () => {
      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
          page: 1,
          sort: "id",
          direction: "ASC",
        },
      });

      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
          page: 2,
          sort: "id",
          direction: "ASC",
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // If there are enough results, page 2 should have different items
      if (page1.data.findScenes.count > 5 && page2.data.findScenes.scenes.length > 0) {
        const page1Ids = page1.data.findScenes.scenes.map((s) => s.id);
        const page2Ids = page2.data.findScenes.scenes.map((s) => s.id);

        // Verify no overlap between pages
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it("maintains consistent count across pages", async () => {
      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 1,
        },
      });

      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 2,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // Total count should be the same regardless of page
      expect(page1.data.findScenes.count).toBe(page2.data.findScenes.count);
    });
  });

  describe("beyond-range page numbers", () => {
    it("returns empty array for page beyond total pages", async () => {
      // First get the count
      const countResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 10, page: 1 },
      });

      expect(countResponse.ok).toBe(true);
      const totalCount = countResponse.data.findScenes.count;
      const totalPages = Math.ceil(totalCount / 10);

      // Request a page way beyond the total
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: totalPages + 100,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      // Count should still reflect total items
      expect(response.data.findScenes.count).toBe(totalCount);
    });

    it("handles page 0 gracefully", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 0,
        },
      });

      // Should either treat as page 1 or return error gracefully
      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("handles negative page gracefully", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: -1,
        },
      });

      // Should either treat as page 1 or return error gracefully
      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("last page handling", () => {
    it("returns partial results on last page", async () => {
      // Get total count with per_page that won't divide evenly
      const countResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 7, page: 1 },
      });

      expect(countResponse.ok).toBe(true);
      const totalCount = countResponse.data.findScenes.count;

      if (totalCount > 7) {
        const lastPage = Math.ceil(totalCount / 7);
        const expectedLastPageCount = totalCount % 7 || 7;

        const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          filter: {
            per_page: 7,
            page: lastPage,
          },
        });

        expect(response.ok).toBe(true);
        expect(response.data.findScenes.scenes.length).toBe(expectedLastPageCount);
      }
    });
  });

  describe("pagination across entity types", () => {
    it("paginates performers correctly", async () => {
      const page1 = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 5,
          page: 1,
          sort: "name",
          direction: "ASC",
        },
      });

      const page2 = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 5,
          page: 2,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);
      expect(page1.data.findPerformers.count).toBe(page2.data.findPerformers.count);

      if (page1.data.findPerformers.count > 5 && page2.data.findPerformers.performers.length > 0) {
        const page1Ids = page1.data.findPerformers.performers.map((p) => p.id);
        const page2Ids = page2.data.findPerformers.performers.map((p) => p.id);
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it("paginates tags correctly", async () => {
      const page1 = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 5,
          page: 1,
          sort: "name",
          direction: "ASC",
        },
      });

      const page2 = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 5,
          page: 2,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);
      expect(page1.data.findTags.count).toBe(page2.data.findTags.count);

      if (page1.data.findTags.count > 5 && page2.data.findTags.tags.length > 0) {
        const page1Ids = page1.data.findTags.tags.map((t) => t.id);
        const page2Ids = page2.data.findTags.tags.map((t) => t.id);
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });

  describe("pagination with filters", () => {
    it("paginates filtered results correctly", async () => {
      // First get count of filtered results
      const countResponse = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 5, page: 1 },
        scene_filter: {
          rating100: {
            value: 0,
            modifier: "NOT_NULL",
          },
        },
      });

      expect(countResponse.ok).toBe(true);
      const filteredCount = countResponse.data.findScenes.count;

      if (filteredCount > 5) {
        // Get page 2 of filtered results
        const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          filter: { per_page: 5, page: 2 },
          scene_filter: {
            rating100: {
              value: 0,
              modifier: "NOT_NULL",
            },
          },
        });

        expect(page2.ok).toBe(true);
        expect(page2.data.findScenes.count).toBe(filteredCount);
        expect(page2.data.findScenes.scenes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("pagination with random sort", () => {
    it("maintains stable pagination with random seed", async () => {
      const seed = 77777777;

      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
          page: 1,
          sort: `random_${seed}`,
        },
      });

      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
          page: 2,
          sort: `random_${seed}`,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // With same seed, pages should not overlap
      if (page1.data.findScenes.count > 5 && page2.data.findScenes.scenes.length > 0) {
        const page1Ids = page1.data.findScenes.scenes.map((s) => s.id);
        const page2Ids = page2.data.findScenes.scenes.map((s) => s.id);
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    it("re-requesting same page with same seed returns same results", async () => {
      const seed = 88888888;

      const first = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 1,
          sort: `random_${seed}`,
        },
      });

      const second = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          page: 1,
          sort: `random_${seed}`,
        },
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const firstIds = first.data.findScenes.scenes.map((s) => s.id);
      const secondIds = second.data.findScenes.scenes.map((s) => s.id);
      expect(firstIds).toEqual(secondIds);
    });
  });
});
