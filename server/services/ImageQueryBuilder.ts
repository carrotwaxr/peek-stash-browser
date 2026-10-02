/**
 * ImageQueryBuilder: the image list in SQL.
 *
 * The image builder on the base (`query/EntityQueryBuilder.ts`): this file
 * declares the image's spec (table, the viewer's rating and view joins,
 * columns), its filter clauses from the parsed request, its sort map, its
 * row transform and its relations. The instance filters, the exclusion join,
 * the `ids` filter, the random sort, the primary key ending every order and
 * the count are the base's.
 *
 * Rating and O count are the viewer's own (ImageRating, ImageViewHistory),
 * never Stash's, for filtering, sorting and the row alike (QUERIES-17). Each
 * image's performers, tags, galleries and studio are loaded by its
 * (id, instance), one statement per relation for the page, only those the
 * viewer may see.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import type { ImageListItem } from "../types/index.js";
import type { ImageQueryRow } from "../types/internal/queryRows.js";
import type { RefFieldCriterion } from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type ColumnTarget,
  type FilterClause,
  type JunctionTarget,
  buildDayFilter,
  buildFavoriteFilter,
  buildInstantFilter,
  buildNumericFilter,
  buildTextFilter,
  orientationClause,
  refClause,
  resolutionClause,
  searchAll,
} from "../utils/sqlClauses.js";
import {
  emptyToNull,
  parseJsonArray,
  searchTerms,
} from "../utils/sqlHelpers.js";
import { getImageFallbackTitle } from "../utils/titleUtils.js";
import {
  EntityQueryBuilder,
  type EntitySpec,
  type FieldClauses,
  type LeafContext,
  type QueryContext,
  type SortExpr,
  hierarchicalRefClause,
  refFieldClause,
  refPresence,
} from "./query/EntityQueryBuilder.js";
import {
  GALLERY_REF,
  PERFORMER_REF,
  STUDIO_REF,
  TAG_REF,
  loadNestedRefs,
  loadRefsByKey,
} from "./query/nestedRefs.js";

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
 * The viewer's rating and O count as the sorts read them, none as 0; the
 * rating filter reads `r.rating`, so an unrated image matches only IS_NULL
 */
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

/**
 * The image's tags: its `ImageTag` rows on its own instance, which hold the
 * tags its galleries give it too (sync writes them)
 */
const IMAGE_TAG_COUNT =
  "(SELECT COUNT(*) FROM ImageTag itc WHERE itc.imageId = i.id AND itc.imageInstanceId = i.stashInstanceId)";
