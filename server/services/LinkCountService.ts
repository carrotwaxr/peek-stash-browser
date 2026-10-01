/**
 * The count columns a card shows (item 36), as Peek's own live link counts.
 *
 * A performer's, studio's, tag's, collection's or gallery's count column is
 * the number of live entities of the relation, on the entity's own
 * instance, linked to it as the list behind the card links them (the tab's
 * filter, with no sub-tags or sub-studios). Sync writes Stash's number when
 * it inserts a row and never on update; this service replaces it with the
 * count of the synced rows, for every live row ("all": a full sync and data
 * migration 010) or for the rows a sync's changes reach
 * (`StashSyncService.countScope`). Stash refreshes an entity's own counts
 * only when that entity changes, so its numbers lag the junction rows.
 *
 * The reads run outside the writer queue; each relation writes only the rows
 * whose count moved, up to WRITE_CHUNK a unit.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import prisma from "../prisma/singleton.js";
import { dbWrite } from "../utils/dbWrite.js";
import {
  type EntityRef,
  distinctRefs,
  entityKey,
  pairsJson,
} from "../utils/entityRef.js";
import { logger } from "../utils/logger.js";

/** The entity types whose count columns this service keeps. */
export type LinkCountType =
  | "performers"
  | "studios"
  | "tags"
  | "groups"
  | "galleries";

/** The rows a scoped rebuild recounts, per type. */
export type LinkCountScope = Record<LinkCountType, readonly EntityRef[]>;

/** The types whose rows a sync soft-deleted or changed, for `linkedThrough`. */
export interface LinkSources {
  scenes: readonly EntityRef[];
  galleries: readonly EntityRef[];
  images: readonly EntityRef[];
  performers: readonly EntityRef[];
  studios: readonly EntityRef[];
  groups: readonly EntityRef[];
}

/** Rows written per write unit */
const WRITE_CHUNK = 5000;

/** One page of pairs bound as JSON, as the list relations read them */
const PAIR = {
  id: "json_extract(p.value, '$[0]')",
  instanceId: "json_extract(p.value, '$[1]')",
} as const;

/** The scope's pairs, once, for statements that read them more than once */
const PAIRS_CTE = `
      WITH pairs(id, instanceId) AS MATERIALIZED (
        SELECT ${PAIR.id}, ${PAIR.instanceId} FROM json_each(?) p
      )`;

/** One count column: the statements that count it. */
interface Relation {
  column: string;
  /** (id, instanceId, n) of every entity with a live link; no parameter */
  all: string;
  /** The same for the entities bound as one JSON parameter of pairs */
  scoped: string;
}

/**
 * A count over a junction whose far side is soft-deletable: `key` is the
 * counted-for side, `counted` the side that must be live. Both forms count
 * the junction rows by the key's index and subtract the rows of
 * soft-deleted far sides, found from the entity table (server-sql.md:
 * joining every junction row to its entity for `deletedAt` reads a table
 * row per junction row); the scoped form keeps the scope's keys in both.
 * Its `+` keeps the pairs a filter on the deleted rows' links: as an index
 * constraint SQLite probes every pair for every deleted row (the prod
 * snapshot holds 118k deleted images: 0.8 s for 250 galleries, 0.08 s
 * with it).
 */
function junctionCount(
  column: string,
  junction: string,
  key: { id: string; instanceId: string },
  counted: { table: string; id: string; instanceId: string }
): Relation {
  const counts = junctionCounts(junction, key, counted);
  return { column, all: counts.all, scoped: `${PAIRS_CTE}${counts.scoped}` };
}

/**
 * The SELECTs of `junctionCount`, as (id, instanceId, n); the scoped one
 * reads the `pairs` CTE (PAIRS_CTE).
 */
