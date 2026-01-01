import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * EntityImageCountService
 *
 * Calculates and stores inherited image counts for performers, studios, and tags.
 *
 * Image Inheritance Logic:
 * - Images can be "loose" (standalone) or inside galleries
 * - Images inside galleries inherit metadata from their parent gallery
 * - An image counts toward a performer/studio/tag if:
 *   1. The entity is directly associated with the image, OR
 *   2. The entity is associated with a gallery containing the image
 *
 * This service recalculates these counts after sync and stores them in the database
 * for fast retrieval on detail pages.
 *
 * PERFORMANCE: Uses SQL aggregation instead of loading all images into memory.
 * This scales to millions of images without memory issues.
 */

class EntityImageCountService {
  /**
   * Rebuild inherited image counts for all entity types.
   * Called after sync completes to ensure counts reflect gallery inheritance.
   *
   * Uses SQL UNION queries to count images efficiently without loading them into memory.
   */
  async rebuildAllImageCounts(): Promise<void> {
    const startTime = Date.now();
    logger.info("Rebuilding inherited image counts for all entities...");

    try {
      // Rebuild counts for each entity type in parallel using SQL aggregation
      await Promise.all([
        this.rebuildPerformerImageCountsSQL(),
        this.rebuildStudioImageCountsSQL(),
        this.rebuildTagImageCountsSQL(),
      ]);

      const duration = Date.now() - startTime;
      logger.info(`Inherited image counts rebuilt in ${duration}ms`);
    } catch (error) {
      logger.error("Failed to rebuild inherited image counts", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Rebuild image counts for all performers using SQL aggregation.
   * Counts images where performer is directly tagged OR tagged on a parent gallery.
   *
   * Uses UNION to combine:
   * 1. Direct: ImagePerformer joins
   * 2. Inherited: ImageGallery -> GalleryPerformer joins
   */
  private async rebuildPerformerImageCountsSQL(): Promise<void> {
    const startTime = Date.now();

    // Single SQL query that:
    // 1. Finds all distinct (imageId, performerId) pairs from direct + inherited relations
    // 2. Groups by performerId to get counts
    // 3. Updates all performers in one batch
    await prisma.$executeRaw`
      UPDATE StashPerformer
      SET imageCount = COALESCE((
        SELECT COUNT(DISTINCT imageId) FROM (
          -- Direct: image has performer directly
          SELECT ip.imageId, ip.performerId
          FROM ImagePerformer ip
          JOIN StashImage si ON ip.imageId = si.id AND si.deletedAt IS NULL

          UNION

          -- Inherited: image is in gallery that has performer
          SELECT ig.imageId, gp.performerId
          FROM ImageGallery ig
          JOIN StashImage si ON ig.imageId = si.id AND si.deletedAt IS NULL
          JOIN StashGallery sg ON ig.galleryId = sg.id AND sg.deletedAt IS NULL
          JOIN GalleryPerformer gp ON ig.galleryId = gp.galleryId
        ) AS combined
        WHERE combined.performerId = StashPerformer.id
      ), 0)
      WHERE StashPerformer.deletedAt IS NULL
    `;

    const duration = Date.now() - startTime;
    logger.debug(`Performer image counts rebuilt via SQL in ${duration}ms`);
  }

  /**
   * Rebuild image counts for all studios using SQL aggregation.
   * Counts images where studio is directly set OR set on a parent gallery.
   */
  private async rebuildStudioImageCountsSQL(): Promise<void> {
    const startTime = Date.now();

    await prisma.$executeRaw`
      UPDATE StashStudio
      SET imageCount = COALESCE((
        SELECT COUNT(DISTINCT imageId) FROM (
          -- Direct: image has studio directly
          SELECT si.id AS imageId, si.studioId
          FROM StashImage si
          WHERE si.deletedAt IS NULL AND si.studioId IS NOT NULL

          UNION

          -- Inherited: image is in gallery that has studio
          SELECT ig.imageId, sg.studioId
          FROM ImageGallery ig
          JOIN StashImage si ON ig.imageId = si.id AND si.deletedAt IS NULL
          JOIN StashGallery sg ON ig.galleryId = sg.id AND sg.deletedAt IS NULL AND sg.studioId IS NOT NULL
        ) AS combined
        WHERE combined.studioId = StashStudio.id
      ), 0)
      WHERE StashStudio.deletedAt IS NULL
    `;

    const duration = Date.now() - startTime;
    logger.debug(`Studio image counts rebuilt via SQL in ${duration}ms`);
  }

  /**
   * Rebuild image counts for all tags using SQL aggregation.
   * Counts images where tag is directly set OR set on a parent gallery.
   */
  private async rebuildTagImageCountsSQL(): Promise<void> {
    const startTime = Date.now();

    await prisma.$executeRaw`
      UPDATE StashTag
      SET imageCount = COALESCE((
        SELECT COUNT(DISTINCT imageId) FROM (
          -- Direct: image has tag directly
          SELECT it.imageId, it.tagId
          FROM ImageTag it
          JOIN StashImage si ON it.imageId = si.id AND si.deletedAt IS NULL

          UNION

          -- Inherited: image is in gallery that has tag
          SELECT ig.imageId, gt.tagId
          FROM ImageGallery ig
          JOIN StashImage si ON ig.imageId = si.id AND si.deletedAt IS NULL
          JOIN StashGallery sg ON ig.galleryId = sg.id AND sg.deletedAt IS NULL
          JOIN GalleryTag gt ON ig.galleryId = gt.galleryId
        ) AS combined
        WHERE combined.tagId = StashTag.id
      ), 0)
      WHERE StashTag.deletedAt IS NULL
    `;

    const duration = Date.now() - startTime;
    logger.debug(`Tag image counts rebuilt via SQL in ${duration}ms`);
  }

  // ============================================================================
  // Legacy methods kept for backwards compatibility / individual entity updates
  // These use the old approach but are only called for single-entity updates
  // ============================================================================

  /**
   * Rebuild image counts for all performers (legacy method).
   * @deprecated Use rebuildPerformerImageCountsSQL for bulk operations
   */
  async rebuildPerformerImageCounts(): Promise<void> {
    return this.rebuildPerformerImageCountsSQL();
  }

  /**
   * Rebuild image counts for all studios (legacy method).
   * @deprecated Use rebuildStudioImageCountsSQL for bulk operations
   */
  async rebuildStudioImageCounts(): Promise<void> {
    return this.rebuildStudioImageCountsSQL();
  }

  /**
   * Rebuild image counts for all tags (legacy method).
   * @deprecated Use rebuildTagImageCountsSQL for bulk operations
   */
  async rebuildTagImageCounts(): Promise<void> {
    return this.rebuildTagImageCountsSQL();
  }
}

export const entityImageCountService = new EntityImageCountService();
