-- Migration: Composite Entity Primary Keys
--
-- This migration changes all Stash entity tables to use composite primary keys
-- [id, stashInstanceId] to support multiple Stash instances without ID collisions.
--
-- SQLite doesn't support ALTER TABLE to change primary keys, so we must:
-- 1. Create new table with composite PK
-- 2. Copy data from old table
-- 3. Drop old table
-- 4. Rename new table
-- 5. Recreate indexes

-- ============================================================================
-- STEP 0: Disable foreign keys during migration
-- ============================================================================

PRAGMA foreign_keys=OFF;

-- ============================================================================
-- STEP 1: Backfill NULL stashInstanceId to 'default' in all entity tables
-- ============================================================================

UPDATE "StashScene" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashPerformer" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashStudio" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashTag" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashGroup" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashGallery" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashImage" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;
UPDATE "StashClip" SET "stashInstanceId" = 'default' WHERE "stashInstanceId" IS NULL;

-- ============================================================================
-- STEP 2: Add stashInstanceId to junction tables and populate from parent entities
-- ============================================================================

-- ScenePerformer: Add columns for composite FKs
ALTER TABLE "ScenePerformer" ADD COLUMN "sceneInstanceId" TEXT;
ALTER TABLE "ScenePerformer" ADD COLUMN "performerInstanceId" TEXT;
UPDATE "ScenePerformer" SET
    "sceneInstanceId" = (SELECT "stashInstanceId" FROM "StashScene" WHERE "StashScene"."id" = "ScenePerformer"."sceneId"),
    "performerInstanceId" = (SELECT "stashInstanceId" FROM "StashPerformer" WHERE "StashPerformer"."id" = "ScenePerformer"."performerId");

