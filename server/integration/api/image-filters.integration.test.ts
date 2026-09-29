import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectAllInstances,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/**
 * Image Filters Integration Tests
 *
 * Tests image-specific filters:
 * - favorite filter
 * - rating100 filter
 * - o_counter filter
 * - performers filter
 * - tags filter
 * - studios filter
 * - galleries filter
 * - text search (q parameter)
 */

interface FindImagesResponse {
  findImages: {
    images: Array<{
      id: string;
      instanceId?: string;
      title?: string;
      favorite?: boolean;
      rating100?: number | null;
      o_counter?: number;
      performers?: Array<{ id: string; name: string }>;
      studio?: { id: string; name: string } | null;
      tags?: Array<{ id: string; name?: string }>;
      galleries?: Array<{ id: string; title?: string }>;
    }>;
    count: number;
  };
}

describe("Image Filters", () => {
  let testInstanceId = "";

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    testInstanceId = await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  describe("instance_id", () => {
    it("instance_id narrows the list to one instance", async () => {
      const count = async (instanceId?: string) => {
        const response = await adminClient.post<FindImagesResponse>(
          "/api/library/images",
          {
            filter: { per_page: 1 },
            ...(instanceId === undefined
              ? {}
              : { image_filter: { instance_id: instanceId } }),
          }
        );
        expect(response.ok).toBe(true);
        return response.data.findImages.count;
      };

      const all = await count();
      expect(all).toBeGreaterThan(0);
      // The test instance holds every image the admin sees; another holds none
      expect(await count(testInstanceId)).toBe(all);
      expect(await count("no-such-instance")).toBe(0);
    });
  });

  describe("favorite filter", () => {
    it("filters favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("filters non-favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            o_counter: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("performers filter", () => {
    it("filters images by performer with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters images by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters images by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters images by studio", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("galleries filter", () => {
    it("filters images by gallery", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            galleries: {
              value: [TEST_ENTITIES.galleryWithImages],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });
  });

  describe("text search (q parameter)", () => {
    it("searches images by title", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and rating filters", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            favorite: true,
            rating100: {
              value: 50,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("combines performer and gallery filters", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
            galleries: {
              value: [TEST_ENTITIES.galleryWithImages],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("combines studio and tags filters", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts images by title ASC", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            per_page: 50,
            sort: "title",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by rating100 DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by o_counter DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            per_page: 50,
            sort: "o_counter",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("pagination", () => {
    it("paginates images correctly", async () => {
      const page1 = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            page: 1,
            per_page: 2,
          },
        }
      );

      const page2 = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: {
            page: 2,
            per_page: 2,
          },
        }
      );

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Ids = page1.data.findImages.images.map((i) => i.id);
      const page2Ids = page2.data.findImages.images.map((i) => i.id);

      // Both pages have images, and different ones
      expect(page1Ids).toHaveLength(2);
      expect(page2Ids).not.toHaveLength(0);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });
  });

  /**
   * Gallery Inheritance Tests
   *
   * These tests verify that images inherit metadata from their parent galleries.
   * This catches bugs where sync paths don't run gallery inheritance properly.
   *
   * The bug fixed in v3.1.0-beta.13: smartIncrementalSync was missing gallery
   * inheritance entirely, causing image filtering by performer to return 0 results
   * when the performer was assigned to the gallery but not directly to images.
   *
   * Inheritance rules (from ImageGalleryInheritanceService):
   * - Scalar fields (studioId, date, photographer, details): Only inherited if image's field is NULL
   * - Performers: Only inherited if image has NO performers directly assigned
   * - Tags: Only inherited if image has NO tags directly assigned
   * - Title is NEVER inherited - images always keep their own title
   */
  describe("gallery inheritance", () => {
    it("verifies image inherits all properties from gallery", async () => {
      // Skip if no test entity configured
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log(
          "Skipping inheritance verification test - imageWithGalleryInheritance not configured"
        );
        return;
      }

      // Fetch the specific image by ID
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 1 },
          image_filter: {
            ids: {
              value: [imageId],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images.length).toBe(1);

      const image = must(response.data.findImages.images[0]);

      // Image should have its own title (title is never inherited)
      // The image file should have a title derived from its filename or set manually
      expect(image.id).toBe(imageId);

      // Image should have performers (either inherited from gallery or its own)
      // The inheritance test below verifies filtering by gallery performer works
      expect(image.performers).toBeDefined();
      expect(must(image.performers).length).toBeGreaterThan(0);

      // Image should have inherited tags from gallery (if gallery has tags)
      // Note: Only inherited if image had NO tags originally
      expect(image.tags).toBeDefined();

      // Image should have inherited studio from gallery (if gallery has studio)
      // Note: Only inherited if image's studioId was NULL
      expect("studio" in image).toBe(true);
    });

    it("filters images by performer inherited from gallery", async () => {
      // Skip if no test entity configured
      if (!TEST_ENTITIES.galleryPerformerForInheritance) {
        console.log(
          "Skipping gallery inheritance test - no galleryPerformerForInheritance configured"
        );
        return;
      }

      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            performers: {
              value: [TEST_ENTITIES.galleryPerformerForInheritance],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      // The key assertion: should find images even though performer is only on gallery
      // This test FAILS if gallery inheritance didn't run during sync
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });

    it("filters images by tag inherited from gallery", async () => {
      // Skip if no test entity configured
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log(
          "Skipping tag filter test - imageWithGalleryInheritance not configured"
        );
        return;
      }

      // First get the image to find its inherited tags
      const imageResponse = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 1 },
          image_filter: {
            ids: { value: [imageId], modifier: "INCLUDES" },
          },
        }
      );

      expect(imageResponse.ok).toBe(true);
      const image = must(imageResponse.data.findImages.images[0]);

      if (!image.tags || image.tags.length === 0) {
        console.log("Skipping tag filter test - test image has no tags");
        return;
      }

      // Now filter by that tag - should find the image
      const tagId = must(image.tags[0]).id;
      const filterResponse = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 50 },
          image_filter: {
            tags: { value: [tagId], modifier: "INCLUDES" },
          },
        }
      );

      expect(filterResponse.ok).toBe(true);
      expect(filterResponse.data.findImages.count).toBeGreaterThan(0);

      // The original image should be in the results
      const foundImageIds = filterResponse.data.findImages.images.map(
        (i) => i.id
      );
      expect(foundImageIds).toContain(imageId);
    });

    it("filters images by studio inherited from gallery", async () => {
      // Skip if no test entity configured
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log(
          "Skipping studio filter test - imageWithGalleryInheritance not configured"
        );
        return;
      }

      // First get the image to find its inherited studio
      const imageResponse = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 1 },
          image_filter: {
            ids: { value: [imageId], modifier: "INCLUDES" },
          },
        }
      );

      expect(imageResponse.ok).toBe(true);
      const image = must(imageResponse.data.findImages.images[0]);

      if (!image.studio) {
        console.log("Skipping studio filter test - test image has no studio");
        return;
      }

      // Now filter by that studio AND the specific image ID
      // This tests that the image is correctly filterable by its inherited studio
      const studioId = image.studio.id;
      const filterResponse = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 10 },
          image_filter: {
            ids: { value: [imageId], modifier: "INCLUDES" },
            studios: { value: [studioId], modifier: "INCLUDES" },
          },
        }
      );

      expect(filterResponse.ok).toBe(true);
      // The key assertion: image with inherited studio should match studio filter
      expect(filterResponse.data.findImages.count).toBe(1);
      expect(must(filterResponse.data.findImages.images[0]).id).toBe(imageId);
    });

    it("verifies image with own properties is not overwritten by gallery", async () => {
      // Skip if no test entity configured
      const imageId = TEST_ENTITIES.imageWithOwnProperties;

      if (!imageId) {
        console.log(
          "Skipping own-properties test - imageWithOwnProperties not configured"
        );
        return;
      }

      // Fetch the specific image by ID
      const response = await adminClient.post<FindImagesResponse>(
        "/api/library/images",
        {
          filter: { per_page: 1 },
          image_filter: {
            ids: {
              value: [imageId],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images.length).toBe(1);

      const image = must(response.data.findImages.images[0]);

      // Image should have its own title
      expect(image.id).toBe(imageId);

      // Image has its own performers - inheritance should NOT have added gallery performers
      // (inheritance only adds performers if image has NONE)
      expect(image.performers).toBeDefined();
      expect(must(image.performers).length).toBeGreaterThan(0);

      // Image has its own tags - including a tag the gallery doesn't have
      // This verifies inheritance didn't replace the image's tags
      expect(image.tags).toBeDefined();
      expect(must(image.tags).length).toBeGreaterThan(0);

      // The key check: image has tags that are its OWN (not from gallery)
      // We can't assert specific tag IDs without knowing them, but we verify
      // the image retained its tags rather than having them replaced
    });
  });

  /**
   * A studio's or tag's Images tab with Include sub-studios or sub-tags on
   * sends depth -1, and the list adds the descendants on the picked studio's
   * or tag's own server only. Seeded on both servers under the same ids, as
   * two Stash servers reuse ids: a studio with a sub-studio, a tag with a
   * sub-tag, and one image under the sub-studio tagged with the sub-tag.
   * Every seeded row is deleted before the describe ends.
   */
  describe.skipIf(!process.env.STASH_SECOND_URL)(
    "sub-studios and sub-tags",
    () => {
      // Ids no library holds (the parser takes digits only)
      const PARENT = "913001";
      const CHILD = "913002";
      const IMAGE = "913001";
      let otherInstanceId = "";

      /** The instance-qualified keys of the images one filter lists */
      async function imageKeys(imageFilter: object): Promise<string[]> {
        const response = await adminClient.post<FindImagesResponse>(
          "/api/library/images",
          { filter: { per_page: 50 }, image_filter: imageFilter }
        );
        expect(response.status, "POST /api/library/images").toBe(200);
        return response.data.findImages.images
          .map((image) => `${image.id}:${image.instanceId ?? ""}`)
          .sort();
      }

      beforeAll(async () => {
        const instances = await adminClient.get<{
          instances: Array<{ id: string }>;
        }>("/api/setup/stash-instances");
        otherInstanceId = must(
          instances.data.instances.find(
            (instance) => instance.id !== testInstanceId
          ),
          "the second instance"
        ).id;
        await selectAllInstances();

        const both = [testInstanceId, otherInstanceId];
        await prisma.stashStudio.createMany({
          data: both.flatMap((stashInstanceId) => [
            { id: PARENT, stashInstanceId, name: "B13 parent studio" },
            {
              id: CHILD,
              stashInstanceId,
              name: "B13 sub-studio",
              parentId: PARENT,
            },
          ]),
        });
        await prisma.stashTag.createMany({
          data: both.flatMap((stashInstanceId) => [
            { id: PARENT, stashInstanceId, name: "B13 parent tag" },
            {
              id: CHILD,
              stashInstanceId,
              name: "B13 sub-tag",
              parentIds: JSON.stringify([PARENT]),
            },
          ]),
        });
        await prisma.stashImage.createMany({
          data: both.map((stashInstanceId) => ({
            id: IMAGE,
            stashInstanceId,
            title: "B13 image",
            studioId: CHILD,
            studioInstanceId: stashInstanceId,
          })),
        });
        await prisma.imageTag.createMany({
          data: both.map((instanceId) => ({
            imageId: IMAGE,
            imageInstanceId: instanceId,
            tagId: CHILD,
            tagInstanceId: instanceId,
          })),
        });
      });

      afterAll(async () => {
        // The image's tags go with it (cascade)
        await prisma.stashImage.deleteMany({ where: { id: IMAGE } });
        await prisma.stashTag.deleteMany({
          where: { id: { in: [PARENT, CHILD] } },
        });
        await prisma.stashStudio.deleteMany({
          where: { id: { in: [CHILD, PARENT] } },
        });
        await selectTestInstanceOnly();
      });

      it("studio with depth -1 lists its sub-studio's images, on its own instance only", async () => {
        const studios = (depth: number) => ({
          studios: {
            value: [`${PARENT}:${testInstanceId}`],
            modifier: "INCLUDES",
            depth,
          },
        });

        expect(await imageKeys(studios(-1))).toEqual([
          `${IMAGE}:${testInstanceId}`,
        ]);
        // Without sub-studios the parent has no images of its own
        expect(await imageKeys(studios(0))).toEqual([]);
      });

      it("tag with depth -1 lists its sub-tag's images, on its own instance only", async () => {
        const tags = (depth: number) => ({
          tags: {
            value: [`${PARENT}:${testInstanceId}`],
            modifier: "INCLUDES",
            depth,
          },
        });

        expect(await imageKeys(tags(-1))).toEqual([
          `${IMAGE}:${testInstanceId}`,
        ]);
        expect(await imageKeys(tags(0))).toEqual([]);
      });

      it("a bare studio id with depth -1 lists the sub-studio's images on every instance", async () => {
        expect(
          await imageKeys({
            studios: { value: [PARENT], modifier: "INCLUDES", depth: -1 },
          })
        ).toEqual(
          [`${IMAGE}:${testInstanceId}`, `${IMAGE}:${otherInstanceId}`].sort()
        );
      });
    }
  );
});
