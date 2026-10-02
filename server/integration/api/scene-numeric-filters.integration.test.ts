import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

/**
 * Scene Numeric Filters Integration Tests
 *
 * Tests numeric filter types on scenes:
 * - rating100 (0-100 scale rating)
 * - o_counter (orgasm counter)
 * - play_count
 * - play_duration
 * - performer_count
 * - tag_count
 * - duration
 * - the viewer's rating as a throwaway user: an unrated scene matches no
 *   comparison, only IS_NULL ("Not rated"); another user's rating never
 *   counts
 * - Stash's file_count and IS_NULL on o_counter (never missing), which Peek
 *   refuses (400)
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      rating100?: number | null;
      o_counter?: number | null;
      play_count?: number | null;
      play_duration?: number | null;
      files?: Array<{ duration?: number }>;
      instanceId?: string;
    }>;
    count: number;
  };
}

describe("Scene Numeric Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            rating100: {
              value: 60,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            rating100: {
              value: 40,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by rating EQUALS", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            rating100: {
              value: 80,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by o_counter EQUALS", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            o_counter: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            play_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters unplayed scenes (play_count EQUALS 0)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            play_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("performer_count filter", () => {
    it("filters scenes with multiple performers", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes with no performers", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes with exactly one performer", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_count: {
              value: 1,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("tag_count filter", () => {
    it("filters scenes with many tags", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tag_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters untagged scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            tag_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("duration filter", () => {
    it("filters by duration GREATER_THAN (long scenes)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            duration: {
              value: 1800, // 30 minutes
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by duration LESS_THAN (short scenes)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            duration: {
              value: 300, // 5 minutes
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters by duration BETWEEN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            duration: {
              value: 600, // 10 minutes
              value2: 1200, // 20 minutes
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("the viewer's rating: unknown never matches a comparison", () => {
    // The rater rates one replay scene 30 on the test instance; the other
    // user rates nothing. The second library reuses the scene's id.
    let rater: { id: number; client: TestClient };
    let other: { id: number; client: TestClient };
    let ratedKey: string;
    /** Every scene the users see, as "id:instance", sorted */
    let allKeys: string[];

    /** The scenes a rating criterion lists for the client, as "id:instance", sorted */
    const keysFor = async (
      client: TestClient,
      rating100?: Record<string, unknown>
    ): Promise<string[]> => {
      const keys: string[] = [];
      let total = Infinity;
      for (let page = 1; keys.length < total; page++) {
        const response = await client.post<FindScenesResponse>(
          "/api/library/scenes",
          {
            filter: { page, per_page: 250, sort: "title", direction: "ASC" },
            ...(rating100 ? { scene_filter: { rating100 } } : {}),
          }
        );
        expect(response.status).toBe(200);
        const { scenes, count } = response.data.findScenes;
        total = count;
        keys.push(
          ...scenes.map((scene) => `${scene.id}:${scene.instanceId ?? ""}`)
        );
        if (scenes.length === 0) break;
      }
      expect(keys).toHaveLength(total);
      return keys.sort();
    };

    beforeAll(async () => {
      const instanceId = await findTestInstanceId();
      const sceneId = TEST_ENTITIES.sceneWithRelations;
      ratedKey = `${sceneId}:${instanceId}`;
      rater = await createApiUser("s4_rating_rater", "s4_rating_pass_1");
      other = await createApiUser("s4_rating_other", "s4_rating_pass_2");
      const rated = await rater.client.put(`/api/ratings/scene/${sceneId}`, {
        rating: 30,
        instanceId,
      });
      expect(rated.status).toBe(200);
      allKeys = await keysFor(rater.client);
      expect(allKeys).toContain(ratedKey);
    }, 60000);

    afterAll(async () => {
      // beforeAll may have failed before it set them
      for (const user of [rater, other] as const) {
        const created = user as typeof user | undefined;
        if (created) await adminClient.delete(`/api/user/${created.id}`);
      }
    }, 60000);

    it("rating at most 40 lists only rated scenes", async () => {
      // One-sided BETWEEN: value2 alone is at most it
      expect(
        await keysFor(rater.client, { modifier: "BETWEEN", value2: 40 })
      ).toEqual([ratedKey]);
      expect(
        await keysFor(rater.client, { modifier: "LESS_THAN", value: 41 })
      ).toEqual([ratedKey]);
      expect(
        await keysFor(rater.client, { modifier: "NOT_EQUALS", value: 80 })
      ).toEqual([ratedKey]);
      expect(
        await keysFor(rater.client, {
          modifier: "NOT_BETWEEN",
          value: 50,
          value2: 100,
        })
      ).toEqual([ratedKey]);
    });

    it("rating IS_NULL lists the unrated, not the rated", async () => {
      // Every other scene, the same id on the other instance included
      expect(await keysFor(rater.client, { modifier: "IS_NULL" })).toEqual(
        allKeys.filter((key) => key !== ratedKey)
      );
      expect(await keysFor(rater.client, { modifier: "NOT_NULL" })).toEqual([
        ratedKey,
      ]);
    });

    it("another user's rating does not make a scene rated for the viewer", async () => {
      expect(await keysFor(other.client, { modifier: "IS_NULL" })).toEqual(
        allKeys
      );
      expect(await keysFor(other.client, { modifier: "NOT_NULL" })).toEqual([]);
      expect(
        await keysFor(other.client, { modifier: "BETWEEN", value2: 40 })
      ).toEqual([]);
    });
  });

  describe("Stash scene filters Peek does not apply", () => {
    // The request parser refuses them rather than ignore them: a play or O
    // count is never missing (none is 0), and no builder counts files
    it.each([
      {
        name: "o_counter IS_NULL",
        path: "scene_filter.o_counter.modifier",
        criterion: { o_counter: { modifier: "IS_NULL" } },
      },
      {
        name: "play_count NOT_NULL",
        path: "scene_filter.play_count.modifier",
        criterion: { play_count: { value: 0, modifier: "NOT_NULL" } },
      },
      {
        name: "file_count",
        path: "scene_filter.file_count",
        criterion: { file_count: { value: 1, modifier: "GREATER_THAN" } },
      },
    ])("$name answers 400 naming $path", async ({ path, criterion }) => {
      const response = await adminClient.post("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: criterion,
      });

      expectRefused(response, [path]);
    });
  });

  describe("combined numeric filters", () => {
    it("combines rating and duration filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
            duration: {
              value: 600,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("combines play_count and performer_count filters", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            play_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
            performer_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
