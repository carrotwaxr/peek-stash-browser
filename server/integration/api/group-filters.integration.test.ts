import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Group Filters Integration Tests
 *
 * Tests group/collection-specific filters:
 * - favorite filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - performers filter (groups containing scenes with performer)
 * - studios filter
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name text search
 */

interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      name: string;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Group Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite groups", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("filters non-favorite groups", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters groups by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by multiple tags with INCLUDES_ALL", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities, TEST_ENTITIES.restrictableTag],
            modifier: "INCLUDES_ALL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters groups containing specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneInGroup],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should be in the results
      const groupIds = response.data.findGroups.groups.map(g => g.id);
      expect(groupIds).toContain(TEST_ENTITIES.groupWithScenes);
    });

    it("filters groups excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          scenes: {
            value: [TEST_ENTITIES.sceneInGroup],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should NOT be in the results
      const groupIds = response.data.findGroups.groups.map(g => g.id);
      expect(groupIds).not.toContain(TEST_ENTITIES.groupWithScenes);
    });
  });

  describe("performers filter", () => {
    it("filters groups containing scenes with performer", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters groups by studio", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN (watched groups)", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          play_count: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by play_count EQUALS zero (unwatched groups)", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          play_count: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("scene_count filter", () => {
    it("filters groups with many scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          scene_count: {
            value: 10,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with few scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          scene_count: {
            value: 5,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          scene_count: {
            value: 5,
            value2: 50,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches groups by name", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and scene_count filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          favorite: true,
          scene_count: {
            value: 5,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
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
      expect(response.data.findGroups).toBeDefined();
    });

    it("combines studio and performer filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: { per_page: 50 },
        group_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts groups by name ASC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 50,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by scene_count DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 50,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by rating100 DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("group by ID", () => {
    it("returns group by ID with details", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups.groups).toHaveLength(1);
      expect(response.data.findGroups.groups[0].id).toBe(TEST_ENTITIES.groupWithScenes);
    });
  });
});
