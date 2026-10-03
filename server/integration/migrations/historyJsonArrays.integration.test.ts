/**
 * `20261002000100_history_json_arrays` rewrites O, play and view histories that
 * an older version stored as a JSON string holding the array's text
 * (`"[\"2025-10-25T03:50:32.452Z\"]"`, `json_type` text) as the arrays they
 * should be, so `json_each` reads them. A history already an array, or a
 * string that is not an array's text, is left alone.
 *
 * The migration runs on a sandbox database built at the migration before it.
 */
import { cpSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { runPrismaCli } from "../../initializers/migrations.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
  insertUser,
} from "../helpers/migrationSandbox.js";

/** The newest migration before this one */
const BEFORE = "20261001000300_clip_live_scene_index";
const MIGRATION = "20261002000100_history_json_arrays";

type Client = MigrationSandbox["client"];
type Row = Record<string, unknown>;

const T1 = "2025-10-25T03:50:32.452Z";
const T2 = "2025-11-02T10:00:00.000Z";
/** What an older version stored: the array's text, JSON-encoded again */
const ENCODED = JSON.stringify(JSON.stringify([T1, T2]));
const ARRAY = JSON.stringify([T1]);
const NOT_JSON = JSON.stringify("not json");
/** A string that is valid JSON but not an array */
const NOT_ARRAY = JSON.stringify(JSON.stringify({ a: 1 }));

async function seedScene(
  client: Client,
  userId: number,
  sceneId: string,
  oHistory: string,
  playHistory: string
): Promise<void> {
  await client.$executeRawUnsafe(
    `INSERT INTO "WatchHistory" ("userId", "instanceId", "sceneId", "oHistory", "playHistory", "watchedAt")
     VALUES (?, 'default', ?, ?, ?, ?)`,
    userId,
    sceneId,
    oHistory,
    playHistory,
    Date.now()
  );
}

async function seedImage(
  client: Client,
  userId: number,
  imageId: string,
  oHistory: string,
  viewHistory: string
): Promise<void> {
  const now = Date.now();
  await client.$executeRawUnsafe(
    `INSERT INTO "ImageViewHistory" ("userId", "instanceId", "imageId", "oHistory", "viewHistory", "createdAt", "updatedAt")
     VALUES (?, 'default', ?, ?, ?, ?, ?)`,
    userId,
    imageId,
    oHistory,
    viewHistory,
    now,
    now
  );
}

async function types(
  client: Client,
  table: string,
  idColumn: string,
  columns: string[]
): Promise<Record<string, Row>> {
  const select = columns
    .map(
      (c) => `json_type("${c}") AS "${c}Type", CAST("${c}" AS TEXT) AS "${c}"`
    )
    .join(", ");
  const rows = await client.$queryRawUnsafe<Row[]>(
    `SELECT "${idColumn}" AS id, ${select} FROM "${table}"`
  );
  return Object.fromEntries(rows.map((r) => [String(r.id), r]));
}

/** Applies this migration alone */
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

describe("history JSON arrays migration", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("stores double-encoded histories as arrays and leaves every other value alone", async () => {
    const db = await createDatabaseAt(BEFORE);
    sandbox = db;
    const { client } = db;
    const userId = await insertUser(client, { username: "u", password: "x" });

    await seedScene(client, userId, "encoded", ENCODED, ENCODED);
    await seedScene(client, userId, "array", ARRAY, ARRAY);
    await seedScene(client, userId, "notjson", NOT_JSON, NOT_JSON);
    await seedScene(client, userId, "notarray", NOT_ARRAY, NOT_ARRAY);
    await seedImage(client, userId, "encoded", ENCODED, ENCODED);
    await seedImage(client, userId, "array", ARRAY, ARRAY);
    await seedImage(client, userId, "notjson", NOT_JSON, NOT_JSON);

    const sceneBefore = await types(client, "WatchHistory", "sceneId", [
      "oHistory",
      "playHistory",
    ]);
    expect(sceneBefore.encoded?.oHistoryType).toBe("text");
    expect(sceneBefore.encoded?.playHistoryType).toBe("text");

    await migrate(db);

    const scenes = await types(client, "WatchHistory", "sceneId", [
      "oHistory",
      "playHistory",
    ]);
    const images = await types(client, "ImageViewHistory", "imageId", [
      "oHistory",
      "viewHistory",
    ]);

    const scene = (id: string): Row => scenes[id] ?? {};
    const image = (id: string): Row => images[id] ?? {};

    // Encoded rows are arrays with the same timestamps
    expect(scene("encoded").oHistoryType).toBe("array");
    expect(scene("encoded").playHistoryType).toBe("array");
    expect(JSON.parse(String(scene("encoded").oHistory))).toEqual([T1, T2]);
    expect(JSON.parse(String(scene("encoded").playHistory))).toEqual([T1, T2]);
    expect(image("encoded").oHistoryType).toBe("array");
    expect(image("encoded").viewHistoryType).toBe("array");
    expect(JSON.parse(String(image("encoded").oHistory))).toEqual([T1, T2]);
    expect(JSON.parse(String(image("encoded").viewHistory))).toEqual([T1, T2]);

    // Everything else is what it was: an array stays an array, a string that
    // is not an array's text stays that string
    expect(scene("array").oHistory).toBe(ARRAY);
    expect(scene("array").playHistory).toBe(ARRAY);
    expect(scene("array").oHistoryType).toBe("array");
    expect(scene("notjson").oHistory).toBe(NOT_JSON);
    expect(scene("notjson").playHistory).toBe(NOT_JSON);
    expect(scene("notjson").oHistoryType).toBe("text");
    expect(scene("notarray").oHistory).toBe(NOT_ARRAY);
    expect(scene("notarray").playHistory).toBe(NOT_ARRAY);
    expect(scene("notarray").oHistoryType).toBe("text");
    expect(image("array").oHistory).toBe(ARRAY);
    expect(image("array").viewHistory).toBe(ARRAY);
    expect(image("notjson").oHistory).toBe(NOT_JSON);
    expect(image("notjson").viewHistory).toBe(NOT_JSON);

    // The last_o_at sort's expression reads the newest O of a migrated row
    const [newest] = await client.$queryRawUnsafe<Row[]>(
      `SELECT (SELECT MAX(j.value) FROM json_each("oHistory") j) AS newest
       FROM "WatchHistory" WHERE "sceneId" = 'encoded'`
    );
    expect(newest?.newest).toBe(T2);

    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA foreign_key_check")
    ).toEqual([]);
    expect(
      await client.$queryRawUnsafe<Row[]>("PRAGMA integrity_check")
    ).toEqual([{ integrity_check: "ok" }]);
  });
});
