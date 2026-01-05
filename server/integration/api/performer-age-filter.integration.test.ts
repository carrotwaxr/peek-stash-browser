import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Performer Age Filter Integration Tests
 *
 * Tests age-related filters:
 * - age (current age based on birthdate)
 * - birthdate filters
 * - death_date filters
 * - birth_year/death_year
 * - Age at time of scene (performer_age on scene filter)
 */

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      birthdate?: string | null;
      death_date?: string | null;
      age?: number | null;
    }>;
    count: number;
  };
}

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      date?: string | null;
      performers?: Array<{
        id: string;
        name: string;
        birthdate?: string | null;
        age?: number | null;
      }>;
    }>;
    count: number;
  };
}

describe("Performer Age Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("performer age filter", () => {
    it("filters performers by age GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 25,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by age LESS_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 40,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by age BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 20,
            value2: 35,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with unknown age (IS_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 0,
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with known age (NOT_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 0,
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("birthdate filter", () => {
    it("filters performers by birthdate GREATER_THAN (born after)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          birthdate: {
            value: "1990-01-01",
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by birthdate LESS_THAN (born before)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          birthdate: {
            value: "2000-01-01",
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by birthdate BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          birthdate: {
            value: "1985-01-01",
            value2: "1995-12-31",
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with no birthdate (IS_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          birthdate: {
            value: "",
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("death_date filter", () => {
    it("filters deceased performers (death_date NOT_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          death_date: {
            value: "",
            modifier: "NOT_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters living performers (death_date IS_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          death_date: {
            value: "",
            modifier: "IS_NULL",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("performer_age on scenes", () => {
    it("filters scenes by performer age at time of scene", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performer_age: {
            value: 25,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by performer age LESS_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performer_age: {
            value: 30,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by performer age BETWEEN", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performer_age: {
            value: 20,
            value2: 30,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("combined age and other filters", () => {
    it("combines performer age with tag filter on performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 25,
            modifier: "GREATER_THAN",
          },
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines performer age with favorite filter on performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 50 },
        performer_filter: {
          age: {
            value: 30,
            modifier: "LESS_THAN",
          },
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines performer_age on scenes with studio filter", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 50 },
        scene_filter: {
          performer_age: {
            value: 25,
            modifier: "GREATER_THAN",
          },
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});