function junctionCounts(
  junction: string,
  key: { id: string; instanceId: string },
  counted: { table: string; id: string; instanceId: string }
): { all: string; scoped: string } {
  const byKey = `j."${key.id}", j."${key.instanceId}"`;
  const deleted = (scoped: boolean) => `
        SELECT j."${key.id}" AS id, j."${key.instanceId}" AS instanceId, COUNT(*) AS n
        FROM "${counted.table}" c
        CROSS JOIN "${junction}" j ON j."${counted.id}" = c.id AND j."${counted.instanceId}" = c.stashInstanceId
        WHERE c.deletedAt IS NOT NULL${
          scoped
            ? `
          AND (+j."${key.id}", +j."${key.instanceId}") IN (SELECT id, instanceId FROM pairs)`
            : ""
        }
        GROUP BY ${byKey}`;
  return {
    all: `
      SELECT t.id, t.instanceId, t.n - COALESCE(d.n, 0) AS n
      FROM (
        SELECT j."${key.id}" AS id, j."${key.instanceId}" AS instanceId, COUNT(*) AS n
        FROM "${junction}" j
        GROUP BY ${byKey}
      ) t
      LEFT JOIN (${deleted(false)}
      ) d ON d.id = t.id AND d.instanceId = t.instanceId`,
    scoped: `
      SELECT t.id, t.instanceId, t.n - COALESCE(d.n, 0) AS n
      FROM (
        SELECT pr.id, pr.instanceId, COUNT(*) AS n
        FROM pairs pr
        CROSS JOIN "${junction}" j ON j."${key.id}" = pr.id AND j."${key.instanceId}" = pr.instanceId
        GROUP BY pr.id, pr.instanceId
      ) t
      LEFT JOIN (${deleted(true)}
      ) d ON d.id = t.id AND d.instanceId = t.instanceId`,
  };
}

/** A tag's live scenes with a SceneTag row (`junctionCounts`) */
const TAG_SCENES = junctionCounts(
  "SceneTag",
  { id: "tagId", instanceId: "tagInstanceId" },
  { table: "StashScene", id: "sceneId", instanceId: "sceneInstanceId" }
);

/** The junction row `j`'s scene has no SceneTag row for its tag */
const NOT_DIRECT = `NOT EXISTS (
          SELECT 1 FROM SceneTag d
          WHERE d.sceneId = j.sceneId AND d.sceneInstanceId = j.sceneInstanceId
            AND d.tagId = j.tagId AND d.tagInstanceId = j.tagInstanceId
        )`;

/**
 * A tag's live scenes that inherit it (SceneInheritedTag) and hold no
 * SceneTag row for it, each once (the junction's key makes a scene one row
 * per tag). As `junctionCounts`: the junction's rows by tag, minus those of
 * soft-deleted scenes found from the scene table, never a scene row read
 * per junction row. The whole-library form reads the junction once; the
 * scoped form drives from the pairs by its tag index.
 */
const inheritedOnly = (scoped: boolean) => `
      SELECT t.id, t.instanceId, t.n - COALESCE(dl.n, 0) AS n
      FROM (
        SELECT j.tagId AS id, j.tagInstanceId AS instanceId, COUNT(*) AS n
        FROM ${
          scoped
            ? `pairs pr
        CROSS JOIN SceneInheritedTag j ON j.tagId = pr.id AND j.tagInstanceId = pr.instanceId`
            : "SceneInheritedTag j"
        }
        WHERE ${NOT_DIRECT}
        GROUP BY j.tagId, j.tagInstanceId
      ) t
      LEFT JOIN (
        SELECT j.tagId AS id, j.tagInstanceId AS instanceId, COUNT(*) AS n
        FROM StashScene c
        CROSS JOIN SceneInheritedTag j ON j.sceneId = c.id AND j.sceneInstanceId = c.stashInstanceId
        WHERE c.deletedAt IS NOT NULL${
          scoped
            ? `
          AND (+j.tagId, +j.tagInstanceId) IN (SELECT id, instanceId FROM pairs)`
            : ""
        }
          AND ${NOT_DIRECT}
        GROUP BY j.tagId, j.tagInstanceId
      ) dl ON dl.id = t.id AND dl.instanceId = t.instanceId`;

/**
 * A studio's live scenes, galleries or collections: the rows whose
 * `studioId` is the studio, on the studio's instance (no sub-studios). The
 * `+` keeps the scoped form on the `studioId` index.
 */
