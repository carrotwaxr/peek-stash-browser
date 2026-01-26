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
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
          AND g.studioId IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE studioId IS NULL
        AND deletedAt IS NULL
        AND (id, stashInstanceId) IN (
          SELECT ig.imageId, ig.imageInstanceId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
          WHERE g.studioId IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Date inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET date = (
        SELECT g.date
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
          AND g.date IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE date IS NULL
        AND deletedAt IS NULL
        AND (id, stashInstanceId) IN (
          SELECT ig.imageId, ig.imageInstanceId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
          WHERE g.date IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Photographer inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET photographer = (
        SELECT g.photographer
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
          AND g.photographer IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE photographer IS NULL
        AND deletedAt IS NULL
        AND (id, stashInstanceId) IN (
          SELECT ig.imageId, ig.imageInstanceId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
          WHERE g.photographer IS NOT NULL AND g.deletedAt IS NULL
        )
    `;

    // Details inheritance
    await prisma.$executeRaw`
      UPDATE StashImage
      SET details = (
        SELECT g.details
        FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
          AND g.details IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )
      WHERE details IS NULL
        AND deletedAt IS NULL
        AND (id, stashInstanceId) IN (
          SELECT ig.imageId, ig.imageInstanceId
          FROM ImageGallery ig
          JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
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
    // Junction tables now have composite keys: (imageId, imageInstanceId, performerId, performerInstanceId)
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO ImagePerformer (imageId, imageInstanceId, performerId, performerInstanceId)
      SELECT DISTINCT ig.imageId, ig.imageInstanceId, gp.performerId, gp.performerInstanceId
      FROM ImageGallery ig
      JOIN GalleryPerformer gp ON gp.galleryId = ig.galleryId AND gp.galleryInstanceId = ig.galleryInstanceId
      JOIN StashImage i ON i.id = ig.imageId AND i.stashInstanceId = ig.imageInstanceId
      JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
      WHERE i.deletedAt IS NULL
        AND g.deletedAt IS NULL
        AND (ig.imageId, ig.imageInstanceId) NOT IN (
          SELECT DISTINCT imageId, imageInstanceId FROM ImagePerformer
        )
    `;
  }

  /**
   * Inherit tags from gallery to image where image has none.
   * Uses INSERT OR IGNORE to handle duplicates.
   */
  private async inheritTags(): Promise<void> {
    // Insert gallery tags for images that have no tags
    // Junction tables now have composite keys: (imageId, imageInstanceId, tagId, tagInstanceId)
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO ImageTag (imageId, imageInstanceId, tagId, tagInstanceId)
      SELECT DISTINCT ig.imageId, ig.imageInstanceId, gt.tagId, gt.tagInstanceId
      FROM ImageGallery ig
      JOIN GalleryTag gt ON gt.galleryId = ig.galleryId AND gt.galleryInstanceId = ig.galleryInstanceId
      JOIN StashImage i ON i.id = ig.imageId AND i.stashInstanceId = ig.imageInstanceId
      JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
      WHERE i.deletedAt IS NULL
        AND g.deletedAt IS NULL
        AND (ig.imageId, ig.imageInstanceId) NOT IN (
          SELECT DISTINCT imageId, imageInstanceId FROM ImageTag
        )
    `;
  }
}

export const imageGalleryInheritanceService =
  new ImageGalleryInheritanceService();
