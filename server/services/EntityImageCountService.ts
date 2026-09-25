import prisma from "../prisma/singleton.js";
import { dbWrite } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { type EntityRef, distinctRefs, pairsJson } from "./SyncChangeSet.js";

/** The entities whose imageCount includes gallery inheritance. */
type CountedType = "performer" | "studio" | "tag";

/**
 * The performers, studios and tags whose inherited image counts a sync's
 * changes reach (`StashSyncService.imageCountScope`).
 */
export interface ImageCountScope {
  performers: readonly EntityRef[];
  studios: readonly EntityRef[];
  tags: readonly EntityRef[];
}

/**
 * Per type: its table, and the SELECT of the live images it counts, direct
 * and through a live gallery. Both arms are correlated with the row being
 * counted, so each searches the junction's index by that row's key and a
 * count costs as much as the entity's images. (A count over a UNION of every
 * pair, filtered by the row afterwards, recomputes the UNION per row once
 * the rows are scoped: 0.68 s for 3 performers on the prod copy.) The
 * direct studio arm and the gallery's studio keep `+` on the instance
 * column, so the planner stays on the `studioId` index.
 */
const COUNTED: Record<
  CountedType,
  { table: string; label: string; images: string }
> = {
  performer: {
    table: "StashPerformer",
    label: "imageCounts.performers",
    images: `
          -- Direct: image has performer directly
          SELECT ip.imageId FROM ImagePerformer ip
          JOIN StashImage si ON si.id = ip.imageId AND si.stashInstanceId = ip.imageInstanceId AND si.deletedAt IS NULL
          WHERE ip.performerId = StashPerformer.id AND ip.performerInstanceId = StashPerformer.stashInstanceId

          UNION

          -- Inherited: image is in gallery that has performer
          SELECT ig.imageId FROM GalleryPerformer gp
          JOIN StashGallery sg ON sg.id = gp.galleryId AND sg.stashInstanceId = gp.galleryInstanceId AND sg.deletedAt IS NULL
          JOIN ImageGallery ig ON ig.galleryId = gp.galleryId AND ig.galleryInstanceId = gp.galleryInstanceId
          JOIN StashImage si ON si.id = ig.imageId AND si.stashInstanceId = ig.imageInstanceId AND si.deletedAt IS NULL
          WHERE gp.performerId = StashPerformer.id AND gp.performerInstanceId = StashPerformer.stashInstanceId`,
  },
  studio: {
    table: "StashStudio",
    label: "imageCounts.studios",
    images: `
          -- Direct: image has studio directly (on the image's own instance)
          SELECT si.id FROM StashImage si
          WHERE si.studioId = StashStudio.id AND +si.stashInstanceId = StashStudio.stashInstanceId AND si.deletedAt IS NULL

          UNION

          -- Inherited: image is in gallery that has studio
          SELECT ig.imageId FROM StashGallery sg
          JOIN ImageGallery ig ON ig.galleryId = sg.id AND ig.galleryInstanceId = sg.stashInstanceId
          JOIN StashImage si ON si.id = ig.imageId AND si.stashInstanceId = ig.imageInstanceId AND si.deletedAt IS NULL
          WHERE sg.studioId = StashStudio.id AND +sg.stashInstanceId = StashStudio.stashInstanceId AND sg.deletedAt IS NULL`,
  },
  tag: {
    table: "StashTag",
    label: "imageCounts.tags",
    images: `
          -- Direct: image has tag directly
          SELECT it.imageId FROM ImageTag it
          JOIN StashImage si ON si.id = it.imageId AND si.stashInstanceId = it.imageInstanceId AND si.deletedAt IS NULL
          WHERE it.tagId = StashTag.id AND it.tagInstanceId = StashTag.stashInstanceId

          UNION

          -- Inherited: image is in gallery that has tag
          SELECT ig.imageId FROM GalleryTag gt
          JOIN StashGallery sg ON sg.id = gt.galleryId AND sg.stashInstanceId = gt.galleryInstanceId AND sg.deletedAt IS NULL
          JOIN ImageGallery ig ON ig.galleryId = gt.galleryId AND ig.galleryInstanceId = gt.galleryInstanceId
          JOIN StashImage si ON si.id = ig.imageId AND si.stashInstanceId = ig.imageInstanceId AND si.deletedAt IS NULL
          WHERE gt.tagId = StashTag.id AND gt.tagInstanceId = StashTag.stashInstanceId`,
  },
};