function studioColumnCount(column: string, table: string): Relation {
  return {
    column,
    all: `
      SELECT c."studioId" AS id, c.stashInstanceId AS instanceId, COUNT(*) AS n
      FROM "${table}" c
      WHERE c."studioId" IS NOT NULL AND c.deletedAt IS NULL
      GROUP BY c."studioId", c.stashInstanceId`,
    scoped: `
      SELECT ${PAIR.id} AS id, ${PAIR.instanceId} AS instanceId, COUNT(*) AS n
      FROM json_each(?) p
      CROSS JOIN "${table}" c ON c."studioId" = ${PAIR.id} AND +c.stashInstanceId = ${PAIR.instanceId}
      WHERE c.deletedAt IS NULL
      GROUP BY p.key`,
  };
}

/**
 * The scene of a SceneGroup row `sg`, as `s` (the WHERE keeps it live), for
 * the counts through a collection's scenes (`GROUPS_BY_PERFORMER` and
 * `PERFORMERS_BY_GROUP` in the builders)
 */
const LIVE_SCENE_OF_SG =
  "CROSS JOIN StashScene s ON s.id = sg.sceneId AND s.stashInstanceId = sg.sceneInstanceId";

/** The count of distinct far sides per key, over a DISTINCT subquery */
const distinctCount = (inner: string) => `
      SELECT id, instanceId, COUNT(*) AS n FROM (${inner}
      ) GROUP BY id, instanceId`;

