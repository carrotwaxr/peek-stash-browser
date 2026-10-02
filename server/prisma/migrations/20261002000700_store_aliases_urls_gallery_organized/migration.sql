-- Stores what the filters on aliases, links, Organized and zip galleries read
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "StashStudio" ADD COLUMN "aliases" TEXT;
ALTER TABLE "StashGroup" ADD COLUMN "aliases" TEXT;
ALTER TABLE "StashPerformer" ADD COLUMN "urls" TEXT;
ALTER TABLE "StashGallery" ADD COLUMN "organized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StashGallery" ADD COLUMN "filePath" TEXT;
-- Until the re-fetch, a performer's one stored link is its list
UPDATE "StashPerformer" SET "urls" = json_array("url") WHERE "url" IS NOT NULL AND "url" != '';
-- The cached rows lack the new columns: fetch these types whole once
UPDATE "SyncState" SET "lastFullSyncTimestamp" = NULL, "lastIncrementalSyncTimestamp" = NULL
  WHERE "entityType" IN ('studio', 'group', 'performer', 'gallery');
COMMIT;
PRAGMA foreign_keys=ON;
