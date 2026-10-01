/**
 * What a viewer sees of playlists (items 41.6 and 41.7): the playlists
 * page's previews and counts, and a playlist's items with their scenes.
 *
 * An item is visible when its scene, matched on the item's own instance, is
 * live (`deletedAt IS NULL`), on one of the viewer's allowed instances, and
 * not excluded for the viewer (the exclusion anti-join with the instance).
 * The viewer is whoever reads: a shared playlist's recipient sees what their
 * own exclusions allow, never the owner's view (invariants 3, 10 and 11). An
 * item with no instance, saved before multi-instance, matches no scene.
 *
 * Every playlist's previews come from one statement driven by the playlist
 * ids (`json_each` with `CROSS JOIN`s, so SQLite looks each item and scene up
 * by key). A playlist's items go through `loadPlaylistItems`: a page of the
 * visible items in SQL in the view's sort (`orderTerms`), or every item in
 * position order without paging, and their scenes from the scene builder,
 * whose joins carry the viewer's own rating, favorite, O and play fields.
 *
 * Adds go through `appendItems`: the scenes the adder can see, numbered
 * after the playlist's last item inside the insert itself.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import type {
  PlaylistItemWithScene,
  PlaylistPreviewItem,
} from "../types/api/index.js";
import type { NormalizedScene } from "../types/index.js";
import type {
  PlaylistItemQueryRow,
  PlaylistPreviewQueryRow,
} from "../types/internal/queryRows.js";
import type { ParsedPlaylistItemSort } from "../types/parsedFilters.js";
import { dbWrite } from "../utils/dbWrite.js";
import {
  type EntityRef,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import {
  type SqlFragment,
  type SqlParam,
  instanceColumnClause,
} from "../utils/sqlClauses.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import { getVisibleEntityKeys } from "./EntityAccessService.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";

/** The preview thumbnails a playlist shows */
const PREVIEW_COUNT = 4;

/**
 * Refs per scene builder read, a list page's most rows: its OR of
 * primary-key pairs costs about 0.2 ms a ref up to 1,000 refs, then grows
 * faster (2,000 refs in one read took 1.8 s on the prod snapshot)
 */
const REFS_PER_READ = PER_PAGE_MAX;

export interface PlaylistPreviews {
  /** The first four items the viewer can see, in position order */
  readonly items: PlaylistPreviewItem[];
  /** How many of the playlist's items the viewer can see */
  readonly visibleCount: number;
}

export interface LoadPlaylistPreviewsOptions {
  readonly userId: number;
  /** `getUserAllowedInstanceIds`: none means nothing is visible */
  readonly allowedInstanceIds: readonly string[];
  readonly playlistIds: readonly number[];
}

export interface PlaylistItemsPaging {
  /** From 1 */
  readonly page: number;
  readonly perPage: number;
}

export interface LoadPlaylistItemsOptions {
  readonly userId: number;
  /** `getUserAllowedInstanceIds`: none means nothing is visible */
  readonly allowedInstanceIds: readonly string[];
  readonly playlistId: number;
  /** A page of the items the viewer can see; every item when absent */
  readonly paging?: PlaylistItemsPaging | undefined;
  /**
   * The page's order; position ASC when absent. Every item without paging
   * comes in position order whatever this says.
   */
  readonly sort?: ParsedPlaylistItemSort | undefined;
}

export interface PlaylistItems {
  /**
   * With paging, the page's visible items, each with its scene. Without,
   * every item in position order, with null for a scene the viewer cannot
   * see.
   */
  readonly items: PlaylistItemWithScene[];
  /** How many of the playlist's items the viewer can see */
  readonly totalItems: number;
}

const NO_PREVIEWS: PlaylistPreviews = { items: [], visibleCount: 0 };

/** A playlist's own order, the sort a request without one reads */
const POSITION_ASC: ParsedPlaylistItemSort = {
  field: "position",
  direction: "ASC",
  seed: undefined,
};

/**
 * What makes item `pi` visible: its scene `s` on the item's instance (`join`,
 * after `pi`), and that scene live, allowed and not excluded (`where`)
 */