const TABLES: Record<LinkCountType, { table: string; relations: Relation[] }> =
  {
    performers: {
      table: "StashPerformer",
      relations: [
        junctionCount(
          "sceneCount",
          "ScenePerformer",
          { id: "performerId", instanceId: "performerInstanceId" },
          { table: "StashScene", id: "sceneId", instanceId: "sceneInstanceId" }
        ),
        junctionCount(
          "galleryCount",
          "GalleryPerformer",
          { id: "performerId", instanceId: "performerInstanceId" },
          {
            table: "StashGallery",
            id: "galleryId",
            instanceId: "galleryInstanceId",
          }
        ),
        {
          // Distinct live collections holding a live scene of the performer
          column: "groupCount",
          all: distinctCount(`
        SELECT DISTINCT sp.performerId AS id, sp.performerInstanceId AS instanceId, sg.groupId, sg.groupInstanceId
        FROM SceneGroup sg
        CROSS JOIN StashGroup g ON g.id = sg.groupId AND g.stashInstanceId = sg.groupInstanceId
        ${LIVE_SCENE_OF_SG}
        CROSS JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
        WHERE g.deletedAt IS NULL AND s.deletedAt IS NULL`),
          scoped: distinctCount(`
        SELECT DISTINCT ${PAIR.id} AS id, ${PAIR.instanceId} AS instanceId, sg.groupId, sg.groupInstanceId
        FROM json_each(?) p
        CROSS JOIN ScenePerformer sp ON sp.performerId = ${PAIR.id} AND sp.performerInstanceId = ${PAIR.instanceId}
        CROSS JOIN StashScene s ON s.id = sp.sceneId AND s.stashInstanceId = sp.sceneInstanceId
        CROSS JOIN SceneGroup sg ON sg.sceneId = sp.sceneId AND sg.sceneInstanceId = sp.sceneInstanceId
        CROSS JOIN StashGroup g ON g.id = sg.groupId AND g.stashInstanceId = sg.groupInstanceId
        WHERE s.deletedAt IS NULL AND g.deletedAt IS NULL`),
        },
      ],
    },
    studios: {
      table: "StashStudio",
      relations: [
        studioColumnCount("sceneCount", "StashScene"),
        studioColumnCount("galleryCount", "StashGallery"),
        studioColumnCount("groupCount", "StashGroup"),
        {
          // Distinct live performers with a live scene of the studio
          column: "performerCount",
          all: distinctCount(`
        SELECT DISTINCT s.studioId AS id, s.stashInstanceId AS instanceId, sp.performerId, sp.performerInstanceId
        FROM StashScene s
        CROSS JOIN ScenePerformer sp ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        CROSS JOIN StashPerformer pf ON pf.id = sp.performerId AND pf.stashInstanceId = sp.performerInstanceId
        WHERE s.studioId IS NOT NULL AND s.deletedAt IS NULL AND pf.deletedAt IS NULL`),
          scoped: distinctCount(`
        SELECT DISTINCT ${PAIR.id} AS id, ${PAIR.instanceId} AS instanceId, sp.performerId, sp.performerInstanceId
        FROM json_each(?) p
        CROSS JOIN StashScene s ON s.studioId = ${PAIR.id} AND +s.stashInstanceId = ${PAIR.instanceId}
        CROSS JOIN ScenePerformer sp ON sp.sceneId = s.id AND sp.sceneInstanceId = s.stashInstanceId
        CROSS JOIN StashPerformer pf ON pf.id = sp.performerId AND pf.stashInstanceId = sp.performerInstanceId
        WHERE s.deletedAt IS NULL AND pf.deletedAt IS NULL`),
        },
      ],
    },
    tags: {
      table: "StashTag",
      relations: [
        // Direct only: the response's scene_count_direct
        {
          column: "sceneCount",
          all: TAG_SCENES.all,
          scoped: `${PAIRS_CTE}${TAG_SCENES.scoped}`,
        },
        {
          // The card's scene count: live scenes tagged directly or
          // inheriting the tag, each once, as the scene list's tag filter
          // matches them: the direct count and the scenes that only
          // inherit it (a UNION of every (tag, scene) pair instead costs
          // 1.9 s against 0.3 s at 200k scenes)
          column: "sceneCountAll",
          all: `
      SELECT id, instanceId, SUM(n) AS n FROM (${TAG_SCENES.all}
      UNION ALL${inheritedOnly(false)}
      ) GROUP BY id, instanceId`,
          scoped: `${PAIRS_CTE}
      SELECT id, instanceId, SUM(n) AS n FROM (${TAG_SCENES.scoped}
      UNION ALL${inheritedOnly(true)}
      ) GROUP BY id, instanceId`,
        },
        junctionCount(
          "galleryCount",
          "GalleryTag",
          { id: "tagId", instanceId: "tagInstanceId" },
          {
            table: "StashGallery",
            id: "galleryId",
            instanceId: "galleryInstanceId",
          }
        ),
        junctionCount(
          "performerCount",
          "PerformerTag",
          { id: "tagId", instanceId: "tagInstanceId" },
          {
            table: "StashPerformer",
            id: "performerId",
            instanceId: "performerInstanceId",
          }
        ),
        junctionCount(
          "studioCount",
          "StudioTag",
          { id: "tagId", instanceId: "tagInstanceId" },
          {
            table: "StashStudio",
            id: "studioId",
            instanceId: "studioInstanceId",
          }
        ),
        junctionCount(
          "groupCount",
          "GroupTag",
          { id: "tagId", instanceId: "tagInstanceId" },
          { table: "StashGroup", id: "groupId", instanceId: "groupInstanceId" }
        ),
      ],
    },
    groups: {
      table: "StashGroup",
      relations: [
        junctionCount(
          "sceneCount",
          "SceneGroup",
          { id: "groupId", instanceId: "groupInstanceId" },
          { table: "StashScene", id: "sceneId", instanceId: "sceneInstanceId" }
        ),
        {
          // Distinct live performers of the collection's live scenes
          column: "performerCount",
          all: distinctCount(`
        SELECT DISTINCT sg.groupId AS id, sg.groupInstanceId AS instanceId, sp.performerId, sp.performerInstanceId
        FROM SceneGroup sg
        ${LIVE_SCENE_OF_SG}
        CROSS JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
        CROSS JOIN StashPerformer pf ON pf.id = sp.performerId AND pf.stashInstanceId = sp.performerInstanceId
        WHERE s.deletedAt IS NULL AND pf.deletedAt IS NULL`),
          scoped: distinctCount(`
        SELECT DISTINCT ${PAIR.id} AS id, ${PAIR.instanceId} AS instanceId, sp.performerId, sp.performerInstanceId
        FROM json_each(?) p
        CROSS JOIN SceneGroup sg ON sg.groupId = ${PAIR.id} AND sg.groupInstanceId = ${PAIR.instanceId}
        ${LIVE_SCENE_OF_SG}
        CROSS JOIN ScenePerformer sp ON sp.sceneId = sg.sceneId AND sp.sceneInstanceId = sg.sceneInstanceId
        CROSS JOIN StashPerformer pf ON pf.id = sp.performerId AND pf.stashInstanceId = sp.performerInstanceId
        WHERE s.deletedAt IS NULL AND pf.deletedAt IS NULL`),
        },
      ],
    },
    galleries: {
      table: "StashGallery",
      relations: [
        junctionCount(
          "imageCount",
          "ImageGallery",
          { id: "galleryId", instanceId: "galleryInstanceId" },
          { table: "StashImage", id: "imageId", instanceId: "imageInstanceId" }
        ),
      ],
    },
  };

