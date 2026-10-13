-- Each user's recommendation preferences (leads, partners, discovery, ignored
-- tags): NULL shows the defaults (shared/types/recommendationPreferences.ts).
-- Deleted with the user row.
-- UserEntityRanking gains the open and keep counts and the implicit affinity
-- that Recommended reads.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "User" ADD COLUMN "recommendationPreferences" JSONB;
ALTER TABLE "UserEntityRanking" ADD COLUMN "openedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserEntityRanking" ADD COLUMN "keptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserEntityRanking" ADD COLUMN "affinity" REAL NOT NULL DEFAULT 0;
-- The rankings recompute on each user's next visit, now with the new columns.
DELETE FROM "UserEntityRanking";
COMMIT;
PRAGMA foreign_keys=ON;
