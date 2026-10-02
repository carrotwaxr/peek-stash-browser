/**
 * The F1 migration adds the columns sync now fills (studio and collection
 * aliases, a performer's links, a gallery's organized flag and zip path) and
 * asks for one more fetch of the four types, so the cached rows get them.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { isAtomicMigration } from "../../initializers/migrations.js";

const FOLDER = "20261002000700_store_aliases_urls_gallery_organized";

const sql = readFileSync(
  path.join(
    fileURLToPath(new URL("../../prisma/", import.meta.url)),
    "migrations",
    FOLDER,
    "migration.sql"
  ),
  "utf8"
);

describe("migration store_aliases_urls_gallery_organized", () => {
  it("is atomic", () => {
    expect(isAtomicMigration(sql)).toBe(true);
  });

  it("adds the five columns", () => {
    const adds = sql.match(/^ALTER TABLE .* ADD COLUMN .*;$/gm) ?? [];
    expect(adds).toEqual([
      'ALTER TABLE "StashStudio" ADD COLUMN "aliases" TEXT;',
      'ALTER TABLE "StashGroup" ADD COLUMN "aliases" TEXT;',
      'ALTER TABLE "StashPerformer" ADD COLUMN "urls" TEXT;',
      'ALTER TABLE "StashGallery" ADD COLUMN "organized" BOOLEAN NOT NULL DEFAULT false;',
      'ALTER TABLE "StashGallery" ADD COLUMN "filePath" TEXT;',
    ]);
  });

  it("backfills a performer's list from its one stored link", () => {
    expect(sql).toContain(
      `UPDATE "StashPerformer" SET "urls" = json_array("url") WHERE "url" IS NOT NULL AND "url" != '';`
    );
  });

  it("asks for a whole fetch of exactly studio, group, performer and gallery", () => {
    const update = /UPDATE "SyncState"[\s\S]*?;/.exec(sql)?.[0] ?? "";
    expect(update).toContain(
      `SET "lastFullSyncTimestamp" = NULL, "lastIncrementalSyncTimestamp" = NULL`
    );
    const types = /"entityType" IN \(([^)]*)\)/.exec(update)?.[1] ?? "";
    expect(types.match(/'(\w+)'/g)).toEqual([
      "'studio'",
      "'group'",
      "'performer'",
      "'gallery'",
    ]);
  });
});
