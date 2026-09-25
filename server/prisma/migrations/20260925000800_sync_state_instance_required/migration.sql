-- SyncState.stashInstanceId becomes NOT NULL (item 20, SYNC-14): every row
-- is one instance's state of one entity type, as everything stored about a
-- Stash entity carries its instance. The sync status endpoint and the
-- readiness checks read rows per instance, and a row with no instance could
-- come back as a phantom instance's state.
--
-- - Rows with no instance (January's multi-instance migration left 8, which
--   20260925000300 already deleted) and rows of an instance that no longer
--   exists go first: nothing reads them.
-- - SQLite cannot add NOT NULL in place, so the table is rebuilt: create
--   "new_SyncState", copy, drop, rename, recreate the unique key. The
--   autoincrement counter is saved first and restored after the rename, so
--   it never falls back to the highest surviving id.
-- - A downgrade to 3.4.0-beta.1 runs: it reads the rows with no instance,
--   finds none, and writes every row with its instance.
PRAGMA foreign_keys=OFF;
BEGIN;

DELETE FROM "SyncState"
WHERE "stashInstanceId" IS NULL
   OR "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");

CREATE TEMP TABLE "_seq" AS SELECT "seq" FROM sqlite_sequence WHERE "name" = 'SyncState';

CREATE TABLE "new_SyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stashInstanceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "lastFullSyncTimestamp" TEXT,
    "lastIncrementalSyncTimestamp" TEXT,
    "lastFullSyncActual" DATETIME,
    "lastIncrementalSyncActual" DATETIME,
    "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDurationMs" INTEGER,
    "lastError" TEXT,
    "totalEntities" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_SyncState" ("entityType", "id", "lastError", "lastFullSyncActual", "lastFullSyncTimestamp", "lastIncrementalSyncActual", "lastIncrementalSyncTimestamp", "lastSyncCount", "lastSyncDurationMs", "stashInstanceId", "totalEntities") SELECT "entityType", "id", "lastError", "lastFullSyncActual", "lastFullSyncTimestamp", "lastIncrementalSyncActual", "lastIncrementalSyncTimestamp", "lastSyncCount", "lastSyncDurationMs", "stashInstanceId", "totalEntities" FROM "SyncState";
DROP TABLE "SyncState";
ALTER TABLE "new_SyncState" RENAME TO "SyncState";
CREATE UNIQUE INDEX "SyncState_stashInstanceId_entityType_key" ON "SyncState"("stashInstanceId", "entityType");

UPDATE sqlite_sequence SET "seq" = (SELECT "seq" FROM "_seq") WHERE "name" = 'SyncState' AND EXISTS (SELECT 1 FROM "_seq");
INSERT INTO sqlite_sequence ("name", "seq") SELECT 'SyncState', "seq" FROM "_seq" WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE "name" = 'SyncState');
DROP TABLE "_seq";

CREATE TEMP TABLE "_fk_guard" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "_fk_guard" SELECT count(*) FROM pragma_foreign_key_check('SyncState');
DROP TABLE "_fk_guard";

COMMIT;
PRAGMA foreign_keys=ON;
