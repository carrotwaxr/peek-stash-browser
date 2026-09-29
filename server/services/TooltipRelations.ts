/**
 * The related entities the performer, studio, tag and collection cards list
 * in their tooltips (item 41.2), capped per card in SQL, with how many there
 * are.
 *
 * One statement per relation serves a whole page. It drives from the page's
 * parents, bound as one JSON parameter of (id, instance) pairs, and lists for
 * each parent the related entities the user can see: most shared scenes
 * first (through a junction of the related entity's own, such as a tag's
 * performers, the largest first), then by name and id, at most
 * TOOLTIP_LIMIT, and counts them all in `relation_totals`. A card's own tags
 * are listed whole, by name. A studio's performers are only counted: the
 * studio card's performers indicator shows a number and no tooltip.
 *
 * The related entities the user can see, as the list rows' nested refs:
 * live (deletedAt IS NULL), with no UserExcludedEntity row for the user
 * (global or on the entity's instance), and on the parent's instance, which
 * the list already held to the user's allowed instances. A path through
 * scenes takes live scenes only, so a performer's card never names a studio
 * or collection it shares only a deleted scene with.
 *
 * The refs are the list rows' nested refs (`query/nestedRefs.ts`): names,
 * images and links, never Stash's own favorite or rating.
 */
