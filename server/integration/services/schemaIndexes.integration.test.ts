/**
 * The junction tables' and the list sorts' indexes against the migrated
 * database (item 67 (b), DB-04; L6).
 *
 * Each junction's primary key starts with its parent's two columns (a
 * SceneTag's is sceneId, sceneInstanceId, tagId, tagInstanceId), so SQLite's
 * primary-key index already serves every lookup by the parent. A second index
 * on those two columns is never needed and costs every sync write one more
 * B-tree. The index on the other side, which the tag, performer, gallery and
 * group filters drive from, stays.
 *
 * Every list order ends with the primary key, `x.id <dir>,
 * x.stashInstanceId <dir>` (L6), and each browse index covers the whole
 * order: deletedAt, the sort column, then the key in the sort's direction.
 * Prisma's SQLite (built with STAT4) used none of the shorter ones, and one
 * serving only the sort column was dropped once the order had three terms,
 * so a page of a large library scanned and sorted every live row.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";
import {
  type LargeLibraryPlanner,
  largeLibraryPlanner,
} from "../helpers/largeLibraryPlanner.js";
import { recordStatements } from "../helpers/statementRecorder.js";

/** Each junction with the prefix of its two sides' columns */
const JUNCTIONS = [
  { table: "SceneTag", parent: "scene", child: "tag" },
  // A scene's inherited tags (scene tag inheritance writes them)
  { table: "SceneInheritedTag", parent: "scene", child: "tag" },
  { table: "ScenePerformer", parent: "scene", child: "performer" },
  { table: "SceneGroup", parent: "scene", child: "group" },
  { table: "SceneGallery", parent: "scene", child: "gallery" },
  { table: "GalleryTag", parent: "gallery", child: "tag" },
  { table: "GalleryPerformer", parent: "gallery", child: "performer" },
  { table: "ImageGallery", parent: "image", child: "gallery" },
  { table: "ImageTag", parent: "image", child: "tag" },
  { table: "ImagePerformer", parent: "image", child: "performer" },
  { table: "PerformerTag", parent: "performer", child: "tag" },
  { table: "GroupTag", parent: "group", child: "tag" },
  { table: "StudioTag", parent: "studio", child: "tag" },
  { table: "ClipTag", parent: "clip", child: "tag" },
  // The group hierarchy: a containing group's row per sub-group
  { table: "GroupRelation", parent: "containing", child: "sub" },
] as const;

interface IndexRow {
  name: string;
  origin: string;
  columns: string;
}

/** A table's indexes, each with its columns in order, comma-separated */
async function indexesOf(table: string): Promise<IndexRow[]> {
  return prisma.$queryRawUnsafe<IndexRow[]>(
    `SELECT il.name AS name, il.origin AS origin,
       (SELECT group_concat(name, ',')
          FROM (SELECT name FROM pragma_index_info(il.name) ORDER BY seqno)
       ) AS columns
     FROM pragma_index_list(?) il
     ORDER BY il.name`,
    table
  );
}

let planner: LargeLibraryPlanner;

/** A large library's plan (`largeLibraryPlanner`), one line per step */
async function planOf(sql: string): Promise<string> {
  return (await planner.planOf(sql, "1", "default")).join("\n");
}

describe("junction table indexes", () => {
  beforeAll(async () => {
    planner = await largeLibraryPlanner();
  });

  afterAll(async () => {
    await planner.close();
  });

  it("no junction table carries an index whose columns are a prefix of its primary key", async () => {
    const findings: string[] = [];
    for (const { table } of JUNCTIONS) {
      const indexes = await indexesOf(table);
      const primaryKey = must(
        indexes.find((index) => index.origin === "pk"),
        `${table}'s primary-key index`
      ).columns.split(",");
      for (const index of indexes) {
        if (index.origin === "pk") continue;
        const columns = index.columns.split(",");
        const isPrefix = columns.every((column, i) => primaryKey[i] === column);
        if (isPrefix)
          findings.push(`${table}: ${index.name} (${index.columns})`);
      }
    }

    expect(findings).toEqual([]);
  });

  it("a junction lookup by its parent still uses the primary key", async () => {
    for (const { table, parent, child } of JUNCTIONS) {
      const plan = await planOf(
        `SELECT ${child}Id FROM ${table} WHERE ${parent}Id = ? AND ${parent}InstanceId = ?`
      );
      expect(plan, table).toContain(`sqlite_autoindex_${table}_1`);
    }
  });

  it("a junction lookup by its other side still uses that side's index", async () => {
    for (const { table, parent, child } of JUNCTIONS) {
      const plan = await planOf(
        `SELECT ${parent}Id FROM ${table} WHERE ${child}Id = ? AND ${child}InstanceId = ?`
      );
      expect(plan, table).toContain(
        `${table}_${child}Id_${child}InstanceId_idx`
      );
    }
  });
});

