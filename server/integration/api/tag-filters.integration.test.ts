import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Tag Filters Integration Tests
 *
 * Tests tag-specific filters:
 * - favorite filter
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name/description text search
 * - parent/child tag relationships
 */

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      description?: string | null;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      parent_count?: number;
      child_count?: number;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

describe("Tag Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite tags", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.favorite).toBe(true);
      }
    });

    it("filters non-favorite tags", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters tags with rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          rating100: {
            value: 50,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        if (tag.rating100 !== null && tag.rating100 !== undefined) {
          expect(tag.rating100).toBeGreaterThan(50);
        }
      }
    });

    it("filters tags with rating LESS_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          rating100: {
            value: 80,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        if (tag.rating100 !== null && tag.rating100 !== undefined) {
          expect(tag.rating100).toBeLessThan(80);
        }
      }
    });

    it("filters tags with rating BETWEEN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          rating100: {
            value: 40,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        if (tag.rating100 !== null && tag.rating100 !== undefined) {
          expect(tag.rating100).toBeGreaterThanOrEqual(40);
          expect(tag.rating100).toBeLessThanOrEqual(80);
        }
      }
    });
  });

  describe("o_counter filter", () => {
    it("filters tags with o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.o_counter || 0).toBeGreaterThan(0);
      }
    });

    it("filters tags with o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.o_counter || 0).toBe(0);
      }
    });
  });

  describe("play_count filter", () => {
    it("filters tags with play_count GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          play_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.play_count || 0).toBeGreaterThan(0);
      }
    });
  });

  describe("scene_count filter", () => {
    it("filters tags with scene_count GREATER_THAN", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          scene_count: {
            value: 5,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count || 0).toBeGreaterThan(5);
      }
    });

    it("filters tags with scene_count EQUALS zero (unused tags)", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          scene_count: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count || 0).toBe(0);
      }
    });
  });

  describe("text search", () => {
    it("searches tags by name using q parameter", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 50,
          q: "tag", // Common substring in tag names
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });

    it("searches tags by name filter", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          name: {
            value: "tag",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });
  });

  describe("parent/child relationships", () => {
    it("filters tags with child_count > 0", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 100 },
        tag_filter: {
          child_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      // Filter should work - may return 0 results if no parent tags exist in test data
    });

    it("filters tags with parent_count > 0", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 100 },
        tag_filter: {
          parent_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      // Filter should work - may return 0 results if no child tags exist in test data
    });
  });

  describe("sorting", () => {
    it("sorts tags by name ascending", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const names = response.data.findTags.tags.map((t) => t.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });

    it("sorts tags by scene_count descending", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const counts = response.data.findTags.tags.map((t) => t.scene_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });
  });

  describe("combined filters", () => {
    it("combines favorite and rating filters", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          favorite: true,
          rating100: {
            value: 60,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.favorite).toBe(true);
        if (tag.rating100 !== null && tag.rating100 !== undefined) {
          expect(tag.rating100).toBeGreaterThan(60);
        }
      }
    });

    it("combines scene_count and o_counter filters", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          scene_count: {
            value: 1,
            modifier: "GREATER_THAN",
          },
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      for (const tag of response.data.findTags.tags) {
        expect(tag.scene_count || 0).toBeGreaterThan(1);
        expect(tag.o_counter || 0).toBeGreaterThan(0);
      }
    });
  });

  describe("fetch by ID", () => {
    it("fetches specific tag by ID", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.tags.length).toBe(1);
      expect(response.data.findTags.tags[0].id).toBe(TEST_ENTITIES.tagWithEntities);
    });
  });
});