function visibleItem(
  userId: number,
  allowedInstanceIds: readonly string[]
): { join: SqlFragment; where: SqlFragment } {
  const instances = instanceColumnClause("s.stashInstanceId", [
    ...allowedInstanceIds,
  ]);
  return {
    join: {
      sql: `CROSS JOIN StashScene s ON s.id = pi.sceneId AND s.stashInstanceId = pi.instanceId
LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = 'scene' AND e.entityId = pi.sceneId AND (e.instanceId = '' OR e.instanceId = pi.instanceId)`,
      params: [userId],
    },
    where: {
      sql: `s.deletedAt IS NULL AND e.id IS NULL AND ${instances.sql}`,
      params: instances.params,
    },
  };
}

/**
 * The order of a playlist's visible items (`pi`, with its scene `s`) under a
 * view sort, and the joins it reads, which follow `visibleItem`'s join:
 * `position` is the playlist's order, `added_at` when each item was added
 * (ties by position), and any scene sort the Scenes page's expression
 * (`SceneQueryBuilder.sortTerms`: the viewer's own rating and history, a
 * seeded random) with ties by position. The item id ends every order, so
 * a page never repeats or skips an item. The item page, the play queue and
 * "Save as playlist order" all order through this, so the three agree.
 */
export function orderTerms(
  userId: number,
  sort: ParsedPlaylistItemSort
): { joins: SqlFragment[]; order: SqlFragment } {
  const dir = sort.direction;
  if (sort.field === "position") {
    return {
      joins: [],
      order: { sql: `pi.position ${dir}, pi.id ${dir}`, params: [] },
    };
  }
  if (sort.field === "added_at") {
    return {
      joins: [],
      order: { sql: `pi.addedAt ${dir}, pi.position, pi.id`, params: [] },
    };
  }
  const terms = sceneQueryBuilder.sortTerms(userId, sort);
  return {
    joins: terms.joins,
    order: {
      sql: `${terms.order.sql}, pi.position, pi.id`,
      params: terms.order.params,
    },
  };
}

/**
 * Each playlist's first four visible items and its visible count, in one
 * statement. Every requested playlist is in the map; one with nothing the
 * viewer can see previews nothing and counts 0.
 */
export async function loadPlaylistPreviews(
  options: LoadPlaylistPreviewsOptions
): Promise<Map<number, PlaylistPreviews>> {
  const { userId, allowedInstanceIds, playlistIds } = options;
  const previews = new Map<number, PlaylistPreviews>(
    playlistIds.map((id) => [id, NO_PREVIEWS])
  );
  if (playlistIds.length === 0 || allowedInstanceIds.length === 0) {
    return previews;
  }

  const { join, where } = visibleItem(userId, allowedInstanceIds);
  const sql = `WITH visible AS (
  SELECT pi.playlistId, pi.sceneId, pi.instanceId, pi.position,
    s.title, s.filePath, s.pathScreenshot,
    ROW_NUMBER() OVER (PARTITION BY pi.playlistId ORDER BY pi.position, pi.id) AS rn,
    COUNT(*) OVER (PARTITION BY pi.playlistId) AS visibleCount
  FROM json_each(?) j
  CROSS JOIN PlaylistItem pi ON pi.playlistId = j.value
  ${join.sql}
  WHERE ${where.sql}
)
SELECT playlistId, sceneId, instanceId, position, title, filePath, pathScreenshot, visibleCount
FROM visible
WHERE rn <= ${PREVIEW_COUNT}
ORDER BY playlistId, rn`;
  const rows = await prisma.$queryRawUnsafe<PlaylistPreviewQueryRow[]>(
    sql,
    JSON.stringify(playlistIds),
    ...join.params,
    ...where.params
  );

  const items = new Map<number, PlaylistPreviewItem[]>();
  const counts = new Map<number, number>();
  for (const row of rows) {
    const list = items.get(row.playlistId) ?? [];
    list.push({
      sceneId: row.sceneId,
      instanceId: row.instanceId,
      position: row.position,
      scene: {
        id: row.sceneId,
        instanceId: row.instanceId,
        title: emptyToNull(row.title) ?? getSceneFallbackTitle(row.filePath),
        paths: { screenshot: toProxyUrl(row.pathScreenshot, row.instanceId) },
      },
    });
    items.set(row.playlistId, list);
    counts.set(row.playlistId, Number(row.visibleCount));
  }
  for (const [playlistId, list] of items) {
    previews.set(playlistId, {
      items: list,
      visibleCount: counts.get(playlistId) ?? list.length,
    });
  }
  return previews;
}

