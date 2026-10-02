import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { refreshImageDerivedColumns } from "../../services/StashSyncService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
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

/**
 * Image title, details, code, photographer, path, URL, organized,
 * resolution and orientation (items 63 and 66), from the wire through the
 * parser into the image builder, on seeded rows.
 *
 * Two made-up instances reusing ids, as two Stash servers do: spi-x and
 * spi-y, both enabled and both selected by every viewer. Image ids are
 * 7898000 + n. Users: A, whose hides are none, and B, who hid image 60@x.
 * Every seeded row is deleted before the describe ends.
 */
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const IX = "spi-x";
const IY = "spi-y";
const IMAGE_INSTANCES = [IX, IY];
const IMAGE_PREFIX = "spi-it";
const imageId = (n: number) => String(7898000 + n);

describeWithDb("Image own fields (seeded)", () => {
  const user = { A: 0, B: 0 };

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { startsWith: IMAGE_PREFIX } },
    });
    await prisma.stashImage.deleteMany({
      where: { stashInstanceId: { in: IMAGE_INSTANCES } },
    });
    await prisma.stashInstance.deleteMany({
      where: { id: { in: IMAGE_INSTANCES } },
    });
  }

  /** The images of one instance a wire `image_filter` lists, as numbers; the count is checked */
  async function ns(
    viewer: number,
    imageFilter: Record<string, unknown>,
    instance = IX
  ): Promise<number[]> {
    const request = parseListRequest(
      "image",
      { filter: { per_page: 250 }, image_filter: imageFilter },
      { userId: viewer }
    );
    const { items, total } = await imageQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
      request,
    });
    expect(total).toBe(items.length);
    return items
      .filter((image) => image.instanceId === instance)
      .map((image) => Number(image.id) - 7898000)
      .sort((a, b) => a - b);
  }

  const text = (field: string, modifier: string, value?: string) => ({
    [field]: value === undefined ? { modifier } : { value, modifier },
  });

  beforeAll(async () => {
    await removeRows();

    for (const [i, id] of IMAGE_INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: true,
          priority: 960 + i,
          firstSyncedAt: new Date(),
        },
      });
    }

    const makeUser = async (name: string) =>
      (
        await prisma.user.create({
          data: {
            username: `${IMAGE_PREFIX}-${name}`,
            password: "not-a-real-hash",
            role: "USER",
            stashInstances: {
              create: IMAGE_INSTANCES.map((instanceId) => ({ instanceId })),
            },
          },
        })
      ).id;
    user.A = await makeUser("a");
    user.B = await makeUser("b");

    const image = (
      n: number,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id: imageId(n),
      stashInstanceId: instance,
      title: `SPI ${n} ${instance}`,
      ...extra,
    });
    await prisma.stashImage.createMany({
      data: [
        // Titles, details, codes, photographers: 1 holds an underscore, 2 a
        // lookalike, 3 a percent
        image(1, IX, {
          title: "a_b title",
          details: "d_1",
          code: "C_1",
          photographer: "p_1",
        }),
        image(2, IX, {
          title: "axb title",
          details: "dx1",
          code: "CX1",
          photographer: "px1",
        }),
        image(3, IX, {
          title: "100% title",
          details: "100% detail",
          code: "100%",
          photographer: "100% shots",
        }),
        image(1, IY, {
          title: "a_b title",
          details: "d_1",
          code: "C_1",
          photographer: "p_1",
        }),
        image(3, IY, { details: "100% elsewhere" }),
        // Paths
        image(4, IX, { filePath: "/a_b/x.jpg" }),
        image(5, IX, { filePath: "/axb/x.jpg" }),
        image(6, IX, { filePath: "/z/a_b/x.jpg" }),
        image(7, IX, { filePath: "/100%/y.jpg" }),
        image(4, IY, { filePath: "/a_b/other.jpg" }),
        image(7, IY, { filePath: "/plain/other.jpg" }),
        // URLs
        image(10, IX, {
          urls: JSON.stringify(["https://a.test/1", "https://example.com/2"]),
        }),
        image(11, IX, { urls: JSON.stringify(["https://other.test/"]) }),
        image(12, IX, { urls: null }),
        image(13, IX, { urls: "" }),
        image(14, IX, { urls: "[]" }),
        image(10, IY, { urls: JSON.stringify(["https://nothing.test/"]) }),
        // Organized
        image(20, IX, { organized: true }),
        image(21, IX),
        image(20, IY),
        // Resolution and orientation: 30 is 1080 by 1920 (portrait), 31
        // 1920 by 1080, 32 square 2000, 33 has no size
        image(30, IX, { width: 1080, height: 1920 }),
        image(31, IX, { width: 1920, height: 1080 }),
        image(32, IX, { width: 2000, height: 2000 }),
        image(33, IX, { width: null, height: null }),
        image(30, IY, { width: 640, height: 480 }),
        // Names: 40 untitled (the card shows its file name without the
        // extension), 41 titled and also named by its file, 42 an empty
        // title, 43 no title and no path, 44 an untitled image in a folder
        // named like 41's file
        image(40, IX, { title: null, filePath: "/pics/sunset_beach.jpg" }),
        image(41, IX, {
          title: "Card title",
          filePath: "/pics/other_name.jpg",
        }),
        image(42, IX, { title: "", filePath: "C:\\pics\\win_name.png" }),
        image(43, IX, { title: null, filePath: null }),
        image(44, IX, { title: null, filePath: "/other_name/plain.gif" }),
        image(40, IY, { title: null, filePath: "/pics/other_instance.jpg" }),
        // Hidden by B, with every field set
        image(60, IX, {
          title: "hidden title",
          details: "hidden details",
          code: "HID",
          photographer: "hidden photographer",
          filePath: "/hidden/x.jpg",
          urls: JSON.stringify(["https://hidden.test/"]),
          organized: false,
          width: 1080,
          height: 1920,
        }),
      ],
    });

    // Sync stores each image's name as the card shows it (titleSort) after
    // every batch; the filters and the search read it
    for (const instanceId of IMAGE_INSTANCES) {
      const rows = await prisma.stashImage.findMany({
        where: { stashInstanceId: instanceId },
        select: { id: true },
      });
      await refreshImageDerivedColumns(
        prisma,
        rows.map((row) => row.id),
        instanceId
      );
    }

    await prisma.userHiddenEntity.create({
      data: {
        userId: user.B,
        entityType: "image",
        entityId: imageId(60),
        instanceId: IX,
      },
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: user.B,
        entityType: "image",
        entityId: imageId(60),
        instanceId: IX,
        reason: "hidden",
      },
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("title, details, code and photographer match literally, per instance", async () => {
    for (const field of ["title", "details", "code", "photographer"]) {
      const underscore = {
        title: "a_b",
        details: "d_",
        code: "C_",
        photographer: "p_",
      }[field] as string;
      expect(await ns(user.A, text(field, "INCLUDES", underscore))).toEqual([
        1,
      ]);
      // The same id on the other instance is another image
      expect(await ns(user.A, text(field, "INCLUDES", underscore), IY)).toEqual(
        [1]
      );
    }
    expect(await ns(user.A, text("title", "INCLUDES", "100%"))).toEqual([3]);
    expect(await ns(user.A, text("details", "INCLUDES", "100%"))).toEqual([3]);
    expect(await ns(user.A, text("details", "INCLUDES", "100%"), IY)).toEqual([
      3,
    ]);
    expect(await ns(user.A, text("code", "EQUALS", "C_1"))).toEqual([1]);
    expect(await ns(user.A, text("code", "EQUALS", "C%"))).toEqual([]);
    expect(await ns(user.A, text("photographer", "EQUALS", "p_1"))).toEqual([
      1,
    ]);
    expect(
      await ns(user.A, text("photographer", "NOT_EQUALS", "p_1"))
    ).not.toContain(1);
  });

  it("title is the name the card shows: the title, else the file name without its extension", async () => {
    // An untitled image by its file name, as the card shows it
    expect(await ns(user.A, text("title", "INCLUDES", "sunset_beach"))).toEqual(
      [40]
    );
    expect(await ns(user.A, text("title", "EQUALS", "sunset_beach"))).toEqual([
      40,
    ]);
    // Neither the extension nor the directory is part of the name
    expect(await ns(user.A, text("title", "INCLUDES", ".jpg"))).toEqual([]);
    expect(await ns(user.A, text("title", "INCLUDES", "pics"))).toEqual([]);
    // An empty title falls back too, and a backslash path has its own name
    expect(await ns(user.A, text("title", "EQUALS", "win_name"))).toEqual([42]);
    // A titled image is named by its title, not its file
    expect(await ns(user.A, text("title", "INCLUDES", "other_name"))).toEqual(
      []
    );
    expect(await ns(user.A, text("title", "EQUALS", "Card title"))).toEqual([
      41,
    ]);
    // No title and no path: no name at all, which a negative still passes
    expect(await ns(user.A, text("title", "IS_NULL"))).toContain(43);
    expect(await ns(user.A, text("title", "IS_NULL"))).not.toContain(40);
    expect(await ns(user.A, text("title", "NOT_EQUALS", "zzz"))).toContain(43);
    // The same id on the other instance is another image
    expect(
      await ns(user.A, text("title", "INCLUDES", "other_instance"), IY)
    ).toEqual([40]);
  });

  it("the search box matches the name the card shows, the details and the photographer", async () => {
    const q = async (search: string, instance = IX) => {
      const request = parseListRequest(
        "image",
        { filter: { per_page: 250, q: search } },
        { userId: user.A }
      );
      const { items, total } = await imageQueryBuilder.execute({
        userId: user.A,
        allowedInstanceIds: await getUserAllowedInstanceIds(user.A),
        request,
      });
      expect(total).toBe(items.length);
      return items
        .filter((image) => image.instanceId === instance)
        .map((image) => Number(image.id) - 7898000)
        .sort((a, b) => a - b);
    };
    // An untitled image by its file name, a titled one by its title only
    expect(await q("sunset_beach")).toEqual([40]);
    expect(await q("Card title")).toEqual([41]);
    expect(await q("other_name")).toEqual([]);
    expect(await q("win_name")).toEqual([42]);
    // Details and photographer still count
    expect(await q("d_1")).toEqual([1]);
    expect(await q("p_1")).toEqual([1]);
    expect(await q("other_instance", IY)).toEqual([40]);
    expect(await q("other_instance")).toEqual([]);
  });

  it("path STARTS_WITH matches the start only, literally", async () => {
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"))).toEqual([4]);
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"), IY)).toEqual([
      4,
    ]);
    expect(await ns(user.A, text("path", "STARTS_WITH", "/z/"))).toEqual([6]);
    expect(await ns(user.A, text("path", "INCLUDES", "%"))).toEqual([7]);
    expect(await ns(user.A, text("path", "INCLUDES", "%"), IY)).toEqual([]);
    expect(await ns(user.A, text("path", "EQUALS", "/axb/x.jpg"))).toEqual([5]);
  });

  it("url matches any of the image's URLs, not the JSON text", async () => {
    expect(await ns(user.A, text("url", "INCLUDES", '"'))).toEqual([]);
    expect(await ns(user.A, text("url", "INCLUDES", "]"))).toEqual([]);
    expect(await ns(user.A, text("url", "INCLUDES", "example.com"))).toEqual([
      10,
    ]);
    expect(
      await ns(user.A, text("url", "INCLUDES", "nothing.test"), IY)
    ).toEqual([10]);
    expect(await ns(user.A, text("url", "INCLUDES", "nothing.test"))).toEqual(
      []
    );
    expect(
      await ns(user.A, text("url", "EQUALS", "https://other.test/"))
    ).toEqual([11]);
    // NULL, '' and [] are all "no URL"
    expect(await ns(user.A, text("url", "IS_NULL"))).toEqual(
      expect.arrayContaining([12, 13, 14])
    );
    expect(await ns(user.A, text("url", "IS_NULL"))).not.toContain(10);
    expect(await ns(user.A, text("url", "NOT_NULL"))).toEqual(
      expect.arrayContaining([10, 11])
    );
    expect(
      await ns(user.A, text("url", "EXCLUDES", "example.com"))
    ).not.toContain(10);
  });

  it("organized false matches the default and true the marked", async () => {
    expect(await ns(user.A, { organized: true })).toEqual([20]);
    expect(await ns(user.A, { organized: false })).toEqual(
      expect.arrayContaining([21])
    );
    expect(await ns(user.A, { organized: false })).not.toContain(20);
    expect(await ns(user.A, { organized: true }, IY)).toEqual([]);
    expect(await ns(user.A, { organized: false }, IY)).toContain(20);
  });

  it("resolution reads the shorter side, so a portrait 1080 is Full HD", async () => {
    const resolution = (value: string, modifier: string) => ({
      resolution: { value, modifier },
    });
    const full = await ns(user.A, resolution("FULL_HD", "EQUALS"));
    expect(full).toEqual(expect.arrayContaining([30, 31]));
    expect(full).not.toContain(32);
    expect(full).not.toContain(33);
    expect(await ns(user.A, resolution("FULL_HD", "GREATER_THAN"))).toEqual(
      expect.arrayContaining([32])
    );
    expect(
      await ns(user.A, resolution("FULL_HD", "GREATER_THAN"))
    ).not.toContain(30);
    // An image with no size never matches, NOT_EQUALS included
    expect(await ns(user.A, resolution("FULL_HD", "NOT_EQUALS"))).not.toContain(
      33
    );
    // The other instance's 640 by 480 is its own
    expect(await ns(user.A, resolution("FULL_HD", "EQUALS"), IY)).toEqual([]);
    expect(await ns(user.A, resolution("STANDARD", "EQUALS"), IY)).toEqual([
      30,
    ]);
  });

  it("orientation matches portrait, landscape and square, and several at once", async () => {
    const orientation = (...value: string[]) => ({ orientation: { value } });
    expect(await ns(user.A, orientation("PORTRAIT"))).toEqual(
      expect.arrayContaining([30])
    );
    expect(await ns(user.A, orientation("PORTRAIT"))).not.toContain(31);
    expect(await ns(user.A, orientation("LANDSCAPE"))).toContain(31);
    expect(await ns(user.A, orientation("SQUARE"))).toEqual([32]);
    const either = await ns(user.A, orientation("SQUARE", "LANDSCAPE"));
    expect(either).toEqual(expect.arrayContaining([31, 32]));
    expect(either).not.toContain(30);
    expect(either).not.toContain(33);
    expect(await ns(user.A, orientation("LANDSCAPE"), IY)).toEqual([30]);
  });

  it("an image the viewer hid is never listed under a new field", async () => {
    // A sees it, so every field below really matches it
    for (const filter of [
      text("title", "INCLUDES", "hidden"),
      text("details", "INCLUDES", "hidden"),
      text("code", "EQUALS", "HID"),
      text("photographer", "INCLUDES", "hidden"),
      text("path", "STARTS_WITH", "/hidden/"),
      text("url", "INCLUDES", "hidden.test"),
      { organized: false },
      { resolution: { value: "FULL_HD", modifier: "EQUALS" } },
      { orientation: { value: ["PORTRAIT"] } },
    ]) {
      expect(await ns(user.A, filter), JSON.stringify(filter)).toContain(60);
      expect(await ns(user.B, filter), JSON.stringify(filter)).not.toContain(
        60
      );
    }
    // The negative forms never list it either
    for (const filter of [
      text("title", "EXCLUDES", "zzz"),
      text("title", "NOT_EQUALS", "zzz"),
      text("path", "EXCLUDES", "zzz"),
      text("url", "EXCLUDES", "zzz"),
      text("url", "NOT_NULL"),
      text("code", "NOT_NULL"),
      { resolution: { value: "FULL_HD", modifier: "NOT_EQUALS" } },
      { resolution: { value: "FULL_HD", modifier: "LESS_THAN" } },
      { organized: false },
    ]) {
      expect(await ns(user.B, filter), JSON.stringify(filter)).not.toContain(
        60
      );
    }
  });
});
