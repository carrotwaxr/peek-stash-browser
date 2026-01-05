import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Studio Filters Integration Tests
 *
 * Tests studio-specific filters:
 * - favorite filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name text search
 * - parent/child studio relationships
 */

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      parent_studio?: { id: string; name: string } | null;
      child_studios?: Array<{ id: string; name: string }>;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Studio Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite studios", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      for (const studio of response.data.findStudios.studios) {
        expect(studio.favorite).toBe(true);
      }
    });

    it("filters non-favorite studios", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters studios by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN (watched studios)", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          play_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters by play_count EQUALS zero (unwatched studios)", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          play_count: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("scene_count filter", () => {
    it("filters studios with many scenes", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          scene_count: {
            value: 10,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios with few scenes", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          scene_count: {
            value: 5,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("filters studios with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          scene_count: {
            value: 5,
            value2: 50,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("name filter", () => {
    it("filters studios by name text search", async () => {
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

  describe("text search (q parameter)", () => {
    it("searches studios by name", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and scene_count filters", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          favorite: true,
          scene_count: {
            value: 5,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      for (const studio of response.data.findStudios.studios) {
        expect(studio.favorite).toBe(true);
      }
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: { per_page: 50 },
        studio_filter: {
          rating100: {
            value: 60,
            modifier: "GREATER_THAN",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts studios by name ASC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 50,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by scene_count DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 50,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by rating100 DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });
  });

  describe("studio by ID", () => {
    it("returns studio by ID with details", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios.studios).toHaveLength(1);
      expect(response.data.findStudios.studios[0].id).toBe(TEST_ENTITIES.studioWithScenes);
    });
  });
});