/**
 * The statement that copies a playlist's items the viewer can see into a new
 * playlist, numbered 0..n-1 in the original's order. The new playlist's id
 * is known only inside the write unit, so `paramsFor` takes it.
 */
export interface DuplicateVisibleItems {
  readonly sql: string;
  paramsFor(newPlaylistId: number): SqlParam[];
}

/**
 * Builds the copy statement for `sourceId`: one `INSERT ... SELECT` over the
 * items the viewer can see (the same visibility as every item read; a viewer
 * with no allowed instance copies nothing). `addedAt` is the copy's time, in
 * epoch milliseconds, as Prisma stores a DateTime.
 */
export function duplicateVisibleItems(
  userId: number,
  allowedInstanceIds: readonly string[],
  sourceId: number
): DuplicateVisibleItems {
  const { join, where } = visibleItem(userId, allowedInstanceIds);
  const sql = `INSERT INTO PlaylistItem (playlistId, instanceId, sceneId, position, addedAt)
SELECT ?, pi.instanceId, pi.sceneId, ROW_NUMBER() OVER (ORDER BY pi.position, pi.id) - 1, ?
FROM PlaylistItem pi
${join.sql}
WHERE pi.playlistId = ? AND ${where.sql}`;
  return {
    sql,
    paramsFor: (newPlaylistId) => [
      newPlaylistId,
      Date.now(),
      ...join.params,
      sourceId,
      ...where.params,
    ],
  };
}

/** What an add did with the scenes it was asked to add */
export interface AppendItemsResult {
  readonly added: number;
  /** Visible scenes the playlist already held, a racing add's included */
  readonly alreadyInPlaylist: number;
  /** Scenes the adder cannot see: missing, deleted, hidden, restricted or on an instance they do not use */
  readonly unavailable: number;
}

/**
 * The append statement: the requested refs (`[id, instance]` pairs in
 * request order) that the playlist does not hold yet, numbered from
 * `MAX(position) + 1` in that order. It runs alone in its write unit, so the
 * `MAX` and the insert see one state; `INSERT OR IGNORE` leaves the unique
 * key the last word.
 */
const APPEND_ITEMS_SQL = `WITH req(ord, sid, inst) AS (
  SELECT CAST(j.key AS INTEGER), json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?) j
), fresh AS (
  SELECT r.ord, r.sid, r.inst FROM req r
  WHERE NOT EXISTS (SELECT 1 FROM PlaylistItem p WHERE p.playlistId = ? AND p.instanceId = r.inst AND p.sceneId = r.sid)
), base AS (SELECT COALESCE(MAX(position), -1) AS m FROM PlaylistItem WHERE playlistId = ?)
INSERT OR IGNORE INTO PlaylistItem (playlistId, instanceId, sceneId, position, addedAt)
SELECT ?, f.inst, f.sid, base.m + ROW_NUMBER() OVER (ORDER BY f.ord), ? FROM fresh f CROSS JOIN base`;

/**
 * Adds scenes to the end of a playlist, in the order given, skipping the
 * ones it holds and the ones the adder cannot see (the adder's own access
 * rules, invariants 3 and 10). One statement in one write unit; the caller
 * has checked the adder may add to the playlist.
 */
export async function appendItems(
  playlistId: number,
  userId: number,
  refs: readonly EntityRef[]
): Promise<AppendItemsResult> {
  const requested = distinctRefs(refs);
  const visibleKeys = await getVisibleEntityKeys(userId, "scene", requested);
  const visible = requested.filter((ref) =>
    visibleKeys.has(entityKey(ref.id, ref.instanceId))
  );
  const unavailable = requested.length - visible.length;
  if (visible.length === 0) {
    return { added: 0, alreadyInPlaylist: 0, unavailable };
  }

  const params = [
    pairsJson(visible),
    playlistId,
    playlistId,
    playlistId,
    // epoch milliseconds, as Prisma stores a DateTime
    Date.now(),
  ];
  const added = await dbWrite("playlist.addItems", () =>
    prisma.$executeRawUnsafe(APPEND_ITEMS_SQL, ...params)
  );
  return { added, alreadyInPlaylist: visible.length - added, unavailable };
}

/**
 * Which of these playlists hold the scene, by its id on its instance: one
 * statement on the item key `(playlistId, instanceId, sceneId)`. Membership
 * is the rows', whatever the viewer can see of the scene.
 */
