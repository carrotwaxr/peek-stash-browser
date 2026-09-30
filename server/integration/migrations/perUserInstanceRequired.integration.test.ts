/**
 * `20260930000100_per_user_instance_required` makes `instanceId` NOT NULL on
 * the ten per-user tables that allowed NULL (WatchHistory, PlaylistItem,
 * ImageViewHistory and the seven rating tables), gives the four stats tables
 * (UserPerformerStats, UserStudioStats, UserTagStats, UserEntityRanking) a
 * cascading foreign key to User and no default instance, and drops
 * UserEntityStats (Library counts are read per request).
 *
 * A NULL instance (none on prod; older installs may hold them) takes the
 * instance of a live entity with that id, by instance priority, else the
 * first instance by priority. A NULL row that would then repeat a stored key,
 * or an earlier NULL row's, is left out. Stats and ranking rows of a user
 * that no longer exists are left out.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
import { cpSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import { must } from "../../tests/helpers/must.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

/** The newest migration before this one */
const BEFORE = "20260929000100_browse_indexes_primary_key";
const MIGRATION = "20260930000100_per_user_instance_required";

type Client = MigrationSandbox["client"];
type Row = Record<string, unknown>;

const UPDATED = Date.UTC(2026, 8, 1);

/**
 * The ten tables whose instance was nullable: the entity column, the entity
 * table it names, and the columns a row needs besides its keys.
 */
const NULLABLE_TABLES: Array<{
  table: string;
  column: string;
  entityTable: string;
  extra: Row;
}> = [
  {
    table: "WatchHistory",
    column: "sceneId",
    entityTable: "StashScene",
    extra: {},
  },
  {
    table: "SceneRating",
    column: "sceneId",
    entityTable: "StashScene",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "PerformerRating",
    column: "performerId",
    entityTable: "StashPerformer",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "StudioRating",
    column: "studioId",
    entityTable: "StashStudio",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "TagRating",
    column: "tagId",
    entityTable: "StashTag",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "GalleryRating",
    column: "galleryId",
    entityTable: "StashGallery",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "GroupRating",
    column: "groupId",
    entityTable: "StashGroup",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "ImageRating",
    column: "imageId",
    entityTable: "StashImage",
    extra: { rating: 80, updatedAt: UPDATED },
  },
  {
    table: "ImageViewHistory",
    column: "imageId",
    entityTable: "StashImage",
    extra: { viewCount: 1, updatedAt: UPDATED },
  },
  // PlaylistItem's owner is its playlist; `userId` is replaced by `playlistId`
  {
    table: "PlaylistItem",
    column: "sceneId",
    entityTable: "StashScene",
    extra: { position: 0 },
  },
];

/** Columns an entity row needs besides its keys. */
const ENTITY_COLUMNS: Record<string, Row> = {
  StashScene: {},
  StashPerformer: { name: "p" },
  StashStudio: { name: "s" },
  StashTag: { name: "t" },
  StashGroup: { name: "g" },
  StashGallery: {},
  StashImage: {},
};

/** The four stats tables: a row's entity columns besides userId and instanceId. */
const STATS_TABLES: Record<string, Row> = {
  UserPerformerStats: { performerId: "1", updatedAt: UPDATED },
  UserStudioStats: { studioId: "1", updatedAt: UPDATED },
  UserTagStats: { tagId: "1", updatedAt: UPDATED },
  UserEntityRanking: {
    entityType: "performer",
    entityId: "1",
    updatedAt: UPDATED,
  },
};

async function insert(client: Client, table: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  await client.$executeRawUnsafe(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    ...Object.values(row)
  );
}

// Raw SQL: the client follows the current schema
async function addInstance(
  client: Client,
  id: string,
  priority: number
): Promise<void> {
  await insert(client, "StashInstance", {
    id,
    name: id,
    url: `http://${id}:9999/graphql`,
    apiKey: "k",
    priority,
    updatedAt: UPDATED,
  });
}

async function addEntity(
  client: Client,
  entityTable: string,
  id: string,
  instance: string,
  deleted = false
): Promise<void> {
  await insert(client, entityTable, {
    id,
    stashInstanceId: instance,
    ...ENTITY_COLUMNS[entityTable],
    ...(deleted ? { deletedAt: UPDATED } : {}),
  });
}

async function addUser(client: Client, username: string): Promise<number> {
  await insert(client, "User", {
    username,
    password: "x",
    updatedAt: UPDATED,
  });
  const [row] = await client.$queryRawUnsafe<Array<{ id: number | bigint }>>(
    `SELECT "id" FROM "User" WHERE "username" = ?`,
    username
  );
  return Number(must(row, "the inserted row").id);
}

