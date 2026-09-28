/**
 * The entity pickers' search (item 41.1): `POST /library/<entities>/minimal`
 * for performers, studios, tags, groups and galleries, in one statement.
 *
 * Every row goes through the exclusion anti-join with the instance,
 * `deletedAt IS NULL` and the user's allowed instances (invariants 3 and 11:
 * none allowed lists nothing). The search matches the name and, for
 * performers and tags, their aliases, never a description (lead decision,
 * PR 4). The order is always the name with case folded, and the `LIMIT` is
 * the page size: a picker lists one page.
 *
 * No index serves `%q%`, so a keystroke reads the type's live rows once and
 * sorts the matches in a temp B-tree: a few ms at 9k performers.
 */
import prisma from "../prisma/singleton.js";
import type { MinimalCountFilter, MinimalEntity } from "../types/api/index.js";
import type { MinimalEntityQueryRow } from "../types/internal/queryRows.js";
import type {
  MinimalKind,
  ParsedMinimalRequest,
} from "../types/parsedFilters.js";
import { disambiguateEntityNames } from "../utils/entityInstanceId.js";
import { pairs } from "../utils/sqlClauses.js";
import { emptyToNull, likeContains } from "../utils/sqlHelpers.js";
import { getGalleryFallbackTitle } from "../utils/titleUtils.js";
import {
  buildInstanceFilterClause,
  getUserAllowedInstanceIds,
} from "./UserInstanceService.js";

type SqlParam = string | number | boolean;

/** A picker's type: its table, how it is named, searched and counted */
interface MinimalConfig {
  readonly table: string;
  /** The exclusion rows' entityType */
  readonly entityType: MinimalKind;
  /** The name as the SQL sees it: what the search and the order read */
  readonly name: string;
  /** Further columns the display name is built from */
  readonly extraColumns?: string;
  /** The columns `q` is matched against */
  readonly search: readonly string[];
  /** The column each count minimum compares; a minimum the type lacks is ignored */
  readonly counts: readonly (readonly [keyof MinimalCountFilter, string])[];
}

/** SQL: the text after the last `/` or `\` in `col`, else all of it (`extractBasename`) */
function basenameSql(col: string): string {
  const upToSeparator = `rtrim(${col}, replace(replace(${col}, '/', ''), '\\', ''))`;
  return `COALESCE(NULLIF(substr(${col}, length(${upToSeparator}) + 1), ''), ${col})`;
}

/** SQL: `col` without its extension (`stripExtension`) */
function stemSql(col: string): string {
  const upToDot = `length(rtrim(${col}, replace(${col}, '.', '')))`;
  return `CASE WHEN ${upToDot} BETWEEN 1 AND length(${col}) - 1 THEN substr(${col}, 1, ${upToDot} - 1) ELSE ${col} END`;
}

/**
 * A gallery's name as it is shown: its title, else its file's name without
 * the extension, else its folder's own name (`getGalleryFallbackTitle`)
 */
const GALLERY_NAME = `COALESCE(NULLIF(x.title, ''), ${stemSql("NULLIF(x.fileBasename, '')")}, ${basenameSql("NULLIF(x.folderPath, '')")})`;

