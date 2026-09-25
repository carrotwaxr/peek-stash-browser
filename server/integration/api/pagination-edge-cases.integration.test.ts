import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser, hideFor } from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient, selectTestInstanceOnly } from "../helpers/testClient.js";

/**
 * Pagination Edge Cases Integration Tests
 *
 * Tests pagination behavior including:
 * - Various per_page values (1, 10, 100, 1000)
 * - Empty result sets
 * - Last page handling
 * - Beyond-range page numbers
 * - Page navigation consistency
 * - Totals for a user with overlapping exclusion rows
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

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
    }>;
    count: number;
  };
}

interface FindImagesResponse {
  findImages: {
    images: Array<{
      id: string;
    }>;
    count: number;
  };
}

/** Every page's ids at per_page 5, and the total each page reported. */
async function pageThrough(
  fetchPage: (page: number) => Promise<{ count: number; ids: string[] }>
): Promise<{ counts: Set<number>; ids: string[] }> {
  const counts = new Set<number>();
  const ids: string[] = [];
  for (let page = 1; page <= 1000; page++) {
    const result = await fetchPage(page);
    counts.add(result.count);
    if (result.ids.length === 0) break;
    ids.push(...result.ids);
  }
  return { counts, ids };
}

describe("Pagination Edge Cases", () => {
  let testInstanceId: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance for consistent pagination counts
    testInstanceId = await selectTestInstanceOnly();
  });

  describe("per_page variations", () => {
    it("handles per_page of 1", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 1,
            page: 1,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(1);
    });

    it("handles per_page of 10", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 1,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(10);
    });

    it("handles per_page of 100", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 100,
            page: 1,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(100);
    });

    it("handles per_page of 1000", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 1000,
            page: 1,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(1000);
    });

    it("handles default per_page when not specified", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {},
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("empty result sets", () => {
    it("returns empty array for impossible filter", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            // Filter that should return no results
            rating100: {
              value: 999, // Impossible rating
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      expect(response.data.findScenes.count).toBe(0);
    });

    it("returns empty array for non-existent ID", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          ids: ["999999999"], // Non-existent ID
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
    });

    it("returns empty array for text search with no matches", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
            q: "xyznonexistentquerystring12345",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      expect(response.data.findScenes.count).toBe(0);
    });
  });

  describe("page navigation", () => {
    it("returns correct items for page 1", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
            page: 1,
            sort: "id",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeLessThanOrEqual(5);
    });

    it("returns different items for page 2", async () => {
      const page1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
            page: 1,
            sort: "id",
            direction: "ASC",
          },
        }
      );

      const page2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
            page: 2,
            sort: "id",
            direction: "ASC",
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // The library fills page 2, and it has different items
      expect(page1.data.findScenes.count).toBeGreaterThan(5);
      expect(page2.data.findScenes.scenes).not.toHaveLength(0);
      const page1Ids = page1.data.findScenes.scenes.map((s) => s.id);
      const page2Ids = page2.data.findScenes.scenes.map((s) => s.id);

      // Verify no overlap between pages
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("maintains consistent count across pages", async () => {
      const page1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 1,
          },
        }
      );

      const page2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 2,
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // Total count should be the same regardless of page
      expect(page1.data.findScenes.count).toBe(page2.data.findScenes.count);
    });
  });

  describe("beyond-range page numbers", () => {
    it("returns empty array for page beyond total pages", async () => {
      // First get the count
      const countResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 10, page: 1 },
        }
      );

      expect(countResponse.ok).toBe(true);
      const totalCount = countResponse.data.findScenes.count;
      const totalPages = Math.ceil(totalCount / 10);

      // Request a page way beyond the total
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: totalPages + 100,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes).toEqual([]);
      // Count should still reflect total items
      expect(response.data.findScenes.count).toBe(totalCount);
    });

    it("handles page 0 gracefully", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 0,
          },
        }
      );

      // Should either treat as page 1 or return error gracefully
      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("handles negative page gracefully", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: -1,
          },
        }
      );

      // Should either treat as page 1 or return error gracefully
      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("last page handling", () => {
    it("returns partial results on last page", async () => {
      // Get total count with per_page that won't divide evenly
      const countResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 7, page: 1 },
        }
      );

      expect(countResponse.ok).toBe(true);
      const totalCount = countResponse.data.findScenes.count;

      // The library has more than one page of 7
      expect(totalCount).toBeGreaterThan(7);
      const lastPage = Math.ceil(totalCount / 7);
      const expectedLastPageCount = totalCount % 7 || 7;

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 7,
            page: lastPage,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes.scenes.length).toBe(
        expectedLastPageCount
      );
    });
  });

  describe("pagination across entity types", () => {
    it("paginates performers correctly", async () => {
      const page1 = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 5,
            page: 1,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      const page2 = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 5,
            page: 2,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);
      expect(page1.data.findPerformers.count).toBe(
        page2.data.findPerformers.count
      );

      expect(page1.data.findPerformers.count).toBeGreaterThan(5);
      expect(page2.data.findPerformers.performers).not.toHaveLength(0);
      const page1Ids = page1.data.findPerformers.performers.map((p) => p.id);
      const page2Ids = page2.data.findPerformers.performers.map((p) => p.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("paginates tags correctly", async () => {
      const page1 = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 5,
            page: 1,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      const page2 = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 5,
            page: 2,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);
      expect(page1.data.findTags.count).toBe(page2.data.findTags.count);

      expect(page1.data.findTags.count).toBeGreaterThan(5);
      expect(page2.data.findTags.tags).not.toHaveLength(0);
      const page1Ids = page1.data.findTags.tags.map((t) => t.id);
      const page2Ids = page2.data.findTags.tags.map((t) => t.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe("pagination with filters", () => {
    it("paginates filtered results correctly", async () => {
      // studioWithScenes has more than one scene, so a page of one leaves a
      // second page
      const sceneFilter = {
        studios: {
          value: [TEST_ENTITIES.studioWithScenes],
          modifier: "INCLUDES",
        },
      };

      // First get count of filtered results
      const countResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        { filter: { per_page: 1, page: 1 }, scene_filter: sceneFilter }
      );

      expect(countResponse.ok).toBe(true);
      const filteredCount = countResponse.data.findScenes.count;
      expect(filteredCount).toBeGreaterThan(1);

      // Get page 2 of filtered results
      const page2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        { filter: { per_page: 1, page: 2 }, scene_filter: sceneFilter }
      );

      expect(page2.ok).toBe(true);
      expect(page2.data.findScenes.count).toBe(filteredCount);
      expect(page2.data.findScenes.scenes.length).toBeGreaterThan(0);
    });
  });

  describe("pagination with random sort", () => {
    it("maintains stable pagination with random seed", async () => {
      const seed = 77777777;

      const page1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
            page: 1,
            sort: `random_${seed}`,
          },
        }
      );

      const page2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 5,
            page: 2,
            sort: `random_${seed}`,
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      // With same seed, pages should not overlap
      expect(page1.data.findScenes.count).toBeGreaterThan(5);
      expect(page2.data.findScenes.scenes).not.toHaveLength(0);
      const page1Ids = page1.data.findScenes.scenes.map((s) => s.id);
      const page2Ids = page2.data.findScenes.scenes.map((s) => s.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("re-requesting same page with same seed returns same results", async () => {
      const seed = 88888888;

      const first = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 1,
            sort: `random_${seed}`,
          },
        }
      );

      const second = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 10,
            page: 1,
            sort: `random_${seed}`,
          },
        }
      );

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const firstIds = first.data.findScenes.scenes.map((s) => s.id);
      const secondIds = second.data.findScenes.scenes.map((s) => s.id);
      expect(firstIds).toEqual(secondIds);
    });
  });

  describe("totals with overlapping exclusion rows", () => {
    // A USER whose hidden scene and image each have a global ("") and an
    // instance-specific exclusion row, and whose visible scene and image
    // have a rating and a history row: the count query joins all of them,
    // and must still count each visible entity once.
    let viewer: { id: number; client: TestClient } | undefined;
    let hiddenScene: string;
    let hiddenImage: string;

    beforeAll(async () => {
      viewer = await createApiUser(
        "pagination_it_viewer",
        "pagination_it_pass_1"
      );
      const userId = viewer.id;
      await prisma.userStashInstance.deleteMany({ where: { userId } });
      await prisma.userStashInstance.create({
        data: { userId, instanceId: testInstanceId },
      });

      const live = { stashInstanceId: testInstanceId, deletedAt: null };
      const scenes = await prisma.stashScene.findMany({
        where: live,
        select: { id: true },
        orderBy: { id: "asc" },
        take: 2,
      });
      const images = await prisma.stashImage.findMany({
        where: live,
        select: { id: true },
        orderBy: { id: "asc" },
        take: 2,
      });
      hiddenScene = must(scenes[0], "a live scene").id;
      hiddenImage = must(images[0], "a live image").id;
      const ratedScene = must(scenes[1], "a second live scene").id;
      const ratedImage = must(images[1], "a second live image").id;

      for (const instanceId of ["", testInstanceId]) {
        await hideFor(userId, "scene", hiddenScene, instanceId);
        await hideFor(userId, "image", hiddenImage, instanceId);
      }
      const mine = { userId, instanceId: testInstanceId };
      await prisma.sceneRating.create({
        data: { ...mine, sceneId: ratedScene, rating: 80 },
      });
      await prisma.watchHistory.create({
        data: { ...mine, sceneId: ratedScene, playCount: 1 },
      });
      await prisma.imageRating.create({
        data: { ...mine, imageId: ratedImage, rating: 80 },
      });
      await prisma.imageViewHistory.create({
        data: { ...mine, imageId: ratedImage, viewCount: 1 },
      });
    }, 60000);

    afterAll(async () => {
      // Deleting the user deletes their hides, exclusions, ratings and history
      if (viewer) {
        await adminClient.delete(`/api/user/${viewer.id}`);
      }
    });

    it("the total equals the number of items across every page for a user whose scene has both a global and an instance-specific exclusion row", async () => {
      const { client } = must(viewer, "the viewer");
      const { counts, ids } = await pageThrough(async (page) => {
        const response = await client.post<FindScenesResponse>(
          "/api/library/scenes",
          { filter: { per_page: 5, page, sort: "id", direction: "ASC" } }
        );
        expect(response.status).toBe(200);
        return {
          count: response.data.findScenes.count,
          ids: response.data.findScenes.scenes.map((s) => s.id),
        };
      });

      expect([...counts]).toEqual([ids.length]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(hiddenScene);
      expect(ids.length).toBeGreaterThan(5);
    });

    it("the total equals the number of items across every page for a user whose image has both a global and an instance-specific exclusion row", async () => {
      const { client } = must(viewer, "the viewer");
      const { counts, ids } = await pageThrough(async (page) => {
        const response = await client.post<FindImagesResponse>(
          "/api/library/images",
          { filter: { per_page: 5, page, sort: "title", direction: "ASC" } }
        );
        expect(response.status).toBe(200);
        return {
          count: response.data.findImages.count,
          ids: response.data.findImages.images.map((i) => i.id),
        };
      });

      expect([...counts]).toEqual([ids.length]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain(hiddenImage);
      expect(ids.length).toBeGreaterThan(5);
    });
  });
});
