import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

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
 * - synopsis and director text filters
 */

interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      instanceId: string;
      name: string;
      synopsis?: string | null;
      director?: string | null;
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
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("filters non-favorite groups", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters groups by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups by multiple tags with INCLUDES_ALL", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            tags: {
              value: [
                TEST_ENTITIES.tagWithEntities,
                TEST_ENTITIES.restrictableTag,
              ],
              modifier: "INCLUDES_ALL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters groups containing specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneInGroup],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should be in the results
      const groupIds = response.data.findGroups.groups.map((g) => g.id);
      expect(groupIds).toContain(TEST_ENTITIES.groupWithScenes);
    });

    it("filters groups excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneInGroup],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      // The group should NOT be in the results
      const groupIds = response.data.findGroups.groups.map((g) => g.id);
      expect(groupIds).not.toContain(TEST_ENTITIES.groupWithScenes);
    });
  });

  describe("performers filter", () => {
    it("filters groups containing scenes with performer", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters groups by studio", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("Stash group filters Peek does not apply", () => {
    // Groups carry no O count or play count of their own; the request
    // parser refuses the criteria rather than ignore them
    it.each(["o_counter", "play_count"])(
      "%s answers 400 naming it",
      async (field) => {
        const response = await adminClient.post("/api/library/groups", {
          filter: { per_page: 50 },
          group_filter: { [field]: { value: 0, modifier: "GREATER_THAN" } },
        });

        expectRefused(response, [`group_filter.${field}`]);
      }
    );
  });

  describe("synopsis and director filters", () => {
    type Group = FindGroupsResponse["findGroups"]["groups"][number];

    const listed = async (groupFilter: Record<string, unknown>) => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        { filter: { per_page: 250 }, group_filter: groupFilter }
      );
      expect(response.ok).toBe(true);
      return response.data.findGroups;
    };
    const keys = (groups: readonly Group[]) =>
      groups.map((g) => `${g.id}:${g.instanceId}`).sort();

    /** A group holding the field, and the library's groups without it */
    async function subjects(field: "synopsis" | "director") {
      const all = await listed({});
      const holder = must(
        all.groups.find((g) => (g[field] ?? "") !== ""),
        `a group with a ${field}`
      );
      const without = all.groups.filter((g) => (g[field] ?? "") === "");
      expect(without.length, `a group without a ${field}`).toBeGreaterThan(0);
      return { all, text: must(holder[field]), holder, without };
    }

    it("synopsis INCLUDES lists only groups whose synopsis holds the text", async () => {
      const { text, holder, without } = await subjects("synopsis");
      const needle = text.slice(0, -2).toUpperCase();

      const { groups, count } = await listed({
        synopsis: { value: needle, modifier: "INCLUDES" },
      });

      expect(count).toBe(groups.length);
      expect(keys(groups)).toContain(`${holder.id}:${holder.instanceId}`);
      expect(
        groups.filter((g) => !(g.synopsis ?? "").toUpperCase().includes(needle))
      ).toEqual([]);
      const listedKeys = keys(groups);
      expect(keys(without).filter((key) => listedKeys.includes(key))).toEqual(
        []
      );
    });

    it("director EQUALS lists only groups with that director", async () => {
      const { text } = await subjects("director");

      const { groups } = await listed({
        director: { value: text.toLowerCase(), modifier: "EQUALS" },
      });

      expect(groups.length).toBeGreaterThan(0);
      expect(
        groups.filter(
          (g) => (g.director ?? "").toLowerCase() !== text.toLowerCase()
        )
      ).toEqual([]);
    });

    it("director IS_NULL lists the groups without one, and NOT_NULL the rest", async () => {
      const { all, without } = await subjects("director");

      const missing = await listed({ director: { modifier: "IS_NULL" } });
      const present = await listed({ director: { modifier: "NOT_NULL" } });

      expect(keys(missing.groups)).toEqual(keys(without));
      expect(missing.count + present.count).toBe(all.count);
    });
  });

  describe("scene_count filter", () => {
    it("filters groups with many scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 10,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with few scenes", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 5,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("filters groups with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            scene_count: {
              value: 5,
              value2: 50,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches groups by name", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and scene_count filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: { per_page: 50 },
          group_filter: {
            favorite: true,
            scene_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      for (const group of response.data.findGroups.groups) {
        expect(group.favorite).toBe(true);
      }
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
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
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("combines studio and performer filters", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
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
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts groups by name ASC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by scene_count DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by rating100 DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });
  });

  describe("group by ID", () => {
    it("returns group by ID with details", async () => {
      // A detail page names the entity's instance: the second library
      // reuses the test library's ids, so a bare id can match one on each
      // instance (the ambiguous-lookup 400)
      const instanceId = await findTestInstanceId();
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          ids: [`${TEST_ENTITIES.groupWithScenes}:${instanceId}`],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups.groups).toHaveLength(1);
      const group = must(response.data.findGroups.groups[0]);
      expect(group.id).toBe(TEST_ENTITIES.groupWithScenes);
      expect(group.instanceId).toBe(instanceId);
    });
  });
});
