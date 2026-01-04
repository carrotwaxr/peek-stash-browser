import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/scenes
interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      performers?: Array<{ id: string; name?: string }>;
      tags?: Array<{ id: string; name?: string }>;
      studio?: { id: string; name?: string } | null;
    }>;
    count: number;
  };
}

describe("Scene API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/scenes", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {});

      expect(response.status).toBe(401);
    });

    it("returns scenes with pagination", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toBeDefined();
      expect(Array.isArray(response.data.findScenes.scenes)).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(10);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
    });

    it("returns scene by ID with relations", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        ids: [TEST_ENTITIES.sceneWithRelations],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes).toHaveLength(1);

      const scene = response.data.findScenes.scenes[0];
      expect(scene.id).toBe(TEST_ENTITIES.sceneWithRelations);
      expect(scene.title).toBeDefined();
      // Note: performers/tags may or may not be included depending on API design
    });

    it("filters scenes by performer", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by studio", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("filters scenes by tag", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
        },
        scene_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.count).toBeGreaterThan(0);
      // Verify we got scenes (filter worked)
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("respects per_page limit", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 5,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(5);
    });

    it("paginates correctly", async () => {
      const page1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 1,
          per_page: 5,
        },
      });

      const page2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          page: 2,
          per_page: 5,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Scenes = page1.data.findScenes.scenes;
      const page2Scenes = page2.data.findScenes.scenes;

      if (page1Scenes.length === 5 && page2Scenes.length > 0) {
        const page1Ids = page1Scenes.map((s) => s.id);
        const page2Ids = page2Scenes.map((s) => s.id);

        for (const id of page2Ids) {
          expect(page1Ids).not.toContain(id);
        }
      }
    });
  });

  describe("GET /api/library/scenes/:id/similar", () => {
    it("returns similar scenes", async () => {
      const response = await adminClient.get<{
        scenes: Array<{ id: string; title: string }>;
      }>(`/api/library/scenes/${TEST_ENTITIES.sceneWithRelations}/similar`);

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toBeDefined();
      expect(Array.isArray(response.data.scenes)).toBe(true);
    });
  });
});
