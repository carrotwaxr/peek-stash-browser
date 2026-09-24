import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/studios
interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      performers?: Array<{
        id: string;
        name: string;
        image_path: string | null;
      }>;
      groups?: Array<{
        id: string;
        name: string;
        front_image_path: string | null;
      }>;
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
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          page: 1,
          per_page: 10,
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
      expect(response.data.findStudios.studios).toBeDefined();
      expect(Array.isArray(response.data.findStudios.studios)).toBe(true);
      expect(response.data.findStudios.count).toBeGreaterThan(0);
    });

    it("returns studio by ID", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          ids: [TEST_ENTITIES.studioWithScenes],
        }
      );

      expect(response.ok).toBe(true);
      // With multi-instance, same ID can exist in multiple instances
      expect(response.data.findStudios.studios.length).toBeGreaterThanOrEqual(
        1
      );
      // Verify at least one result has the expected ID
      const matchingStudio = response.data.findStudios.studios.find(
        (s) => s.id === TEST_ENTITIES.studioWithScenes
      );
      expect(matchingStudio).toBeDefined();
    });

    // Each relation is checked on its first entry. A test skips when
    // studioWithScenes has none of that relation, rather than passing
    // without checking anything.
    describe("tooltip entity data", () => {
      let studio: FindStudiosResponse["findStudios"]["studios"][number];

      beforeAll(async () => {
        const response = await adminClient.post<FindStudiosResponse>(
          "/api/library/studios",
          { ids: [TEST_ENTITIES.studioWithScenes] }
        );
        expect(response.ok).toBe(true);
        studio = must(response.data.findStudios.studios[0], "studioWithScenes");
      });

      it("returns tags with image_path", ({ skip }) => {
        expect(studio).toHaveProperty("tags");
        skip(!studio.tags?.length, "studioWithScenes has no tags");
        const firstTag = must(studio.tags?.[0], "studio.tags[0]");
        expect(firstTag).toHaveProperty("id");
        expect(firstTag).toHaveProperty("name");
        expect(firstTag).toHaveProperty("image_path");
      });

      it("returns performers with tooltip data", ({ skip }) => {
        expect(studio).toHaveProperty("performers");
        skip(!studio.performers?.length, "studioWithScenes has no performers");
        const firstPerformer = must(
          studio.performers?.[0],
          "studio.performers[0]"
        );
        expect(firstPerformer).toHaveProperty("id");
        expect(firstPerformer).toHaveProperty("name");
        expect(firstPerformer).toHaveProperty("image_path");
      });

      it("returns groups with tooltip data", ({ skip }) => {
        expect(studio).toHaveProperty("groups");
        skip(!studio.groups?.length, "studioWithScenes has no groups");
        const firstGroup = must(studio.groups?.[0], "studio.groups[0]");
        expect(firstGroup).toHaveProperty("id");
        expect(firstGroup).toHaveProperty("name");
        expect(firstGroup).toHaveProperty("front_image_path");
      });

      it("returns galleries with tooltip data", ({ skip }) => {
        expect(studio).toHaveProperty("galleries");
        skip(!studio.galleries?.length, "studioWithScenes has no galleries");
        const firstGallery = must(studio.galleries?.[0], "studio.galleries[0]");
        expect(firstGallery).toHaveProperty("id");
        expect(firstGallery).toHaveProperty("title");
        expect(firstGallery).toHaveProperty("cover");
      });
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