-- SceneTag: Add columns for composite FKs
ALTER TABLE "SceneTag" ADD COLUMN "sceneInstanceId" TEXT;
ALTER TABLE "SceneTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "SceneTag" SET
    "sceneInstanceId" = (SELECT "stashInstanceId" FROM "StashScene" WHERE "StashScene"."id" = "SceneTag"."sceneId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "SceneTag"."tagId");

-- SceneGroup: Add columns for composite FKs
ALTER TABLE "SceneGroup" ADD COLUMN "sceneInstanceId" TEXT;
ALTER TABLE "SceneGroup" ADD COLUMN "groupInstanceId" TEXT;
UPDATE "SceneGroup" SET
    "sceneInstanceId" = (SELECT "stashInstanceId" FROM "StashScene" WHERE "StashScene"."id" = "SceneGroup"."sceneId"),
    "groupInstanceId" = (SELECT "stashInstanceId" FROM "StashGroup" WHERE "StashGroup"."id" = "SceneGroup"."groupId");

-- SceneGallery: Add columns for composite FKs
ALTER TABLE "SceneGallery" ADD COLUMN "sceneInstanceId" TEXT;
ALTER TABLE "SceneGallery" ADD COLUMN "galleryInstanceId" TEXT;
UPDATE "SceneGallery" SET
    "sceneInstanceId" = (SELECT "stashInstanceId" FROM "StashScene" WHERE "StashScene"."id" = "SceneGallery"."sceneId"),
    "galleryInstanceId" = (SELECT "stashInstanceId" FROM "StashGallery" WHERE "StashGallery"."id" = "SceneGallery"."galleryId");

-- ImagePerformer: Add columns for composite FKs
ALTER TABLE "ImagePerformer" ADD COLUMN "imageInstanceId" TEXT;
ALTER TABLE "ImagePerformer" ADD COLUMN "performerInstanceId" TEXT;
UPDATE "ImagePerformer" SET
    "imageInstanceId" = (SELECT "stashInstanceId" FROM "StashImage" WHERE "StashImage"."id" = "ImagePerformer"."imageId"),
    "performerInstanceId" = (SELECT "stashInstanceId" FROM "StashPerformer" WHERE "StashPerformer"."id" = "ImagePerformer"."performerId");

-- ImageTag: Add columns for composite FKs
ALTER TABLE "ImageTag" ADD COLUMN "imageInstanceId" TEXT;
ALTER TABLE "ImageTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "ImageTag" SET
    "imageInstanceId" = (SELECT "stashInstanceId" FROM "StashImage" WHERE "StashImage"."id" = "ImageTag"."imageId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "ImageTag"."tagId");

-- ImageGallery: Add columns for composite FKs
ALTER TABLE "ImageGallery" ADD COLUMN "imageInstanceId" TEXT;
ALTER TABLE "ImageGallery" ADD COLUMN "galleryInstanceId" TEXT;
UPDATE "ImageGallery" SET
    "imageInstanceId" = (SELECT "stashInstanceId" FROM "StashImage" WHERE "StashImage"."id" = "ImageGallery"."imageId"),
    "galleryInstanceId" = (SELECT "stashInstanceId" FROM "StashGallery" WHERE "StashGallery"."id" = "ImageGallery"."galleryId");

-- GalleryPerformer: Add columns for composite FKs
ALTER TABLE "GalleryPerformer" ADD COLUMN "galleryInstanceId" TEXT;
ALTER TABLE "GalleryPerformer" ADD COLUMN "performerInstanceId" TEXT;
UPDATE "GalleryPerformer" SET
    "galleryInstanceId" = (SELECT "stashInstanceId" FROM "StashGallery" WHERE "StashGallery"."id" = "GalleryPerformer"."galleryId"),
    "performerInstanceId" = (SELECT "stashInstanceId" FROM "StashPerformer" WHERE "StashPerformer"."id" = "GalleryPerformer"."performerId");

-- GalleryTag: Add columns for composite FKs
ALTER TABLE "GalleryTag" ADD COLUMN "galleryInstanceId" TEXT;
ALTER TABLE "GalleryTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "GalleryTag" SET
    "galleryInstanceId" = (SELECT "stashInstanceId" FROM "StashGallery" WHERE "StashGallery"."id" = "GalleryTag"."galleryId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "GalleryTag"."tagId");

-- PerformerTag: Add columns for composite FKs
ALTER TABLE "PerformerTag" ADD COLUMN "performerInstanceId" TEXT;
ALTER TABLE "PerformerTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "PerformerTag" SET
    "performerInstanceId" = (SELECT "stashInstanceId" FROM "StashPerformer" WHERE "StashPerformer"."id" = "PerformerTag"."performerId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "PerformerTag"."tagId");

-- StudioTag: Add columns for composite FKs
ALTER TABLE "StudioTag" ADD COLUMN "studioInstanceId" TEXT;
ALTER TABLE "StudioTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "StudioTag" SET
    "studioInstanceId" = (SELECT "stashInstanceId" FROM "StashStudio" WHERE "StashStudio"."id" = "StudioTag"."studioId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "StudioTag"."tagId");

-- GroupTag: Add columns for composite FKs
ALTER TABLE "GroupTag" ADD COLUMN "groupInstanceId" TEXT;
ALTER TABLE "GroupTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "GroupTag" SET
    "groupInstanceId" = (SELECT "stashInstanceId" FROM "StashGroup" WHERE "StashGroup"."id" = "GroupTag"."groupId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "GroupTag"."tagId");

-- ClipTag: Add columns for composite FKs
ALTER TABLE "ClipTag" ADD COLUMN "clipInstanceId" TEXT;
ALTER TABLE "ClipTag" ADD COLUMN "tagInstanceId" TEXT;
UPDATE "ClipTag" SET
    "clipInstanceId" = (SELECT "stashInstanceId" FROM "StashClip" WHERE "StashClip"."id" = "ClipTag"."clipId"),
    "tagInstanceId" = (SELECT "stashInstanceId" FROM "StashTag" WHERE "StashTag"."id" = "ClipTag"."tagId");

-- ============================================================================
-- STEP 3: Recreate StashScene with composite primary key
-- ============================================================================

-- Backfill NULL boolean/integer fields to defaults before copying
UPDATE "StashScene" SET "organized" = 0 WHERE "organized" IS NULL;
UPDATE "StashScene" SET "oCounter" = 0 WHERE "oCounter" IS NULL;
UPDATE "StashScene" SET "playCount" = 0 WHERE "playCount" IS NULL;
UPDATE "StashScene" SET "playDuration" = 0 WHERE "playDuration" IS NULL;

-- Drop FTS triggers first (they reference StashScene)
DROP TRIGGER IF EXISTS scene_fts_insert;
DROP TRIGGER IF EXISTS scene_fts_delete;
DROP TRIGGER IF EXISTS scene_fts_update;

CREATE TABLE "StashScene_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "code" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "director" TEXT,
    "urls" TEXT,
    "filePath" TEXT,
    "fileBitRate" INTEGER,
    "fileFrameRate" REAL,
    "fileWidth" INTEGER,
    "fileHeight" INTEGER,
    "fileVideoCodec" TEXT,
    "fileAudioCodec" TEXT,
    "fileSize" BIGINT,
    "pathScreenshot" TEXT,
    "pathPreview" TEXT,
    "pathSprite" TEXT,
    "pathVtt" TEXT,
    "pathChaptersVtt" TEXT,
    "pathStream" TEXT,
    "pathCaption" TEXT,
    "streams" TEXT,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "playDuration" REAL NOT NULL DEFAULT 0,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "inheritedTagIds" TEXT,
    "phash" TEXT,
    "phashes" TEXT,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashScene_new" (
    "id", "stashInstanceId", "title", "code", "date", "studioId", "rating100", "duration",
    "organized", "details", "director", "urls", "filePath", "fileBitRate", "fileFrameRate",
    "fileWidth", "fileHeight", "fileVideoCodec", "fileAudioCodec", "fileSize",
    "pathScreenshot", "pathPreview", "pathSprite", "pathVtt", "pathChaptersVtt",
    "pathStream", "pathCaption", "streams", "oCounter", "playCount", "playDuration",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt", "inheritedTagIds", "phash", "phashes"
)
SELECT
    "id", "stashInstanceId", "title", "code", "date", "studioId", "rating100", "duration",
    "organized", "details", "director", "urls", "filePath", "fileBitRate", "fileFrameRate",
    "fileWidth", "fileHeight", "fileVideoCodec", "fileAudioCodec", "fileSize",
    "pathScreenshot", "pathPreview", "pathSprite", "pathVtt", "pathChaptersVtt",
    "pathStream", "pathCaption", "streams", "oCounter", "playCount", "playDuration",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt", "inheritedTagIds", "phash", "phashes"
FROM "StashScene";
DROP TABLE "StashScene";
ALTER TABLE "StashScene_new" RENAME TO "StashScene";

-- Recreate StashScene indexes
CREATE INDEX "StashScene_studioId_idx" ON "StashScene"("studioId");
CREATE INDEX "StashScene_date_idx" ON "StashScene"("date");
CREATE INDEX "StashScene_stashCreatedAt_idx" ON "StashScene"("stashCreatedAt");
CREATE INDEX "StashScene_stashUpdatedAt_idx" ON "StashScene"("stashUpdatedAt");
CREATE INDEX "StashScene_rating100_idx" ON "StashScene"("rating100");
CREATE INDEX "StashScene_duration_idx" ON "StashScene"("duration");
CREATE INDEX "StashScene_deletedAt_idx" ON "StashScene"("deletedAt");
CREATE INDEX "StashScene_oCounter_idx" ON "StashScene"("oCounter");
CREATE INDEX "StashScene_playCount_idx" ON "StashScene"("playCount");
CREATE INDEX "StashScene_phash_idx" ON "StashScene"("phash");
CREATE INDEX "StashScene_browse_idx" ON "StashScene"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashScene_browse_updated_idx" ON "StashScene"("deletedAt", "stashUpdatedAt" DESC);
CREATE INDEX "StashScene_browse_date_idx" ON "StashScene"("deletedAt", "date" DESC);
CREATE INDEX "StashScene_browse_title_idx" ON "StashScene"("deletedAt", "title");
CREATE INDEX "StashScene_browse_duration_idx" ON "StashScene"("deletedAt", "duration" DESC);
CREATE INDEX "StashScene_stashInstanceId_idx" ON "StashScene"("stashInstanceId");

-- Recreate FTS triggers
CREATE TRIGGER scene_fts_insert AFTER INSERT ON StashScene BEGIN
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;

CREATE TRIGGER scene_fts_delete AFTER DELETE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
END;

CREATE TRIGGER scene_fts_update AFTER UPDATE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;

-- ============================================================================
-- STEP 4: Recreate StashPerformer with composite primary key
-- ============================================================================

-- Backfill NULL boolean/integer fields to defaults before copying
UPDATE "StashPerformer" SET "favorite" = 0 WHERE "favorite" IS NULL;
UPDATE "StashPerformer" SET "sceneCount" = 0 WHERE "sceneCount" IS NULL;
UPDATE "StashPerformer" SET "imageCount" = 0 WHERE "imageCount" IS NULL;
UPDATE "StashPerformer" SET "galleryCount" = 0 WHERE "galleryCount" IS NULL;
UPDATE "StashPerformer" SET "groupCount" = 0 WHERE "groupCount" IS NULL;

CREATE TABLE "StashPerformer_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "stashIds" TEXT,
    "name" TEXT NOT NULL,
    "disambiguation" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "galleryCount" INTEGER NOT NULL DEFAULT 0,
    "groupCount" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "aliasList" TEXT,
    "country" TEXT,
    "ethnicity" TEXT,
    "hairColor" TEXT,
    "eyeColor" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "measurements" TEXT,
    "fakeTits" TEXT,
    "tattoos" TEXT,
    "piercings" TEXT,
    "careerLength" TEXT,
    "deathDate" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashPerformer_new" (
    "id", "stashInstanceId", "stashIds", "name", "disambiguation", "gender", "birthdate",
    "favorite", "rating100", "sceneCount", "imageCount", "galleryCount", "groupCount",
    "details", "aliasList", "country", "ethnicity", "hairColor", "eyeColor",
    "heightCm", "weightKg", "measurements", "fakeTits", "tattoos", "piercings",
    "careerLength", "deathDate", "url", "imagePath", "stashCreatedAt", "stashUpdatedAt",
    "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "stashIds", "name", "disambiguation", "gender", "birthdate",
    "favorite", "rating100", "sceneCount", "imageCount", "galleryCount", "groupCount",
    "details", "aliasList", "country", "ethnicity", "hairColor", "eyeColor",
    "heightCm", "weightKg", "measurements", "fakeTits", "tattoos", "piercings",
    "careerLength", "deathDate", "url", "imagePath", "stashCreatedAt", "stashUpdatedAt",
    "syncedAt", "deletedAt"
FROM "StashPerformer";
DROP TABLE "StashPerformer";
ALTER TABLE "StashPerformer_new" RENAME TO "StashPerformer";

-- Recreate StashPerformer indexes
CREATE INDEX "StashPerformer_name_idx" ON "StashPerformer"("name");
CREATE INDEX "StashPerformer_gender_idx" ON "StashPerformer"("gender");
CREATE INDEX "StashPerformer_favorite_idx" ON "StashPerformer"("favorite");
CREATE INDEX "StashPerformer_rating100_idx" ON "StashPerformer"("rating100");
CREATE INDEX "StashPerformer_stashUpdatedAt_idx" ON "StashPerformer"("stashUpdatedAt");
CREATE INDEX "StashPerformer_deletedAt_idx" ON "StashPerformer"("deletedAt");
CREATE INDEX "StashPerformer_stashInstanceId_idx" ON "StashPerformer"("stashInstanceId");

-- ============================================================================
-- STEP 5: Recreate StashStudio with composite primary key
-- ============================================================================

-- Backfill NULL boolean/integer fields to defaults before copying
UPDATE "StashStudio" SET "favorite" = 0 WHERE "favorite" IS NULL;
UPDATE "StashStudio" SET "sceneCount" = 0 WHERE "sceneCount" IS NULL;
UPDATE "StashStudio" SET "imageCount" = 0 WHERE "imageCount" IS NULL;
UPDATE "StashStudio" SET "galleryCount" = 0 WHERE "galleryCount" IS NULL;
UPDATE "StashStudio" SET "performerCount" = 0 WHERE "performerCount" IS NULL;
UPDATE "StashStudio" SET "groupCount" = 0 WHERE "groupCount" IS NULL;

CREATE TABLE "StashStudio_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "stashIds" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "galleryCount" INTEGER NOT NULL DEFAULT 0,
    "performerCount" INTEGER NOT NULL DEFAULT 0,
    "groupCount" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashStudio_new" (
    "id", "stashInstanceId", "stashIds", "name", "parentId", "favorite", "rating100",
    "sceneCount", "imageCount", "galleryCount", "performerCount", "groupCount",
    "details", "url", "imagePath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "stashIds", "name", "parentId", "favorite", "rating100",
    "sceneCount", "imageCount", "galleryCount", "performerCount", "groupCount",
    "details", "url", "imagePath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
FROM "StashStudio";
DROP TABLE "StashStudio";
ALTER TABLE "StashStudio_new" RENAME TO "StashStudio";

-- Recreate StashStudio indexes
CREATE INDEX "StashStudio_name_idx" ON "StashStudio"("name");
CREATE INDEX "StashStudio_parentId_idx" ON "StashStudio"("parentId");
CREATE INDEX "StashStudio_favorite_idx" ON "StashStudio"("favorite");
CREATE INDEX "StashStudio_rating100_idx" ON "StashStudio"("rating100");
CREATE INDEX "StashStudio_stashUpdatedAt_idx" ON "StashStudio"("stashUpdatedAt");
CREATE INDEX "StashStudio_deletedAt_idx" ON "StashStudio"("deletedAt");
CREATE INDEX "StashStudio_stashInstanceId_idx" ON "StashStudio"("stashInstanceId");

-- ============================================================================
-- STEP 6: Recreate StashTag with composite primary key
-- ============================================================================

-- Backfill NULL boolean/integer fields to defaults before copying
UPDATE "StashTag" SET "favorite" = 0 WHERE "favorite" IS NULL;
UPDATE "StashTag" SET "sceneCount" = 0 WHERE "sceneCount" IS NULL;
UPDATE "StashTag" SET "imageCount" = 0 WHERE "imageCount" IS NULL;
UPDATE "StashTag" SET "galleryCount" = 0 WHERE "galleryCount" IS NULL;
UPDATE "StashTag" SET "performerCount" = 0 WHERE "performerCount" IS NULL;
UPDATE "StashTag" SET "studioCount" = 0 WHERE "studioCount" IS NULL;
UPDATE "StashTag" SET "groupCount" = 0 WHERE "groupCount" IS NULL;
UPDATE "StashTag" SET "sceneMarkerCount" = 0 WHERE "sceneMarkerCount" IS NULL;
UPDATE "StashTag" SET "sceneCountViaPerformers" = 0 WHERE "sceneCountViaPerformers" IS NULL;

CREATE TABLE "StashTag_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "stashIds" TEXT,
    "name" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "galleryCount" INTEGER NOT NULL DEFAULT 0,
    "performerCount" INTEGER NOT NULL DEFAULT 0,
    "studioCount" INTEGER NOT NULL DEFAULT 0,
    "groupCount" INTEGER NOT NULL DEFAULT 0,
    "sceneMarkerCount" INTEGER NOT NULL DEFAULT 0,
    "sceneCountViaPerformers" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "aliases" TEXT,
    "parentIds" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashTag_new" (
    "id", "stashInstanceId", "stashIds", "name", "favorite", "color",
    "sceneCount", "imageCount", "galleryCount", "performerCount", "studioCount",
    "groupCount", "sceneMarkerCount", "sceneCountViaPerformers",
    "description", "aliases", "parentIds", "imagePath",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "stashIds", "name", "favorite", "color",
    "sceneCount", "imageCount", "galleryCount", "performerCount", "studioCount",
    "groupCount", "sceneMarkerCount", "sceneCountViaPerformers",
    "description", "aliases", "parentIds", "imagePath",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
FROM "StashTag";
DROP TABLE "StashTag";
ALTER TABLE "StashTag_new" RENAME TO "StashTag";

-- Recreate StashTag indexes
CREATE INDEX "StashTag_name_idx" ON "StashTag"("name");
CREATE INDEX "StashTag_favorite_idx" ON "StashTag"("favorite");
CREATE INDEX "StashTag_stashUpdatedAt_idx" ON "StashTag"("stashUpdatedAt");
CREATE INDEX "StashTag_deletedAt_idx" ON "StashTag"("deletedAt");
CREATE INDEX "StashTag_stashInstanceId_idx" ON "StashTag"("stashInstanceId");

-- ============================================================================
-- STEP 7: Recreate StashGroup with composite primary key
-- ============================================================================

-- Backfill NULL integer fields to defaults before copying
UPDATE "StashGroup" SET "sceneCount" = 0 WHERE "sceneCount" IS NULL;
UPDATE "StashGroup" SET "performerCount" = 0 WHERE "performerCount" IS NULL;

CREATE TABLE "StashGroup_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "performerCount" INTEGER NOT NULL DEFAULT 0,
    "director" TEXT,
    "synopsis" TEXT,
    "urls" TEXT,
    "frontImagePath" TEXT,
    "backImagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashGroup_new" (
    "id", "stashInstanceId", "name", "date", "studioId", "rating100", "duration",
    "sceneCount", "performerCount", "director", "synopsis", "urls",
    "frontImagePath", "backImagePath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "name", "date", "studioId", "rating100", "duration",
    "sceneCount", "performerCount", "director", "synopsis", "urls",
    "frontImagePath", "backImagePath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
FROM "StashGroup";
DROP TABLE "StashGroup";
ALTER TABLE "StashGroup_new" RENAME TO "StashGroup";

-- Recreate StashGroup indexes
CREATE INDEX "StashGroup_name_idx" ON "StashGroup"("name");
CREATE INDEX "StashGroup_date_idx" ON "StashGroup"("date");
CREATE INDEX "StashGroup_studioId_idx" ON "StashGroup"("studioId");
CREATE INDEX "StashGroup_rating100_idx" ON "StashGroup"("rating100");
CREATE INDEX "StashGroup_stashUpdatedAt_idx" ON "StashGroup"("stashUpdatedAt");
CREATE INDEX "StashGroup_deletedAt_idx" ON "StashGroup"("deletedAt");
CREATE INDEX "StashGroup_stashInstanceId_idx" ON "StashGroup"("stashInstanceId");

-- ============================================================================
-- STEP 8: Recreate StashGallery with composite primary key
-- ============================================================================

-- Backfill NULL integer fields to defaults before copying
UPDATE "StashGallery" SET "imageCount" = 0 WHERE "imageCount" IS NULL;

CREATE TABLE "StashGallery_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "coverImageId" TEXT,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "url" TEXT,
    "code" TEXT,
    "photographer" TEXT,
    "urls" TEXT,
    "folderPath" TEXT,
    "fileBasename" TEXT,
    "coverPath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashGallery_new" (
    "id", "stashInstanceId", "title", "date", "studioId", "rating100", "coverImageId",
    "imageCount", "details", "url", "code", "photographer", "urls",
    "folderPath", "fileBasename", "coverPath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "title", "date", "studioId", "rating100", "coverImageId",
    "imageCount", "details", "url", "code", "photographer", "urls",
    "folderPath", "fileBasename", "coverPath", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
FROM "StashGallery";
DROP TABLE "StashGallery";
ALTER TABLE "StashGallery_new" RENAME TO "StashGallery";

-- Recreate StashGallery indexes
CREATE INDEX "StashGallery_title_idx" ON "StashGallery"("title");
CREATE INDEX "StashGallery_date_idx" ON "StashGallery"("date");
CREATE INDEX "StashGallery_studioId_idx" ON "StashGallery"("studioId");
CREATE INDEX "StashGallery_rating100_idx" ON "StashGallery"("rating100");
CREATE INDEX "StashGallery_stashUpdatedAt_idx" ON "StashGallery"("stashUpdatedAt");
CREATE INDEX "StashGallery_deletedAt_idx" ON "StashGallery"("deletedAt");
CREATE INDEX "StashGallery_coverImageId_idx" ON "StashGallery"("coverImageId");
CREATE INDEX "StashGallery_studioId_deletedAt_idx" ON "StashGallery"("studioId", "deletedAt");
CREATE INDEX "StashGallery_stashInstanceId_idx" ON "StashGallery"("stashInstanceId");

-- ============================================================================
-- STEP 9: Recreate StashImage with composite primary key
-- ============================================================================

-- Backfill NULL boolean/integer fields to defaults before copying
UPDATE "StashImage" SET "oCounter" = 0 WHERE "oCounter" IS NULL;
UPDATE "StashImage" SET "organized" = 0 WHERE "organized" IS NULL;

CREATE TABLE "StashImage_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "code" TEXT,
    "details" TEXT,
    "photographer" TEXT,
    "urls" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" BIGINT,
    "pathThumbnail" TEXT,
    "pathPreview" TEXT,
    "pathImage" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

INSERT INTO "StashImage_new" (
    "id", "stashInstanceId", "title", "code", "details", "photographer", "urls",
    "date", "studioId", "rating100", "oCounter", "organized", "filePath",
    "width", "height", "fileSize", "pathThumbnail", "pathPreview", "pathImage",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    "id", "stashInstanceId", "title", "code", "details", "photographer", "urls",
    "date", "studioId", "rating100", "oCounter", "organized", "filePath",
    "width", "height", "fileSize", "pathThumbnail", "pathPreview", "pathImage",
    "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
FROM "StashImage";
DROP TABLE "StashImage";
ALTER TABLE "StashImage_new" RENAME TO "StashImage";

-- Recreate StashImage indexes
CREATE INDEX "StashImage_studioId_idx" ON "StashImage"("studioId");
CREATE INDEX "StashImage_date_idx" ON "StashImage"("date");
CREATE INDEX "StashImage_rating100_idx" ON "StashImage"("rating100");
CREATE INDEX "StashImage_stashUpdatedAt_idx" ON "StashImage"("stashUpdatedAt");
CREATE INDEX "StashImage_deletedAt_idx" ON "StashImage"("deletedAt");
CREATE INDEX "StashImage_title_idx" ON "StashImage"("title");
CREATE INDEX "StashImage_browse_idx" ON "StashImage"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashImage_stashInstanceId_idx" ON "StashImage"("stashInstanceId");

-- ============================================================================
-- STEP 10: Recreate StashClip with composite primary key
-- ============================================================================

-- Backfill NULL boolean fields to defaults before copying
UPDATE "StashClip" SET "isGenerated" = 0 WHERE "isGenerated" IS NULL;

CREATE TABLE "StashClip_new" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL DEFAULT 'default',
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "seconds" REAL NOT NULL,
    "endSeconds" REAL,
    "primaryTagId" TEXT,
    "primaryTagInstanceId" TEXT,
    "previewPath" TEXT,
    "screenshotPath" TEXT,
    "streamPath" TEXT,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generationCheckedAt" DATETIME,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    PRIMARY KEY ("id", "stashInstanceId")
);

-- Insert with composite FK lookups
INSERT INTO "StashClip_new" (
    "id", "stashInstanceId", "sceneId", "sceneInstanceId", "title", "seconds", "endSeconds",
    "primaryTagId", "primaryTagInstanceId", "previewPath", "screenshotPath", "streamPath",
    "isGenerated", "generationCheckedAt", "stashCreatedAt", "stashUpdatedAt", "syncedAt", "deletedAt"
)
SELECT
    c."id", c."stashInstanceId", c."sceneId",
    COALESCE((SELECT s."stashInstanceId" FROM "StashScene" s WHERE s."id" = c."sceneId"), 'default'),
    c."title", c."seconds", c."endSeconds",
    c."primaryTagId",
    CASE WHEN c."primaryTagId" IS NOT NULL
        THEN COALESCE((SELECT t."stashInstanceId" FROM "StashTag" t WHERE t."id" = c."primaryTagId"), 'default')
        ELSE NULL
    END,
    c."previewPath", c."screenshotPath", c."streamPath",
    c."isGenerated", c."generationCheckedAt", c."stashCreatedAt", c."stashUpdatedAt", c."syncedAt", c."deletedAt"
FROM "StashClip" c;

DROP TABLE "StashClip";
ALTER TABLE "StashClip_new" RENAME TO "StashClip";

-- Recreate StashClip indexes
CREATE INDEX "StashClip_sceneId_idx" ON "StashClip"("sceneId");
CREATE INDEX "StashClip_primaryTagId_idx" ON "StashClip"("primaryTagId");
CREATE INDEX "StashClip_isGenerated_deletedAt_idx" ON "StashClip"("isGenerated", "deletedAt");
CREATE INDEX "StashClip_deletedAt_stashCreatedAt_idx" ON "StashClip"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashClip_stashInstanceId_idx" ON "StashClip"("stashInstanceId");

-- ============================================================================
-- STEP 11: Recreate ScenePerformer with composite foreign keys
-- ============================================================================

CREATE TABLE "ScenePerformer_new" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL DEFAULT 'default',
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("sceneId", "sceneInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "ScenePerformer_scene_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenePerformer_performer_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ScenePerformer_new" ("sceneId", "sceneInstanceId", "performerId", "performerInstanceId")
SELECT "sceneId", COALESCE("sceneInstanceId", 'default'), "performerId", COALESCE("performerInstanceId", 'default')
FROM "ScenePerformer";

DROP TABLE "ScenePerformer";
ALTER TABLE "ScenePerformer_new" RENAME TO "ScenePerformer";

CREATE INDEX "ScenePerformer_performerId_idx" ON "ScenePerformer"("performerId", "performerInstanceId");
CREATE INDEX "ScenePerformer_sceneId_idx" ON "ScenePerformer"("sceneId", "sceneInstanceId");

-- ============================================================================
-- STEP 12: Recreate SceneTag with composite foreign keys
-- ============================================================================

CREATE TABLE "SceneTag_new" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "SceneTag_scene_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "SceneTag_new" ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId")
SELECT "sceneId", COALESCE("sceneInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "SceneTag";

DROP TABLE "SceneTag";
ALTER TABLE "SceneTag_new" RENAME TO "SceneTag";

CREATE INDEX "SceneTag_tagId_idx" ON "SceneTag"("tagId", "tagInstanceId");
CREATE INDEX "SceneTag_sceneId_idx" ON "SceneTag"("sceneId", "sceneInstanceId");

-- ============================================================================
-- STEP 13: Recreate SceneGroup with composite foreign keys
-- ============================================================================

CREATE TABLE "SceneGroup_new" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL DEFAULT 'default',
    "groupId" TEXT NOT NULL,
    "groupInstanceId" TEXT NOT NULL DEFAULT 'default',
    "sceneIndex" INTEGER,
    PRIMARY KEY ("sceneId", "sceneInstanceId", "groupId", "groupInstanceId"),
    CONSTRAINT "SceneGroup_scene_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGroup_group_fkey" FOREIGN KEY ("groupId", "groupInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "SceneGroup_new" ("sceneId", "sceneInstanceId", "groupId", "groupInstanceId", "sceneIndex")
SELECT "sceneId", COALESCE("sceneInstanceId", 'default'), "groupId", COALESCE("groupInstanceId", 'default'), "sceneIndex"
FROM "SceneGroup";

DROP TABLE "SceneGroup";
ALTER TABLE "SceneGroup_new" RENAME TO "SceneGroup";

CREATE INDEX "SceneGroup_groupId_idx" ON "SceneGroup"("groupId", "groupInstanceId");
CREATE INDEX "SceneGroup_sceneId_idx" ON "SceneGroup"("sceneId", "sceneInstanceId");

-- ============================================================================
-- STEP 14: Recreate SceneGallery with composite foreign keys
-- ============================================================================

CREATE TABLE "SceneGallery_new" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL DEFAULT 'default',
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("sceneId", "sceneInstanceId", "galleryId", "galleryInstanceId"),
    CONSTRAINT "SceneGallery_scene_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGallery_gallery_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "SceneGallery_new" ("sceneId", "sceneInstanceId", "galleryId", "galleryInstanceId")
SELECT "sceneId", COALESCE("sceneInstanceId", 'default'), "galleryId", COALESCE("galleryInstanceId", 'default')
FROM "SceneGallery";

DROP TABLE "SceneGallery";
ALTER TABLE "SceneGallery_new" RENAME TO "SceneGallery";

CREATE INDEX "SceneGallery_galleryId_idx" ON "SceneGallery"("galleryId", "galleryInstanceId");
CREATE INDEX "SceneGallery_sceneId_idx" ON "SceneGallery"("sceneId", "sceneInstanceId");

-- ============================================================================
-- STEP 15: Recreate ImagePerformer with composite foreign keys
-- ============================================================================

CREATE TABLE "ImagePerformer_new" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL DEFAULT 'default',
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("imageId", "imageInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "ImagePerformer_image_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImagePerformer_performer_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ImagePerformer_new" ("imageId", "imageInstanceId", "performerId", "performerInstanceId")
SELECT "imageId", COALESCE("imageInstanceId", 'default'), "performerId", COALESCE("performerInstanceId", 'default')
FROM "ImagePerformer";

DROP TABLE "ImagePerformer";
ALTER TABLE "ImagePerformer_new" RENAME TO "ImagePerformer";

CREATE INDEX "ImagePerformer_performerId_idx" ON "ImagePerformer"("performerId", "performerInstanceId");
CREATE INDEX "ImagePerformer_imageId_idx" ON "ImagePerformer"("imageId", "imageInstanceId");

-- ============================================================================
-- STEP 16: Recreate ImageTag with composite foreign keys
-- ============================================================================

CREATE TABLE "ImageTag_new" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("imageId", "imageInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "ImageTag_image_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ImageTag_new" ("imageId", "imageInstanceId", "tagId", "tagInstanceId")
SELECT "imageId", COALESCE("imageInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "ImageTag";

DROP TABLE "ImageTag";
ALTER TABLE "ImageTag_new" RENAME TO "ImageTag";

CREATE INDEX "ImageTag_tagId_idx" ON "ImageTag"("tagId", "tagInstanceId");
CREATE INDEX "ImageTag_imageId_idx" ON "ImageTag"("imageId", "imageInstanceId");

-- ============================================================================
-- STEP 17: Recreate ImageGallery with composite foreign keys
-- ============================================================================

CREATE TABLE "ImageGallery_new" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL DEFAULT 'default',
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("imageId", "imageInstanceId", "galleryId", "galleryInstanceId"),
    CONSTRAINT "ImageGallery_image_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageGallery_gallery_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ImageGallery_new" ("imageId", "imageInstanceId", "galleryId", "galleryInstanceId")
SELECT "imageId", COALESCE("imageInstanceId", 'default'), "galleryId", COALESCE("galleryInstanceId", 'default')
FROM "ImageGallery";

DROP TABLE "ImageGallery";
ALTER TABLE "ImageGallery_new" RENAME TO "ImageGallery";

CREATE INDEX "ImageGallery_galleryId_idx" ON "ImageGallery"("galleryId", "galleryInstanceId");
CREATE INDEX "ImageGallery_imageId_idx" ON "ImageGallery"("imageId", "imageInstanceId");

-- ============================================================================
-- STEP 18: Recreate GalleryPerformer with composite foreign keys
-- ============================================================================

CREATE TABLE "GalleryPerformer_new" (
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL DEFAULT 'default',
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("galleryId", "galleryInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "GalleryPerformer_gallery_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryPerformer_performer_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "GalleryPerformer_new" ("galleryId", "galleryInstanceId", "performerId", "performerInstanceId")
SELECT "galleryId", COALESCE("galleryInstanceId", 'default'), "performerId", COALESCE("performerInstanceId", 'default')
FROM "GalleryPerformer";

DROP TABLE "GalleryPerformer";
ALTER TABLE "GalleryPerformer_new" RENAME TO "GalleryPerformer";

CREATE INDEX "GalleryPerformer_performerId_idx" ON "GalleryPerformer"("performerId", "performerInstanceId");
CREATE INDEX "GalleryPerformer_galleryId_idx" ON "GalleryPerformer"("galleryId", "galleryInstanceId");

-- ============================================================================
-- STEP 19: Recreate GalleryTag with composite foreign keys
-- ============================================================================

CREATE TABLE "GalleryTag_new" (
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("galleryId", "galleryInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "GalleryTag_gallery_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "GalleryTag_new" ("galleryId", "galleryInstanceId", "tagId", "tagInstanceId")
SELECT "galleryId", COALESCE("galleryInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "GalleryTag";

DROP TABLE "GalleryTag";
ALTER TABLE "GalleryTag_new" RENAME TO "GalleryTag";

CREATE INDEX "GalleryTag_tagId_idx" ON "GalleryTag"("tagId", "tagInstanceId");
CREATE INDEX "GalleryTag_galleryId_idx" ON "GalleryTag"("galleryId", "galleryInstanceId");

-- ============================================================================
-- STEP 20: Recreate PerformerTag with composite foreign keys
-- ============================================================================

CREATE TABLE "PerformerTag_new" (
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("performerId", "performerInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "PerformerTag_performer_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformerTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "PerformerTag_new" ("performerId", "performerInstanceId", "tagId", "tagInstanceId")
SELECT "performerId", COALESCE("performerInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "PerformerTag";

DROP TABLE "PerformerTag";
ALTER TABLE "PerformerTag_new" RENAME TO "PerformerTag";

CREATE INDEX "PerformerTag_tagId_idx" ON "PerformerTag"("tagId", "tagInstanceId");
CREATE INDEX "PerformerTag_performerId_idx" ON "PerformerTag"("performerId", "performerInstanceId");

-- ============================================================================
-- STEP 21: Recreate StudioTag with composite foreign keys
-- ============================================================================

CREATE TABLE "StudioTag_new" (
    "studioId" TEXT NOT NULL,
    "studioInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("studioId", "studioInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "StudioTag_studio_fkey" FOREIGN KEY ("studioId", "studioInstanceId") REFERENCES "StashStudio" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "StudioTag_new" ("studioId", "studioInstanceId", "tagId", "tagInstanceId")
SELECT "studioId", COALESCE("studioInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "StudioTag";

DROP TABLE "StudioTag";
ALTER TABLE "StudioTag_new" RENAME TO "StudioTag";

CREATE INDEX "StudioTag_tagId_idx" ON "StudioTag"("tagId", "tagInstanceId");
CREATE INDEX "StudioTag_studioId_idx" ON "StudioTag"("studioId", "studioInstanceId");

-- ============================================================================
-- STEP 22: Recreate GroupTag with composite foreign keys
-- ============================================================================

CREATE TABLE "GroupTag_new" (
    "groupId" TEXT NOT NULL,
    "groupInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("groupId", "groupInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "GroupTag_group_fkey" FOREIGN KEY ("groupId", "groupInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "GroupTag_new" ("groupId", "groupInstanceId", "tagId", "tagInstanceId")
SELECT "groupId", COALESCE("groupInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "GroupTag";

DROP TABLE "GroupTag";
ALTER TABLE "GroupTag_new" RENAME TO "GroupTag";

CREATE INDEX "GroupTag_tagId_idx" ON "GroupTag"("tagId", "tagInstanceId");
CREATE INDEX "GroupTag_groupId_idx" ON "GroupTag"("groupId", "groupInstanceId");

-- ============================================================================
-- STEP 23: Recreate ClipTag with composite foreign keys
-- ============================================================================

CREATE TABLE "ClipTag_new" (
    "clipId" TEXT NOT NULL,
    "clipInstanceId" TEXT NOT NULL DEFAULT 'default',
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL DEFAULT 'default',
    PRIMARY KEY ("clipId", "clipInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "ClipTag_clip_fkey" FOREIGN KEY ("clipId", "clipInstanceId") REFERENCES "StashClip" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClipTag_tag_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ClipTag_new" ("clipId", "clipInstanceId", "tagId", "tagInstanceId")
SELECT "clipId", COALESCE("clipInstanceId", 'default'), "tagId", COALESCE("tagInstanceId", 'default')
FROM "ClipTag";

DROP TABLE "ClipTag";
ALTER TABLE "ClipTag_new" RENAME TO "ClipTag";

CREATE INDEX "ClipTag_tagId_idx" ON "ClipTag"("tagId", "tagInstanceId");
CREATE INDEX "ClipTag_clipId_idx" ON "ClipTag"("clipId", "clipInstanceId");

-- ============================================================================
-- STEP 24: Re-enable foreign keys
-- ============================================================================

PRAGMA foreign_keys=ON;