/**
 * The count UPDATE of a type, for every live row or, scoped, for the rows
 * bound as one JSON parameter of [id, instanceId] pairs. The scope is a
 * single-column `rowid IN (...)`, which SQLite builds once and probes by
 * rowid, so only those rows are counted (a row-value
 * `(id, stashInstanceId) IN (...)` is the form that scanned for minutes in
 * gallery inheritance). The UNION counts an image once however it links;
 * every image an entity links to is on that entity's instance.
 */
export function imageCountSql(type: CountedType, scoped: boolean): string {
  const { table, images } = COUNTED[type];
  const scope = scoped
    ? `
        AND ${table}.rowid IN (
          SELECT x.rowid FROM json_each(?) j
          CROSS JOIN ${table} x ON x.id = json_extract(j.value, '$[0]') AND x.stashInstanceId = json_extract(j.value, '$[1]')
        )`
    : "";
  return `
      UPDATE ${table}
      SET imageCount = (
        SELECT COUNT(*) FROM (${images}
        )
      )
      WHERE ${table}.deletedAt IS NULL${scope}
    `;
}

/**
 * What an image's or a gallery's links count toward, from the rows bound as
 * one JSON parameter of [id, instanceId] pairs (bound once per part). Each
 * part drives from the pairs through the table's index on the near side.
 */
const LINKS_OF = {
  image: [
    `SELECT 'performer' AS kind, l.performerId AS id, l.performerInstanceId AS instanceId
     FROM json_each(?) j
     CROSS JOIN ImagePerformer l ON l.imageId = json_extract(j.value, '$[0]') AND l.imageInstanceId = json_extract(j.value, '$[1]')`,
    `SELECT 'tag', l.tagId, l.tagInstanceId
     FROM json_each(?) j
     CROSS JOIN ImageTag l ON l.imageId = json_extract(j.value, '$[0]') AND l.imageInstanceId = json_extract(j.value, '$[1]')`,
    `SELECT 'studio', i.studioId, i.stashInstanceId
     FROM json_each(?) j
     CROSS JOIN StashImage i ON i.id = json_extract(j.value, '$[0]') AND i.stashInstanceId = json_extract(j.value, '$[1]')
     WHERE i.studioId IS NOT NULL`,
    `SELECT 'gallery', l.galleryId, l.galleryInstanceId
     FROM json_each(?) j
     CROSS JOIN ImageGallery l ON l.imageId = json_extract(j.value, '$[0]') AND l.imageInstanceId = json_extract(j.value, '$[1]')`,
  ].join("\nUNION\n"),
  gallery: [
    `SELECT 'performer' AS kind, l.performerId AS id, l.performerInstanceId AS instanceId
     FROM json_each(?) j
     CROSS JOIN GalleryPerformer l ON l.galleryId = json_extract(j.value, '$[0]') AND l.galleryInstanceId = json_extract(j.value, '$[1]')`,
    `SELECT 'tag', l.tagId, l.tagInstanceId
     FROM json_each(?) j
     CROSS JOIN GalleryTag l ON l.galleryId = json_extract(j.value, '$[0]') AND l.galleryInstanceId = json_extract(j.value, '$[1]')`,
    `SELECT 'studio', g.studioId, g.stashInstanceId
     FROM json_each(?) j
     CROSS JOIN StashGallery g ON g.id = json_extract(j.value, '$[0]') AND g.stashInstanceId = json_extract(j.value, '$[1]')
     WHERE g.studioId IS NOT NULL`,
  ].join("\nUNION\n"),
} as const;

const PARTS = { image: 4, gallery: 3 } as const;

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
 * A full sync recounts every entity; an incremental sync recounts only the
 * ones its changes reach (`ImageCountScope`). Sync writes a new entity with
 * Stash's direct count and never overwrites the stored count on update.
 *
 * PERFORMANCE: Uses SQL aggregation instead of loading all images into memory.
 * This scales to millions of images without memory issues.
 */
