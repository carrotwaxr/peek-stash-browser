import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import { stashEntityService } from "./StashEntityService.js";

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
 */

interface ImageWithRelations {
  id: string;
  studioId?: string | null;
  performers?: Array<{ id: string }>;
  tags?: Array<{ id: string }>;
  galleries?: Array<{
    id: string;
    studioId?: string | null;
    performers?: Array<{ id: string }>;
    tags?: Array<{ id: string }>;
  }>;
}

class EntityImageCountService {
  /**
   * Rebuild inherited image counts for all entity types.
   * Called after sync completes to ensure counts reflect gallery inheritance.
   */
  async rebuildAllImageCounts(): Promise<void> {
    const startTime = Date.now();
    logger.info("Rebuilding inherited image counts for all entities...");

    try {
      // Load all images with their relationships once
      const allImages = await stashEntityService.getAllImages();

      // Rebuild counts for each entity type in parallel
      await Promise.all([
        this.rebuildPerformerImageCounts(allImages),
        this.rebuildStudioImageCounts(allImages),
        this.rebuildTagImageCounts(allImages),
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
   * Rebuild image counts for all performers.
   * Counts images where performer is directly tagged OR tagged on a parent gallery.
   */
  async rebuildPerformerImageCounts(allImages?: ImageWithRelations[]): Promise<void> {
    const startTime = Date.now();

    // Load images if not provided
    const images = allImages ?? await stashEntityService.getAllImages();

    // Get all performer IDs
    const performers = await prisma.stashPerformer.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    if (performers.length === 0) {
      logger.debug("No performers to update image counts for");
      return;
    }

    // Calculate counts for each performer
    const counts = new Map<string, number>();

    for (const performer of performers) {
      const count = this.countImagesForPerformer(images, performer.id);
      counts.set(performer.id, count);
    }

    // Batch update all performers
    await this.batchUpdatePerformerImageCounts(counts);

    const duration = Date.now() - startTime;
    logger.debug(`Performer image counts rebuilt in ${duration}ms`, {
      performerCount: performers.length,
    });
  }

  /**
   * Rebuild image counts for all studios.
   * Counts images where studio is directly set OR set on a parent gallery.
   */
  async rebuildStudioImageCounts(allImages?: ImageWithRelations[]): Promise<void> {
    const startTime = Date.now();

    const images = allImages ?? await stashEntityService.getAllImages();

    const studios = await prisma.stashStudio.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    if (studios.length === 0) {
      logger.debug("No studios to update image counts for");
      return;
    }

    const counts = new Map<string, number>();

    for (const studio of studios) {
      const count = this.countImagesForStudio(images, studio.id);
      counts.set(studio.id, count);
    }

    await this.batchUpdateStudioImageCounts(counts);

    const duration = Date.now() - startTime;
    logger.debug(`Studio image counts rebuilt in ${duration}ms`, {
      studioCount: studios.length,
    });
  }

  /**
   * Rebuild image counts for all tags.
   * Counts images where tag is directly set OR set on a parent gallery.
   */
  async rebuildTagImageCounts(allImages?: ImageWithRelations[]): Promise<void> {
    const startTime = Date.now();

    const images = allImages ?? await stashEntityService.getAllImages();

    const tags = await prisma.stashTag.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    if (tags.length === 0) {
      logger.debug("No tags to update image counts for");
      return;
    }

    const counts = new Map<string, number>();

    for (const tag of tags) {
      const count = this.countImagesForTag(images, tag.id);
      counts.set(tag.id, count);
    }

    await this.batchUpdateTagImageCounts(counts);

    const duration = Date.now() - startTime;
    logger.debug(`Tag image counts rebuilt in ${duration}ms`, {
      tagCount: tags.length,
    });
  }

  /**
   * Count images for a performer using gallery inheritance.
   */
  private countImagesForPerformer(images: ImageWithRelations[], performerId: string): number {
    return images.filter((img) => {
      // Check direct performers
      if (img.performers?.some((p) => String(p.id) === String(performerId))) {
        return true;
      }
      // Check gallery performers (inheritance)
      if (img.galleries?.some((g) =>
        g.performers?.some((p) => String(p.id) === String(performerId))
      )) {
        return true;
      }
      return false;
    }).length;
  }

  /**
   * Count images for a studio using gallery inheritance.
   */
  private countImagesForStudio(images: ImageWithRelations[], studioId: string): number {
    return images.filter((img) => {
      // Check direct studio
      if (String(img.studioId) === String(studioId)) {
        return true;
      }
      // Check gallery studio (inheritance)
      if (img.galleries?.some((g) => String(g.studioId) === String(studioId))) {
        return true;
      }
      return false;
    }).length;
  }

  /**
   * Count images for a tag using gallery inheritance.
   */
  private countImagesForTag(images: ImageWithRelations[], tagId: string): number {
    return images.filter((img) => {
      // Check direct tags
      if (img.tags?.some((t) => String(t.id) === String(tagId))) {
        return true;
      }
      // Check gallery tags (inheritance)
      if (img.galleries?.some((g) =>
        g.tags?.some((t) => String(t.id) === String(tagId))
      )) {
        return true;
      }
      return false;
    }).length;
  }

  /**
   * Batch update performer image counts in the database.
   * Uses raw SQL for performance with large datasets.
   */
  private async batchUpdatePerformerImageCounts(counts: Map<string, number>): Promise<void> {
    if (counts.size === 0) return;

    // Build CASE statement for batch update
    const cases = Array.from(counts.entries())
      .map(([id, count]) => `WHEN '${id}' THEN ${count}`)
      .join(" ");

    const ids = Array.from(counts.keys())
      .map((id) => `'${id}'`)
      .join(", ");

    await prisma.$executeRawUnsafe(`
      UPDATE StashPerformer
      SET imageCount = CASE id ${cases} ELSE imageCount END
      WHERE id IN (${ids})
    `);
  }

  /**
   * Batch update studio image counts in the database.
   */
  private async batchUpdateStudioImageCounts(counts: Map<string, number>): Promise<void> {
    if (counts.size === 0) return;

    const cases = Array.from(counts.entries())
      .map(([id, count]) => `WHEN '${id}' THEN ${count}`)
      .join(" ");

    const ids = Array.from(counts.keys())
      .map((id) => `'${id}'`)
      .join(", ");

    await prisma.$executeRawUnsafe(`
      UPDATE StashStudio
      SET imageCount = CASE id ${cases} ELSE imageCount END
      WHERE id IN (${ids})
    `);
  }

  /**
   * Batch update tag image counts in the database.
   */
  private async batchUpdateTagImageCounts(counts: Map<string, number>): Promise<void> {
    if (counts.size === 0) return;

    const cases = Array.from(counts.entries())
      .map(([id, count]) => `WHEN '${id}' THEN ${count}`)
      .join(" ");

    const ids = Array.from(counts.keys())
      .map((id) => `'${id}'`)
      .join(", ");

    await prisma.$executeRawUnsafe(`
      UPDATE StashTag
      SET imageCount = CASE id ${cases} ELSE imageCount END
      WHERE id IN (${ids})
    `);
  }
}

export const entityImageCountService = new EntityImageCountService();
