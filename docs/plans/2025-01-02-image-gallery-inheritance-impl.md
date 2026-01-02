# Image Gallery Inheritance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Denormalize gallery metadata (studio, date, photographer, details, performers, tags) to images at sync time so images can be filtered and displayed without loading their parent gallery.

**Architecture:** After images are synced and ImageGallery junction records exist, run a post-processing pass that copies gallery metadata to images that have none. Uses SQL for efficient bulk operations matching the existing EntityImageCountService pattern.

**Tech Stack:** Prisma, SQLite raw queries, TypeScript

---

## Task 1: Create ImageGalleryInheritanceService

Create a new service to handle gallery → image inheritance logic.

**Files:**
- Create: `server/services/ImageGalleryInheritanceService.ts`
- Test: `server/services/__tests__/ImageGalleryInheritanceService.test.ts`

**Step 1: Write the failing test**

Create the test file with basic tests for the inheritance logic.

```typescript
// server/services/__tests__/ImageGalleryInheritanceService.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageGalleryInheritanceService } from "../ImageGalleryInheritanceService.js";

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

  describe("applyGalleryInheritance", () => {
    it("should inherit studio from gallery when image has none", async () => {
      // Create studio
      await prisma.stashStudio.create({
        data: { id: "studio-1", name: "Test Studio" },
      });

      // Create gallery with studio
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Test Gallery", studioId: "studio-1" },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited studio
      const image = await prisma.stashImage.findUnique({
        where: { id: "image-1" },
      });
      expect(image?.studioId).toBe("studio-1");
    });

    it("should NOT overwrite image studio when image already has one", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          { id: "studio-1", name: "Gallery Studio" },
          { id: "studio-2", name: "Image Studio" },
        ],
      });

      // Create gallery with studio-1
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Test Gallery", studioId: "studio-1" },
      });

      // Create image with its own studio-2
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image", studioId: "studio-2" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image kept its own studio
      const image = await prisma.stashImage.findUnique({
        where: { id: "image-1" },
      });
      expect(image?.studioId).toBe("studio-2");
    });

    it("should inherit performers from gallery when image has none", async () => {
      // Create performer
      await prisma.stashPerformer.create({
        data: { id: "performer-1", name: "Test Performer" },
      });

      // Create gallery and link performer
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Test Gallery" },
      });
      await prisma.galleryPerformer.create({
        data: { galleryId: "gallery-1", performerId: "performer-1" },
      });

      // Create image without performers
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: "image-1" },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(imagePerformers[0].performerId).toBe("performer-1");
    });

    it("should inherit tags from gallery when image has none", async () => {
      // Create tag
      await prisma.stashTag.create({
        data: { id: "tag-1", name: "Test Tag" },
      });

      // Create gallery and link tag
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Test Gallery" },
      });
      await prisma.galleryTag.create({
        data: { galleryId: "gallery-1", tagId: "tag-1" },
      });

      // Create image without tags
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image inherited tag
      const imageTags = await prisma.imageTag.findMany({
        where: { imageId: "image-1" },
      });
      expect(imageTags).toHaveLength(1);
      expect(imageTags[0].tagId).toBe("tag-1");
    });

    it("should NOT inherit performers when image already has performers", async () => {
      // Create two performers
      await prisma.stashPerformer.createMany({
        data: [
          { id: "performer-1", name: "Gallery Performer" },
          { id: "performer-2", name: "Image Performer" },
        ],
      });

      // Create gallery with performer-1
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "Test Gallery" },
      });
      await prisma.galleryPerformer.create({
        data: { galleryId: "gallery-1", performerId: "performer-1" },
      });

      // Create image with performer-2
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image" },
      });
      await prisma.imagePerformer.create({
        data: { imageId: "image-1", performerId: "performer-2" },
      });

      // Link image to gallery
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image kept only its own performer
      const imagePerformers = await prisma.imagePerformer.findMany({
        where: { imageId: "image-1" },
      });
      expect(imagePerformers).toHaveLength(1);
      expect(imagePerformers[0].performerId).toBe("performer-2");
    });

    it("should handle image in multiple galleries (use first)", async () => {
      // Create two studios
      await prisma.stashStudio.createMany({
        data: [
          { id: "studio-1", name: "First Gallery Studio" },
          { id: "studio-2", name: "Second Gallery Studio" },
        ],
      });

      // Create two galleries
      await prisma.stashGallery.create({
        data: { id: "gallery-1", title: "First Gallery", studioId: "studio-1" },
      });
      await prisma.stashGallery.create({
        data: { id: "gallery-2", title: "Second Gallery", studioId: "studio-2" },
      });

      // Create image without studio
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Test Image" },
      });

      // Link image to both galleries (gallery-1 first)
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-1" },
      });
      await prisma.imageGallery.create({
        data: { imageId: "image-1", galleryId: "gallery-2" },
      });

      // Apply inheritance
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image got studio from first gallery
      const image = await prisma.stashImage.findUnique({
        where: { id: "image-1" },
      });
      expect(image?.studioId).toBe("studio-1");
    });

    it("should handle image not in any gallery (no inheritance)", async () => {
      // Create image without gallery
      await prisma.stashImage.create({
        data: { id: "image-1", title: "Standalone Image" },
      });

      // Apply inheritance (should not fail)
      await imageGalleryInheritanceService.applyGalleryInheritance();

      // Verify image unchanged
      const image = await prisma.stashImage.findUnique({
        where: { id: "image-1" },
      });
      expect(image?.studioId).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run ImageGalleryInheritanceService`