class EntityImageCountService {
  /**
   * Rebuild inherited image counts, for every live performer, studio and
   * tag ("all", after a full sync) or for the ones in `scope`. Runs after
   * gallery inheritance.
   */
  async rebuildAllImageCounts(
    scope: ImageCountScope | "all" = "all"
  ): Promise<void> {
    const startTime = Date.now();
    logger.info(
      scope === "all"
        ? "Rebuilding inherited image counts for all entities..."
        : `Rebuilding inherited image counts for ${scope.performers.length} performers, ${scope.studios.length} studios and ${scope.tags.length} tags...`
    );

    try {
      // SQLite has one writer, so one type after the other
      await this.rebuildPerformerImageCountsSQL(
        scope === "all" ? "all" : scope.performers
      );
      await this.rebuildStudioImageCountsSQL(
        scope === "all" ? "all" : scope.studios
      );
      await this.rebuildTagImageCountsSQL(scope === "all" ? "all" : scope.tags);

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
   * The performers, studios and tags whose counts include these images or
   * galleries, as stored: an image's own performers, tags and studio, and
   * those of its galleries; a gallery's performers, tags and studio. Sync
   * reads them for what it soft-deleted and for the galleries an image
   * joined or left, whose links the change set does not hold.
   */
  async countedThrough({
    images,
    galleries,
  }: {
    images: readonly EntityRef[];
    galleries: readonly EntityRef[];
  }): Promise<ImageCountScope> {
    const found: Record<CountedType | "gallery", EntityRef[]> = {
      performer: [],
      studio: [],
      tag: [],
      gallery: [...galleries],
    };
    const read = async (source: "image" | "gallery", refs: EntityRef[]) => {
      if (refs.length === 0) return;
      const json = pairsJson(refs);
      const rows = await prisma.$queryRawUnsafe<
        Array<{ kind: CountedType | "gallery"; id: string; instanceId: string }>
      >(LINKS_OF[source], ...Array<string>(PARTS[source]).fill(json));
      for (const { kind, id, instanceId } of rows) {
        found[kind].push({ id, instanceId });
      }
    };

    await read("image", distinctRefs(images));
    // The galleries given, and the images' own
    await read("gallery", distinctRefs(found.gallery));
    return {
      performers: distinctRefs(found.performer),
      studios: distinctRefs(found.studio),
      tags: distinctRefs(found.tag),
    };
  }

  /**
   * Rebuild image counts for performers using SQL aggregation.
   * Counts images where performer is directly tagged OR tagged on a parent gallery.
   *
   * Uses UNION to combine:
   * 1. Direct: ImagePerformer joins
   * 2. Inherited: ImageGallery -> GalleryPerformer joins
   */
  private async rebuildPerformerImageCountsSQL(
    refs: readonly EntityRef[] | "all" = "all"
  ): Promise<void> {
    await this.rebuild("performer", refs);
  }

  /**
   * Rebuild image counts for studios using SQL aggregation.
   * Counts images where studio is directly set OR set on a parent gallery.
   */
  private async rebuildStudioImageCountsSQL(
    refs: readonly EntityRef[] | "all" = "all"
  ): Promise<void> {
    await this.rebuild("studio", refs);
  }

  /**
   * Rebuild image counts for tags using SQL aggregation.
   * Counts images where tag is directly set OR set on a parent gallery.
   */
  private async rebuildTagImageCountsSQL(
    refs: readonly EntityRef[] | "all" = "all"
  ): Promise<void> {
    await this.rebuild("tag", refs);
  }

  /** One type's UPDATE, one dbWrite unit; an empty scope writes nothing. */
  private async rebuild(
    type: CountedType,
    refs: readonly EntityRef[] | "all"
  ): Promise<void> {
    if (refs !== "all" && refs.length === 0) return;
    const startTime = Date.now();
    const { label } = COUNTED[type];
    await dbWrite(label, () =>
      refs === "all"
        ? prisma.$executeRawUnsafe(imageCountSql(type, false))
        : prisma.$executeRawUnsafe(
            imageCountSql(type, true),
            pairsJson(distinctRefs(refs))
          )
    );
    logger.debug(
      `${type} image counts rebuilt via SQL in ${Date.now() - startTime}ms${refs === "all" ? "" : ` for ${refs.length} refs`}`
    );
  }
}

export const entityImageCountService = new EntityImageCountService();