async function addPlaylist(client: Client, userId: number): Promise<number> {
  await insert(client, "Playlist", {
    name: `p${userId}`,
    userId,
    updatedAt: UPDATED,
  });
  const [row] = await client.$queryRawUnsafe<Array<{ id: number | bigint }>>(
    `SELECT MAX("id") AS "id" FROM "Playlist"`
  );
  return Number(must(row, "the inserted row").id);
}

/** A row of one of the ten tables, with an explicit id. */
async function addPerUserRow(
  client: Client,
  spec: (typeof NULLABLE_TABLES)[number],
  owner: { userId: number; playlistId: number },
  id: number,
  entityId: string,
  instanceId: string | null
): Promise<void> {
  const ownerColumn =
    spec.table === "PlaylistItem"
      ? { playlistId: owner.playlistId }
      : { userId: owner.userId };
  await insert(client, spec.table, {
    id,
    ...ownerColumn,
    instanceId,
    [spec.column]: entityId,
    ...spec.extra,
  });
}

async function rows(
  client: Client,
  table: string,
  columns = `"id", "instanceId"`
): Promise<Row[]> {
  const found = await client.$queryRawUnsafe<Row[]>(
    `SELECT ${columns} FROM "${table}" ORDER BY "id"`
  );
  return found.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === "bigint" ? Number(v) : v,
      ])
    )
  );
}

/** Applies this migration, the newest, to a sandbox built at the one before. */
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

