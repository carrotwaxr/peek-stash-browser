import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/performers
interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{
        id: string;
        name: string;
        front_image_path: string | null;
      }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
    }>;
    count: number;
  };
}

describe("Performer API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  describe("POST /api/library/performers", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/performers", {});
      expect(response.status).toBe(401);
    });

    it("returns performers with pagination", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            page: 1,
            per_page: 10,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.performers).toBeDefined();
      expect(Array.isArray(response.data.findPerformers.performers)).toBe(true);
      expect(
        response.data.findPerformers.performers.length
      ).toBeLessThanOrEqual(10);
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("returns performer by ID", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          ids: [TEST_ENTITIES.performerWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers.performers).toHaveLength(1);
      expect(must(response.data.findPerformers.performers[0]).id).toBe(
        TEST_ENTITIES.performerWithScenes
      );
      expect(
        must(response.data.findPerformers.performers[0]).name
      ).toBeDefined();
    });

    it("returns performer with tooltip entity data (tags, groups, galleries, studios)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          ids: [TEST_ENTITIES.performerWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      const performer = must(response.data.findPerformers.performers[0]);

      // Tags should have image_path for TooltipEntityGrid
      const firstTag = must(performer.tags?.[0], "performer.tags[0]");
      expect(firstTag).toHaveProperty("id");
      expect(firstTag).toHaveProperty("name");
      expect(firstTag).toHaveProperty("image_path");

      // Groups should exist with tooltip data
      expect(performer).toHaveProperty("groups");
      const firstGroup = must(performer.groups?.[0], "performer.groups[0]");
      expect(firstGroup).toHaveProperty("id");
      expect(firstGroup).toHaveProperty("name");
      expect(firstGroup).toHaveProperty("front_image_path");

      // Galleries should exist with tooltip data
      expect(performer).toHaveProperty("galleries");
      const firstGallery = must(
        performer.galleries?.[0],
        "performer.galleries[0]"
      );
      expect(firstGallery).toHaveProperty("id");
      expect(firstGallery).toHaveProperty("title");
      expect(firstGallery).toHaveProperty("cover");

      // Studios should exist with tooltip data
      expect(performer).toHaveProperty("studios");
      const firstStudio = must(performer.studios?.[0], "performer.studios[0]");
      expect(firstStudio).toHaveProperty("id");
      expect(firstStudio).toHaveProperty("name");
      expect(firstStudio).toHaveProperty("image_path");
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
