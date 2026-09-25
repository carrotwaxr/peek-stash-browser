import prisma from "../prisma/singleton.js";
import { dbWrite } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";
import { type EntityRef, distinctRefs, pairsJson } from "./SyncChangeSet.js";

/** Images per scoped pass: one dbWrite unit per statement. */
const SCOPE_CHUNK = 5000;

/**
 * The images a scoped statement covers, bound as one JSON parameter of
 * [id, instanceId] pairs: `CROSS JOIN` keeps `json_each` as the outer loop,
 * so each pair searches the table's primary key.
 */
const scopedImageGalleries = `json_each(?) j
  CROSS JOIN ImageGallery ig ON ig.imageId = json_extract(j.value, '$[0]') AND ig.imageInstanceId = json_extract(j.value, '$[1]')`;
const scopedImageRowids = `SELECT x.rowid FROM json_each(?) j
          CROSS JOIN StashImage x ON x.id = json_extract(j.value, '$[0]') AND x.stashInstanceId = json_extract(j.value, '$[1]')`;

/**
 * A gallery's live performers or tags for every live image in a live
 * gallery that has none of its own, for every image or only the scoped
 * ones. A soft-deleted performer or tag (Stash deleted or merged it) is not
 * handed down; the gallery's link to it goes when the gallery is fetched
 * again. "Has none" is a correlated NOT EXISTS, which looks up each image's
 * rows in the junction's (imageId, imageInstanceId) index; a row-value NOT
 * IN over the junction scanned it whole as a list, and the two inserts held
 * the write lock for 50 to 90 s each on a 260k-image library.
 */
function inheritLinksSql(
  link: {
    junction: string;
    source: string;
    far: string;
    id: string;
    instance: string;
  },
  scoped: boolean
): string {
  const { junction, source, far, id, instance } = link;
  return `
  INSERT OR IGNORE INTO ${junction} (imageId, imageInstanceId, ${id}, ${instance})
  SELECT DISTINCT ig.imageId, ig.imageInstanceId, gl.${id}, gl.${instance}
  FROM ${scoped ? scopedImageGalleries : "ImageGallery ig"}
  JOIN ${source} gl ON gl.galleryId = ig.galleryId AND gl.galleryInstanceId = ig.galleryInstanceId
  JOIN ${far} f ON f.id = gl.${id} AND f.stashInstanceId = gl.${instance}
  JOIN StashImage i ON i.id = ig.imageId AND i.stashInstanceId = ig.imageInstanceId
  JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
  WHERE i.deletedAt IS NULL
    AND g.deletedAt IS NULL
    AND f.deletedAt IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM ${junction} x
      WHERE x.imageId = ig.imageId AND x.imageInstanceId = ig.imageInstanceId
    )
`;
}

const PERFORMERS = {
  junction: "ImagePerformer",
  source: "GalleryPerformer",
  far: "StashPerformer",
  id: "performerId",
  instance: "performerInstanceId",
};
const TAGS = {
  junction: "ImageTag",
  source: "GalleryTag",
  far: "StashTag",
  id: "tagId",
  instance: "tagInstanceId",
};

/** Gallery performers for every image that has none (whole library). */
export const INHERIT_PERFORMERS_SQL = inheritLinksSql(PERFORMERS, false);
/** Gallery tags for every image that has none (whole library). */
export const INHERIT_TAGS_SQL = inheritLinksSql(TAGS, false);
/** The same for the scoped images only. */
export const INHERIT_PERFORMERS_SCOPED_SQL = inheritLinksSql(PERFORMERS, true);
export const INHERIT_TAGS_SCOPED_SQL = inheritLinksSql(TAGS, true);

/** The scalar fields an image takes from its first gallery that has one. */
const SCALAR_FIELDS = [
  { column: "studioId", label: "galleryInheritance.studio" },
  { column: "date", label: "galleryInheritance.date" },
  { column: "photographer", label: "galleryInheritance.photographer" },
  { column: "details", label: "galleryInheritance.details" },
] as const;

type ScalarColumn = (typeof SCALAR_FIELDS)[number]["column"];

/**
 * One scalar field for every live image that has none and is in a live
 * gallery that has one, from its first such gallery; for every image or
 * only the scoped ones. The whole-library form finds those images with one
 * list of the galleries' images; the scoped form probes the scoped images
 * by rowid and checks each one's galleries through the junction's index.
 * An inherited studio takes the image's own instance, as the gallery's
 * studio is on the gallery's (and so the image's) Stash.
 */
