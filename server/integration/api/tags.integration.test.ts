import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/tags
interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      performers?: Array<{ id: string; name: string; image_path: string | null }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{ id: string; name: string; front_image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
    }>;
    count: number;
  };
}

describe("Tag API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/tags", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/tags", {});
      expect(response.status).toBe(401);
    });

    it("returns tags with pagination", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        page: 1,
        per_page: 10,
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();
      expect(response.data.findTags.tags).toBeDefined();
      expect(Array.isArray(response.data.findTags.tags)).toBe(true);
      expect(response.data.findTags.count).toBeGreaterThan(0);
    });

    it("returns tag by ID", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags.tags).toHaveLength(1);
      expect(response.data.findTags.tags[0].id).toBe(TEST_ENTITIES.tagWithEntities);
    });

    it("returns tag with tooltip entity data (performers, studios, groups, galleries)", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      const tag = response.data.findTags.tags[0];

      // Performers should exist with tooltip data
      expect(tag).toHaveProperty('performers');
      if (tag.performers && tag.performers.length > 0) {
        expect(tag.performers[0]).toHaveProperty('id');
        expect(tag.performers[0]).toHaveProperty('name');
        expect(tag.performers[0]).toHaveProperty('image_path');
      }

      // Studios should exist with tooltip data
      expect(tag).toHaveProperty('studios');
      if (tag.studios && tag.studios.length > 0) {
        expect(tag.studios[0]).toHaveProperty('id');
        expect(tag.studios[0]).toHaveProperty('name');
        expect(tag.studios[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(tag).toHaveProperty('groups');
      if (tag.groups && tag.groups.length > 0) {
        expect(tag.groups[0]).toHaveProperty('id');
        expect(tag.groups[0]).toHaveProperty('name');
        expect(tag.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(tag).toHaveProperty('galleries');
      if (tag.galleries && tag.galleries.length > 0) {
        expect(tag.galleries[0]).toHaveProperty('id');
        expect(tag.galleries[0]).toHaveProperty('title');
        expect(tag.galleries[0]).toHaveProperty('cover');
      }
    });
  });

  describe("POST /api/library/tags/minimal", () => {
    it("returns minimal tag data", async () => {
      const response = await adminClient.post<{
        tags: Array<{ id: string; name: string }>;
      }>("/api/library/tags/minimal", {});

      expect(response.ok).toBe(true);
      expect(response.data.tags).toBeDefined();
      expect(Array.isArray(response.data.tags)).toBe(true);
    });
  });
});