/** The order the types are rebuilt in */
const TYPES = Object.keys(TABLES) as LinkCountType[];

/**
 * What the given rows count toward, as stored (their links survive a soft
 * delete): one arm per link, each driven from the rows bound as one JSON
 * parameter of pairs through the near side's index. A soft-deleted or
 * returning scene changes its performers', tags' (direct and inherited),
 * collections' and studio's counts; a gallery its performers', tags' and
 * studio's; an image its galleries'. A performer's or collection's liveness
 * changes the distinct counts through their scenes (a studio's and a
 * collection's performers, a performer's collections); a studio's and a
 * collection's their tags' and, for a collection, its studio's.
 */
const THROUGH: Record<keyof LinkSources, string[]> = {
  scenes: [
    `SELECT 'performers' AS kind, l.performerId AS id, l.performerInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN ScenePerformer l ON l.sceneId = ${PAIR.id} AND l.sceneInstanceId = ${PAIR.instanceId}`,
    `SELECT 'tags', l.tagId, l.tagInstanceId
     FROM json_each(?) p
     CROSS JOIN SceneTag l ON l.sceneId = ${PAIR.id} AND l.sceneInstanceId = ${PAIR.instanceId}`,
    `SELECT 'tags', l.tagId, l.tagInstanceId
     FROM json_each(?) p
     CROSS JOIN SceneInheritedTag l ON l.sceneId = ${PAIR.id} AND l.sceneInstanceId = ${PAIR.instanceId}`,
    `SELECT 'groups', l.groupId, l.groupInstanceId
     FROM json_each(?) p
     CROSS JOIN SceneGroup l ON l.sceneId = ${PAIR.id} AND l.sceneInstanceId = ${PAIR.instanceId}`,
    `SELECT 'studios', s.studioId, s.stashInstanceId
     FROM json_each(?) p
     CROSS JOIN StashScene s ON s.id = ${PAIR.id} AND s.stashInstanceId = ${PAIR.instanceId}
     WHERE s.studioId IS NOT NULL`,
  ],
  galleries: [
    `SELECT 'performers' AS kind, l.performerId AS id, l.performerInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN GalleryPerformer l ON l.galleryId = ${PAIR.id} AND l.galleryInstanceId = ${PAIR.instanceId}`,
    `SELECT 'tags', l.tagId, l.tagInstanceId
     FROM json_each(?) p
     CROSS JOIN GalleryTag l ON l.galleryId = ${PAIR.id} AND l.galleryInstanceId = ${PAIR.instanceId}`,
    `SELECT 'studios', g.studioId, g.stashInstanceId
     FROM json_each(?) p
     CROSS JOIN StashGallery g ON g.id = ${PAIR.id} AND g.stashInstanceId = ${PAIR.instanceId}
     WHERE g.studioId IS NOT NULL`,
  ],
  images: [
    `SELECT 'galleries' AS kind, l.galleryId AS id, l.galleryInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN ImageGallery l ON l.imageId = ${PAIR.id} AND l.imageInstanceId = ${PAIR.instanceId}`,
  ],
  performers: [
    `SELECT 'tags' AS kind, l.tagId AS id, l.tagInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN PerformerTag l ON l.performerId = ${PAIR.id} AND l.performerInstanceId = ${PAIR.instanceId}`,
    `SELECT 'studios', s.studioId, s.stashInstanceId
     FROM json_each(?) p
     CROSS JOIN ScenePerformer l ON l.performerId = ${PAIR.id} AND l.performerInstanceId = ${PAIR.instanceId}
     CROSS JOIN StashScene s ON s.id = l.sceneId AND s.stashInstanceId = l.sceneInstanceId
     WHERE s.studioId IS NOT NULL`,
    `SELECT 'groups', sg.groupId, sg.groupInstanceId
     FROM json_each(?) p
     CROSS JOIN ScenePerformer l ON l.performerId = ${PAIR.id} AND l.performerInstanceId = ${PAIR.instanceId}
     CROSS JOIN SceneGroup sg ON sg.sceneId = l.sceneId AND sg.sceneInstanceId = l.sceneInstanceId`,
  ],
  studios: [
    `SELECT 'tags' AS kind, l.tagId AS id, l.tagInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN StudioTag l ON l.studioId = ${PAIR.id} AND l.studioInstanceId = ${PAIR.instanceId}`,
  ],
  groups: [
    `SELECT 'tags' AS kind, l.tagId AS id, l.tagInstanceId AS instanceId
     FROM json_each(?) p
     CROSS JOIN GroupTag l ON l.groupId = ${PAIR.id} AND l.groupInstanceId = ${PAIR.instanceId}`,
    `SELECT 'studios', g.studioId, g.stashInstanceId
     FROM json_each(?) p
     CROSS JOIN StashGroup g ON g.id = ${PAIR.id} AND g.stashInstanceId = ${PAIR.instanceId}
     WHERE g.studioId IS NOT NULL`,
    `SELECT 'performers', sp.performerId, sp.performerInstanceId
     FROM json_each(?) p
     CROSS JOIN SceneGroup l ON l.groupId = ${PAIR.id} AND l.groupInstanceId = ${PAIR.instanceId}
     CROSS JOIN ScenePerformer sp ON sp.sceneId = l.sceneId AND sp.sceneInstanceId = l.sceneInstanceId`,
  ],
};

