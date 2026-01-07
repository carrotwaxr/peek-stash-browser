import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Performer Filters Integration Tests
 *
 * Tests performer-specific filters:
 * - favorite filter
 * - gender filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - studios filter (performers in scenes from studio)
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name/aliases text search
 */

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      gender?: string | null;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Performer Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.favorite).toBe(true);
      }
    });

    it("filters non-favorite performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("gender filter", () => {
    it("filters by gender EQUALS FEMALE", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          gender: {
            value: "FEMALE",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("FEMALE");
      }
    });

    it("filters by gender EQUALS MALE", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          gender: {
            value: "MALE",
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("MALE");
      }
    });

    it("filters by gender NOT_EQUALS", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          gender: {
            value: "MALE",
            modifier: "NOT_EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).not.toBe("MALE");
      }
    });
  });

  describe("tags filter", () => {
    it("filters performers by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by multiple tags with INCLUDES_ALL", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities, TEST_ENTITIES.restrictableTag],
            modifier: "INCLUDES_ALL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters performers appearing in specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneWithRelations],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("filters performers excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneWithRelations],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters performers who appear in scenes from studio", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN (watched performers)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          play_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by play_count EQUALS zero (unwatched performers)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          play_count: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("scene_count filter", () => {
    it("filters performers with many scenes", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scene_count: {
            value: 10,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with few scenes", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scene_count: {
            value: 5,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scene_count: {
            value: 5,
            value2: 20,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches performers by name", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines gender and favorite filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          gender: {
            value: "FEMALE",
            modifier: "EQUALS",
          },
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("FEMALE");
        expect(performer.favorite).toBe(true);
      }
    });

    it("combines scene_count and rating filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          scene_count: {
            value: 5,
            modifier: "GREATER_THAN",
          },
          rating100: {
            value: 60,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines tags and studios filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts performers by name ASC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 50,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by scene_count DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 50,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by rating100 DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });
});
