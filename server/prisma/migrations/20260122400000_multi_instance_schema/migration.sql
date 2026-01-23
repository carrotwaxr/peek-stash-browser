-- Multi-instance support schema changes
-- Adds description to StashInstance, creates UserStashInstance join table,
-- and adds instanceId to all user data tables for composite entity references

-- ============================================================================
-- STEP 1: Add description field to StashInstance
-- ============================================================================

ALTER TABLE "StashInstance" ADD COLUMN "description" TEXT;

-- ============================================================================
-- STEP 2: Create UserStashInstance join table
-- Tracks which instances each user wants to see content from
-- ============================================================================

CREATE TABLE "UserStashInstance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStashInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserStashInstance_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "StashInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserStashInstance_userId_instanceId_key" ON "UserStashInstance"("userId", "instanceId");
CREATE INDEX "UserStashInstance_userId_idx" ON "UserStashInstance"("userId");
CREATE INDEX "UserStashInstance_instanceId_idx" ON "UserStashInstance"("instanceId");

-- ============================================================================
-- STEP 3: Add instanceId to WatchHistory
-- ============================================================================

-- Add nullable column first
ALTER TABLE "WatchHistory" ADD COLUMN "instanceId" TEXT;

-- Backfill with first StashInstance (there's only one in existing deployments)
UPDATE "WatchHistory" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);

-- Drop old unique index
DROP INDEX IF EXISTS "WatchHistory_userId_sceneId_key";

-- Create new composite unique index
CREATE UNIQUE INDEX "WatchHistory_userId_instanceId_sceneId_key" ON "WatchHistory"("userId", "instanceId", "sceneId");

-- ============================================================================
-- STEP 4: Add instanceId to SceneRating
-- ============================================================================

ALTER TABLE "SceneRating" ADD COLUMN "instanceId" TEXT;
UPDATE "SceneRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "SceneRating_userId_sceneId_key";
CREATE UNIQUE INDEX "SceneRating_userId_instanceId_sceneId_key" ON "SceneRating"("userId", "instanceId", "sceneId");

-- ============================================================================
-- STEP 5: Add instanceId to PerformerRating
-- ============================================================================

ALTER TABLE "PerformerRating" ADD COLUMN "instanceId" TEXT;
UPDATE "PerformerRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "PerformerRating_userId_performerId_key";
CREATE UNIQUE INDEX "PerformerRating_userId_instanceId_performerId_key" ON "PerformerRating"("userId", "instanceId", "performerId");

-- ============================================================================
-- STEP 6: Add instanceId to StudioRating
-- ============================================================================

ALTER TABLE "StudioRating" ADD COLUMN "instanceId" TEXT;
UPDATE "StudioRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "StudioRating_userId_studioId_key";
CREATE UNIQUE INDEX "StudioRating_userId_instanceId_studioId_key" ON "StudioRating"("userId", "instanceId", "studioId");

-- ============================================================================
-- STEP 7: Add instanceId to TagRating
-- ============================================================================

ALTER TABLE "TagRating" ADD COLUMN "instanceId" TEXT;
UPDATE "TagRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "TagRating_userId_tagId_key";
CREATE UNIQUE INDEX "TagRating_userId_instanceId_tagId_key" ON "TagRating"("userId", "instanceId", "tagId");

-- ============================================================================
-- STEP 8: Add instanceId to GalleryRating
-- ============================================================================

ALTER TABLE "GalleryRating" ADD COLUMN "instanceId" TEXT;
UPDATE "GalleryRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "GalleryRating_userId_galleryId_key";
CREATE UNIQUE INDEX "GalleryRating_userId_instanceId_galleryId_key" ON "GalleryRating"("userId", "instanceId", "galleryId");

-- ============================================================================
-- STEP 9: Add instanceId to GroupRating
-- ============================================================================

ALTER TABLE "GroupRating" ADD COLUMN "instanceId" TEXT;
UPDATE "GroupRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "GroupRating_userId_groupId_key";
CREATE UNIQUE INDEX "GroupRating_userId_instanceId_groupId_key" ON "GroupRating"("userId", "instanceId", "groupId");

-- ============================================================================
-- STEP 10: Add instanceId to ImageRating
-- ============================================================================

ALTER TABLE "ImageRating" ADD COLUMN "instanceId" TEXT;
UPDATE "ImageRating" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "ImageRating_userId_imageId_key";
CREATE UNIQUE INDEX "ImageRating_userId_instanceId_imageId_key" ON "ImageRating"("userId", "instanceId", "imageId");

-- ============================================================================
-- STEP 11: Add instanceId to ImageViewHistory
-- ============================================================================

ALTER TABLE "ImageViewHistory" ADD COLUMN "instanceId" TEXT;
UPDATE "ImageViewHistory" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "ImageViewHistory_userId_imageId_key";
CREATE UNIQUE INDEX "ImageViewHistory_userId_instanceId_imageId_key" ON "ImageViewHistory"("userId", "instanceId", "imageId");

-- ============================================================================
-- STEP 12: Add instanceId to PlaylistItem
-- For cross-instance playlists
-- ============================================================================

ALTER TABLE "PlaylistItem" ADD COLUMN "instanceId" TEXT;
UPDATE "PlaylistItem" SET "instanceId" = (SELECT "id" FROM "StashInstance" LIMIT 1);
DROP INDEX IF EXISTS "PlaylistItem_playlistId_sceneId_key";
CREATE UNIQUE INDEX "PlaylistItem_playlistId_instanceId_sceneId_key" ON "PlaylistItem"("playlistId", "instanceId", "sceneId");
