-- Add missing count fields to CachedPerformer
ALTER TABLE "CachedPerformer" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 0;

-- Add missing count fields to CachedStudio
ALTER TABLE "CachedStudio" ADD COLUMN "performerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedStudio" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 0;

-- Add missing count fields to CachedTag
ALTER TABLE "CachedTag" ADD COLUMN "galleryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedTag" ADD COLUMN "performerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedTag" ADD COLUMN "studioCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedTag" ADD COLUMN "groupCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedTag" ADD COLUMN "sceneMarkerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CachedTag" ADD COLUMN "aliases" TEXT;

-- Add missing count fields to CachedGroup
ALTER TABLE "CachedGroup" ADD COLUMN "performerCount" INTEGER NOT NULL DEFAULT 0;
