import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/performers
interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{ id: string; name: string; front_image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
    }>;
    count: number;
  };
}

describe("Performer API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/performers", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers", {});
      expect(response.status).toBe(401);
    });

    it("returns performers with pagination", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.performers).toBeDefined();
      expect(Array.isArray(response.data.findPerformers.performers)).toBe(true);
      expect(response.data.findPerformers.performers.length).toBeLessThanOrEqual(10);
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("returns performer by ID", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers.performers).toHaveLength(1);
      expect(response.data.findPerformers.performers[0].id).toBe(TEST_ENTITIES.performerWithScenes);
      expect(response.data.findPerformers.performers[0].name).toBeDefined();
    });

    it("returns performer with tooltip entity data (tags, groups, galleries, studios)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      const performer = response.data.findPerformers.performers[0];

      // Tags should have image_path for TooltipEntityGrid
      if (performer.tags && performer.tags.length > 0) {
        expect(performer.tags[0]).toHaveProperty('id');
        expect(performer.tags[0]).toHaveProperty('name');
        expect(performer.tags[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(performer).toHaveProperty('groups');
      if (performer.groups && performer.groups.length > 0) {
        expect(performer.groups[0]).toHaveProperty('id');
        expect(performer.groups[0]).toHaveProperty('name');
        expect(performer.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(performer).toHaveProperty('galleries');
      if (performer.galleries && performer.galleries.length > 0) {
        expect(performer.galleries[0]).toHaveProperty('id');
        expect(performer.galleries[0]).toHaveProperty('title');
        expect(performer.galleries[0]).toHaveProperty('cover');
      }

      // Studios should exist with tooltip data
      expect(performer).toHaveProperty('studios');
      if (performer.studios && performer.studios.length > 0) {
        expect(performer.studios[0]).toHaveProperty('id');
        expect(performer.studios[0]).toHaveProperty('name');
        expect(performer.studios[0]).toHaveProperty('image_path');
      }
    });
  });

  describe("POST /api/library/performers/minimal", () => {
    it("returns minimal performer data for dropdowns", async () => {
      const response = await adminClient.post<{
        performers: Array<{ id: string; name: string }>;
      }>("/api/library/performers/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
      expect(Array.isArray(response.data.performers)).toBe(true);
    });
  });
});
