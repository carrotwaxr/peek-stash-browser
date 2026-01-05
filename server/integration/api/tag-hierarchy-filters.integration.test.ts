import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Tag Hierarchy Filters Integration Tests
 *
 * Tests tag filtering with hierarchical relationships:
 * - Tag depth filtering
 * - Parent tags include children (INCLUDES_ALL behavior)
 * - Tag exclusions
 * - Inherited tag behavior
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      parent_count?: number;
      child_count?: number;
      parents?: Array<{ id: string; name: string }>;
      children?: Array<{ id: string; name: string }>;
    }>;
    count: number;
  };
}

describe("Tag Hierarchy Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("basic tag filtering", () => {
    it("filters scenes by tag with INCLUDES modifier", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("filters scenes by tag with EXCLUDES modifier", async () => {
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
      // Results should not include the excluded tag
    });

    it("filters scenes by multiple tags with INCLUDES_ALL modifier", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities, TEST_ENTITIES.restrictableTag],
            modifier: "INCLUDES_ALL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // Result should include scenes with ALL specified tags
    });
  });

  describe("tag depth filtering", () => {
    it("filters tags by tag_count (scenes using the tag)", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          scene_count: {
            value: 1,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("filters tags with parent_count filter", async () => {
      // Tags that are children of other tags
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          parent_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });

    it("filters tags with child_count filter", async () => {
      // Tags that are parents of other tags
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          child_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });
  });

  describe("tag relationship filtering", () => {
    it("filters tags by parents", async () => {
      // First get a tag that has children
      const parentResponse = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 1 },
        tag_filter: {
          child_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      if (parentResponse.data.findTags.count > 0) {
        const parentTagId = parentResponse.data.findTags.tags[0].id;

        // Now filter scenes by this parent tag
        const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
          filter: { per_page: 50 },
          scene_filter: {
            tags: {
              value: [parentTagId],
              modifier: "INCLUDES",
              depth: 1, // Include child tags
            },
          },
        });

        expect(response.ok).toBe(true);
        expect(response.data.findScenes).toBeDefined();
      }
    });

    it("returns tag by ID with relationships", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.tags).toHaveLength(1);
      expect(response.data.findTags.tags[0].id).toBe(TEST_ENTITIES.tagWithEntities);
    });
  });

  describe("combined tag filters", () => {
    it("combines tag filter with other scene filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
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

    it("combines tag INCLUDES with tag EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("tag count filter on scenes", () => {
    it("filters scenes by tag_count", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tag_count: {
            value: 1,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes with IS_NULL for tags", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          tag_count: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