import prisma from "../prisma/singleton.js";
import type {
  GalleryRef,
  GroupRef,
  PerformerRef,
  RelationTotals,
  StudioRef,
  TagRef,
} from "../types/index.js";
import type {
  GalleryRefRow,
  GroupRefRow,
  PerformerRefRow,
  StudioRefRow,
  TagRefRow,
  TooltipListRow,
  TooltipTotalRow,
} from "../types/internal/queryRows.js";
import {
  type EntityRef,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../utils/entityRef.js";
import {
  REF_COLUMNS,
  galleryRef,
  groupRef,
  performerRef,
  studioRef,
  tagRef,
} from "./query/nestedRefs.js";

/** The most related entities of one kind a card lists. */
export const TOOLTIP_LIMIT = 12;

/** The cards whose relations load here. */
export type TooltipParentType = "performer" | "studio" | "tag" | "group";

/** One parent's relation lists and totals, under the response's names. */
export interface TooltipRelations {
  tags?: TagRef[];
  performers?: PerformerRef[];
  studios?: StudioRef[];
  groups?: GroupRef[];
  galleries?: GalleryRef[];
  relation_totals: RelationTotals;
}

type RelatedType = "performer" | "studio" | "tag" | "group" | "gallery";

interface RelatedRow {
  performer: PerformerRefRow;
  studio: StudioRefRow;
  tag: TagRefRow;
  group: GroupRefRow;
  gallery: GalleryRefRow;
}

interface RelatedRef {
  performer: PerformerRef;
  studio: StudioRef;
  tag: TagRef;
  group: GroupRef;
  gallery: GalleryRef;
}

/** How a related entity is read, ordered and put on its parent. */
interface RelatedEntity<R extends RelatedType> {
  table: string;
  /** Its size: the weight of a relation through a junction of its own */
  size: string;
  /** What it sorts by after the weight, before its id */
  sortName: string;
  /** Its columns, as RelatedRow names them */
  columns: string;
  toRef(row: TooltipListRow & RelatedRow[R]): RelatedRef[R];
  /** The parent's list of these, created empty */
  list(into: TooltipRelations): RelatedRef[R][];
  /** Where the parent's total goes; tags are never capped, so have none */
  totalKey: keyof RelationTotals | null;
}

const RELATED: { [R in RelatedType]: RelatedEntity<R> } = {
  performer: {
    table: "StashPerformer",
    size: "x.sceneCount",
    sortName: "x.name",
    columns: REF_COLUMNS.performer,
    toRef: (row) => performerRef(row, row.pinst),
    list: (into) => (into.performers ??= []),
    totalKey: "performers",
  },
  studio: {
    table: "StashStudio",
    size: "x.sceneCount",
    sortName: "x.name",
    columns: REF_COLUMNS.studio,
    toRef: (row) => studioRef(row, row.pinst),
    list: (into) => (into.studios ??= []),
    totalKey: "studios",
  },
  tag: {
    table: "StashTag",
    size: "x.sceneCount",
    sortName: "x.name",
    columns: REF_COLUMNS.tag,
    toRef: (row) => tagRef(row, row.pinst),
    list: (into) => (into.tags ??= []),
    totalKey: null,
  },
  group: {
    table: "StashGroup",
    size: "x.sceneCount",
    sortName: "x.name",
    columns: REF_COLUMNS.group,
    toRef: (row) => groupRef(row, row.pinst),
    list: (into) => (into.groups ??= []),
    totalKey: "groups",
  },
  gallery: {
    table: "StashGallery",
    size: "x.imageCount",
    // The displayed title's fallbacks, near enough to order by
    sortName: "COALESCE(NULLIF(x.title, ''), x.fileBasename, x.folderPath)",
    columns: REF_COLUMNS.gallery,
    toRef: (row) => galleryRef(row, row.pinst),
    list: (into) => (into.galleries ??= []),
    totalKey: "galleries",
  },
};

/** One relation of a parent type. */
interface RelationSpec<R extends RelatedType> {
  related: R;
  /**
   * SELECT pid, pinst, rid, weight FROM page pg ...: each related id of each
   * parent once, with the live scenes they share (0 through a junction)
   */
  rel: string;
  /** Order by shared scenes, by the related entity's size, or by name */
  weight: "shared" | "size" | "none";
  /** TOOLTIP_LIMIT with a total; listed whole; or counted only */
  mode: "capped" | "all" | "total";
}

type AnyRelationSpec = { [R in RelatedType]: RelationSpec<R> }[RelatedType];

/** Each parent's live scenes, as `s`. */
const SCENES_OF = {
  performer: `CROSS JOIN ScenePerformer ps ON ps.performerId = pg.pid AND ps.performerInstanceId = pg.pinst
  JOIN StashScene s ON s.id = ps.sceneId AND s.stashInstanceId = ps.sceneInstanceId AND s.deletedAt IS NULL`,
  // The unary + keeps a database without statistics off
  // StashScene_stashInstanceId_idx (every scene of the instance): with it,
  // StashScene_studioId_idx
  studio: `CROSS JOIN StashScene s ON s.studioId = pg.pid AND +s.stashInstanceId = pg.pinst AND s.deletedAt IS NULL`,
  group: `CROSS JOIN SceneGroup gs ON gs.groupId = pg.pid AND gs.groupInstanceId = pg.pinst
  JOIN StashScene s ON s.id = gs.sceneId AND s.stashInstanceId = gs.sceneInstanceId AND s.deletedAt IS NULL`,
} as const;

/** The related ids of a scene `s`. */
const OF_SCENE = {
  performer: {
    id: "sp.performerId",
    join: "JOIN ScenePerformer sp ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId",
  },
  studio: { id: "s.studioId", join: "" },
  group: {
    id: "sg.groupId",
    join: "JOIN SceneGroup sg ON sg.sceneId = s.id AND sg.sceneInstanceId = s.stashInstanceId",
  },
  gallery: {
    id: "sgl.galleryId",
    join: "JOIN SceneGallery sgl ON sgl.sceneId = s.id AND sgl.sceneInstanceId = s.stashInstanceId",
  },
} as const;

/** The entities of a parent's live scenes, by how many scenes they share. */
function throughScenes<R extends keyof typeof OF_SCENE>(
  parent: keyof typeof SCENES_OF,
  related: R,
  mode: "capped" | "total" = "capped"
): RelationSpec<R> {
  const of = OF_SCENE[related];
  return {
    related,
    weight: "shared",
    mode,
    rel: `SELECT pg.pid, pg.pinst, ${of.id}, COUNT(*)
  FROM page pg
  ${SCENES_OF[parent]}
  ${of.join}
  WHERE ${of.id} IS NOT NULL
  GROUP BY pg.pid, pg.pinst, ${of.id}`,
  };
}

/** The entities of a junction keyed by the parent's (id, instance). */
function throughJunction<R extends RelatedType>(
  related: R,
  junction: string,
  parentCols: readonly [id: string, instanceId: string],
  relatedIdCol: string,
  mode: "capped" | "all" = "capped"
): RelationSpec<R> {
  return {
    related,
    weight: mode === "all" ? "none" : "size",
    mode,
    rel: `SELECT pg.pid, pg.pinst, j.${relatedIdCol}, 0
  FROM page pg
  CROSS JOIN ${junction} j ON j.${parentCols[0]} = pg.pid AND j.${parentCols[1]} = pg.pinst`,
  };
}

/** A card's own tags, listed whole. */
const ownTags = (junction: string, parentCols: readonly [string, string]) =>
  throughJunction("tag", junction, parentCols, "tagId", "all");

const BY_TAG = ["tagId", "tagInstanceId"] as const;

/** The relations each card lists, in the order the statements go out. */
const PARENT_RELATIONS: Record<TooltipParentType, readonly AnyRelationSpec[]> =
  {
    performer: [
      ownTags("PerformerTag", ["performerId", "performerInstanceId"]),
      throughScenes("performer", "studio"),
      throughScenes("performer", "group"),
      throughJunction(
        "gallery",
        "GalleryPerformer",
        ["performerId", "performerInstanceId"],
        "galleryId"
      ),
    ],
    studio: [
      ownTags("StudioTag", ["studioId", "studioInstanceId"]),
      throughScenes("studio", "performer", "total"),
      throughScenes("studio", "group"),
      {
        related: "gallery",
        weight: "size",
        mode: "capped",
        rel: `SELECT pg.pid, pg.pinst, g.id, 0
  FROM page pg
  CROSS JOIN StashGallery g ON g.studioId = pg.pid AND +g.stashInstanceId = pg.pinst`,
      },
    ],
    tag: [
      throughJunction("performer", "PerformerTag", BY_TAG, "performerId"),
      throughJunction("studio", "StudioTag", BY_TAG, "studioId"),
      throughJunction("group", "GroupTag", BY_TAG, "groupId"),
      throughJunction("gallery", "GalleryTag", BY_TAG, "galleryId"),
    ],
    group: [
      ownTags("GroupTag", ["groupId", "groupInstanceId"]),
      throughScenes("group", "performer"),
      throughScenes("group", "gallery"),
    ],
  };

/** The page's parents, from the one JSON parameter of [id, instance] pairs. */
const PAGE = `page(pid, pinst) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
)`;

/**
 * One relation's statement. Binds the page's pairs, the user, the related
 * entity type and, when capped, TOOLTIP_LIMIT.
 */
function tooltipStatement<R extends RelatedType>(
  spec: RelationSpec<R>
): string {
  const x = RELATED[spec.related];
  const head = `WITH ${PAGE},
rel(pid, pinst, rid, weight) AS (
  ${spec.rel}
)`;
  const visible = `FROM rel r
  JOIN ${x.table} x ON x.id = r.rid AND x.stashInstanceId = r.pinst AND x.deletedAt IS NULL
  LEFT JOIN UserExcludedEntity e ON e.userId = ? AND e.entityType = ? AND e.entityId = x.id
    AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)
  WHERE e.id IS NULL`;

  if (spec.mode === "total") {
    return `${head}
SELECT r.pid, r.pinst, COUNT(*) AS total
${visible}
GROUP BY r.pid, r.pinst`;
  }

  const weight =
    spec.weight === "shared"
      ? "r.weight DESC, "
      : spec.weight === "size"
        ? `${x.size} DESC, `
        : "";
  return `${head},
vis AS (
  SELECT r.pid, r.pinst, x.id, ${x.columns},
    ROW_NUMBER() OVER (PARTITION BY r.pid, r.pinst ORDER BY ${weight}${x.sortName} COLLATE NOCASE, x.id) AS rn,
    COUNT(*) OVER (PARTITION BY r.pid, r.pinst) AS total
  ${visible}
)
SELECT * FROM vis${spec.mode === "capped" ? " WHERE rn <= ?" : ""}
ORDER BY pid, pinst, rn`;
}

/** Runs one relation's statement and puts its rows on their parents. */
async function loadRelation<R extends RelatedType>(
  spec: RelationSpec<R>,
  parentsJson: string,
  userId: number,
  byParent: ReadonlyMap<string, TooltipRelations>
): Promise<void> {
  const related: RelatedEntity<R> = RELATED[spec.related];
  const sql = tooltipStatement(spec);

  if (spec.mode === "total") {
    const rows = await prisma.$queryRawUnsafe<TooltipTotalRow[]>(
      sql,
      parentsJson,
      userId,
      spec.related
    );
    const key = related.totalKey;
    for (const row of rows) {
      const into = byParent.get(entityKey(row.pid, row.pinst));
      if (into && key) into.relation_totals[key] = Number(row.total);
    }
    return;
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<TooltipListRow & RelatedRow[R]>
  >(
    sql,
    parentsJson,
    userId,
    spec.related,
    ...(spec.mode === "capped" ? [TOOLTIP_LIMIT] : [])
  );
  for (const row of rows) {
    const into = byParent.get(entityKey(row.pid, row.pinst));
    if (!into) continue;
    related.list(into).push(related.toRef(row));
    if (spec.mode === "capped" && related.totalKey) {
      into.relation_totals[related.totalKey] = Number(row.total);
    }
  }
}

/**
 * The tooltip relations of a page of cards, keyed by each parent's
 * entityKey: every parent gets each of its lists (empty when it has none)
 * and a total for each capped or counted relation (0 when it has none).
 * One statement per relation.
 */
export async function loadTooltipRelations(
  parentType: TooltipParentType,
  parents: readonly EntityRef[],
  userId: number
): Promise<Map<string, TooltipRelations>> {
  const specs = PARENT_RELATIONS[parentType];
  const refs = distinctRefs(parents);
  const byParent = new Map<string, TooltipRelations>();
  for (const ref of refs) {
    const into: TooltipRelations = { relation_totals: {} };
    for (const spec of specs) {
      const related = RELATED[spec.related];
      if (spec.mode !== "total") related.list(into);
      if (spec.mode !== "all" && related.totalKey) {
        into.relation_totals[related.totalKey] = 0;
      }
    }
    byParent.set(entityKey(ref.id, ref.instanceId), into);
  }
  if (refs.length === 0) return byParent;

  // One statement after another: sent together they spread over pooled
  // connections with cold page caches and take longer, and less evenly (a
  // page of 100 performers by scene count on prod: 57 to 134 ms together,
  // 53 to 64 ms in turn)
  const parentsJson = pairsJson(refs);
  for (const spec of specs) {
    await loadRelation(spec, parentsJson, userId, byParent);
  }
  return byParent;
}