const IMAGE_PERFORMERS = imageJunction("ImagePerformer", "ip", "performer");
const IMAGE_GALLERIES = imageJunction("ImageGallery", "ig", "gallery");

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
      // The displayed title (the title, else the file name without its
      // extension), ASCII lower-cased, stored by sync
      // (IMAGE_DERIVED_COLUMNS_SQL): a page walks
      // StashImage_browse_titleSort_idx instead of sorting every image
      title: column("i.titleSort"),
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

  /**
   * The image filter's clauses, one per field, in the order the statement
   * ANDs them. A ref field's CTEs are named from the leaf (`ctx.name`).
   */
  protected override readonly fieldClauses: FieldClauses<"image"> = {
    // The viewer's own data
    favorite: (favorite) => buildFavoriteFilter(favorite),
    rating100: (c) => buildNumericFilter(c, "r.rating"),
    o_counter: (c) => buildNumericFilter(c, USER_O_COUNT),

    // The image's tag rows; EQUALS 0 is the folder view's Untagged
    tag_count: (c) => buildNumericFilter(c, IMAGE_TAG_COUNT),

    // Related entities
    // "Has any" and "has none" count only related rows the viewer can see
    performers: (c, ctx) =>
      refFieldClause(IMAGE_PERFORMERS, c, ctx, {
        table: "StashPerformer",
        entityType: "performer",
      }),
    tags: (c, ctx) => this.tagClause(c, ctx),
    studios: (c, ctx) => this.studioClause(c, ctx),
    galleries: (c, ctx) => this.galleryClause(c, ctx),

    // Text; the URL is matched one element of the list at a time
    title: (c) => buildTextFilter(c, "i.title"),
    details: (c) => buildTextFilter(c, "i.details"),
    code: (c) => buildTextFilter(c, "i.code"),
    photographer: (c) => buildTextFilter(c, "i.photographer"),
    path: (c) => buildTextFilter(c, "i.filePath"),
    url: (c) => buildTextFilter(c, null, { lists: ["i.urls"] }),

    organized: (organized) => ({
      sql: "i.organized = ?",
      params: [organized ? 1 : 0],
    }),

    // The shorter side against Stash's ranges, as the scene list reads it
    resolution: (c) => resolutionClause(c, "i.width", "i.height"),
    orientation: (c) => orientationClause(c, "i.width", "i.height"),

    // Dates
    date: (c) => buildDayFilter(c, "i.date"),
    created_at: (c, ctx) =>
      buildInstantFilter(c, "i.stashCreatedAt", ctx.timeZone),
    updated_at: (c, ctx) =>
      buildInstantFilter(c, "i.stashUpdatedAt", ctx.timeZone),
  };

  /**
   * The tag filter, with the tags' descendants to the depth, as the scene
   * list expands them: INCLUDES_ALL with a depth is one clause per selected
   * tag, each with its own descendants (QUERIES-08).
   */
  private async tagClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("tag", IMAGE_TAGS, criterion, ctx, {
      name: ctx.name,
      related: { table: "StashTag", entityType: "tag" },
    });
  }

  /**
   * The studio filter, with the studios' descendants to the depth. An
   * image has one studio, so the parser never sends INCLUDES_ALL here; an
   * EXCLUDES keeps the images with no studio.
   */
  private async studioClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): Promise<FilterClause> {
    return hierarchicalRefClause("studio", IMAGE_STUDIO, criterion, ctx, {
      name: ctx.name,
    });
  }

  /**
   * The gallery filter (a gallery page lists its images this way). Up to
   * the inline limit an INCLUDES reads the galleries' images once from
   * ImageGallery's gallery index as a row-value IN (`sortedByIndex: false`,
   * `junctionInList`), under every sort and for the count alike: a gallery
   * is a small share of the library, so the page sorts its few rows where
   * the correlated EXISTS walked the sort index and probed the junction for
   * every live image. On prod's 141,957 images a 1,074-image gallery's page
   * takes 2 to 3 ms against up to 45, its count 1.5 against 42, sorted by
   * title or created_at; the created_at index walk wins on no page, the
   * first included (2.4 against 27) (S2, C7). Above the limit, and for
   * EXCLUDES, the default shapes. "Has any" and "has none" count only
   * galleries the viewer can see.
   */
  private galleryClause(
    criterion: RefFieldCriterion,
    ctx: LeafContext
  ): FilterClause {
    if (criterion.modifier === "IS_NULL" || criterion.modifier === "NOT_NULL") {
      return refPresence(IMAGE_GALLERIES, criterion.modifier, ctx, {
        related: { table: "StashGallery", entityType: "gallery" },
      });
    }
    return refClause(IMAGE_GALLERIES, criterion.refs, criterion.modifier, {
      name: ctx.name,
      allowedInstanceIds: ctx.allowedInstanceIds,
      sortedByIndex: false,
    });
  }

  /**
   * The search across the title, details, photographer and file path: every
   * word must match (`searchAll`), each as `likeContains` with `ESCAPE '\'`
   */
  protected override searchClause(q: string): FilterClause {
    return searchAll(searchTerms(q), (pattern) => ({
      sql: "(i.title LIKE ? ESCAPE '\\' OR i.details LIKE ? ESCAPE '\\' OR i.photographer LIKE ? ESCAPE '\\' OR i.filePath LIKE ? ESCAPE '\\')",
      params: [pattern, pattern, pattern, pattern],
    }));
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
   * Each image's performers, tags, galleries and studio, only those the
   * viewer may see (`query/nestedRefs.ts`): one statement per relation for
   * the page, driven from its (id, instance) pairs into each junction's
   * key. An image's studio is on the image's own instance.
   */
  protected async populateRelations(
    images: ImageListItem[],
    ctx: QueryContext
  ): Promise<void> {
    if (images.length === 0) return;

    const studioRefs = images.flatMap((image): EntityRef[] =>
      image.studioId === null
        ? []
        : [{ id: image.studioId, instanceId: image.instanceId }]
    );
    const [performers, tags, galleries, studios] = await Promise.all([
      loadNestedRefs(PERFORMER_REF, IMAGE_PERFORMERS, images, ctx),
      loadNestedRefs(TAG_REF, IMAGE_TAGS, images, ctx),
      loadNestedRefs(GALLERY_REF, IMAGE_GALLERIES, images, ctx),
      loadRefsByKey(STUDIO_REF, studioRefs, ctx),
    ]);

    for (const image of images) {
      const key = entityKey(image.id, image.instanceId);
      image.performers = performers.get(key) ?? [];
      image.tags = tags.get(key) ?? [];
      image.galleries = galleries.get(key) ?? [];
      image.studio =
        image.studioId === null
          ? null
          : (studios.get(entityKey(image.studioId, image.instanceId)) ?? null);
    }
  }
}

// Export singleton instance
export const imageQueryBuilder = new ImageQueryBuilder();