/** The inherited tags (SceneInheritedTag) of the scenes bound as pairs */
const INHERITED_TAGS_SQL = `
  SELECT DISTINCT l.tagId AS id, l.tagInstanceId AS instanceId
  FROM json_each(?) p
  CROSS JOIN SceneInheritedTag l ON l.sceneId = ${PAIR.id} AND l.sceneInstanceId = ${PAIR.instanceId}`;

/** A count as a raw read returns it (COUNT is a bigint, a column a number) */
type RawCount = number | bigint;

interface CountRow {
  id: string;
  instanceId: string;
  n: RawCount;
}

/** A live row to recount: its key and its stored count columns, by name */
type CurrentRow = EntityRef & Record<string, unknown>;

/** A row whose count moved: id, instance, the new count, the value read */
type MovedCount = [string, string, number, number | null];

/** Rows written per relation, by `<table>.<column>` */
export type LinkCountResult = Record<string, number>;

export interface LinkCountOptions {
  /**
   * Write a row only while its column still holds the value this rebuild
   * read (`AND x.col IS <value read>`), so a count another writer stored
   * between the read and the write stands. For the data migration
   * (010_rebuild_link_counts), which runs after the startup sync while
   * later syncs run: a sync that commits meanwhile has written a newer
   * count. The sync's own rebuild runs under the sync lock and writes
   * unconditionally, so its fresh count also replaces anything a migration
   * wrote before it.
   */
  onlyIfUnchanged?: boolean;
}

