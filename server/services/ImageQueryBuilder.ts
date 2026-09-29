/**
 * ImageQueryBuilder: the image list in SQL.
 *
 * The image builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the image's spec (table, the viewer's rating and view joins,
 * columns, the id tiebreak), its filter clauses from the parsed request, its
 * sort map, its row transform and its relations. The instance filters, the
 * exclusion join, the `ids` filter, the random sort and the count are the
 * base's.
 *
 * Rating and O count are the viewer's own (ImageRating, ImageViewHistory),
 * never Stash's, for filtering, sorting and the row alike (QUERIES-17). Each
 * image's performers, tags, galleries and studio are loaded by its
 * (id, instance), one statement per relation for the page.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type {
  GalleryRef,
  ImageListItem,
  PerformerRef,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  ImageGalleryQueryRow,
  ImagePerformerQueryRow,
  ImageQueryRow,
  ImageStudioQueryRow,
  ImageTagQueryRow,
} from "../types/internal/queryRows.js";
import type { ParsedFilter, RefCriterion } from "../types/parsedFilters.js";
import {
  type EntityRef,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../utils/entityRef.js";
import { expandStudioIds, expandTagIds } from "../utils/hierarchyUtils.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  allOf,
  buildDateFilter,
  buildFavoriteFilter,
  buildNumericFilter,
  refClause,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  likeContains,
  parseJsonArray,
} from "../utils/sqlHelpers.js";
import { getImageFallbackTitle } from "../utils/titleUtils.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type QueryContext,
  type SortExpr,
  expandRefs,
} from "./query/EntityQueryBuilder.js";

// Column list for SELECT - the StashImage fields the list shows, plus the
// viewer's rating (r) and views (v)
const SELECT_COLUMNS = `
    i.id, i.stashInstanceId, i.title, i.code, i.details, i.photographer, i.urls, i.date,
    i.studioId, i.organized, i.filePath, i.width, i.height, i.fileSize,
    i.pathThumbnail, i.pathPreview, i.pathImage,
    i.stashCreatedAt, i.stashUpdatedAt,
    r.rating AS userRating, r.favorite AS userFavorite,
    v.viewCount AS userViewCount, v.oCount AS userOCount,
    v.lastViewedAt AS userLastViewedAt
  `.trim();

/**
 * The file name from the path: '/images/My Image.jpg' -> 'My Image.jpg',
 * as `getImageFallbackTitle` shows it (with the extension here)
 */
const FILE_NAME = `REPLACE(i.filePath, RTRIM(i.filePath, REPLACE(i.filePath, '/', '')), '')`;

/** The viewer's rating and O count; none is 0 */
const USER_RATING = "COALESCE(r.rating, 0)";
const USER_O_COUNT = "COALESCE(v.oCount, 0)";

const IMAGE_SPEC: EntitySpec = {
  table: "StashImage",
  alias: "i",
  entityType: "image",
  userJoins: [
    { table: "ImageRating", alias: "r", entityIdCol: "imageId" },
    { table: "ImageViewHistory", alias: "v", entityIdCol: "imageId" },
  ],
  selectColumns: () => ({ sql: SELECT_COLUMNS, params: [] }),
  defaultSort: "created_at",
  tiebreak: (direction) => `i.id ${direction}`,
};

/** An image's studio, on the image's own row */
const IMAGE_STUDIO: ColumnTarget = {
  kind: "column",
  parentTable: "StashImage",
  parentAlias: "i",
  idCol: "studioId",
  instanceCol: "stashInstanceId",
};

/** A junction from the image to one of its relations */
function imageJunction(
  table: string,
  alias: string,
  ref: "tag" | "performer" | "gallery"
): JunctionTarget {
  return {
    kind: "junction",
    table,
    alias,
    parentAlias: "i",
    parentIdCol: "imageId",
    parentInstanceCol: "imageInstanceId",
    refIdCol: `${ref}Id`,
    refInstanceCol: `${ref}InstanceId`,
  };
}

const IMAGE_TAGS = imageJunction("ImageTag", "it", "tag");
const IMAGE_PERFORMERS = imageJunction("ImagePerformer", "ip", "performer");
const IMAGE_GALLERIES = imageJunction("ImageGallery", "ig", "gallery");

