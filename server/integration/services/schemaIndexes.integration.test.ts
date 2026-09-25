/**
 * The junction tables' indexes against the migrated database (item 67 (b),
 * DB-04).
 *
 * Each junction's primary key starts with its parent's two columns (a
 * SceneTag's is sceneId, sceneInstanceId, tagId, tagInstanceId), so SQLite's
 * primary-key index already serves every lookup by the parent. A second index
 * on those two columns is never needed and costs every sync write one more
 * B-tree. The index on the other side, which the tag, performer, gallery and
 * group filters drive from, stays.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import {
  type LargeLibraryPlanner,
  largeLibraryPlanner,
} from "../helpers/largeLibraryPlanner.js";

/** Each junction with the prefix of its two sides' columns */
const JUNCTIONS = [
  { table: "SceneTag", parent: "scene", child: "tag" },
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
