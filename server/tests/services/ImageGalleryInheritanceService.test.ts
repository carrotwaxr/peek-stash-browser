import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../services/../prisma/singleton.js";
import { imageGalleryInheritanceService } from "../../services/ImageGalleryInheritanceService.js";

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

  describe("applyGalleryInheritance", () => {
    it("should inherit studio from gallery when image has none", async () => {
      // Create studio
      await prisma.stashStudio.create({
        data: { id: `${PREFIX}studio-1`, name: "Test Studio" },
      });

      // Create gallery with studio
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "Test Gallery", studioId: `${PREFIX}studio-1` },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited studio
      const image = await prisma.stashImage.findFirst({
        where: { id: `${PREFIX}image-1` },
      });
      expect(image?.studioId).toBe(`${PREFIX}studio-1`);
    });

    it("should NOT overwrite image studio when image already has one", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          { id: `${PREFIX}studio-1`, name: "Gallery Studio" },
          { id: `${PREFIX}studio-2`, name: "Image Studio" },
        ],
      });

      // Create gallery with studio-1
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "Test Gallery", studioId: `${PREFIX}studio-1` },
      });

      // Create image with its own studio-2
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image", studioId: `${PREFIX}studio-2` },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
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
        data: { id: `${PREFIX}performer-1`, name: "Test Performer" },
      });

      // Create gallery and link performer
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "Test Gallery" },
      });
      await prisma.galleryPerformer.create({
        data: { galleryId: `${PREFIX}gallery-1`, performerId: `${PREFIX}performer-1` },
      });

      // Create image without performers
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(imagePerformers[0].performerId).toBe(`${PREFIX}performer-1`);
    });

    it("should inherit tags from gallery when image has none", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: `${PREFIX}tag-1`, name: "Test Tag" },
      });

      // Create gallery and link tag
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "Test Gallery" },
      });
      await prisma.galleryTag.create({
        data: { galleryId: `${PREFIX}gallery-1`, tagId: `${PREFIX}tag-1` },
      });

      // Create image without tags
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited tag
      const imageTags = await prisma.imageTag.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imageTags).toHaveLength(1);
      expect(imageTags[0].tagId).toBe(`${PREFIX}tag-1`);
    });

    it("should NOT inherit performers when image already has performers", async () => {
      // Create two performers
      await prisma.stashPerformer.createMany({
        data: [
          { id: `${PREFIX}performer-1`, name: "Gallery Performer" },
          { id: `${PREFIX}performer-2`, name: "Image Performer" },
        ],
      });

      // Create gallery with performer-1
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "Test Gallery" },
      });
      await prisma.galleryPerformer.create({
        data: { galleryId: `${PREFIX}gallery-1`, performerId: `${PREFIX}performer-1` },
      });

      // Create image with performer-2
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image" },
      });
      await prisma.imagePerformer.create({
        data: { imageId: `${PREFIX}image-1`, performerId: `${PREFIX}performer-2` },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image kept only its own performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: `${PREFIX}image-1` },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(imagePerformers[0].performerId).toBe(`${PREFIX}performer-2`);
    });

    it("should handle image in multiple galleries (use first)", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          { id: `${PREFIX}studio-1`, name: "First Gallery Studio" },
          { id: `${PREFIX}studio-2`, name: "Second Gallery Studio" },
        ],
      });

      // Create two galleries
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-1`, title: "First Gallery", studioId: `${PREFIX}studio-1` },
      });
      await prisma.stashGallery.create({
        data: { id: `${PREFIX}gallery-2`, title: "Second Gallery", studioId: `${PREFIX}studio-2` },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: { id: `${PREFIX}image-1`, title: "Test Image" },
      });

      // Link image to both galleries (gallery-1 first)
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-1` },
      });
      await prisma.imageGallery.create({
        data: { imageId: `${PREFIX}image-1`, galleryId: `${PREFIX}gallery-2` },
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
        data: { id: `${PREFIX}image-1`, title: "Standalone Image" },
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
});
