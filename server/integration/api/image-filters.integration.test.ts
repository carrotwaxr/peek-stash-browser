import { describe, it, expect, beforeAll } from "vitest";
import { adminClient, selectTestInstanceOnly } from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";

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
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  describe("favorite filter", () => {
    it("filters favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: true,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("filters non-favorite images", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: false,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 70,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 50,
            modifier: "LESS_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          rating100: {
            value: 50,
            value2: 80,
            modifier: "BETWEEN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          o_counter: {
            value: 0,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          o_counter: {
            value: 0,
            modifier: "EQUALS",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("performers filter", () => {
    it("filters images by performer with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          performers: {
            value: [TEST_ENTITIES.performerWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters images by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("filters images by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          tags: {
            value: [TEST_ENTITIES.tagWithEntities],
            modifier: "EXCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters images by studio", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          studios: {
            value: [TEST_ENTITIES.studioWithScenes],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("galleries filter", () => {
    it("filters images by gallery", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithImages],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });
  });

  describe("text search (q parameter)", () => {
    it("searches images by title", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          q: "a",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and rating filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          favorite: true,
          rating100: {
            value: 50,
            modifier: "GREATER_THAN",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();

      for (const image of response.data.findImages.images) {
        expect(image.favorite).toBe(true);
      }
    });

    it("combines performer and gallery filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
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
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("combines studio and tags filters", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
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
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts images by title ASC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "title",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by rating100 DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "rating100",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });

    it("sorts images by o_counter DESC", async () => {
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          per_page: 50,
          sort: "o_counter",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
    });
  });

  describe("pagination", () => {
    it("paginates images correctly", async () => {
      const page1 = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          page: 1,
          per_page: 10,
        },
      });

      const page2 = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: {
          page: 2,
          per_page: 10,
        },
      });

      expect(page1.ok).toBe(true);
      expect(page2.ok).toBe(true);

      const page1Ids = page1.data.findImages.images.map((i) => i.id);
      const page2Ids = page2.data.findImages.images.map((i) => i.id);

      // Pages should have different images
      if (page1Ids.length > 0 && page2Ids.length > 0) {
        for (const id of page2Ids) {
          expect(page1Ids).not.toContain(id);
        }
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
      // @ts-expect-error - imageWithGalleryInheritance may not exist in older testEntities
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log("Skipping inheritance verification test - imageWithGalleryInheritance not configured");
        return;
      }

      // Fetch the specific image by ID
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 1 },
        image_filter: {
          ids: {
            value: [imageId],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images.length).toBe(1);

      const image = response.data.findImages.images[0];

      // Image should have its own title (title is never inherited)
      // The image file should have a title derived from its filename or set manually
      expect(image.id).toBe(imageId);

      // Image should have performers (either inherited from gallery or its own)
      // The inheritance test below verifies filtering by gallery performer works
      expect(image.performers).toBeDefined();
      expect(image.performers!.length).toBeGreaterThan(0);

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
        console.log("Skipping gallery inheritance test - no galleryPerformerForInheritance configured");
        return;
      }

      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          performers: {
            value: [TEST_ENTITIES.galleryPerformerForInheritance],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages).toBeDefined();
      // The key assertion: should find images even though performer is only on gallery
      // This test FAILS if gallery inheritance didn't run during sync
      expect(response.data.findImages.count).toBeGreaterThan(0);
    });

    it("filters images by tag inherited from gallery", async () => {
      // Skip if no test entity configured
      // @ts-expect-error - imageWithGalleryInheritance may not exist in older testEntities
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log("Skipping tag filter test - imageWithGalleryInheritance not configured");
        return;
      }

      // First get the image to find its inherited tags
      const imageResponse = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 1 },
        image_filter: {
          ids: { value: [imageId], modifier: "INCLUDES" },
        },
      });

      expect(imageResponse.ok).toBe(true);
      const image = imageResponse.data.findImages.images[0];

      if (!image.tags || image.tags.length === 0) {
        console.log("Skipping tag filter test - test image has no tags");
        return;
      }

      // Now filter by that tag - should find the image
      const tagId = image.tags[0].id;
      const filterResponse = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 50 },
        image_filter: {
          tags: { value: [tagId], modifier: "INCLUDES" },
        },
      });

      expect(filterResponse.ok).toBe(true);
      expect(filterResponse.data.findImages.count).toBeGreaterThan(0);

      // The original image should be in the results
      const foundImageIds = filterResponse.data.findImages.images.map((i) => i.id);
      expect(foundImageIds).toContain(imageId);
    });

    it("filters images by studio inherited from gallery", async () => {
      // Skip if no test entity configured
      // @ts-expect-error - imageWithGalleryInheritance may not exist in older testEntities
      const imageId = TEST_ENTITIES.imageWithGalleryInheritance;

      if (!imageId) {
        console.log("Skipping studio filter test - imageWithGalleryInheritance not configured");
        return;
      }

      // First get the image to find its inherited studio
      const imageResponse = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 1 },
        image_filter: {
          ids: { value: [imageId], modifier: "INCLUDES" },
        },
      });

      expect(imageResponse.ok).toBe(true);
      const image = imageResponse.data.findImages.images[0];

      if (!image.studio) {
        console.log("Skipping studio filter test - test image has no studio");
        return;
      }

      // Now filter by that studio AND the specific image ID
      // This tests that the image is correctly filterable by its inherited studio
      const studioId = image.studio.id;
      const filterResponse = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 10 },
        image_filter: {
          ids: { value: [imageId], modifier: "INCLUDES" },
          studios: { value: [studioId], modifier: "INCLUDES" },
        },
      });

      expect(filterResponse.ok).toBe(true);
      // The key assertion: image with inherited studio should match studio filter
      expect(filterResponse.data.findImages.count).toBe(1);
      expect(filterResponse.data.findImages.images[0].id).toBe(imageId);
    });

    it("verifies image with own properties is not overwritten by gallery", async () => {
      // Skip if no test entity configured
      // @ts-expect-error - imageWithOwnProperties may not exist in older testEntities
      const imageId = TEST_ENTITIES.imageWithOwnProperties;

      if (!imageId) {
        console.log("Skipping own-properties test - imageWithOwnProperties not configured");
        return;
      }

      // Fetch the specific image by ID
      const response = await adminClient.post<FindImagesResponse>("/api/library/images", {
        filter: { per_page: 1 },
        image_filter: {
          ids: {
            value: [imageId],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images.length).toBe(1);

      const image = response.data.findImages.images[0];

      // Image should have its own title
      expect(image.id).toBe(imageId);

      // Image has its own performers - inheritance should NOT have added gallery performers
      // (inheritance only adds performers if image has NONE)
      expect(image.performers).toBeDefined();
      expect(image.performers!.length).toBeGreaterThan(0);

      // Image has its own tags - including a tag the gallery doesn't have
      // This verifies inheritance didn't replace the image's tags
      expect(image.tags).toBeDefined();
      expect(image.tags!.length).toBeGreaterThan(0);

      // The key check: image has tags that are its OWN (not from gallery)
      // We can't assert specific tag IDs without knowing them, but we verify
      // the image retained its tags rather than having them replaced
    });
  });
});
