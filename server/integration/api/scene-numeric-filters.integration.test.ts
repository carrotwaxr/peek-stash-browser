import { beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient } from "../helpers/testClient.js";

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
 * - Stash's file_count and the rating's IS_NULL and NOT_NULL, which Peek
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

  describe("Stash scene filters Peek does not apply", () => {
    // The request parser refuses them rather than ignore them: the numeric
    // clause has no IS_NULL or NOT_NULL, and no builder counts files
    it.each([
      {
        name: "rating100 IS_NULL",
        path: "scene_filter.rating100.modifier",
        criterion: { rating100: { value: 0, modifier: "IS_NULL" } },
      },
      {
        name: "rating100 NOT_NULL",
        path: "scene_filter.rating100.modifier",
        criterion: { rating100: { value: 0, modifier: "NOT_NULL" } },
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