/** The page's images, from the one JSON parameter of [id, instance] pairs */
const PAGE = `WITH page(pid, pinst) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
)`;

/**
 * Builds and executes SQL queries for image filtering
 */
class ImageQueryBuilder extends EntityQueryBuilder<
  ImageQueryRow,
  ImageListItem,
  "image"
> {
  protected readonly spec = IMAGE_SPEC;

  protected sortMap(dir: SortDirection): Record<string, SortExpr> {
    const column = (sql: string): SortExpr => ({
      sql: `${sql} ${dir}`,
      params: [],
    });
    return {
      // The displayed title: the title, else the file name
      title: column(
        `COALESCE(NULLIF(i.title, ''), ${FILE_NAME}) COLLATE NOCASE`
      ),
      date: column("i.date"),
      created_at: column("i.stashCreatedAt"),
      updated_at: column("i.stashUpdatedAt"),
      path: column("i.filePath"),
      filesize: column("COALESCE(i.fileSize, 0)"),

      // The viewer's rating and O count
      rating: column(USER_RATING),
      rating100: column(USER_RATING),
      o_counter: column(USER_O_COUNT),
    };
  }

  /** The image filter's clauses, one per criterion the request carried */
  protected async filterClauses(
    filter: ParsedFilter<"image">,
    q: string | undefined,
    ctx: QueryContext
  ): Promise<FilterClause[]> {
    const clauses: FilterClause[] = [];
    const push = (clause: FilterClause) => clauses.push(clause);
    const opts = (name: string) => ({
      name,
      allowedInstanceIds: ctx.allowedInstanceIds,
    });

    if (q !== undefined) push(this.searchClause(q));

    // The viewer's own data
    push(buildFavoriteFilter(filter.favorite));
    if (filter.rating100) {
      push(buildNumericFilter(filter.rating100, USER_RATING));
    }
    if (filter.o_counter) {
      push(buildNumericFilter(filter.o_counter, USER_O_COUNT));
    }

    // Related entities
    if (filter.performers) {
      const { refs, modifier } = filter.performers;
      push(refClause(IMAGE_PERFORMERS, refs, modifier, opts("performers")));
    }
    if (filter.tags) push(await this.tagClause(filter.tags, ctx));
    if (filter.studios) push(await this.studioClause(filter.studios, ctx));
    if (filter.galleries) {
      const { refs, modifier } = filter.galleries;
      push(refClause(IMAGE_GALLERIES, refs, modifier, opts("galleries")));
    }

    // Dates
    if (filter.date) push(buildDateFilter(filter.date, "i.date"));
    if (filter.created_at) {
      push(buildDateFilter(filter.created_at, "i.stashCreatedAt"));
    }
    if (filter.updated_at) {
      push(buildDateFilter(filter.updated_at, "i.stashUpdatedAt"));
    }

    return clauses;
  }

  /**
   * The tag filter, with the tags' descendants to the depth, as the scene
   * list expands them: INCLUDES_ALL with a depth is one clause per selected
   * tag, each with its own descendants (QUERIES-08).
   */
  private async tagClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const opts = { name: "tags", allowedInstanceIds: ctx.allowedInstanceIds };
    if (criterion.depth !== 0 && criterion.modifier === "INCLUDES_ALL") {
      const groups = await Promise.all(
        criterion.refs.map((ref) =>
          expandRefs([ref], criterion.depth, expandTagIds)
        )
      );
      return allOf(
        groups.map((group, i) =>
          refClause(IMAGE_TAGS, group, "INCLUDES", {
            ...opts,
            name: `tags_${i}`,
          })
        )
      );
    }
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandTagIds
    );
    return refClause(IMAGE_TAGS, refs, criterion.modifier, opts);
  }

  /**
   * The studio filter, with the studios' descendants to the depth. An
   * image has one studio, so the parser never sends INCLUDES_ALL here; an
   * EXCLUDES keeps the images with no studio.
   */
  private async studioClause(
    criterion: RefCriterion,
    ctx: QueryContext
  ): Promise<FilterClause> {
    const refs = await expandRefs(
      criterion.refs,
      criterion.depth,
      expandStudioIds
    );
    return refClause(IMAGE_STUDIO, refs, criterion.modifier, {
      name: "studios",
      allowedInstanceIds: ctx.allowedInstanceIds,
    });
  }

  /**
   * The search across the title, details, photographer and file path:
   * `likeContains` with `ESCAPE '\'`, so a `%`, `_` or `\` in the text
   * matches itself. SQLite's LIKE folds ASCII case, as before.
   */
  private searchClause(q: string): FilterClause {
    const pattern = likeContains(q);
    return {
      sql: "(i.title LIKE ? ESCAPE '\\' OR i.details LIKE ? ESCAPE '\\' OR i.photographer LIKE ? ESCAPE '\\' OR i.filePath LIKE ? ESCAPE '\\')",
      params: [pattern, pattern, pattern, pattern],
    };
  }

  /**
   * A raw row as the list returns it: the title's fallback, the file size as
   * a number, dates as ISO strings, media paths as proxy URLs, and the
   * viewer's own rating, favorite, O count and views. Relations are empty
   * until populateRelations.
   */
  protected transformRow(row: ImageQueryRow): ImageListItem {
    const instanceId = row.stashInstanceId;
    const thumbnail = toProxyUrl(row.pathThumbnail, instanceId);
    const preview = toProxyUrl(row.pathPreview, instanceId);
    const image = toProxyUrl(row.pathImage, instanceId);
    return {
      id: row.id,
      instanceId,
      stashInstanceId: instanceId,
      title: emptyToNull(row.title) ?? getImageFallbackTitle(row.filePath),
      code: row.code,
      details: row.details,
      photographer: row.photographer,
      urls: parseJsonArray(row.urls),
      date: row.date,
      studioId: row.studioId,
      organized: row.organized,
      filePath: row.filePath,
      width: row.width,
      height: row.height,
      fileSize: row.fileSize === null ? null : Number(row.fileSize),
      paths: { thumbnail, preview, image },
      pathThumbnail: thumbnail,
      pathPreview: preview,
      pathImage: image,
      stashCreatedAt: row.stashCreatedAt?.toISOString() ?? null,
      stashUpdatedAt: row.stashUpdatedAt?.toISOString() ?? null,

      // User data - Peek user data ONLY: Stash's rating and O count belong
      // to the Stash user
      rating100: row.userRating,
      favorite: row.userFavorite ?? false,
      oCounter: row.userOCount ?? 0,
      viewCount: row.userViewCount ?? 0,
      lastViewedAt: row.userLastViewedAt?.toISOString() ?? null,

      // Filled by populateRelations
      performers: [],
      tags: [],
      galleries: [],
      studio: null,
    };
  }

  /**
   * Each image's performers, tags and galleries (live ones), and its
   * studio, by the image's (id, instance): one statement per relation for
   * the page, driven from the page's pairs (`json_each(?)` with `CROSS
   * JOIN`) into each junction's key.
   */
  protected async populateRelations(images: ImageListItem[]): Promise<void> {
    if (images.length === 0) return;

    const page = pairsJson(images);
    const studioRefs = distinctRefs(
      images.flatMap((image): EntityRef[] =>
        image.studioId === null
          ? []
          : [{ id: image.studioId, instanceId: image.instanceId }]
      )
    );

    const [performers, tags, galleries, studios] = await Promise.all([
      prisma.$queryRawUnsafe<ImagePerformerQueryRow[]>(
        `${PAGE}
        SELECT pg.pid AS imageId, pg.pinst AS imageInstanceId, p.id, p.stashInstanceId,
          p.name, p.disambiguation, p.gender, p.favorite, p.rating100, p.imagePath
        FROM page pg
        CROSS JOIN ImagePerformer ip ON ip.imageId = pg.pid AND ip.imageInstanceId = pg.pinst
        JOIN StashPerformer p ON p.id = ip.performerId AND p.stashInstanceId = ip.performerInstanceId
        WHERE p.deletedAt IS NULL`,
        page
      ),
      prisma.$queryRawUnsafe<ImageTagQueryRow[]>(
        `${PAGE}
        SELECT pg.pid AS imageId, pg.pinst AS imageInstanceId, t.id, t.stashInstanceId,
          t.name, t.favorite, t.imagePath
        FROM page pg
        CROSS JOIN ImageTag it ON it.imageId = pg.pid AND it.imageInstanceId = pg.pinst
        JOIN StashTag t ON t.id = it.tagId AND t.stashInstanceId = it.tagInstanceId
        WHERE t.deletedAt IS NULL`,
        page
      ),
      prisma.$queryRawUnsafe<ImageGalleryQueryRow[]>(
        `${PAGE}
        SELECT pg.pid AS imageId, pg.pinst AS imageInstanceId, g.id, g.stashInstanceId,
          g.title, g.coverPath
        FROM page pg
        CROSS JOIN ImageGallery ig ON ig.imageId = pg.pid AND ig.imageInstanceId = pg.pinst
        JOIN StashGallery g ON g.id = ig.galleryId AND g.stashInstanceId = ig.galleryInstanceId
        WHERE g.deletedAt IS NULL`,
        page
      ),
      studioRefs.length === 0
        ? Promise.resolve([])
        : prisma.$queryRawUnsafe<ImageStudioQueryRow[]>(
            `WITH refs(sid, sinst) AS (
              SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
            )
            SELECT s.id, s.stashInstanceId, s.name, s.imagePath, s.favorite, s.parentId
            FROM refs r
            CROSS JOIN StashStudio s ON s.id = r.sid AND s.stashInstanceId = r.sinst`,
            pairsJson(studioRefs)
          ),
    ]);

    const performersByImage = groupByImage(
      performers,
      (row): PerformerRef => ({
        id: row.id,
        instanceId: row.stashInstanceId,
        name: row.name,
        disambiguation: row.disambiguation,
        gender: row.gender,
        favorite: row.favorite,
        rating100: row.rating100,
        image_path: toProxyUrl(row.imagePath, row.stashInstanceId),
      })
    );
    const tagsByImage = groupByImage(
      tags,
      (row): TagRef => ({
        id: row.id,
        instanceId: row.stashInstanceId,
        name: row.name,
        favorite: row.favorite,
        image_path: toProxyUrl(row.imagePath, row.stashInstanceId),
      })
    );
    const galleriesByImage = groupByImage(
      galleries,
      (row): GalleryRef => ({
        id: row.id,
        instanceId: row.stashInstanceId,
        title: row.title,
        cover: toProxyUrl(row.coverPath, row.stashInstanceId),
      })
    );
    const studiosByKey = new Map(
      studios.map((row): [string, StudioRef] => [
        entityKey(row.id, row.stashInstanceId),
        {
          id: row.id,
          instanceId: row.stashInstanceId,
          name: row.name,
          image_path: toProxyUrl(row.imagePath, row.stashInstanceId),
          favorite: row.favorite,
          parent_studio: row.parentId === null ? null : { id: row.parentId },
        },
      ])
    );

    for (const image of images) {
      const key = entityKey(image.id, image.instanceId);
      image.performers = performersByImage.get(key) ?? [];
      image.tags = tagsByImage.get(key) ?? [];
      image.galleries = galleriesByImage.get(key) ?? [];
      image.studio =
        image.studioId === null
          ? null
          : (studiosByKey.get(entityKey(image.studioId, image.instanceId)) ??
            null);
    }
  }
}

/** A relation's rows as refs, grouped by their image's entityKey */
function groupByImage<
  Row extends { imageId: string; imageInstanceId: string },
  Ref,
>(rows: readonly Row[], toRef: (row: Row) => Ref): Map<string, Ref[]> {
  const grouped = new Map<string, Ref[]>();
  for (const row of rows) {
    const key = entityKey(row.imageId, row.imageInstanceId);
    const list = grouped.get(key) ?? [];
    list.push(toRef(row));
    grouped.set(key, list);
  }
  return grouped;
}

// Export singleton instance
export const imageQueryBuilder = new ImageQueryBuilder();
