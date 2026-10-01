/**
 * The compact tag tree (item 41.8): every tag a user can see with its
 * parents, counts and the user's own rating, favorite and O count, in one
 * statement. The Tags page's hierarchy view and the folder view build their
 * trees from it; children are derived on the client.
 *
 * Every tag goes through the exclusion anti-join with the instance,
 * `deletedAt IS NULL` and the user's allowed instances. A parent the user
 * cannot see is left out of a tag's parents, so the tag becomes a root.
 *
 * With a scope (a performer, tag, studio and collection, all that are given),
 * a recursive CTE starts from the tags on the scope's visible scenes (their
 * own and their inherited ones, from `SceneTag` and `SceneInheritedTag`, as
 * the scene list's tag filter matches them; a tag scope's scenes too), each
 * counted once per scene, so a folder's badge on a detail page is its list's
 * total (the folder at depth 0 with the page's entity), and walks
 * `json_each(parentIds)` up to their ancestors. Each step applies the same
 * three conditions, so the walk stops at a hidden or restricted ancestor:
 * the child it would have led to becomes a root, and the ancestor's own
 * parents are not reached through it.
 *
 * The folder view's Untagged folder asks for one more count, of its page's
 * type (`loadUntaggedCount`), under the same three conditions.
 */
import prisma from "../prisma/singleton.js";
import type { TagTreeRow, UntaggedKind } from "../types/api/index.js";
import type {
  TagTreeQueryRow,
  UntaggedCountRow,
} from "../types/internal/queryRows.js";
import type { FilterRef } from "../types/parsedFilters.js";
import { entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import { sceneUntaggedSql } from "../utils/sqlClauses.js";
import { parseJsonArray } from "../utils/sqlHelpers.js";
import { jsonListOrEmpty } from "../utils/sqlJson.js";
import {
  excludedCountsJoinSql,
  visibleCountSql,
} from "./query/excludedCounts.js";

/** The scope's refs, parsed; a bare ref (no instance) matches every allowed instance */
export interface TagTreeScopeRefs {
  readonly performer?: FilterRef | undefined;
  readonly tag?: FilterRef | undefined;
  readonly studio?: FilterRef | undefined;
  readonly group?: FilterRef | undefined;
}

export interface LoadTagTreeOptions {
  readonly userId: number;
  /** `getUserAllowedInstanceIds`: none means no tags */
  readonly allowedInstanceIds: readonly string[];
  readonly scope?: TagTreeScopeRefs | undefined;
}

type SqlParam = string | number;

interface Fragment {
  readonly sql: string;
  readonly params: SqlParam[];
}

/**
 * The row's columns; the counts as the user sees them, the card's numbers
 * (the live link count minus the user's excluded links, joined as `d` by
 * excludedCountsJoin)
 */
const TREE_COLUMNS = `t.id, t.stashInstanceId, t.name, t.imagePath, t.parentIds,
  ${visibleCountSql("t.sceneCountAll", "scenes")} AS sceneCountAll,
  ${visibleCountSql("t.imageCount", "images")} AS imageCount,
  ${visibleCountSql("t.galleryCount", "galleries")} AS galleryCount,
  ${visibleCountSql("t.performerCount", "performers")} AS performerCount,
  t.stashCreatedAt, t.stashUpdatedAt,
  r.rating AS userRating, r.favorite AS userFavorite, us.oCounter AS userOCounter`;

/**
 * The user's own rating, favorite and O count for tag `t` (unique per
 * user, instance and tag), and their excluded links per tag for the counts
 */
function userDataJoins(userId: number): Fragment {
  return {
    sql: `LEFT JOIN TagRating r ON r.userId = ? AND r.instanceId = t.stashInstanceId AND r.tagId = t.id
LEFT JOIN UserTagStats us ON us.userId = ? AND us.instanceId = t.stashInstanceId AND us.tagId = t.id
${excludedCountsJoinSql("tag", "t")}`,
    params: [userId, userId, userId],
  };
}

/**
 * What makes entity `alias` visible: the exclusion anti-join on its instance
 * (`join`, placed after the entity) and the live, allowed-instance and not
 * excluded conditions (`where`).
 */
function visible(
  alias: string,
  entityType: "tag" | "scene" | "gallery" | "image",
  userId: number,
  instanceIds: readonly string[]
): { join: Fragment; where: Fragment } {
  const e = `${alias}e`;
  return {
    join: {
      sql: `LEFT JOIN UserExcludedEntity ${e} ON ${e}.userId = ? AND ${e}.entityType = '${entityType}' AND ${e}.entityId = ${alias}.id AND (${e}.instanceId = '' OR ${e}.instanceId = ${alias}.stashInstanceId)`,
      params: [userId],
    },
    where: {
      sql: `${alias}.deletedAt IS NULL AND ${e}.id IS NULL AND ${alias}.stashInstanceId IN (${instanceIds.map(() => "?").join(", ")})`,
      params: [...instanceIds],
    },
  };
}

/** `idCol = ?`, plus `instanceCol = ?` when the ref names its instance */
function refMatch(
  ref: FilterRef,
  idCol: string,
  instanceCol: string
): Fragment {
  return ref.instanceId === undefined
    ? { sql: `${idCol} = ?`, params: [ref.id] }
    : {
        sql: `${idCol} = ? AND ${instanceCol} = ?`,
        params: [ref.id, ref.instanceId],
      };
}

/**
 * The scope's scenes as (id, inst) pairs, one indexed read per part, the
 * parts intersected; null when the scope names nothing
 */
function scopeScenes(scope: TagTreeScopeRefs): Fragment | null {
  const parts: Fragment[] = [];
  const junction = (
    ref: FilterRef | undefined,
    table: string,
    idCol: string,
    instanceCol: string
  ) => {
    if (!ref) return;
    const match = refMatch(ref, `j.${idCol}`, `j.${instanceCol}`);
    parts.push({
      sql: `SELECT j.sceneId, j.sceneInstanceId FROM ${table} j WHERE ${match.sql}`,
      params: match.params,
    });
  };
  junction(
    scope.performer,
    "ScenePerformer",
    "performerId",
    "performerInstanceId"
  );
  if (scope.tag) {
    // A tag's scenes carry it directly or by inheritance, as the scene
    // list's tag filter matches them; one part of the intersection
    const direct = refMatch(scope.tag, "j.tagId", "j.tagInstanceId");
    parts.push({
      sql: `SELECT u.sceneId, u.sceneInstanceId FROM (SELECT j.sceneId, j.sceneInstanceId FROM SceneTag j WHERE ${direct.sql}
UNION
SELECT j.sceneId, j.sceneInstanceId FROM SceneInheritedTag j WHERE ${direct.sql}) u`,
      params: [...direct.params, ...direct.params],
    });
  }
  junction(scope.group, "SceneGroup", "groupId", "groupInstanceId");
  if (scope.studio) {
    // A scene's studio is on the scene's own instance
    const match = refMatch(scope.studio, "s.studioId", "s.stashInstanceId");
    parts.push({
      sql: `SELECT s.id, s.stashInstanceId FROM StashScene s WHERE ${match.sql}`,
      params: match.params,
    });
  }
  if (parts.length === 0) return null;
  return {
    sql: parts.map((p) => p.sql).join("\nINTERSECT\n"),
    params: parts.flatMap((p) => p.params),
  };
}

function unscopedQuery(
  userId: number,
  instanceIds: readonly string[]
): Fragment {
  const tag = visible("t", "tag", userId, instanceIds);
  const user = userDataJoins(userId);
  return {
    sql: `SELECT ${TREE_COLUMNS}, NULL AS scopeSceneCount
FROM StashTag t
${tag.join.sql}
${user.sql}
WHERE ${tag.where.sql}`,
    params: [...tag.join.params, ...user.params, ...tag.where.params],
  };
}

function scopedQuery(
  userId: number,
  instanceIds: readonly string[],
  scenes: Fragment
): Fragment {
  const scene = visible("s", "scene", userId, instanceIds);
  const seedTag = visible("t", "tag", userId, instanceIds);
  const parent = visible("p", "tag", userId, instanceIds);
  const user = userDataJoins(userId);
  return {
    sql: `WITH RECURSIVE
scope_scene(id, inst) AS (
${scenes.sql}
),
visible_scene(id, inst) AS MATERIALIZED (
  SELECT s.id, s.stashInstanceId
  FROM scope_scene x
  CROSS JOIN StashScene s ON s.id = x.id AND s.stashInstanceId = x.inst
  ${scene.join.sql}
  WHERE ${scene.where.sql}
),
seed(tagId, tagInstanceId, n) AS (
  SELECT tagId, tagInstanceId, SUM(n) FROM (
    SELECT st.tagId AS tagId, st.tagInstanceId AS tagInstanceId, COUNT(*) AS n
    FROM visible_scene v
    CROSS JOIN SceneTag st ON st.sceneId = v.id AND st.sceneInstanceId = v.inst
    GROUP BY st.tagId, st.tagInstanceId
    UNION ALL
    SELECT it.tagId, it.tagInstanceId, COUNT(*)
    FROM visible_scene v
    CROSS JOIN SceneInheritedTag it ON it.sceneId = v.id AND it.sceneInstanceId = v.inst
    WHERE NOT EXISTS (SELECT 1 FROM SceneTag d WHERE d.sceneId = it.sceneId AND d.sceneInstanceId = it.sceneInstanceId AND d.tagId = it.tagId AND d.tagInstanceId = it.tagInstanceId)
    GROUP BY it.tagId, it.tagInstanceId
  )
  GROUP BY tagId, tagInstanceId
),
tree(id, inst, parentIds) AS (
  SELECT t.id, t.stashInstanceId, t.parentIds
  FROM seed x
  CROSS JOIN StashTag t ON t.id = x.tagId AND t.stashInstanceId = x.tagInstanceId
  ${seedTag.join.sql}
  WHERE ${seedTag.where.sql}
  UNION
  SELECT p.id, p.stashInstanceId, p.parentIds
  FROM tree c
  CROSS JOIN json_each(${jsonListOrEmpty("c.parentIds")}) jp
  CROSS JOIN StashTag p ON p.id = jp.value AND p.stashInstanceId = c.inst
  ${parent.join.sql}
  WHERE ${parent.where.sql}
)
SELECT ${TREE_COLUMNS}, COALESCE(x.n, 0) AS scopeSceneCount
FROM tree c
CROSS JOIN StashTag t ON t.id = c.id AND t.stashInstanceId = c.inst
LEFT JOIN seed x ON x.tagId = t.id AND x.tagInstanceId = t.stashInstanceId
${user.sql}`,
    params: [
      ...scenes.params,
      ...scene.join.params,
      ...scene.where.params,
      ...seedTag.join.params,
      ...seedTag.where.params,
      ...parent.join.params,
      ...parent.where.params,
      ...user.params,
    ],
  };
}

function toTreeRow(
  row: TagTreeQueryRow,
  visibleKeys: ReadonlySet<string>,
  scoped: boolean
): TagTreeRow {
  const parents = [...new Set(parseJsonArray(row.parentIds).map(String))]
    .filter((id) => visibleKeys.has(entityKey(id, row.stashInstanceId)))
    .map((id) => ({ id }));
  return {
    id: row.id,
    instanceId: row.stashInstanceId,
    name: row.name,
    image_path: toProxyUrl(row.imagePath, row.stashInstanceId),
    parents,
    scene_count: scoped
      ? Number(row.scopeSceneCount ?? 0)
      : Number(row.sceneCountAll),
    image_count: scoped ? 0 : Number(row.imageCount),
    gallery_count: scoped ? 0 : Number(row.galleryCount),
    performer_count: scoped ? 0 : Number(row.performerCount),
    created_at: row.stashCreatedAt?.toISOString() ?? null,
    updated_at: row.stashUpdatedAt?.toISOString() ?? null,
    rating100: row.userRating,
    favorite: row.userFavorite ?? false,
    o_counter: row.userOCounter ?? 0,
  };
}

/** The user's tag tree, whole or scoped, in one statement */
export async function loadTagTree({
  userId,
  allowedInstanceIds,
  scope,
}: LoadTagTreeOptions): Promise<TagTreeRow[]> {
  if (allowedInstanceIds.length === 0) return [];
  const scenes = scope ? scopeScenes(scope) : null;
  const query = scenes
    ? scopedQuery(userId, allowedInstanceIds, scenes)
    : unscopedQuery(userId, allowedInstanceIds);

  const rows = await prisma.$queryRawUnsafe<TagTreeQueryRow[]>(
    query.sql,
    ...query.params
  );
  const visibleKeys = new Set(
    rows.map((r) => entityKey(r.id, r.stashInstanceId))
  );
  return rows.map((row) => toTreeRow(row, visibleKeys, scenes !== null));
}

/**
 * Each type's table and its untagged condition, as the Untagged folder's
 * list reads it: a scene with no tag, its own or inherited (`tagged`
 * false), a gallery or an image with no tag rows (`tag_count` EQUALS 0; an
 * image's rows hold its galleries' tags too)
 */
const UNTAGGED = {
  scene: { table: "StashScene", alias: "s", where: sceneUntaggedSql("s") },
  gallery: {
    table: "StashGallery",
    alias: "g",
    where:
      "NOT EXISTS (SELECT 1 FROM GalleryTag gt WHERE gt.galleryId = g.id AND gt.galleryInstanceId = g.stashInstanceId)",
  },
  image: {
    table: "StashImage",
    alias: "i",
    where:
      "NOT EXISTS (SELECT 1 FROM ImageTag it WHERE it.imageId = i.id AND it.imageInstanceId = i.stashInstanceId)",
  },
} as const satisfies Record<
  UntaggedKind,
  { table: string; alias: string; where: string }
>;

export interface LoadUntaggedCountOptions extends LoadTagTreeOptions {
  readonly kind: UntaggedKind;
}

/**
 * The folder view's Untagged count, in one statement: the items of the kind
 * the user can see (live, on the allowed instances, under the exclusion
 * anti-join with the instance: invariant 3) in no tag's folder, the total
 * of the Untagged list (`UNTAGGED`). With a scope, the scope's
 * visible untagged scenes; galleries and images 0, as the scoped tree's
 * counts are. Only the page's kind is counted: the image count reads every
 * live image (52 to 82 ms on the prod snapshot's 142k).
 */
export async function loadUntaggedCount({
  userId,
  allowedInstanceIds,
  scope,
  kind,
}: LoadUntaggedCountOptions): Promise<number> {
  if (allowedInstanceIds.length === 0) return 0;
  const scenes = scope ? scopeScenes(scope) : null;
  if (scenes && kind !== "scene") return 0;
  // A tag's scenes carry it, their own or inherited: none is untagged
  if (scope?.tag) return 0;

  const { table, alias, where } = UNTAGGED[kind];
  const entity = visible(alias, kind, userId, allowedInstanceIds);
  const query: Fragment = scenes
    ? {
        sql: `WITH scope_scene(id, inst) AS (
${scenes.sql}
)
SELECT COUNT(*) AS n
FROM scope_scene x
CROSS JOIN StashScene s ON s.id = x.id AND s.stashInstanceId = x.inst
${entity.join.sql}
WHERE ${entity.where.sql} AND ${where}`,
        params: [
          ...scenes.params,
          ...entity.join.params,
          ...entity.where.params,
        ],
      }
    : {
        sql: `SELECT COUNT(*) AS n
FROM ${table} ${alias}
${entity.join.sql}
WHERE ${entity.where.sql} AND ${where}`,
        params: [...entity.join.params, ...entity.where.params],
      };

  const [row] = await prisma.$queryRawUnsafe<UntaggedCountRow[]>(
    query.sql,
    ...query.params
  );
  // One row always: COUNT(*) with no GROUP BY
  return Number(row?.n ?? 0);
}
