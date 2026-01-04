import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, guestClient } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

// Response type for /api/library/tags
interface FindTagsResponse {
  findTags: {
    tags: Array<{ id: string; name: string }>;
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
