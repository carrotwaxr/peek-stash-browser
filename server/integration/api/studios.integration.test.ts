import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient, selectTestInstanceOnly } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/studios
interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      performers?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{ id: string; name: string; front_image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
    }>;
    count: number;
  };
}

describe("Studio API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  describe("POST /api/library/studios", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/studios", {});
      expect(response.status).toBe(401);
    });

    it("returns studios with pagination", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
      expect(response.data.findStudios.studios).toBeDefined();
      expect(Array.isArray(response.data.findStudios.studios)).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });

    it("returns studio by ID", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      // With multi-instance, same ID can exist in multiple instances
      expect(response.data.findStudios.studios.length).toBeGreaterThanOrEqual(1);
      // Verify at least one result has the expected ID
      const matchingStudio = response.data.findStudios.studios.find(
        (s) => s.id === TEST_ENTITIES.studioWithScenes
      );
      expect(matchingStudio).toBeDefined();
    });

    it("returns studio with tooltip entity data (tags, performers, groups, galleries)", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      const studio = response.data.findStudios.studios[0];

      // Tags should have image_path (already exists, verify structure)
      expect(studio).toHaveProperty('tags');
      if (studio.tags && studio.tags.length > 0) {
        expect(studio.tags[0]).toHaveProperty('id');
        expect(studio.tags[0]).toHaveProperty('name');
        expect(studio.tags[0]).toHaveProperty('image_path');
      }

      // Performers should exist with tooltip data
      expect(studio).toHaveProperty('performers');
      if (studio.performers && studio.performers.length > 0) {
        expect(studio.performers[0]).toHaveProperty('id');
        expect(studio.performers[0]).toHaveProperty('name');
        expect(studio.performers[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(studio).toHaveProperty('groups');
      if (studio.groups && studio.groups.length > 0) {
        expect(studio.groups[0]).toHaveProperty('id');
        expect(studio.groups[0]).toHaveProperty('name');
        expect(studio.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(studio).toHaveProperty('galleries');
      if (studio.galleries && studio.galleries.length > 0) {
        expect(studio.galleries[0]).toHaveProperty('id');
        expect(studio.galleries[0]).toHaveProperty('title');
        expect(studio.galleries[0]).toHaveProperty('cover');
      }
    });
  });

  describe("POST /api/library/studios/minimal", () => {
    it("returns minimal studio data", async () => {
      const response = await adminClient.post<{
        studios: Array<{ id: string; name: string }>;
      }>("/api/library/studios/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.studios).toBeDefined();
      expect(Array.isArray(response.data.studios)).toBe(true);
    });
  });
});
