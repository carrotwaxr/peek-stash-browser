-- StashPerformer.penisLength and circumcised (item 25). Stash's
-- FindPerformers already returned penis_length (cm) and circumcised
-- ("CUT" or "UNCUT"), but sync stored neither, so the Penis Length filter
-- and sort failed on a missing column and the performer page never showed
-- either row.
--
-- In place, no rebuild: an ADD COLUMN rewrites no row. The columns start
-- NULL, so the next sync fetches every performer again to fill them
-- (prisma.md, step 3); performers only. An older Peek ignores the columns.
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashPerformer" ADD COLUMN "penisLength" REAL;
ALTER TABLE "StashPerformer" ADD COLUMN "circumcised" TEXT;

UPDATE "SyncState" SET "lastFullSyncTimestamp" = NULL, "lastIncrementalSyncTimestamp" = NULL WHERE "entityType" = 'performer';

COMMIT;
PRAGMA foreign_keys=ON;
