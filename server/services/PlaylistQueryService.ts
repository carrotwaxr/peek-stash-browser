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
 * by key). A playlist's items go through `loadPlaylistItems`, the one read
 * a sort can join later: a page of the visible items in SQL, or every item
 * without paging, and their scenes from the scene builder, whose joins carry
 * the viewer's own rating, favorite, O and play fields.
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
import { type EntityRef, distinctRefs, entityKey } from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";
import { buildInstanceFilterClause } from "./UserInstanceService.js";

/** The preview thumbnails a playlist shows */
const PREVIEW_COUNT = 4;

/**
 * Refs per scene builder read, a list page's most rows: its OR of
 * primary-key pairs costs about 0.2 ms a ref up to 1,000 refs, then grows
 * faster (2,000 refs in one read took 1.8 s on the prod snapshot)
 */
const REFS_PER_READ = PER_PAGE_MAX;

type SqlParam = string | number;

interface Fragment {
  readonly sql: string;
  readonly params: SqlParam[];
}

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

/**
 * What makes item `pi` visible: its scene `s` on the item's instance (`join`,
 * after `pi`), and that scene live, allowed and not excluded (`where`)
 */
function visibleItem(
  userId: number,
  allowedInstanceIds: readonly string[]
): { join: Fragment; where: Fragment } {
  const instances = buildInstanceFilterClause(
    [...allowedInstanceIds],
    "s.stashInstanceId"
  );
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
 * The scenes of these items the viewer can see, keyed by entityKey, from the
 * scene builder (exclusions, allowed instances and the viewer's own fields
 * in SQL), REFS_PER_READ refs at a time
 */
async function loadItemScenes(
  userId: number,
  allowedInstanceIds: readonly string[],
  items: ReadonlyArray<{ sceneId: string; instanceId: string | null }>
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
    const { scenes: found } = await sceneQueryBuilder.getByRefs({
      userId,
      refs: refs.slice(start, start + REFS_PER_READ),
      allowedInstanceIds: [...allowedInstanceIds],
    });
    for (const scene of found) {
      scenes.set(entityKey(scene.id, scene.instanceId), scene);
    }
  }
  return scenes;
}

/**
 * A playlist's items with their scenes, as the viewer sees them. The one
 * read of a playlist's items: a view sort joins its page statement.
 */
export async function loadPlaylistItems(
  options: LoadPlaylistItemsOptions
): Promise<PlaylistItems> {
  const { userId, allowedInstanceIds, playlistId, paging } = options;

  if (paging === undefined) {
    // Every item, as the playlist page has always read them
    const rows = await prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const scenes = await loadItemScenes(userId, allowedInstanceIds, rows);
    const items = rows.map((row) => ({
      ...row,
      scene:
        row.instanceId === null
          ? null
          : (scenes.get(entityKey(row.sceneId, row.instanceId)) ?? null),
    }));
    return {
      items,
      totalItems: items.filter((item) => item.scene !== null).length,
    };
  }

  if (allowedInstanceIds.length === 0) return { items: [], totalItems: 0 };

  const { join, where } = visibleItem(userId, allowedInstanceIds);
  const from = `FROM PlaylistItem pi
${join.sql}
WHERE pi.playlistId = ? AND ${where.sql}`;
  const fromParams = [...join.params, playlistId, ...where.params];

  const countRows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*) AS total ${from}`,
    ...fromParams
  );
  const totalItems = Number(countRows[0]?.total ?? 0n);

  const rows = await prisma.$queryRawUnsafe<PlaylistItemQueryRow[]>(
    `SELECT pi.id, pi.playlistId, pi.sceneId, pi.instanceId, pi.position, pi.addedAt
${from}
ORDER BY pi.position, pi.id
LIMIT ? OFFSET ?`,
    ...fromParams,
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