Expected: FAIL with "Cannot find module '../ImageGalleryInheritanceService.js'"

**Step 3: Write the service implementation**

```typescript
// server/services/ImageGalleryInheritanceService.ts
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * ImageGalleryInheritanceService
 *
 * Applies gallery metadata to images that have none.
 * Called after sync completes to denormalize gallery data for efficient filtering.
 *
 * Inheritance rules:
 * - Only copies metadata if the image field is NULL/empty
 * - Never overwrites existing image metadata
 * - Uses first gallery if image is in multiple galleries
 *
 * Fields inherited:
 * - studioId, date, photographer, details (scalar fields)
 * - performers (via ImagePerformer junction)
 * - tags (via ImageTag junction)
 */
class ImageGalleryInheritanceService {
  /**
   * Apply gallery inheritance to all images.
   * Uses SQL for efficient bulk operations.
   */
  async applyGalleryInheritance(): Promise<void> {
    const startTime = Date.now();
    logger.info("Applying gallery inheritance to images...");

    try {
      // Step 1: Inherit scalar fields (studioId, date, photographer, details)
      await this.inheritScalarFields();

      // Step 2: Inherit performers
      await this.inheritPerformers();

      // Step 3: Inherit tags
      await this.inheritTags();

      const duration = Date.now() - startTime;
      logger.info(`Gallery inheritance applied in ${duration}ms`);
    } catch (error) {
      logger.error("Failed to apply gallery inheritance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Inherit scalar fields from gallery to image where image has none.
   * Uses a single UPDATE with subquery for efficiency.
   */
  private async inheritScalarFields(): Promise<void> {
    // For each scalar field, update images that:
    // 1. Have no value for that field
    // 2. Are in a gallery that has a value

    // StudioId inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET studioId = (
        SELECT g.studioId
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId
        WHERE ig.imageId = StashImage.id
          AND g.studioId IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE studioId IS NULL
        AND deletedAt IS NULL
        AND id IN (
          SELECT ig.imageId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId
          WHERE g.studioId IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Date inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET date = (
        SELECT g.date
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId
        WHERE ig.imageId = StashImage.id
          AND g.date IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE date IS NULL
        AND deletedAt IS NULL
        AND id IN (
          SELECT ig.imageId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId
          WHERE g.date IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Photographer inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET photographer = (
        SELECT g.photographer
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId
        WHERE ig.imageId = StashImage.id
          AND g.photographer IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE photographer IS NULL
        AND deletedAt IS NULL
        AND id IN (
          SELECT ig.imageId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId
          WHERE g.photographer IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Details inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET details = (
        SELECT g.details
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId
        WHERE ig.imageId = StashImage.id
          AND g.details IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE details IS NULL
        AND deletedAt IS NULL
        AND id IN (
          SELECT ig.imageId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId
          WHERE g.details IS NOT NULL AND g.deletedAt IS NULL
        )
    `;
  }

  /**
   * Inherit performers from gallery to image where image has none.
   * Uses INSERT OR IGNORE to handle duplicates.
   */
  private async inheritPerformers(): Promise<void> {
    // Insert gallery performers for images that have no performers
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO ImagePerformer (imageId, performerId)
      SELECT DISTINCT ig.imageId, gp.performerId
      FROM ImageGallery ig
      JOIN GalleryPerformer gp ON gp.galleryId = ig.galleryId
      JOIN StashImage i ON i.id = ig.imageId
      JOIN StashGallery g ON g.id = ig.galleryId
      WHERE i.deletedAt IS NULL
        AND g.deletedAt IS NULL
        AND ig.imageId NOT IN (
          SELECT DISTINCT imageId FROM ImagePerformer
        )
    `;
  }

  /**
   * Inherit tags from gallery to image where image has none.
   * Uses INSERT OR IGNORE to handle duplicates.
   */
  private async inheritTags(): Promise<void> {
    // Insert gallery tags for images that have no tags
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO ImageTag (imageId, tagId)
      SELECT DISTINCT ig.imageId, gt.tagId
      FROM ImageGallery ig
      JOIN GalleryTag gt ON gt.galleryId = ig.galleryId
      JOIN StashImage i ON i.id = ig.imageId
      JOIN StashGallery g ON g.id = ig.galleryId
      WHERE i.deletedAt IS NULL
        AND g.deletedAt IS NULL
        AND ig.imageId NOT IN (
          SELECT DISTINCT imageId FROM ImageTag
        )
    `;
  }
}