/** `refs` in pages of PER_PAGE_MAX */
function pages(refs: readonly EntityRef[]): EntityRef[][] {
  const out: EntityRef[][] = [];
  for (let i = 0; i < refs.length; i += PER_PAGE_MAX) {
    out.push(refs.slice(i, i + PER_PAGE_MAX));
  }
  return out;
}

class LinkCountService {
  /**
   * Recounts the count columns of every live performer, studio, tag,
   * collection and gallery ("all") or of the rows in `scope`, and writes
   * the ones that moved. Runs after scene tag inheritance (a tag's
   * `sceneCountAll` reads SceneInheritedTag).
   */
  async rebuildLinkCounts(
    scope: LinkCountScope | "all",
    options: LinkCountOptions = {}
  ): Promise<LinkCountResult> {
    const startedAt = Date.now();
    const written: LinkCountResult = {};
    let readMs = 0;
    let writeMs = 0;
    for (const type of TYPES) {
      const refs = scope === "all" ? "all" : distinctRefs(scope[type]);
      if (refs !== "all" && refs.length === 0) continue;
      const { table, relations } = TABLES[type];

      const readStart = Date.now();
      const current = await this.readCurrent(
        table,
        relations.map((r) => r.column),
        refs
      );
      readMs += Date.now() - readStart;
      if (current.length === 0) continue;

      for (const relation of relations) {
        const countStart = Date.now();
        const counts = await this.readCounts(relation, refs);
        const relationReadMs = Date.now() - countStart;
        readMs += relationReadMs;
        logger.debug("Link counts read", {
          table,
          column: relation.column,
          ms: relationReadMs,
          counted: counts.size,
        });

        const moved: MovedCount[] = [];
        for (const row of current) {
          const n = counts.get(entityKey(row.id, row.instanceId)) ?? 0;
          const stored = row[relation.column];
          if (n !== Number(stored)) {
            // As a JSON number (a bigint would not serialize), null as null
            const read = stored === null ? null : Number(stored);
            moved.push([row.id, row.instanceId, n, read]);
          }
        }
        const writeStart = Date.now();
        written[`${table}.${relation.column}`] = await this.write(
          table,
          relation.column,
          moved,
          options.onlyIfUnchanged ?? false
        );
        writeMs += Date.now() - writeStart;
      }
    }
    logger.info("Link counts rebuilt", {
      scope:
        scope === "all"
          ? "all"
          : Object.fromEntries(TYPES.map((t) => [t, scope[t].length])),
      durationMs: Date.now() - startedAt,
      readMs,
      writeMs,
      written,
    });
    return written;
  }

  /**
   * The performers, studios, tags, collections and galleries whose counts
   * include the given rows, read from their stored links (`THROUGH`). Sync
   * reads them for what it soft-deleted, and for changed performers and
   * collections, whose liveness the distinct counts through their scenes
   * depend on.
   */
  async linkedThrough(sources: LinkSources): Promise<LinkCountScope> {
    const found: Record<LinkCountType, EntityRef[]> = {
      performers: [],
      studios: [],
      tags: [],
      groups: [],
      galleries: [],
    };
    for (const source of Object.keys(THROUGH) as Array<keyof LinkSources>) {
      const refs = distinctRefs(sources[source]);
      if (refs.length === 0) continue;
      const arms = THROUGH[source];
      const json = pairsJson(refs);
      const rows = await prisma.$queryRawUnsafe<
        Array<{ kind: LinkCountType; id: string; instanceId: string }>
      >(arms.join("\nUNION\n"), ...arms.map(() => json));
      for (const { kind, id, instanceId } of rows) {
        found[kind].push({ id, instanceId });
      }
    }
    return {
      performers: distinctRefs(found.performers),
      studios: distinctRefs(found.studios),
      tags: distinctRefs(found.tags),
      groups: distinctRefs(found.groups),
      galleries: distinctRefs(found.galleries),
    };
  }

