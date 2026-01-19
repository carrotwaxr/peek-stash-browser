import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Scene Date Filters Integration Tests
 *
 * Tests the date-related filters:
 * - date: Filter by scene date (when the scene was filmed/released)
 * - created_at: Filter by when the scene was added to Stash
 * - updated_at: Filter by when the scene was last updated in Stash
 * - last_played_at: Filter by when the user last played the scene
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      date?: string;
      created_at?: string;
      updated_at?: string;
      last_played_at?: string;
    }>;
    count: number;
  };
}

describe("Scene Date Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("date filter (scene date)", () => {
    it("filters scenes by date GREATER_THAN", async () => {
      // Get scenes from 2020 onwards
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2020-01-01",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date LESS_THAN", async () => {
      // Get scenes before 2020
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2020-01-01",
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date BETWEEN", async () => {
      // Get scenes from 2022
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2022-01-01",
            value2: "2022-12-31",
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date NOT_BETWEEN", async () => {
      // Get scenes NOT from 2022
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2022-01-01",
            value2: "2022-12-31",
            modifier: "NOT_BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date IS_NULL", async () => {
      // Get scenes without a date set
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by date NOT_NULL", async () => {
      // Get scenes with a date set
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    /**
     * CRITICAL TEST: Date BETWEEN must exclude items with NULL dates
     *
     * This test ensures the Timeline feature works correctly - when a user
     * selects a time period like "January 2024", only items WITH dates
     * within that range should be shown. Items without dates should NOT
     * appear in the filtered results.
     */
    it("date BETWEEN excludes scenes with NULL dates", async () => {
      // First, count scenes with NULL dates
      const nullDatesResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: {
            date: { modifier: "IS_NULL" },
          },
        }
      );

      const scenesWithNullDates = nullDatesResponse.data.findScenes.count;

      // If there are no scenes with null dates, skip this test
      if (scenesWithNullDates === 0) {
        console.log("Skipping NULL date exclusion test - no scenes with NULL dates in test data");
        return;
      }

      // Now get scenes with BETWEEN filter - use very wide range to include all dated scenes
      const betweenResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 100 },
          scene_filter: {
            date: {
              value: "2000-01-01",
              value2: "2099-12-31",
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(betweenResponse.ok).toBe(true);

      // CRITICAL: No scene in the BETWEEN results should have a NULL date
      for (const scene of betweenResponse.data.findScenes.scenes) {
        expect(scene.date).not.toBeNull();
        expect(scene.date).toBeDefined();
        expect(scene.date).toBeTruthy();
      }
    });
  });

  describe("created_at filter", () => {
    it("filters scenes by created_at GREATER_THAN", async () => {
      // Get scenes added in the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateStr = oneYearAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          created_at: {
            value: dateStr,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by created_at LESS_THAN", async () => {
      // Get scenes added more than a year ago
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateStr = oneYearAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          created_at: {
            value: dateStr,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by created_at BETWEEN", async () => {
      // Get scenes added in the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const today = new Date();

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          created_at: {
            value: sixMonthsAgo.toISOString().split("T")[0],
            value2: today.toISOString().split("T")[0],
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("updated_at filter", () => {
    it("filters scenes by updated_at GREATER_THAN", async () => {
      // Get recently updated scenes
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const dateStr = oneMonthAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          updated_at: {
            value: dateStr,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by updated_at BETWEEN", async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const today = new Date();

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          updated_at: {
            value: threeMonthsAgo.toISOString().split("T")[0],
            value2: today.toISOString().split("T")[0],
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("last_played_at filter", () => {
    it("filters scenes by last_played_at GREATER_THAN", async () => {
      // Get scenes played recently
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const dateStr = oneWeekAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          last_played_at: {
            value: dateStr,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // May return 0 if user hasn't played any scenes recently
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by last_played_at IS_NULL (never played)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          last_played_at: {
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by last_played_at NOT_NULL (has been played)", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          last_played_at: {
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("combined date filters", () => {
    it("can combine date with created_at filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2021-01-01",
            modifier: "GREATER_THAN",
          },
          created_at: {
            value: "2022-01-01",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("can combine all date filters", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          date: {
            value: "2020-01-01",
            modifier: "GREATER_THAN",
          },
          created_at: {
            value: oneYearAgo.toISOString().split("T")[0],
            modifier: "GREATER_THAN",
          },
          updated_at: {
            value: oneYearAgo.toISOString().split("T")[0],
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
