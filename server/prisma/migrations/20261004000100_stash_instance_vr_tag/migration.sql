PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "StashInstance" ADD COLUMN "vrTagId" TEXT;
ALTER TABLE "StashInstance" ADD COLUMN "stashVrTag" TEXT;
COMMIT;
PRAGMA foreign_keys=ON;