const CONFIGS: Record<MinimalKind, MinimalConfig> = {
  performer: {
    table: "StashPerformer",
    entityType: "performer",
    name: "x.name",
    search: ["x.name", "x.aliasList"],
    counts: [
      ["min_scene_count", "x.sceneCount"],
      ["min_gallery_count", "x.galleryCount"],
      ["min_image_count", "x.imageCount"],
      ["min_group_count", "x.groupCount"],
    ],
  },
  studio: {
    table: "StashStudio",
    entityType: "studio",
    name: "x.name",
    search: ["x.name"],
    counts: [
      ["min_scene_count", "x.sceneCount"],
      ["min_gallery_count", "x.galleryCount"],
      ["min_image_count", "x.imageCount"],
      ["min_performer_count", "x.performerCount"],
      ["min_group_count", "x.groupCount"],
    ],
  },
  tag: {
    table: "StashTag",
    entityType: "tag",
    name: "x.name",
    search: ["x.name", "x.aliases"],
    counts: [
      ["min_scene_count", "x.sceneCount"],
      ["min_gallery_count", "x.galleryCount"],
      ["min_image_count", "x.imageCount"],
      ["min_performer_count", "x.performerCount"],
      ["min_group_count", "x.groupCount"],
    ],
  },
  group: {
    table: "StashGroup",
    entityType: "group",
    name: "x.name",
    search: ["x.name"],
    counts: [
      ["min_scene_count", "x.sceneCount"],
      ["min_performer_count", "x.performerCount"],
    ],
  },
  gallery: {
    table: "StashGallery",
    entityType: "gallery",
    name: GALLERY_NAME,
    extraColumns: "x.title, x.fileBasename, x.folderPath",
    search: [GALLERY_NAME],
    counts: [["min_image_count", "x.imageCount"]],
  },
};

/** The statement for one request */
function buildQuery(
  config: MinimalConfig,
  userId: number,
  allowedInstanceIds: string[],
  request: ParsedMinimalRequest<MinimalKind>
): { sql: string; params: SqlParam[] } {
  const where: string[] = ["x.deletedAt IS NULL", "e.id IS NULL"];
  const params: SqlParam[] = [userId, config.entityType];

  const instances = buildInstanceFilterClause(
    allowedInstanceIds,
    "x.stashInstanceId"
  );
  where.push(instances.sql);
  params.push(...instances.params);

  if (request.q !== undefined) {
    const pattern = likeContains(request.q);
    where.push(
      `(${config.search.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(" OR ")})`
    );
    params.push(...config.search.map(() => pattern));
  }

  // Any one of the minimums the type has (OR); none of them filters nothing
  const counts = config.counts.flatMap(([key, col]) => {
    const min = request.countFilter?.[key];
    return min === undefined ? [] : [{ col, min }];
  });
  if (counts.length > 0) {
    where.push(`(${counts.map(({ col }) => `${col} >= ?`).join(" OR ")})`);
    params.push(...counts.map(({ min }) => min));
  }

  if (request.ids !== undefined) {
    const refs = pairs("x.id", "x.stashInstanceId", request.ids);
    where.push(`(${refs.sql})`);
    params.push(...refs.params);
  }

  params.push(request.perPage);
  const extra = config.extraColumns ? `, ${config.extraColumns}` : "";
  return {
    sql: `SELECT x.id, x.stashInstanceId AS instanceId, ${config.name} AS name${extra}
FROM ${config.table} x
LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = ? AND e.entityId = x.id
  AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)
WHERE ${where.join("\n  AND ")}
ORDER BY name COLLATE NOCASE, x.id, x.stashInstanceId
LIMIT ?`,
    params,
  };
}

/** The name a picker shows: a gallery's as the gallery pages show it */
function displayName(kind: MinimalKind, row: MinimalEntityQueryRow): string {
  if (kind !== "gallery") return row.name ?? "";
  return (
    emptyToNull(row.title) ??
    getGalleryFallbackTitle(row.folderPath ?? null, row.fileBasename ?? null) ??
    ""
  );
}

/** One page of what a picker lists for the user, in name order */
export async function findMinimalEntities(
  userId: number,
  request: ParsedMinimalRequest<MinimalKind>
): Promise<MinimalEntity[]> {
  const allowedInstanceIds = await getUserAllowedInstanceIds(userId);
  if (allowedInstanceIds.length === 0) return [];
  const query = buildQuery(
    CONFIGS[request.entity],
    userId,
    allowedInstanceIds,
    request
  );
  const rows = await prisma.$queryRawUnsafe<MinimalEntityQueryRow[]>(
    query.sql,
    ...query.params
  );
  return disambiguateEntityNames(
    rows.map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      name: displayName(request.entity, row),
    }))
  );
}