export async function playlistsHoldingScene(
  playlistIds: readonly number[],
  scene: EntityRef
): Promise<Set<number>> {
  if (playlistIds.length === 0) return new Set();
  const rows = await prisma.$queryRawUnsafe<{ playlistId: number }[]>(
    `SELECT pi.playlistId FROM json_each(?) j
CROSS JOIN PlaylistItem pi ON pi.playlistId = j.value AND pi.instanceId = ? AND pi.sceneId = ?`,
    JSON.stringify(playlistIds),
    scene.instanceId,
    scene.id
  );
  return new Set(rows.map((row) => row.playlistId));
}

/**
 * The scenes of these items the viewer can see, keyed by entityKey, from the
 * scene builder (exclusions, allowed instances and the viewer's own fields
 * in SQL), REFS_PER_READ refs at a time
 */
async function loadItemScenes(
  userId: number,
  allowedInstanceIds: readonly string[],
  items: ReadonlyArray<{ sceneId: string; instanceId: string }>
): Promise<Map<string, NormalizedScene>> {
  const refs = distinctRefs(
    items.flatMap((item): EntityRef[] => {
      const instanceId = emptyToNull(item.instanceId);
      return instanceId === null ? [] : [{ id: item.sceneId, instanceId }];
    })
  );
  const scenes = new Map<string, NormalizedScene>();
  // An empty list would lift the builder's instance filter
  if (refs.length === 0 || allowedInstanceIds.length === 0) return scenes;

  // In turn: the reads share the pooled connection's cache
  for (let start = 0; start < refs.length; start += REFS_PER_READ) {
    const found = await sceneQueryBuilder.getByRefs({
      userId,
      refs: refs.slice(start, start + REFS_PER_READ),
      allowedInstanceIds,
    });
    for (const scene of found) {
      scenes.set(entityKey(scene.id, scene.instanceId), scene);
    }
  }
  return scenes;
}

/**
 * A playlist's items with their scenes, as the viewer sees them. The one
 * read of a playlist's items: a page comes in the view's sort
 * (`orderTerms`), whose joins only the page statement takes; the count
 * reads the visible items alone.
 */
export async function loadPlaylistItems(
  options: LoadPlaylistItemsOptions
): Promise<PlaylistItems> {
  const { userId, allowedInstanceIds, playlistId, paging } = options;
  const sort = options.sort ?? POSITION_ASC;

  if (paging === undefined) {
    // Every item, as the playlist page has always read them
    const rows = await prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const scenes = await loadItemScenes(userId, allowedInstanceIds, rows);
    const items = rows.map((row) => ({
      ...row,
      scene: scenes.get(entityKey(row.sceneId, row.instanceId)) ?? null,
    }));
    return {
      items,
      totalItems: items.filter((item) => item.scene !== null).length,
    };
  }

  if (allowedInstanceIds.length === 0) return { items: [], totalItems: 0 };

  const { join, where } = visibleItem(userId, allowedInstanceIds);
  const { joins: sortJoins, order } = orderTerms(userId, sort);
  const fromWith = (joins: readonly SqlFragment[]) => ({
    sql: `FROM PlaylistItem pi
${[join, ...joins].map((j) => j.sql).join("\n")}
WHERE pi.playlistId = ? AND ${where.sql}`,
    params: [
      ...join.params,
      ...joins.flatMap((j) => j.params),
      playlistId,
      ...where.params,
    ],
  });

  const counted = fromWith([]);
  const countRows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*) AS total ${counted.sql}`,
    ...counted.params
  );
  const totalItems = Number(countRows[0]?.total ?? 0n);

  const paged = fromWith(sortJoins);
  const rows = await prisma.$queryRawUnsafe<PlaylistItemQueryRow[]>(
    `SELECT pi.id, pi.playlistId, pi.sceneId, pi.instanceId, pi.position, pi.addedAt
${paged.sql}
ORDER BY ${order.sql}
LIMIT ? OFFSET ?`,
    ...paged.params,
    ...order.params,
    paging.perPage,
    (paging.page - 1) * paging.perPage
  );
  if (rows.length === 0) return { items: [], totalItems };

  const scenes = await loadItemScenes(userId, allowedInstanceIds, rows);
  // A scene hidden since the page statement leaves its item out
  const items = rows.flatMap((row) => {
    const scene = scenes.get(entityKey(row.sceneId, row.instanceId));
    return scene ? [{ ...row, scene }] : [];
  });
  return { items, totalItems };
}