describe("per-user instance required migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  /**
   * Two instances; "second" is first by priority, "first" first by id, so a
   * pick by id and a pick by priority differ.
   */
  async function setUp(): Promise<{
    db: MigrationSandbox;
    client: Client;
    owner: { userId: number; playlistId: number };
  }> {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;
    await addInstance(client, "first", 1);
    await addInstance(client, "second", 0);
    const userId = await addUser(client, "u");
    const playlistId = await addPlaylist(client, userId);
    return { db, client, owner: { userId, playlistId } };
  }

  it("a NULL instance takes the instance of a live entity with that id", async () => {
    const { db, client, owner } = await setUp();

    // Entity "5" lives on "first" and is deleted on "second", which is first
    // by priority: the live one wins. Entity "6" lives on both: priority
    // wins. StashScene and StashImage serve two tables each: seeded once.
    const seeded = new Set<string>();
    for (const spec of NULLABLE_TABLES) {
      if (seeded.has(spec.entityTable)) continue;
      seeded.add(spec.entityTable);
      await addEntity(client, spec.entityTable, "5", "first");
      await addEntity(client, spec.entityTable, "5", "second", true);
      await addEntity(client, spec.entityTable, "6", "first");
      await addEntity(client, spec.entityTable, "6", "second");
    }
    for (const spec of NULLABLE_TABLES) {
      await addPerUserRow(client, spec, owner, 1, "5", null);
      await addPerUserRow(client, spec, owner, 2, "6", null);
    }

    await migrate(db);

    for (const spec of NULLABLE_TABLES) {
      expect(await rows(client, spec.table), spec.table).toEqual([
        { id: 1, instanceId: "first" },
        { id: 2, instanceId: "second" },
      ]);
    }
    // The WatchHistory row keeps the rest of its columns
    expect(
      await rows(
        client,
        "WatchHistory",
        `"id", "userId", "sceneId", "oHistory"`
      )
    ).toEqual([
      { id: 1, userId: owner.userId, sceneId: "5", oHistory: [] },
      { id: 2, userId: owner.userId, sceneId: "6", oHistory: [] },
    ]);
  });

  it("a NULL row that repeats a stored key is left out; two NULL rows of one key keep the lower id", async () => {
    const { db, client, owner } = await setUp();

    const seeded = new Set<string>();
    for (const spec of NULLABLE_TABLES) {
      if (seeded.has(spec.entityTable)) continue;
      seeded.add(spec.entityTable);
      await addEntity(client, spec.entityTable, "5", "first");
      await addEntity(client, spec.entityTable, "6", "first");
    }
    for (const spec of NULLABLE_TABLES) {
      // A stored row for "5" on "first", and a NULL row that resolves to it
      await addPerUserRow(client, spec, owner, 10, "5", "first");
      await addPerUserRow(client, spec, owner, 5, "5", null);
      // Two NULL rows of "6", which both resolve to "first"
      await addPerUserRow(client, spec, owner, 7, "6", null);
      await addPerUserRow(client, spec, owner, 3, "6", null);
    }

    await migrate(db);

    for (const spec of NULLABLE_TABLES) {
      expect(await rows(client, spec.table), spec.table).toEqual([
        { id: 3, instanceId: "first" },
        { id: 10, instanceId: "first" },
      ]);
    }
  });

  it("a NULL instance for an id no entity has takes the first instance by priority", async () => {
    const { db, client, owner } = await setUp();

    for (const spec of NULLABLE_TABLES) {
      await addPerUserRow(client, spec, owner, 1, "99", null);
    }

    await migrate(db);

    for (const spec of NULLABLE_TABLES) {
      expect(await rows(client, spec.table), spec.table).toEqual([
        { id: 1, instanceId: "second" },
      ]);
    }
  });

  it("stats and ranking rows of a user that no longer exists are gone", async () => {
    const { db, client, owner } = await setUp();

    for (const [table, row] of Object.entries(STATS_TABLES)) {
      await insert(client, table, {
        id: 1,
        userId: owner.userId,
        instanceId: "first",
        ...row,
      });
      await insert(client, table, {
        id: 2,
        userId: owner.userId + 100,
        instanceId: "first",
        ...row,
      });
    }

    await migrate(db);

    for (const table of Object.keys(STATS_TABLES)) {
      expect(await rows(client, table, `"id", "userId"`), table).toEqual([
        { id: 1, userId: owner.userId },
      ]);
    }
  });

  it("after it, a NULL instance fails NOT NULL, a stats row for a missing user fails the foreign key, and deleting a user deletes its four stats tables' rows", async () => {
    const { db, client, owner } = await setUp();
    await migrate(db);

    for (const spec of NULLABLE_TABLES) {
      await expect(
        addPerUserRow(client, spec, owner, 50, "1", null),
        spec.table
      ).rejects.toThrow(/NOT NULL/);
    }
    for (const [table, row] of Object.entries(STATS_TABLES)) {
      await expect(
        insert(client, table, {
          userId: owner.userId + 100,
          instanceId: "first",
          ...row,
        }),
        table
      ).rejects.toThrow(/FOREIGN KEY/);
      // No default instance any more
      await expect(
        insert(client, table, { userId: owner.userId, ...row }),
        table
      ).rejects.toThrow(/NOT NULL/);
      await insert(client, table, {
        userId: owner.userId,
        instanceId: "first",
        ...row,
      });
    }

    await client.$executeRawUnsafe(
      `DELETE FROM "User" WHERE "id" = ?`,
      owner.userId
    );

    for (const table of Object.keys(STATS_TABLES)) {
      expect(await rows(client, table), table).toEqual([]);
    }
  });

  it("each rebuilt table keeps its autoincrement counter, so a deleted row's id is not reused", async () => {
    const { db, client, owner } = await setUp();
    const tables = [
      ...NULLABLE_TABLES.map((spec) => spec.table),
      ...Object.keys(STATS_TABLES),
    ];
    // Rows 1 and 2 of each; row 2 then deleted, so the counter (2) is above
    // the highest id left (1). GroupRating is left empty: no row, and no
    // counter left by a rebuild, unless the migration puts it back.
    for (const spec of NULLABLE_TABLES) {
      if (spec.table === "GroupRating") continue;
      await addPerUserRow(client, spec, owner, 1, "1", "first");
      await addPerUserRow(client, spec, owner, 2, "2", "first");
    }
    for (const [table, row] of Object.entries(STATS_TABLES)) {
      await insert(client, table, {
        id: 1,
        userId: owner.userId,
        instanceId: "first",
        ...row,
      });
      await insert(client, table, {
        id: 2,
        userId: owner.userId,
        instanceId: "second",
        ...row,
      });
    }
    await insert(client, "GroupRating", {
      id: 7,
      userId: owner.userId,
      instanceId: "first",
      groupId: "1",
      updatedAt: UPDATED,
    });
    for (const table of tables) {
      await client.$executeRawUnsafe(
        `DELETE FROM "${table}" WHERE "id" = ${table === "GroupRating" ? 7 : 2}`
      );
    }
    const counters = async () =>
      Object.fromEntries(
        (
          await client.$queryRawUnsafe<
            Array<{ name: string; seq: number | bigint }>
          >(
            `SELECT "name", "seq" FROM sqlite_sequence WHERE "name" IN (${tables
              .map((t) => `'${t}'`)
              .join(", ")})`
          )
        ).map((row) => [row.name, Number(row.seq)])
      );
    const before = await counters();
    expect(Object.keys(before).sort()).toEqual([...tables].sort());

    await migrate(db);

    expect(await counters()).toEqual(before);
    expect(
      await client.$queryRawUnsafe<Row[]>(
        `SELECT "name" FROM sqlite_sequence WHERE "name" = 'UserEntityStats'`
      )
    ).toEqual([]);
  });

  it("`PRAGMA foreign_key_check` is empty and `UserEntityStats` is gone", async () => {
    const { db, client, owner } = await setUp();
    await insert(client, "UserEntityStats", {
      userId: owner.userId,
      entityType: "scene",
      instanceId: "",
      visibleCount: 1,
      updatedAt: UPDATED,
    });

    await migrate(db);

    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA integrity_check")
    ).toEqual([{ integrity_check: "ok" }]);
    expect(
      await client.$queryRawUnsafe<Row[]>(
        `SELECT "name" FROM "sqlite_master" WHERE "name" = 'UserEntityStats'`
      )
    ).toEqual([]);
  });
});
