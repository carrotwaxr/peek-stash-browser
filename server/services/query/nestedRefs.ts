/**
 * The entities a list row nests, loaded for a whole page: a scene's
 * performers, tags, inherited tags, collections, galleries and studio; a
 * gallery's and an image's; a collection's studio; a clip's tags and primary
 * tag. One statement per relation, driven from the page's (id, instance)
 * pairs bound as one JSON parameter (server-sql.md, "Every list query").
 *
 * A row nests only what the viewer may see (invariant 3): the entity is live
 * (`deletedAt IS NULL`) and, with the viewer's exclusions applied, has no
 * UserExcludedEntity row for them, global ('') or on the entity's own
 * instance. The parent's visibility does not settle its refs': cascades are
 * first order, so a scene the viewer sees can hold a performer excluded
 * through a tag, and a soft-deleted tag keeps its junction rows until the
 * next sync removes them. An admin's rows hold only their own hides and
 * their cascades, so no role logic is needed here.
 *
 * A ref carries what a chip, a card line or a tooltip shows: the name or
 * title, the image, the (id, instance) for its link. It never carries
 * Stash's own `favorite` or `rating100`, which belong to the Stash user
 * (CLAUDE.md), and no client reads a favorite or a rating from a ref.
 * TooltipRelations builds its refs with the same functions.
 */
