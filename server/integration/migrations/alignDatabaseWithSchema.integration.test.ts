/**
 * `20260925000500_align_database_with_schema` rebuilds the 26 tables whose
 * shape had drifted from `schema.prisma`: the instance columns lose their
 * `DEFAULT 'default'`, four declared foreign keys are added (gallery and
 * image to studio, clip to scene and primary tag), JSON columns become JSONB
 * and every index takes Prisma's name. The copies keep a junction row only
 * when both parents exist, null a studio or primary tag whose row is missing,
 * leave out a clip whose scene is missing and per-user rows whose user is
 * missing, and preserve the autoincrement counters.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
import { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { cpSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

/** The newest migration before this one */
const BEFORE = "20260925000400_studio_instance_of_galleries_and_images";
const MIGRATION = "20260925000500_align_database_with_schema";

type Client = MigrationSandbox["client"];
type Row = Record<string, unknown>;

/** The 8 entity tables, with the columns a row needs besides its keys. */
const ENTITY_TABLES: Record<string, Row> = {
  StashScene: {},
  StashPerformer: { name: "p" },
  StashStudio: { name: "s" },
  StashTag: { name: "t" },
  StashGroup: { name: "g" },
  StashGallery: { studioId: "1" },
  StashImage: { studioId: "1" },
  StashClip: { sceneId: "1", seconds: 0, primaryTagId: "1" },
};

/** The 13 junctions: [table, side a, side b]. */
const JUNCTIONS: Array<[string, string, string]> = [
  ["SceneTag", "scene", "tag"],
  ["ScenePerformer", "scene", "performer"],
  ["SceneGroup", "scene", "group"],
  ["SceneGallery", "scene", "gallery"],
  ["ImageTag", "image", "tag"],
  ["ImagePerformer", "image", "performer"],
  ["ImageGallery", "image", "gallery"],
  ["GalleryTag", "gallery", "tag"],
  ["GalleryPerformer", "gallery", "performer"],
  ["PerformerTag", "performer", "tag"],
  ["StudioTag", "studio", "tag"],
  ["GroupTag", "group", "tag"],
  ["ClipTag", "clip", "tag"],
];

/** The tables the migration rebuilds, plus two it must leave alone. */
const TABLES = [
  ...Object.keys(ENTITY_TABLES),
  ...JUNCTIONS.map(([table]) => table),
  "User",
  "ImageViewHistory",
  "UserEntityStats",
  "UserExcludedEntity",
  "UserHiddenEntity",
  "SceneRating",
  "StashInstance",
];

async function insert(client: Client, table: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  await client.$executeRawUnsafe(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    ...Object.values(row)
  );
}

async function addInstance(client: Client, id: string): Promise<void> {
  await client.stashInstance.create({
    data: { id, name: id, url: `http://${id}:9999/graphql`, apiKey: "k" },
  });
}

/**
 * One row of every entity table, id `id`, on `instance`. Tags and studios
 * first: the gallery, image and clip rows name studio 1 and tag 1.
 */
async function seedEntities(
  client: Client,
  id: string,
  instance: string
): Promise<void> {
  for (const [table, columns] of Object.entries(ENTITY_TABLES)) {
    const row: Row = { id, stashInstanceId: instance, ...columns };
    if ("studioId" in columns) row.studioInstanceId = instance;
    if ("sceneId" in columns) row.sceneInstanceId = instance;
    if ("primaryTagId" in columns) row.primaryTagInstanceId = instance;
    await insert(client, table, row);
  }
}

/** One row of every junction, from entity `id` to entity `id`. */
async function seedJunctions(
  client: Client,
  id: string,
  instance: string
): Promise<void> {
  for (const [table, a, b] of JUNCTIONS) {
    await insert(client, table, {
      [`${a}Id`]: id,
      [`${a}InstanceId`]: instance,
      [`${b}Id`]: id,
      [`${b}InstanceId`]: instance,
    });
  }
}

/** A table's column names and its rows, each value as its SQL literal. */
interface TableSnapshot {
  columns: string[];
  rows: string[][];
}

/**
 * Every row of every table the test reads, each value as its SQL literal
 * (`quote()`), so NULL, '' and a type change all show, whatever the
 * column's declared type. Columns are by name and rows in a stable order:
 * a rebuild puts columns added over the years in the schema's order.
 */