/** Each browse index, its table and its key columns with their direction */
const BROWSE_INDEXES = [
  ["StashScene_browse_idx", "StashScene", "stashCreatedAt", "DESC"],
  ["StashScene_browse_updated_idx", "StashScene", "stashUpdatedAt", "DESC"],
  ["StashScene_browse_date_idx", "StashScene", "date", "DESC"],
  ["StashScene_browse_duration_idx", "StashScene", "duration", "DESC"],
  ["StashScene_browse_titleSort_idx", "StashScene", "titleSort", "ASC"],
  [
    "StashScene_browse_performerCount_idx",
    "StashScene",
    "performerCount",
    "ASC",
  ],
  ["StashScene_browse_tagCount_idx", "StashScene", "tagCount", "ASC"],
  ["StashImage_browse_idx", "StashImage", "stashCreatedAt", "DESC"],
  ["StashImage_browse_titleSort_idx", "StashImage", "titleSort", "ASC"],
] as const;

/** The scene sorts on an index, each with the index serving it */
const SCENE_SORTS: ReadonlyArray<
  readonly [ParsedListRequest<"scene">["sort"]["field"], string]
> = [
  ["created_at", "StashScene_browse_idx"],
  ["updated_at", "StashScene_browse_updated_idx"],
  ["date", "StashScene_browse_date_idx"],
  ["duration", "StashScene_browse_duration_idx"],
  ["title", "StashScene_browse_titleSort_idx"],
  ["performer_count", "StashScene_browse_performerCount_idx"],
  ["tag_count", "StashScene_browse_tagCount_idx"],
];

/** One allowed instance, and two (the instance term is then no constant) */
const INSTANCE_SETS = [["plan-a"], ["plan-a", "plan-b"]];

describe("browse indexes", () => {
  beforeAll(async () => {
    planner = await largeLibraryPlanner();
  });

  afterAll(async () => {
    await planner.close();
  });

  /** The page statement a builder call sends, with its parameters */
  async function pageStatement(
    run: () => Promise<unknown>
  ): Promise<{ sql: string; params: readonly unknown[] }> {
    const recorder = recordStatements();
    try {
      await run();
    } finally {
      recorder.restore();
    }
    return must(
      recorder.statements.find(({ sql }) => sql.includes("\nORDER BY ")),
      "the page statement"
    );
  }

  it("each ends with the list's primary key, in its sort's direction", async () => {
    for (const [name, table, column, direction] of BROWSE_INDEXES) {
      const keys = await prisma.$queryRawUnsafe<
        { name: string; desc: bigint }[]
      >(
        `SELECT name, "desc" FROM pragma_index_xinfo(?) WHERE key = 1 ORDER BY seqno`,
        name
      );
      const tables = await prisma.$queryRawUnsafe<{ tbl_name: string }[]>(
        "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?",
        name
      );

      expect(must(tables[0], name).tbl_name, name).toBe(table);
      expect(
        keys.map((key) => `${key.name} ${key.desc === 1n ? "DESC" : "ASC"}`),
        name
      ).toEqual([
        "deletedAt ASC",
        `${column} ${direction}`,
        `id ${direction}`,
        `stashInstanceId ${direction}`,
      ]);
    }
  });

  it("a scene page sorted on an indexed column reads its rows off the index, with no sort", async () => {
    for (const [field, index] of SCENE_SORTS) {
      for (const direction of [
        "ASC",
        "DESC",
      ] as const satisfies readonly SortDirection[]) {
        for (const allowedInstanceIds of INSTANCE_SETS) {
          const { sql, params } = await pageStatement(() =>
            sceneQueryBuilder.execute({
              userId: 1,
              allowedInstanceIds,
              request: parsedListRequest("scene", {
                page: 100,
                sort: { field, direction, seed: undefined },
              }),
            })
          );
          const plan = (await planner.planOf(sql, ...params)).join("\n");
          const label = `${field} ${direction} on ${allowedInstanceIds.length}`;

          expect(plan, label).toContain(`USING INDEX ${index} `);
          expect(plan, label).not.toContain("TEMP B-TREE");
        }
      }
    }
  });

  it("an image page by creation date reads its rows off the index, with no sort", async () => {
    for (const direction of [
      "ASC",
      "DESC",
    ] as const satisfies readonly SortDirection[]) {
      for (const allowedInstanceIds of INSTANCE_SETS) {
        const { sql, params } = await pageStatement(() =>
          imageQueryBuilder.execute({
            userId: 1,
            allowedInstanceIds,
            request: parsedListRequest("image", {
              sort: { field: "created_at", direction, seed: undefined },
            }),
          })
        );
        const plan = (await planner.planOf(sql, ...params)).join("\n");
        const label = `${direction} on ${allowedInstanceIds.length}`;

        expect(plan, label).toContain("USING INDEX StashImage_browse_idx ");
        expect(plan, label).not.toContain("TEMP B-TREE");
      }
    }
  });

  it("images by title use StashImage_browse_titleSort_idx with no temp B-tree", async () => {
    for (const direction of [
      "ASC",
      "DESC",
    ] as const satisfies readonly SortDirection[]) {
      for (const allowedInstanceIds of INSTANCE_SETS) {
        const { sql, params } = await pageStatement(() =>
          imageQueryBuilder.execute({
            userId: 1,
            allowedInstanceIds,
            request: parsedListRequest("image", {
              page: 100,
              sort: { field: "title", direction, seed: undefined },
            }),
          })
        );
        const plan = (await planner.planOf(sql, ...params)).join("\n");
        const label = `${direction} on ${allowedInstanceIds.length}`;

        expect(plan, label).toContain(
          "USING INDEX StashImage_browse_titleSort_idx "
        );
        expect(plan, label).not.toContain("TEMP B-TREE");
      }
    }
  });
});