import prisma from "../../prisma/singleton.js";
import type {
  GalleryRef,
  GroupRef,
  PerformerRef,
  StudioRef,
  TagRef,
} from "../../types/index.js";
import type {
  GalleryRefRow,
  GroupRefRow,
  NestedParentRow,
  PerformerRefRow,
  RefKeyRow,
  StudioRefRow,
  TagRefRow,
} from "../../types/internal/queryRows.js";
import {
  type EntityRef,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../../utils/entityRef.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { type JunctionTarget, exclusionJoin } from "../../utils/sqlClauses.js";
import { emptyToNull } from "../../utils/sqlHelpers.js";
import { getGalleryFallbackTitle } from "../../utils/titleUtils.js";
import type { ExclusionEntityType } from "./EntityQueryBuilder.js";

/** Who is looking, and whether their exclusions apply (a list's context) */
export interface NestedViewer {
  readonly userId: number;
  readonly applyExclusions: boolean;
}

/** How a nested entity is read and shown */
export interface NestedEntity<Row, Ref> {
  readonly table: string;
  readonly entityType: ExclusionEntityType;
  /**
   * The columns besides `x.id` and `x.stashInstanceId`, on the entity's
   * alias `x`; a link column (a scene's collection index) as `j.<column>`,
   * read by loadNestedRefs only
   */
  readonly columns: string;
  readonly toRef: (row: RefKeyRow & Row) => Ref;
}

/**
 * How a page's parents reach a nested entity, read as `j`: a junction (a
 * builder's filter target is one), or the parent's own table for a column
 * (a clip's primary tag, `parentIdCol` "id").
 */
export type NestedLink = Pick<
  JunctionTarget,
  "table" | "parentIdCol" | "parentInstanceCol" | "refIdCol" | "refInstanceCol"
>;

// ---------------------------------------------------------------------------
// The ref shapes (TooltipRelations builds its refs with these too)
// ---------------------------------------------------------------------------

type WithId<Row> = Row & { id: string };

export const performerRef = (
  row: WithId<PerformerRefRow>,
  instanceId: string
): PerformerRef => ({
  id: row.id,
  instanceId,
  name: row.name,
  disambiguation: emptyToNull(row.disambiguation),
  gender: emptyToNull(row.gender),
  image_path: toProxyUrl(row.imagePath, instanceId),
});

export const studioRef = (
  row: WithId<StudioRefRow>,
  instanceId: string
): StudioRef => ({
  id: row.id,
  instanceId,
  name: row.name,
  image_path: toProxyUrl(row.imagePath, instanceId),
  parent_studio: row.parentId ? { id: row.parentId } : null,
});

export const tagRef = (row: WithId<TagRefRow>, instanceId: string): TagRef => ({
  id: row.id,
  instanceId,
  name: row.name,
  image_path: toProxyUrl(row.imagePath, instanceId),
});

export const groupRef = (
  row: WithId<GroupRefRow>,
  instanceId: string
): GroupRef => ({
  id: row.id,
  instanceId,
  name: row.name,
  front_image_path: toProxyUrl(row.frontImagePath, instanceId),
  back_image_path: toProxyUrl(row.backImagePath, instanceId),
});

/** The displayed title: the title, else the file, else the folder's name */
export const galleryRef = (
  row: WithId<GalleryRefRow>,
  instanceId: string
): GalleryRef => ({
  id: row.id,
  instanceId,
  title:
    emptyToNull(row.title) ??
    getGalleryFallbackTitle(row.folderPath, row.fileBasename),
  cover: toProxyUrl(row.coverPath, instanceId),
});

/** Each ref shape's columns, on alias `x` */
export const REF_COLUMNS = {
  performer: "x.name, x.disambiguation, x.gender, x.imagePath",
  studio: "x.name, x.imagePath, x.parentId",
  tag: "x.name, x.imagePath",
  group: "x.name, x.frontImagePath, x.backImagePath",
  gallery: "x.title, x.folderPath, x.fileBasename, x.coverPath",
} as const;

export const PERFORMER_REF: NestedEntity<PerformerRefRow, PerformerRef> = {
  table: "StashPerformer",
  entityType: "performer",
  columns: REF_COLUMNS.performer,
  toRef: (row) => performerRef(row, row.stashInstanceId),
};

export const STUDIO_REF: NestedEntity<StudioRefRow, StudioRef> = {
  table: "StashStudio",
  entityType: "studio",
  columns: REF_COLUMNS.studio,
  toRef: (row) => studioRef(row, row.stashInstanceId),
};

export const TAG_REF: NestedEntity<TagRefRow, TagRef> = {
  table: "StashTag",
  entityType: "tag",
  columns: REF_COLUMNS.tag,
  toRef: (row) => tagRef(row, row.stashInstanceId),
};

export const GROUP_REF: NestedEntity<GroupRefRow, GroupRef> = {
  table: "StashGroup",
  entityType: "group",
  columns: REF_COLUMNS.group,
  toRef: (row) => groupRef(row, row.stashInstanceId),
};

export const GALLERY_REF: NestedEntity<GalleryRefRow, GalleryRef> = {
  table: "StashGallery",
  entityType: "gallery",
  columns: REF_COLUMNS.gallery,
  toRef: (row) => galleryRef(row, row.stashInstanceId),
};

// ---------------------------------------------------------------------------
// The loads
// ---------------------------------------------------------------------------

/** The live-and-visible part of a load: the exclusion join and the WHERE */
function visibility(
  entityType: ExclusionEntityType,
  viewer: NestedViewer
): { join: string; where: string; params: number[] } {
  if (!viewer.applyExclusions) {
    return { join: "", where: "WHERE x.deletedAt IS NULL", params: [] };
  }
  return {
    join: `\n${exclusionJoin("e", entityType, "x.id", "x.stashInstanceId")}`,
    where: "WHERE x.deletedAt IS NULL AND e.id IS NULL",
    params: [viewer.userId],
  };
}

/** A JSON list of [id, instance] pairs as rows */
const pairs = (name: string, id: string, instanceId: string) =>
  `WITH ${name}(${id}, ${instanceId}) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
)`;

/**
 * Each parent's visible nested entities of one kind, by the parent's
 * entityKey (a parent with none is absent), in the link's key order. One
 * statement: the page's pairs drive into the link's key and each link row
 * into the entity's primary key (`CROSS JOIN` keeps that order), then the
 * viewer's exclusion rows by their unique key.
 */
export async function loadNestedRefs<Row, Ref>(
  entity: NestedEntity<Row, Ref>,
  link: NestedLink,
  parents: readonly EntityRef[],
  viewer: NestedViewer
): Promise<Map<string, Ref[]>> {
  const byParent = new Map<string, Ref[]>();
  const page = distinctRefs(parents);
  if (page.length === 0) return byParent;

  const visible = visibility(entity.entityType, viewer);
  const rows = await prisma.$queryRawUnsafe<
    Array<NestedParentRow & RefKeyRow & Row>
  >(
    `${pairs("page", "pid", "pinst")}
SELECT pg.pid, pg.pinst, x.id, x.stashInstanceId, ${entity.columns}
FROM page pg
CROSS JOIN ${link.table} j ON j.${link.parentIdCol} = pg.pid AND j.${link.parentInstanceCol} = pg.pinst
CROSS JOIN ${entity.table} x ON x.id = j.${link.refIdCol} AND x.stashInstanceId = j.${link.refInstanceCol}${visible.join}
${visible.where}`,
    pairsJson(page),
    ...visible.params
  );

  for (const row of rows) {
    const key = entityKey(row.pid, row.pinst);
    const list = byParent.get(key) ?? [];
    list.push(entity.toRef(row));
    byParent.set(key, list);
  }
  return byParent;
}

/**
 * The visible entities among the refs, by entityKey (one the viewer cannot
 * see, or that is gone, is absent): a row's own studio, a scene's inherited
 * tags. One statement, each distinct ref looked up by primary key.
 */
export async function loadRefsByKey<Row, Ref>(
  entity: NestedEntity<Row, Ref>,
  refs: readonly EntityRef[],
  viewer: NestedViewer
): Promise<Map<string, Ref>> {
  const byKey = new Map<string, Ref>();
  const distinct = distinctRefs(refs);
  if (distinct.length === 0) return byKey;

  const visible = visibility(entity.entityType, viewer);
  const rows = await prisma.$queryRawUnsafe<Array<RefKeyRow & Row>>(
    `${pairs("refs", "rid", "rinst")}
SELECT x.id, x.stashInstanceId, ${entity.columns}
FROM refs r
CROSS JOIN ${entity.table} x ON x.id = r.rid AND x.stashInstanceId = r.rinst${visible.join}
${visible.where}`,
    pairsJson(distinct),
    ...visible.params
  );

  for (const row of rows) {
    byKey.set(entityKey(row.id, row.stashInstanceId), entity.toRef(row));
  }
  return byKey;
}