async function snapshot(
  client: Client
): Promise<Record<string, TableSnapshot>> {
  const tables: Record<string, TableSnapshot> = {};
  for (const table of TABLES) {
    const columns = (
      await client.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM pragma_table_info(?) ORDER BY name`,
        table
      )
    ).map((c) => c.name);
    const rows = await client.$queryRawUnsafe<Row[]>(
      `SELECT ${columns.map((n) => `quote("${n}") AS "${n}"`).join(", ")}
       FROM "${table}"`
    );
    tables[table] = {
      columns,
      rows: rows
        .map((row) => columns.map((n) => String(row[n])))
        .sort((x, y) => x.join("\0").localeCompare(y.join("\0"))),
    };
  }
  return tables;
}

/** Applies this migration alone, copied into the sandbox's prisma dir. */
async function migrate(db: MigrationSandbox): Promise<void> {
  await db.client.$disconnect();
  cpSync(
    path.join(PRISMA_DIR, "migrations", MIGRATION),
    path.join(db.prismaDir, "migrations", MIGRATION),
    { recursive: true }
  );
  await runPrismaCli(["migrate", "deploy"], {
    prismaDir: db.prismaDir,
    databaseUrl: db.url,
  });
}

/**
 * `prisma migrate diff --exit-code` from the database to the server's
 * schema: 0 when they match, 2 when they differ. (`migrate diff` takes no
 * `--schema`, which `runPrismaCli` always passes.)
 */
function schemaDriftExitCode(databaseUrl: string): Promise<number> {
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        cli,
        "migrate",
        "diff",
        "--from-url",
        databaseUrl,
        "--to-schema-datamodel",
        path.join(PRISMA_DIR, "schema.prisma"),
        "--exit-code",
      ],
      (error) => {
        if (!error) resolve(0);
        else if (typeof error.code === "number") resolve(error.code);
        else reject(new Error(`prisma migrate diff failed: ${error.message}`));
      }
    );
  });
}

/** Rows written with foreign keys off, on their own connection. */
async function withForeignKeysOff(
  db: MigrationSandbox,
  write: (client: PrismaClient) => Promise<void>
): Promise<void> {
  const noFk = new PrismaClient({
    datasourceUrl: `${db.url}?connection_limit=1`,
  });
  try {
    await noFk.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    await write(noFk);
  } finally {
    await noFk.$disconnect();
  }
}

describe("align database with schema migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("keeps every row whose parents exist, drops or nulls the rest, and leaves the database matching schema.prisma", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    await addInstance(client, "default");
    await addInstance(client, "inst-b");

    // Before: an INSERT that forgets the instances lands on 'default'
    await seedEntities(client, "1", "default");
    await client.$executeRawUnsafe(
      `INSERT INTO "SceneTag" ("sceneId", "tagId") VALUES ('1', '1')`
    );
    expect(
      await client.$queryRawUnsafe<Row[]>(`SELECT * FROM "SceneTag"`)
    ).toEqual([
      {
        sceneId: "1",
        sceneInstanceId: "default",
        tagId: "1",
        tagInstanceId: "default",
      },
    ]);
    await client.$executeRawUnsafe(`DELETE FROM "SceneTag"`);

    // Kept: the same entity ids on both instances, each linked to itself
    await seedJunctions(client, "1", "default");
    await seedEntities(client, "1", "inst-b");
    await seedJunctions(client, "1", "inst-b");

    // Kept: a user with JSON preferences, their image views, exclusions,
    // hidden entity, visible count and a rating (a table not rebuilt)
    const user = await client.user.create({
      data: {
        username: "u",
        password: "x",
        carouselPreferences: [{ id: "recent", enabled: true, order: 1 }],
        filterPresets: { scene: [{ name: "4k", filter: { width: 3840 } }] },
        tableColumnDefaults: {
          scene: { visible: ["title"], order: ["title"] },
        },
        cardDisplaySettings: { scene: { showCodeOnCard: true } },
        landingPagePreference: { pages: ["home", "scenes"], randomize: true },
      },
    });
    await client.imageViewHistory.create({
      data: {
        userId: user.id,
        instanceId: "default",
        imageId: "1",
        viewCount: 2,
        viewHistory: ["2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"],
        oCount: 1,
        oHistory: ["2026-09-02T00:00:00Z"],
      },
    });
    await client.userExcludedEntity.create({
      data: {
        userId: user.id,
        entityType: "scene",
        entityId: "1",
        instanceId: "inst-b",
        reason: "hidden",
      },
    });
    await client.userHiddenEntity.create({
      data: {
        userId: user.id,
        entityType: "scene",
        entityId: "1",
        instanceId: "inst-b",
      },
    });
    await client.userEntityStats.create({
      data: {
        userId: user.id,
        entityType: "scene",
        instanceId: "default",
        visibleCount: 1,
      },
    });
    await client.sceneRating.create({
      data: {
        userId: user.id,
        instanceId: "default",
        sceneId: "1",
        rating: 80,
      },
    });

    // The bad rows, written with foreign keys off: a junction row whose
    // scene is missing, an image whose studio is missing, a clip whose scene
    // is missing (with a tag link of its own), a clip whose primary tag is
    // missing, and a hidden entity whose user is missing
    await withForeignKeysOff(db, async (noFk) => {
      await insert(noFk, "SceneTag", {
        sceneId: "9",
        sceneInstanceId: "default",
        tagId: "1",
        tagInstanceId: "default",
      });
      await insert(noFk, "StashImage", {
        id: "2",
        stashInstanceId: "default",
        studioId: "9",
        studioInstanceId: "default",
      });
      await insert(noFk, "StashClip", {
        id: "2",
        stashInstanceId: "default",
        sceneId: "9",
        sceneInstanceId: "default",
        seconds: 0,
      });
      await insert(noFk, "ClipTag", {
        clipId: "2",
        clipInstanceId: "default",
        tagId: "1",
        tagInstanceId: "default",
      });
      await insert(noFk, "StashClip", {
        id: "3",
        stashInstanceId: "default",
        sceneId: "1",
        sceneInstanceId: "default",
        seconds: 0,
        primaryTagId: "9",
        primaryTagInstanceId: "default",
      });
      await insert(noFk, "UserHiddenEntity", {
        userId: 999,
        entityType: "scene",
        entityId: "1",
        instanceId: "default",
      });
    });

    const before = await snapshot(client);
    await migrate(db);
    const after = await snapshot(client);

    // Every other row compares equal, column by column
    const expected: Record<string, TableSnapshot> = {};
    for (const [table, { columns, rows }] of Object.entries(before)) {
      const column = (name: string) => columns.indexOf(name);
      expected[table] = {
        columns,
        rows: rows.flatMap((row) => {
          const at = (name: string) => row[column(name)];
          if (table === "SceneTag" && at("sceneId") === "'9'") return [];
          if (table === "StashClip" && at("sceneId") === "'9'") return [];
          if (table === "ClipTag" && at("clipId") === "'2'") return [];
          if (table === "UserHiddenEntity" && at("userId") === "999") return [];
          const copy = [...row];
          if (table === "StashImage" && at("studioId") === "'9'") {
            copy[column("studioId")] = "NULL";
            copy[column("studioInstanceId")] = "NULL";
          }
          if (table === "StashClip" && at("primaryTagId") === "'9'") {
            copy[column("primaryTagId")] = "NULL";
            copy[column("primaryTagInstanceId")] = "NULL";
          }
          return [copy];
        }),
      };
    }
    expect(after).toEqual(expected);
    const rows = (tables: Record<string, TableSnapshot>, table: string) =>
      tables[table]?.rows.length ?? -1;
    expect(rows(before, "SceneTag")).toBe(rows(after, "SceneTag") + 1);
    expect(rows(before, "StashClip")).toBe(rows(after, "StashClip") + 1);
    expect(rows(before, "ClipTag")).toBe(rows(after, "ClipTag") + 1);
    expect(rows(before, "UserHiddenEntity")).toBe(
      rows(after, "UserHiddenEntity") + 1
    );
    expect(rows(after, "StashImage")).toBe(rows(before, "StashImage"));

    // After: an INSERT that forgets the instances fails
    await expect(
      client.$executeRawUnsafe(
        `INSERT INTO "SceneTag" ("sceneId", "tagId") VALUES ('1', '1')`
      )
    ).rejects.toThrow(/NOT NULL/);

    // The four foreign keys the schema declares now exist (the pragma lists
    // one row per column of a composite key, hence DISTINCT)
    const foreignKeys = async (table: string) =>
      (
        await client.$queryRawUnsafe<Array<{ table: string }>>(
          `SELECT DISTINCT "table" FROM pragma_foreign_key_list(?) ORDER BY "table"`,
          table
        )
      ).map((fk) => fk.table);
    expect(await foreignKeys("StashGallery")).toEqual(["StashStudio"]);
    expect(await foreignKeys("StashImage")).toEqual(["StashStudio"]);
    expect(await foreignKeys("StashClip")).toEqual(["StashScene", "StashTag"]);

    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA integrity_check")
    ).toEqual([{ integrity_check: "ok" }]);
    expect(await schemaDriftExitCode(db.url)).toBe(0);
  });

  it("does not reuse a deleted user's id after the migration", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;

    const kept = await client.user.create({
      data: { username: "kept", password: "x" },
    });
    const deleted = await client.user.create({
      data: { username: "deleted", password: "x" },
    });
    await client.user.delete({ where: { id: deleted.id } });
    // A per-user table that is empty at migration time keeps its counter too
    const hidden = await client.userHiddenEntity.create({
      data: { userId: kept.id, entityType: "scene", entityId: "1" },
    });
    await client.userHiddenEntity.delete({ where: { id: hidden.id } });

    await migrate(db);

    const created = await client.user.create({
      data: { username: "new", password: "x" },
    });
    expect(created.id).toBeGreaterThan(deleted.id);
    const hiddenAgain = await client.userHiddenEntity.create({
      data: { userId: created.id, entityType: "scene", entityId: "1" },
    });
    expect(hiddenAgain.id).toBeGreaterThan(hidden.id);
  });
});
