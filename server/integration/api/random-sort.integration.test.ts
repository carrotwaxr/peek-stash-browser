import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Random Sort Integration Tests
 *
 * Tests the random sort functionality:
 * - Deterministic randomization with seed
 * - Different seeds produce different orders
 * - Pagination stability with the same seed
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
    }>;
    count: number;
  };
}

describe("Random Sort", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("basic random sort", () => {
    it("returns scenes in random order with random sort", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "random",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });
  });

  describe("seeded random sort", () => {
    it("returns same order with same seed", async () => {
      const seed = 12345678;

      // First request with seed
      const response1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      // Second request with same seed
      const response2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);

      // Same seed should produce same order
      expect(ids1).toEqual(ids2);
    });

    it("returns different order with different seeds", async () => {
      const seed1 = 11111111;
      const seed2 = 99999999;

      const response1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: `random_${seed1}`,
        },
      });

      const response2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: `random_${seed2}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);

      // Different seeds should produce different orders
      // Note: There's a tiny chance they could be the same, but with 20 items it's extremely unlikely
      expect(ids1).not.toEqual(ids2);
    });
  });

  describe("pagination stability with seed", () => {
    it("maintains stable pagination across pages with same seed", async () => {
      const seed = 55555555;

      // Get page 1
      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      // Get page 2
      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 2,
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Ids = page1.data.findScenes.scenes.map((s) => s.id);
      const page2Ids = page2.data.findScenes.scenes.map((s) => s.id);

      // Pages should have no overlap (stable pagination)
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it("page 1 results stay consistent when navigating back", async () => {
      const seed = 77777777;

      // Get page 1 first time
      const page1First = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      // Get page 2
      await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 2,
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      // Get page 1 again
      const page1Second = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 10,
          sort: `random_${seed}`,
        },
      });

      expect(page1First.ok).toBe(true);
      expect(page1Second.ok).toBe(true);

      const ids1 = page1First.data.findScenes.scenes.map((s) => s.id);
      const ids2 = page1Second.data.findScenes.scenes.map((s) => s.id);

      // Page 1 should be the same both times
      expect(ids1).toEqual(ids2);
    });
  });

  describe("random sort with filters", () => {
    it("random sort works with entity filters", async () => {
      const seed = 33333333;

      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          sort: `random_${seed}`,
        },
        scene_filter: {
          favorite: false, // Filter to non-favorites
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("random sort produces consistent results with filters", async () => {
      const seed = 44444444;

      const response1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          sort: `random_${seed}`,
        },
        scene_filter: {
          favorite: false,
        },
      });

      const response2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 10,
          sort: `random_${seed}`,
        },
        scene_filter: {
          favorite: false,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);

      expect(ids1).toEqual(ids2);
    });
  });
});
