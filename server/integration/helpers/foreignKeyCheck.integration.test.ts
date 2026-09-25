/**
 * The foreign-key check global teardown runs after the whole suite: a replay
 * run fails on any row whose parent is missing.
 *
 * Prisma's pool keeps foreign keys on, so the orphan goes in through a
 * connection of its own with them off, as the sqlite3 CLI starts. It lives
 * under a made-up instance and is deleted before the test ends.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_CONFIG } from "./config.js";
import {
  type ForeignKeyViolation,
  findForeignKeyViolations,
} from "./foreignKeyCheck.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const INSTANCE = "orphan-it";

function countOf(
  rows: ForeignKeyViolation[],
  table: string,
  parent: string
): number {
  return (
    rows.find((row) => row.table === table && row.parent === parent)?.n ?? 0
  );
}

describeWithDb("findForeignKeyViolations", () => {
  it("reports a junction row whose parent is missing", async () => {
    const before = await findForeignKeyViolations(prisma);

    const db = new DatabaseSync(TEST_CONFIG.databasePath, {
      enableForeignKeyConstraints: false,
      timeout: 10_000,
    });
    try {
      // The tag exists, the scene does not: only the scene side is missing
      db.prepare(
        `INSERT INTO "StashTag" ("id", "stashInstanceId", "name") VALUES (?, ?, ?)`
      ).run("1", INSTANCE, "Orphan check tag");
      db.prepare(
        `INSERT INTO "SceneTag" ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId") VALUES (?, ?, ?, ?)`
      ).run("1", INSTANCE, "1", INSTANCE);

      const during = await findForeignKeyViolations(prisma);

      expect(during).toContainEqual({
        table: "SceneTag",
        parent: "StashScene",
        n: countOf(before, "SceneTag", "StashScene") + 1,
      });
      expect(countOf(during, "SceneTag", "StashTag")).toBe(
        countOf(before, "SceneTag", "StashTag")
      );
    } finally {
      db.prepare(`DELETE FROM "SceneTag" WHERE "sceneInstanceId" = ?`).run(
        INSTANCE
      );
      db.prepare(`DELETE FROM "StashTag" WHERE "stashInstanceId" = ?`).run(
        INSTANCE
      );
      db.close();
    }

    expect(await findForeignKeyViolations(prisma)).toEqual(before);
  });
});
