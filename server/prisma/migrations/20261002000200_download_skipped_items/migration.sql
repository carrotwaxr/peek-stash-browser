-- A playlist zip leaves out a scene it cannot fetch when it is built (Stash
-- answers 404 or 410: deleted since the last sync; or its instance was
-- disabled or deleted) and counts it, so the Downloads page can say so.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "Download" ADD COLUMN "skippedItems" INTEGER NOT NULL DEFAULT 0;
COMMIT;
PRAGMA foreign_keys=ON;
