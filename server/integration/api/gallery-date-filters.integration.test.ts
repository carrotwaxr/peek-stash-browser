import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Gallery Date Filters Integration Tests
 *
 * Tests the date-related filters for galleries:
 * - date: Filter by gallery date (when the gallery was published/created)
 * - created_at: Filter by when the gallery was added to Stash
 * - updated_at: Filter by when the gallery was last updated in Stash
 *
 * IMPORTANT: These tests verify that date filtering correctly excludes
 * items WITHOUT dates (NULL values) when using BETWEEN, as required
 * by the Timeline feature.
 */

interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{
      id: string;
      title?: string;
      date?: string | null;
      created_at?: string;
      updated_at?: string;
    }>;
    count: number;
  };
}

describe("Gallery Date Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("date filter (gallery date)", () => {
    it("filters galleries by date GREATER_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            value: "2020-01-01",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.count).toBeGreaterThanOrEqual(0);

      // All returned galleries should have a date > 2020-01-01
      for (const gallery of response.data.findGalleries.galleries) {
        if (gallery.date) {
          expect(gallery.date > "2020-01-01").toBe(true);
        }
      }
    });

    it("filters galleries by date LESS_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            value: "2025-01-01",
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.count).toBeGreaterThanOrEqual(0);
    });

    it("filters galleries by date BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            value: "2022-01-01",
            value2: "2022-12-31",
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.count).toBeGreaterThanOrEqual(0);

      // All returned galleries should have a date within the range
      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.date).not.toBeNull();
        expect(gallery.date).toBeDefined();
        if (gallery.date) {
          expect(gallery.date >= "2022-01-01").toBe(true);
          expect(gallery.date <= "2022-12-31").toBe(true);
        }
      }
    });

    it("filters galleries by date NOT_BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            value: "2022-01-01",
            value2: "2022-12-31",
            modifier: "NOT_BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.count).toBeGreaterThanOrEqual(0);
    });

    it("filters galleries by date IS_NULL", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      // All returned galleries should have null/undefined date
      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.date).toBeFalsy();
      }
    });

    it("filters galleries by date NOT_NULL", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          date: {
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      // All returned galleries should have a date
      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.date).toBeTruthy();
      }
    });

    /**
     * CRITICAL TEST: Date BETWEEN must exclude items with NULL dates
     *
     * This test ensures the Timeline feature works correctly - when a user
     * selects a time period like "January 2024", only items WITH dates
     * within that range should be shown. Items without dates should NOT
     * appear in the filtered results.
     */
    it("date BETWEEN excludes galleries with NULL dates", async () => {
      // First, count galleries with NULL dates
      const nullDatesResponse = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 1 },
          gallery_filter: {
            date: { modifier: "IS_NULL" },
          },
        }
      );

      const galleriesWithNullDates = nullDatesResponse.data.findGalleries.count;

      // If there are no galleries with null dates, skip this test
      if (galleriesWithNullDates === 0) {
        console.log("Skipping NULL date exclusion test - no galleries with NULL dates in test data");
        return;
      }

      // Now get galleries with BETWEEN filter
      const betweenResponse = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 100 },
          gallery_filter: {
            date: {
              value: "2000-01-01",
              value2: "2099-12-31",
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(betweenResponse.ok).toBe(true);

      // CRITICAL: No gallery in the BETWEEN results should have a NULL date
      for (const gallery of betweenResponse.data.findGalleries.galleries) {
        expect(gallery.date).not.toBeNull();
        expect(gallery.date).toBeDefined();
        expect(gallery.date).toBeTruthy();
      }
    });
  });

  describe("created_at filter", () => {
    it("filters galleries by created_at GREATER_THAN", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateStr = oneYearAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          created_at: {
            value: dateStr,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.count).toBeGreaterThanOrEqual(0);
    });

    it("filters galleries by created_at BETWEEN", async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const today = new Date();

      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          created_at: {
            value: sixMonthsAgo.toISOString().split("T")[0],
            value2: today.toISOString().split("T")[0],
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("updated_at filter", () => {
    it("filters galleries by updated_at GREATER_THAN", async () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const dateStr = oneMonthAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          updated_at: {
            value: dateStr,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by updated_at BETWEEN", async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const today = new Date();

      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
          updated_at: {
            value: threeMonthsAgo.toISOString().split("T")[0],
            value2: today.toISOString().split("T")[0],
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("combined date filters", () => {
    it("can combine date with created_at filter", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: { per_page: 50 },
        gallery_filter: {
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
      expect(response.data.findGalleries).toBeDefined();
    });
  });
});
