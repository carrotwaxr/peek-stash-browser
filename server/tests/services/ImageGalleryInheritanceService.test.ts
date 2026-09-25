import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../services/../prisma/singleton.js";
import {
  imageGalleryInheritanceService,
  inheritScalarSql,
} from "../../services/ImageGalleryInheritanceService.js";
import { must } from "../helpers/must.js";

describe("ImageGalleryInheritanceService", () => {
  // Clean up test data
  beforeEach(async () => {
    await prisma.imageGallery.deleteMany({});
    await prisma.imagePerformer.deleteMany({});
    await prisma.imageTag.deleteMany({});
    await prisma.galleryPerformer.deleteMany({});
    await prisma.galleryTag.deleteMany({});
    await prisma.stashImage.deleteMany({});
    await prisma.stashGallery.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashTag.deleteMany({});
    await prisma.stashStudio.deleteMany({});
  });

  afterEach(async () => {
    await prisma.imageGallery.deleteMany({});
    await prisma.imagePerformer.deleteMany({});
    await prisma.imageTag.deleteMany({});
    await prisma.galleryPerformer.deleteMany({});
    await prisma.galleryTag.deleteMany({});
    await prisma.stashImage.deleteMany({});
    await prisma.stashGallery.deleteMany({});
    await prisma.stashPerformer.deleteMany({});
    await prisma.stashTag.deleteMany({});
    await prisma.stashStudio.deleteMany({});
  });

  // Use unique prefixes to avoid collisions with other test files
  const PREFIX = "igi-"; // Image Gallery Inheritance
  const INSTANCE_ID = "test-instance-igi";

  describe("applyGalleryInheritance", () => {
    it("should inherit studio from gallery when image has none", async () => {
      // Create studio
      await prisma.stashStudio.create({
        data: {
          id: `${PREFIX}studio-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Studio",
        },
      });

      // Create gallery with studio
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Gallery",
          studioId: `${PREFIX}studio-1`,
        },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
        },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited studio
      const image = await prisma.stashImage.findFirst({
        where: { id: `${PREFIX}image-1` },
      });
      expect(image?.studioId).toBe(`${PREFIX}studio-1`);
    });

    it("records the inherited studio's instance, the image's own", async () => {
      await prisma.stashStudio.create({
        data: {
          id: `${PREFIX}studio-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Studio",
        },
      });
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          studioId: `${PREFIX}studio-1`,
          studioInstanceId: INSTANCE_ID,
        },
      });
      // No studio, as sync stores a studio-less image
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          studioInstanceId: null,
        },
      });
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      await imageGalleryInheritanceService.applyGalleryInheritance();

      const image = must(
        await prisma.stashImage.findFirst({
          where: { id: `${PREFIX}image-1`, stashInstanceId: INSTANCE_ID },
        }),
        "image"
      );
      expect(image.studioId).toBe(`${PREFIX}studio-1`);
      expect(image.studioInstanceId).toBe(INSTANCE_ID);
    });

    it("should NOT overwrite image studio when image already has one", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          {
            id: `${PREFIX}studio-1`,
            stashInstanceId: INSTANCE_ID,
            name: "Gallery Studio",
          },
          {
            id: `${PREFIX}studio-2`,
            stashInstanceId: INSTANCE_ID,
            name: "Image Studio",
          },
        ],
      });

      // Create gallery with studio-1
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Gallery",
          studioId: `${PREFIX}studio-1`,
        },
      });

      // Create image with its own studio-2
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
          studioId: `${PREFIX}studio-2`,
        },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image kept its own studio
      const image = await prisma.stashImage.findFirst({
        where: { id: `${PREFIX}image-1` },
      });
      expect(image?.studioId).toBe(`${PREFIX}studio-2`);
    });

    it("should inherit performers from gallery when image has none", async () => {
      // Create performer
      await prisma.stashPerformer.create({
        data: {
          id: `${PREFIX}performer-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Performer",
        },
      });

      // Create gallery and link performer
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Gallery",
        },
      });
      await prisma.galleryPerformer.create({
        data: {
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      // Create image without performers
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
        },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(must(imagePerformers[0]).performerId).toBe(`${PREFIX}performer-1`);
    });

    it("should inherit tags from gallery when image has none", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: {
          id: `${PREFIX}tag-1`,
          stashInstanceId: INSTANCE_ID,
          name: "Test Tag",
        },
      });

      // Create gallery and link tag
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Gallery",
        },
      });
      await prisma.galleryTag.create({
        data: {
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
          tagId: `${PREFIX}tag-1`,
          tagInstanceId: INSTANCE_ID,
        },
      });

      // Create image without tags
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
        },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited tag
      const imageTags = await prisma.imageTag.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imageTags).toHaveLength(1);
      expect(must(imageTags[0]).tagId).toBe(`${PREFIX}tag-1`);
    });

    it("should NOT inherit performers when image already has performers", async () => {
      // Create two performers
      await prisma.stashPerformer.createMany({
        data: [
          {
            id: `${PREFIX}performer-1`,
            stashInstanceId: INSTANCE_ID,
            name: "Gallery Performer",
          },
          {
            id: `${PREFIX}performer-2`,
            stashInstanceId: INSTANCE_ID,
            name: "Image Performer",
          },
        ],
      });

      // Create gallery with performer-1
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Gallery",
        },
      });
      await prisma.galleryPerformer.create({
        data: {
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-1`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      // Create image with performer-2
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
        },
      });
      await prisma.imagePerformer.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          performerId: `${PREFIX}performer-2`,
          performerInstanceId: INSTANCE_ID,
        },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image kept only its own performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(must(imagePerformers[0]).performerId).toBe(`${PREFIX}performer-2`);
    });

    it("should handle image in multiple galleries (use first)", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          {
            id: `${PREFIX}studio-1`,
            stashInstanceId: INSTANCE_ID,
            name: "First Gallery Studio",
          },
          {
            id: `${PREFIX}studio-2`,
            stashInstanceId: INSTANCE_ID,
            name: "Second Gallery Studio",
          },
        ],
      });

      // Create two galleries
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-1`,
          stashInstanceId: INSTANCE_ID,
          title: "First Gallery",
          studioId: `${PREFIX}studio-1`,
        },
      });
      await prisma.stashGallery.create({
        data: {
          id: `${PREFIX}gallery-2`,
          stashInstanceId: INSTANCE_ID,
          title: "Second Gallery",
          studioId: `${PREFIX}studio-2`,
        },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Test Image",
        },
      });

      // Link image to both galleries (gallery-1 first)
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-1`,
          galleryInstanceId: INSTANCE_ID,
        },
      });
      await prisma.imageGallery.create({
        data: {
          imageId: `${PREFIX}image-1`,
          imageInstanceId: INSTANCE_ID,
          galleryId: `${PREFIX}gallery-2`,
          galleryInstanceId: INSTANCE_ID,
        },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image got studio from first gallery
      const image = await prisma.stashImage.findFirst({
        where: { id: `${PREFIX}image-1` },
      });
      expect(image?.studioId).toBe(`${PREFIX}studio-1`);
    });

    it("should handle image not in any gallery (no inheritance)", async () => {
      // Create image without gallery
      await prisma.stashImage.create({
        data: {
          id: `${PREFIX}image-1`,
          stashInstanceId: INSTANCE_ID,
          title: "Standalone Image",
        },
      });

      // Apply inheritance (should not fail)
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image unchanged
      const image = await prisma.stashImage.findFirst({
        where: { id: `${PREFIX}image-1` },
      });
      expect(image?.studioId).toBeNull();
    });
  });

  describe("scoped", () => {
    const OTHER_INSTANCE = "test-instance-igi-other";

    /**
     * On each instance: a gallery with a studio, a date, a performer and a
     * tag, and images 1 and 2 in it with none of their own.
     */
    async function seedGalleryWithTwoImages(): Promise<void> {
      for (const instance of [INSTANCE_ID, OTHER_INSTANCE]) {
        await prisma.stashStudio.create({
          data: {
            id: `${PREFIX}studio-1`,
            stashInstanceId: instance,
            name: "Scoped Studio",
          },
        });
        await prisma.stashPerformer.create({
          data: {
            id: `${PREFIX}performer-1`,
            stashInstanceId: instance,
            name: "Scoped Performer",
          },
        });
        await prisma.stashTag.create({
          data: {
            id: `${PREFIX}tag-1`,
            stashInstanceId: instance,
            name: "Scoped Tag",
          },
        });
        await prisma.stashGallery.create({
          data: {
            id: `${PREFIX}gallery-1`,
            stashInstanceId: instance,
            studioId: `${PREFIX}studio-1`,
            studioInstanceId: instance,
            date: "2026-01-01",
          },
        });
        await prisma.galleryPerformer.create({
          data: {
            galleryId: `${PREFIX}gallery-1`,
            galleryInstanceId: instance,
            performerId: `${PREFIX}performer-1`,
            performerInstanceId: instance,
          },
        });
        await prisma.galleryTag.create({
          data: {
            galleryId: `${PREFIX}gallery-1`,
            galleryInstanceId: instance,
            tagId: `${PREFIX}tag-1`,
            tagInstanceId: instance,
          },
        });
        for (const image of ["image-1", "image-2"]) {
          await prisma.stashImage.create({
            data: { id: `${PREFIX}${image}`, stashInstanceId: instance },
          });
          await prisma.imageGallery.create({
            data: {
              imageId: `${PREFIX}${image}`,
              imageInstanceId: instance,
              galleryId: `${PREFIX}gallery-1`,
              galleryInstanceId: instance,
            },
          });
        }
      }
    }

    /** Whether an image has each inherited value. */
    async function inherited(image: string, instance: string) {
      const where = { imageId: `${PREFIX}${image}`, imageInstanceId: instance };
      const row = must(
        await prisma.stashImage.findUnique({
          where: {
            id_stashInstanceId: {
              id: `${PREFIX}${image}`,
              stashInstanceId: instance,
            },
          },
        }),
        image
      );
      return {
        studio: row.studioId !== null,
        date: row.date !== null,
        performers: await prisma.imagePerformer.count({ where }),
        tags: await prisma.imageTag.count({ where }),
      };
    }

    const all = { studio: true, date: true, performers: 1, tags: 1 };
    const none = { studio: false, date: false, performers: 0, tags: 0 };

    it("applies inheritance to the images in scope only", async () => {
      await seedGalleryWithTwoImages();

      await imageGalleryInheritanceService.applyGalleryInheritance([
        { id: `${PREFIX}image-1`, instanceId: INSTANCE_ID },
      ]);

      expect(await inherited("image-1", INSTANCE_ID)).toEqual(all);
      expect(await inherited("image-2", INSTANCE_ID)).toEqual(none);
      // The same ids on another instance are other images
      expect(await inherited("image-1", OTHER_INSTANCE)).toEqual(none);
    });

    it("an empty scope changes nothing", async () => {
      await seedGalleryWithTwoImages();

      await imageGalleryInheritanceService.applyGalleryInheritance([]);

      expect(await inherited("image-1", INSTANCE_ID)).toEqual(none);
    });

    it("imagesInGalleries lists a gallery's images on its own instance", async () => {
      await seedGalleryWithTwoImages();

      const images = await imageGalleryInheritanceService.imagesInGalleries([
        { id: `${PREFIX}gallery-1`, instanceId: INSTANCE_ID },
      ]);

      expect(images.map((i) => `${i.id}@${i.instanceId}`).sort()).toEqual([
        `${PREFIX}image-1@${INSTANCE_ID}`,
        `${PREFIX}image-2@${INSTANCE_ID}`,
      ]);
    });
  });

  describe("inheritScalarSql", () => {
    // With planner statistics (PRAGMA optimize after each sync), SQLite
    // drove the whole-library UPDATE from the gallery list, probing
    // StashImage by id for each of its 260k rows: 0.2 s became 1.1 s on the
    // prod copy. The `+` keeps the image's key off that list, so each image
    // is read from its own indexes and tested against the list. A real
    // plan needs prod-sized tables; the replay's stay on the good plan.
    it.each(["studioId", "date", "photographer", "details"] as const)(
      "the whole-library %s update tests the gallery list per image instead of driving from it",
      (column) => {
        expect(inheritScalarSql(column, false)).toContain(
          "(+id, +stashInstanceId) IN ("
        );
      }
    );
  });
});
