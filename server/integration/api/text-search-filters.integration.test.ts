import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Text Search Filters Integration Tests
 *
 * Tests text/string search filters across entities:
 * - title filter (scenes, galleries, groups)
 * - name filter (performers, studios, tags)
 * - details filter (description/notes)
 * - url filter
 * - stash_id filter
 * - Query parameter (global search)
 * - String modifiers: EQUALS, NOT_EQUALS, INCLUDES, EXCLUDES, MATCHES_REGEX
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      details?: string;
      url?: string;
    }>;
    count: number;
  };
}

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      details?: string;
      url?: string;
      aliases?: string;
    }>;
    count: number;
  };
}

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      details?: string;
      url?: string;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      description?: string;
      aliases?: string[];
    }>;
    count: number;
  };
}

describe("Text Search Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("scene title filter", () => {
    it("filters by title INCLUDES (partial match)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title EXCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "test",
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title IS_NULL (no title)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "",
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title NOT_NULL (has title)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "",
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by title MATCHES_REGEX", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "^[A-Z].*",
            modifier: "MATCHES_REGEX",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("scene details filter", () => {
    it("filters by details INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          details: {
            value: "the",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by details IS_NULL (no description)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          details: {
            value: "",
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("scene url filter", () => {
    it("filters by url INCLUDES", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          url: {
            value: "http",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by url IS_NULL (no url)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          url: {
            value: "",
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("performer name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          name: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("filters by name MATCHES_REGEX", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          name: {
            value: "^[A-Z].*",
            modifier: "MATCHES_REGEX",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("performer aliases filter", () => {
    it("filters by aliases INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          aliases: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by aliases NOT_NULL (has aliases)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          aliases: {
            value: "",
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("studio name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          name: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("tag name filter", () => {
    it("filters by name INCLUDES", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: { per_page: 50 },
        tag_filter: {
          name: {
            value: "a",
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
    });

    it("filters by name EQUALS (exact match)", async () => {
      // First get a tag to know an exact name
      const initial = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      if (initial.data.findTags.tags.length > 0) {
        const tagName = initial.data.findTags.tags[0].name;

        const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
          filter: { per_page: 50 },
          tag_filter: {
            name: {
              value: tagName,
              modifier: "EQUALS",
            },
          },
        });

        expect(response.ok).toBe(true);
        expect(response.data.findTags.count).toBeGreaterThan(0);
      }
    });
  });

  describe("stash_id filter", () => {
    it("filters scenes by stash_id NOT_NULL", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          stash_id_endpoint: {
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters performers by stash_id NOT_NULL", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          stash_id_endpoint: {
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("query parameter (global search)", () => {
    it("searches scenes with q parameter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          q: "scene",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("searches performers with q parameter", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 50,
          q: "performer",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("combined text filters", () => {
    it("combines title and details filters", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "",
            modifier: "NOT_NULL",
          },
          details: {
            value: "",
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines text filter with entity filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          title: {
            value: "a",
            modifier: "INCLUDES",
          },
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