export function inheritScalarSql(
  column: ScalarColumn,
  scoped: boolean
): string {
  const galleryWithValue = `FROM ImageGallery ig
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId`;
  const filter = scoped
    ? `rowid IN (
          ${scopedImageRowids}
        )
        AND EXISTS (
          SELECT 1
          ${galleryWithValue}
          WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
            AND g.${column} IS NOT NULL AND g.deletedAt IS NULL
        )`
    : `(id, stashInstanceId) IN (
          SELECT ig.imageId, ig.imageInstanceId
          ${galleryWithValue}
          WHERE g.${column} IS NOT NULL AND g.deletedAt IS NULL
        )`;
  return `
      UPDATE StashImage
      SET ${column} = (
        SELECT g.${column}
        ${galleryWithValue}
        WHERE ig.imageId = StashImage.id AND ig.imageInstanceId = StashImage.stashInstanceId
          AND g.${column} IS NOT NULL
          AND g.deletedAt IS NULL
        ORDER BY ig.galleryId
        LIMIT 1
      )${column === "studioId" ? ",\n      studioInstanceId = StashImage.stashInstanceId" : ""}
      WHERE ${column} IS NULL
        AND deletedAt IS NULL
        AND ${filter}
    `;
}

const STATEMENTS = {
  all: {
    scalars: SCALAR_FIELDS.map(({ column, label }) => ({
      label,
      sql: inheritScalarSql(column, false),
    })),
    performers: INHERIT_PERFORMERS_SQL,
    tags: INHERIT_TAGS_SQL,
  },
  scoped: {
    scalars: SCALAR_FIELDS.map(({ column, label }) => ({
      label,
      sql: inheritScalarSql(column, true),
    })),
    performers: INHERIT_PERFORMERS_SCOPED_SQL,
    tags: INHERIT_TAGS_SCOPED_SQL,
  },
};

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
 *
 * A full sync applies it to every image; an incremental sync to the images
 * it wrote (their rows were rewritten from Stash, dropping what they had
 * inherited) and those of the galleries that changed.
 */
class ImageGalleryInheritanceService {
  /**
   * Apply gallery inheritance to every image ("all") or to the images in
   * `scope` (unknown and soft-deleted ones are skipped), 5,000 at a time.
   */
  async applyGalleryInheritance(
    scope: readonly EntityRef[] | "all" = "all"
  ): Promise<void> {
    const startTime = Date.now();
    const images = scope === "all" ? "all" : distinctRefs(scope);
    logger.info(
      images === "all"
        ? "Applying gallery inheritance to images..."
        : `Applying gallery inheritance to ${images.length} images...`
    );

    try {
      if (images === "all") {
        await this.apply(STATEMENTS.all, []);
      } else {
        for (let i = 0; i < images.length; i += SCOPE_CHUNK) {
          await this.apply(STATEMENTS.scoped, [
            pairsJson(images.slice(i, i + SCOPE_CHUNK)),
          ]);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Gallery inheritance applied in ${duration}ms`);
    } catch (error) {
      logger.error("Failed to apply gallery inheritance", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /** The images of these galleries, live or not. */
  async imagesInGalleries(
    galleries: readonly EntityRef[]
  ): Promise<EntityRef[]> {
    if (galleries.length === 0) return [];
    return prisma.$queryRawUnsafe<EntityRef[]>(
      `SELECT DISTINCT ig.imageId AS id, ig.imageInstanceId AS instanceId
FROM json_each(?) j
CROSS JOIN ImageGallery ig ON ig.galleryId = json_extract(j.value, '$[0]') AND ig.galleryInstanceId = json_extract(j.value, '$[1]')`,
      pairsJson(distinctRefs(galleries))
    );
  }

  /**
   * The scalar fields (studioId, date, photographer, details), then the
   * performers and tags, each statement one dbWrite unit.
   */
  private async apply(
    statements: (typeof STATEMENTS)["all"],
    params: string[]
  ): Promise<void> {
    for (const { label, sql } of statements.scalars) {
      await dbWrite(label, () => prisma.$executeRawUnsafe(sql, ...params));
    }
    await dbWrite("galleryInheritance.performers", () =>
      prisma.$executeRawUnsafe(statements.performers, ...params)
    );
    await dbWrite("galleryInheritance.tags", () =>
      prisma.$executeRawUnsafe(statements.tags, ...params)
    );
  }
}

export const imageGalleryInheritanceService =
  new ImageGalleryInheritanceService();