  /**
   * The inherited tags (SceneInheritedTag) of these scenes, as stored now.
   * Sync reads them before and after scene tag inheritance rewrites them
   * (the rows and the JSON column in one unit per batch): a tag either side
   * lists may have gained or lost a scene.
   */
  async inheritedTagsOf(scenes: readonly EntityRef[]): Promise<EntityRef[]> {
    const refs = distinctRefs(scenes);
    if (refs.length === 0) return [];
    return prisma.$queryRawUnsafe<EntityRef[]>(
      INHERITED_TAGS_SQL,
      pairsJson(refs)
    );
  }

  /** The live rows to recount, with their stored count columns */
  private async readCurrent(
    table: string,
    columns: readonly string[],
    refs: readonly EntityRef[] | "all"
  ): Promise<CurrentRow[]> {
    const cols = columns.map((c) => `x."${c}"`).join(", ");
    type Row = CurrentRow;
    if (refs === "all") {
      return prisma.$queryRawUnsafe<Row[]>(
        `SELECT x.id, x.stashInstanceId AS instanceId, ${cols}
         FROM "${table}" x WHERE x.deletedAt IS NULL`
      );
    }
    const rows: Row[] = [];
    for (const page of pages(refs)) {
      rows.push(
        ...(await prisma.$queryRawUnsafe<Row[]>(
          `SELECT x.id, x.stashInstanceId AS instanceId, ${cols}
           FROM json_each(?) p
           CROSS JOIN "${table}" x ON x.id = ${PAIR.id} AND x.stashInstanceId = ${PAIR.instanceId}
           WHERE x.deletedAt IS NULL`,
          pairsJson(page)
        ))
      );
    }
    return rows;
  }

  /**
   * One relation's live counts, by entity key; an entity with none is
   * absent. A scope of more than one page reads the whole-library form
   * and keeps the scope's rows: a scoped statement pays passes the whole
   * form pays once (a tag's inherited arm reads every live scene's list),
   * so a big scope costs more than the whole library (on 200k scenes, 250
   * busy tags: 0.8 s scoped, 0.4 s whole).
   */
  private async readCounts(
    relation: Relation,
    refs: readonly EntityRef[] | "all"
  ): Promise<Map<string, number>> {
    const rows =
      refs === "all" || refs.length > PER_PAGE_MAX
        ? await prisma.$queryRawUnsafe<CountRow[]>(relation.all)
        : await prisma.$queryRawUnsafe<CountRow[]>(
            relation.scoped,
            pairsJson(refs)
          );
    return new Map(
      rows.map((row) => [entityKey(row.id, row.instanceId), Number(row.n)])
    );
  }

  /**
   * Writes the moved counts, WRITE_CHUNK rows a unit, each an UPDATE ...
   * FROM driven from the bound [id, instanceId, n, read] rows, looking each
   * row up by primary key; with `onlyIfUnchanged`, only where the column
   * still holds the value read. Returns the rows written.
   */
  private async write(
    table: string,
    column: string,
    moved: readonly MovedCount[],
    onlyIfUnchanged: boolean
  ): Promise<number> {
    const unchanged = onlyIfUnchanged ? `AND x."${column}" IS v.readValue` : "";
    const sql = `
      UPDATE "${table}" AS x SET "${column}" = v.n
      FROM (
        SELECT json_extract(value, '$[0]') AS id, json_extract(value, '$[1]') AS instanceId, json_extract(value, '$[2]') AS n, json_extract(value, '$[3]') AS readValue
        FROM json_each(?)
      ) AS v
      WHERE x.id = v.id AND x.stashInstanceId = v.instanceId
        ${unchanged}`;
    let written = 0;
    for (let i = 0; i < moved.length; i += WRITE_CHUNK) {
      const chunk = JSON.stringify(moved.slice(i, i + WRITE_CHUNK));
      const startedAt = Date.now();
      written += await dbWrite(`sync.linkCounts.${table}.${column}`, () =>
        prisma.$executeRawUnsafe(sql, chunk)
      );
      logger.debug("Link count chunk written", {
        table,
        column,
        rows: Math.min(WRITE_CHUNK, moved.length - i),
        ms: Date.now() - startedAt,
      });
    }
    return written;
  }
}

export const linkCountService = new LinkCountService();