export const imageGalleryInheritanceService = new ImageGalleryInheritanceService();
```

**Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run ImageGalleryInheritanceService`

Expected: PASS

**Step 5: Commit**

```bash
git add server/services/ImageGalleryInheritanceService.ts server/services/__tests__/ImageGalleryInheritanceService.test.ts
git commit -m "feat: add ImageGalleryInheritanceService

Denormalizes gallery metadata (studio, date, photographer, details,
performers, tags) to images at sync time. Uses efficient SQL bulk
operations matching EntityImageCountService pattern."
```

---

## Task 2: Integrate with StashSyncService

Wire up the inheritance service to run after image sync completes.

**Files:**
- Modify: `server/services/StashSyncService.ts`

**Step 1: Add import for the new service**

At the top of `server/services/StashSyncService.ts`, add the import alongside other service imports:

```typescript
import { imageGalleryInheritanceService } from "./ImageGalleryInheritanceService.js";
```

**Step 2: Call inheritance after image sync in fullSync**

In the `fullSync` method, after images are synced (around line 217), add the inheritance call before `rebuildAllImageCounts`:

Find this section:
```typescript
      result = await this.syncImages(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);
      // Rebuild user stats to reflect current entity relationships
      // Rebuild inherited image counts (must happen after images and galleries are synced)
      logger.info("Rebuilding inherited image counts...");
```

Change to:
```typescript
      result = await this.syncImages(stashInstanceId, true);
      results.push(result);
      await this.saveSyncState(stashInstanceId, "full", result);

      // Apply gallery inheritance to images (must happen after images and galleries are synced)
      logger.info("Applying gallery inheritance to images...");
      await imageGalleryInheritanceService.applyGalleryInheritance();
      logger.info("Gallery inheritance complete");

      // Rebuild inherited image counts (must happen after gallery inheritance)
      logger.info("Rebuilding inherited image counts...");
```

**Step 3: Call inheritance after incremental sync**

Find the `smartIncrementalSync` method (around line 256). After the sync loop completes and before stats rebuild, add inheritance.

Find this section (around line 340):
```typescript
      // Rebuild stats after sync
      if (results.some((r) => r.synced > 0)) {
```

Add before it:
```typescript
      // Apply gallery inheritance if images were synced
      const imageResult = results.find((r) => r.entityType === "image");
      if (imageResult && imageResult.synced > 0) {
        logger.info("Applying gallery inheritance after incremental sync...");
        await imageGalleryInheritanceService.applyGalleryInheritance();
        logger.info("Gallery inheritance complete");
      }

```

**Step 4: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`

Expected: No errors

**Step 5: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "feat: integrate gallery inheritance into sync pipeline

Calls ImageGalleryInheritanceService.applyGalleryInheritance() after
image sync completes, both in full sync and incremental sync.
Runs before image count rebuild to ensure accurate counts."
```

---

## Task 3: Manual Testing

Verify the feature works end-to-end.

**Step 1: Start the development server**

Run: `cd server && npm run dev`

**Step 2: Create test data in Stash**

1. In Stash, create a Gallery with:
   - Title: "Test Gallery"
   - Date: Any date
   - Studio: Create or select one
   - Photographer: "Test Photographer"
   - Details: "Gallery description"
   - Add 2-3 performers
   - Add 2-3 tags

2. Add 2-3 images to the Gallery (images should have no metadata)

**Step 3: Run sync in Peek**

1. Go to Peek Admin → Sync
2. Run a full sync or incremental sync
3. Check server logs for:
   - "Applying gallery inheritance to images..."
   - "Gallery inheritance applied in Xms"

**Step 4: Verify inheritance worked**

1. Go to Library → Images
2. Find the images from the test gallery
3. Verify each image shows:
   - The gallery's studio
   - The gallery's date
   - The gallery's performers
   - The gallery's tags

**Step 5: Verify filtering works**

1. Filter images by the gallery's performer
2. Verify inherited images appear in results
3. Filter images by the gallery's tag
4. Verify inherited images appear in results

**Step 6: Verify no-overwrite behavior**

1. In Stash, add a direct performer to one of the gallery images
2. Run sync
3. Verify that image kept its own performer (not replaced with gallery's)

---

## Task 4: Run Full Test Suite

Ensure no regressions in existing tests.

**Step 1: Run all tests**

Run: `cd server && npm test`

Expected: All tests pass

**Step 2: Run linting**

Run: `cd server && npm run lint`

Expected: No errors

**Step 3: Commit any fixes if needed**

If tests or lint fail, fix and commit.

---

## Task Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Create ImageGalleryInheritanceService | `server/services/ImageGalleryInheritanceService.ts`, `server/services/__tests__/ImageGalleryInheritanceService.test.ts` |
| 2 | Integrate with StashSyncService | `server/services/StashSyncService.ts` |
| 3 | Manual testing | (verification only) |
| 4 | Run full test suite | (verification only) |

**Total commits:** 2-3 focused commits
