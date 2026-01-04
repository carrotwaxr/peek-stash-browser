import { describe, it, expect } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES } from "../fixtures/testEntities.js";

describe("Scene API", () => {
  describe("POST /api/library/scenes", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/scenes", {});

      expect(response.status).toBe(401);
    });

    it("returns scenes with pagination", async () => {
      const response = await adminClient.post<{
        scenes: Array<{ id: string; title: string }>;
        count: number;
      }>("/api/library/scenes", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toBeDefined();
      expect(Array.isArray(response.data.scenes)).toBe(true);
      expect(response.data.scenes.length).toBeLessThanOrEqual(10);
      expect(response.data.count).toBeGreaterThan(0);
    });

    it("returns scene by ID with relations", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          title: string;
          performers?: Array<{ id: string; name: string }>;
          tags?: Array<{ id: string; name: string }>;
          studio?: { id: string; name: string };
        }>;
      }>("/api/library/scenes", {
        ids: [TEST_ENTITIES.sceneWithRelations],
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes).toHaveLength(1);

      const scene = response.data.scenes[0];
      expect(scene.id).toBe(TEST_ENTITIES.sceneWithRelations);
      expect(scene.title).toBeDefined();
      expect(scene.performers).toBeDefined();
      expect(scene.tags).toBeDefined();
    });

    it("filters scenes by performer", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          performers: Array<{ id: string }>;
        }>;
        count: number;
      }>("/api/library/scenes", {
        performers: {
          value: [TEST_ENTITIES.performerWithScenes],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      for (const scene of response.data.scenes) {
        const performerIds = scene.performers.map((p) => p.id);
        expect(performerIds).toContain(TEST_ENTITIES.performerWithScenes);
      }
    });

    it("filters scenes by studio", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          studio: { id: string };
        }>;
        count: number;
      }>("/api/library/scenes", {
        studios: {
          value: [TEST_ENTITIES.studioWithScenes],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      for (const scene of response.data.scenes) {
        expect(scene.studio?.id).toBe(TEST_ENTITIES.studioWithScenes);
      }
    });

    it("filters scenes by tag", async () => {
      const response = await adminClient.post<{
        scenes: Array<{
          id: string;
          tags: Array<{ id: string }>;
        }>;
        count: number;
      }>("/api/library/scenes", {
        tags: {
          value: [TEST_ENTITIES.tagWithEntities],
          modifier: "INCLUDES",
        },
        per_page: 50,
      });

      expect(response.ok).toBe(true);
      expect(response.data.count).toBeGreaterThan(0);

      for (const scene of response.data.scenes) {
        const tagIds = scene.tags.map((t) => t.id);
        expect(tagIds).toContain(TEST_ENTITIES.tagWithEntities);
      }
    });

    it("respects per_page limit", async () => {
      const response = await adminClient.post<{
        scenes: Array<{ id: string }>;
        count: number;
      }>("/api/library/scenes", {
        per_page: 5,
      });

      expect(response.ok).toBe(true);
      expect(response.data.scenes.length).toBeLessThanOrEqual(5);
    });

    it("paginates correctly", async () => {
      const page1 = await adminClient.post<{
        scenes: Array<{ id: string }>;
      }>("/api/library/scenes", {
        page: 1,
        per_page: 5,
      });

      const page2 = await adminClient.post<{
        scenes: Array<{ id: string }>;
      }>("/api/library/scenes", {
        page: 2,
        per_page: 5,
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      if (page1.data.scenes.length === 5 && page2.data.scenes.length > 0) {
        const page1Ids = page1.data.scenes.map((s) => s.id);
        const page2Ids = page2.data.scenes.map((s) => s.id);

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
