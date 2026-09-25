/**
 * Migrations from PR 3 on are atomic: `PRAGMA foreign_keys=OFF;` `BEGIN;`
 * ... `COMMIT;` `PRAGMA foreign_keys=ON;`, so one that fails rolls back whole
 * and the server can retry it at the next start (`.claude/rules/prisma.md`).
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  isAtomicMigration,
  listMigrationFolders,
} from "../../initializers/migrations.js";

const PRISMA_DIR = fileURLToPath(new URL("../../prisma/", import.meta.url));

/** Folders from this name on must be atomic. */
const FIRST_ATOMIC = "20260925000000";

function migrationSql(folder: string): string {
  return readFileSync(
    path.join(PRISMA_DIR, "migrations", folder, "migration.sql"),
    "utf8"
  );
}

const WRAPPED = `-- Drops the probe table
PRAGMA foreign_keys=OFF;
BEGIN;
DROP TABLE "Probe";
COMMIT;
PRAGMA foreign_keys=ON;
`;

/** What \`prisma migrate dev\` writes for SQLite when it rebuilds a table. */
const PRISMA_REDEFINE = `-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Probe" ("id" TEXT NOT NULL PRIMARY KEY);
INSERT INTO "new_Probe" ("id") SELECT "id" FROM "Probe";
DROP TABLE "Probe";
ALTER TABLE "new_Probe" RENAME TO "Probe";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
`;

describe("migration files", () => {
  it("every migration from 20260925000000 on is atomic", () => {
    const newer = listMigrationFolders(PRISMA_DIR).filter(
      (folder) => folder >= FIRST_ATOMIC
    );

    expect(
      newer.filter((folder) => !isAtomicMigration(migrationSql(folder)))
    ).toEqual([]);
  });
});

describe("isAtomicMigration", () => {
  it("accepts the wrapper, with comments, blank lines and any case or spacing", () => {
    expect(isAtomicMigration(WRAPPED)).toBe(true);
    expect(
      isAtomicMigration(`
        /* rebuilds nothing */
        pragma foreign_keys = off;

        begin;  -- one transaction
        UPDATE "Probe" SET "note" = 'BEGIN; COMMIT;';
        commit;
        PRAGMA foreign_keys = ON;`)
    ).toBe(true);
  });

  it("isAtomicMigration rejects Prisma's generated PRAGMA pairs", () => {
    expect(isAtomicMigration(PRISMA_REDEFINE)).toBe(false);
    // Wrapped, the pairs inside would still turn the checks back on midway
    const body = PRISMA_REDEFINE.replace("-- RedefineTables\n", "");
    expect(
      isAtomicMigration(
        `PRAGMA foreign_keys=OFF;\nBEGIN;\n${body}COMMIT;\nPRAGMA foreign_keys=ON;\n`
      )
    ).toBe(false);
    expect(
      isAtomicMigration(
        WRAPPED.replace("BEGIN;", "BEGIN;\nPRAGMA defer_foreign_keys=ON;")
      )
    ).toBe(false);
  });

  it("rejects a file without the wrapper, or with the wrapper out of order", () => {
    expect(isAtomicMigration(`DROP TABLE "Probe";`)).toBe(false);
    expect(isAtomicMigration(WRAPPED.replace("BEGIN;\n", ""))).toBe(false);
    expect(isAtomicMigration(WRAPPED.replace("COMMIT;\n", ""))).toBe(false);
    expect(
      isAtomicMigration(WRAPPED.replace("PRAGMA foreign_keys=ON;\n", ""))
    ).toBe(false);
    // Inside a transaction the pragma does nothing: it must come before BEGIN
    expect(
      isAtomicMigration(
        `BEGIN;\nPRAGMA foreign_keys=OFF;\nDROP TABLE "Probe";\nPRAGMA foreign_keys=ON;\nCOMMIT;\n`
      )
    ).toBe(false);
    expect(isAtomicMigration(`${WRAPPED}DROP TABLE "Other";\n`)).toBe(false);
  });

  it("rejects a transaction ended or split inside the wrapper", () => {
    for (const statement of [
      "COMMIT;",
      "END;",
      "ROLLBACK;",
      "BEGIN;",
      "SAVEPOINT s;",
      "RELEASE s;",
    ]) {
      expect(
        isAtomicMigration(
          WRAPPED.replace(
            'DROP TABLE "Probe";',
            `${statement}\nDROP TABLE "Probe";`
          )
        ),
        statement
      ).toBe(false);
    }
  });

  it("reads a trigger's BEGIN ... END body as part of its statement", () => {
    const trigger = `CREATE TRIGGER "probe_ai" AFTER INSERT ON "Probe"
WHEN NEW."kind" = CASE WHEN 1 THEN 'a' ELSE 'b' END
BEGIN
  UPDATE "Probe" SET "kind" = CASE NEW."kind" WHEN 'a' THEN 'b' ELSE 'a' END;
  INSERT INTO "ProbeLog" ("id") VALUES (NEW."id");
END;`;

    expect(
      isAtomicMigration(WRAPPED.replace('DROP TABLE "Probe";', trigger))
    ).toBe(true);
  });
});
