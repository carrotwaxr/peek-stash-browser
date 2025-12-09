-- Remove FK constraints from cache junction tables
-- These tables store cached data from Stash where:
-- 1. Data is already consistent in the source system
-- 2. Sync order can cause temporary FK violations (scene refs performer not yet synced)
-- 3. INSERT OR IGNORE should skip invalid refs, but SQLite doesn't ignore FK violations
--
-- Also fix fileSize columns: change from INTEGER to BIGINT for files > 2GB

-- Disable FK enforcement during migration
PRAGMA foreign_keys = OFF;

-- ============================================================================
-- Recreate ScenePerformer without FK constraints
-- ============================================================================
CREATE TABLE "ScenePerformer_new" (
    "sceneId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    PRIMARY KEY ("sceneId", "performerId")
);

INSERT INTO "ScenePerformer_new" SELECT * FROM "ScenePerformer";
DROP TABLE "ScenePerformer";
ALTER TABLE "ScenePerformer_new" RENAME TO "ScenePerformer";
CREATE INDEX "ScenePerformer_performerId_idx" ON "ScenePerformer"("performerId");

-- ============================================================================
-- Recreate SceneTag without FK constraints
-- ============================================================================
CREATE TABLE "SceneTag_new" (
    "sceneId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("sceneId", "tagId")
);

INSERT INTO "SceneTag_new" SELECT * FROM "SceneTag";
DROP TABLE "SceneTag";
ALTER TABLE "SceneTag_new" RENAME TO "SceneTag";
CREATE INDEX "SceneTag_tagId_idx" ON "SceneTag"("tagId");

-- ============================================================================
-- Recreate SceneGroup without FK constraints
-- ============================================================================
CREATE TABLE "SceneGroup_new" (
    "sceneId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sceneIndex" INTEGER,
    PRIMARY KEY ("sceneId", "groupId")
);

INSERT INTO "SceneGroup_new" SELECT * FROM "SceneGroup";
DROP TABLE "SceneGroup";
ALTER TABLE "SceneGroup_new" RENAME TO "SceneGroup";
CREATE INDEX "SceneGroup_groupId_idx" ON "SceneGroup"("groupId");

-- ============================================================================
-- Recreate SceneGallery without FK constraints
-- ============================================================================
CREATE TABLE "SceneGallery_new" (
    "sceneId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    PRIMARY KEY ("sceneId", "galleryId")
);

INSERT INTO "SceneGallery_new" SELECT * FROM "SceneGallery";
DROP TABLE "SceneGallery";
ALTER TABLE "SceneGallery_new" RENAME TO "SceneGallery";
CREATE INDEX "SceneGallery_galleryId_idx" ON "SceneGallery"("galleryId");

-- ============================================================================
-- Recreate ImagePerformer without FK constraints
-- ============================================================================
CREATE TABLE "ImagePerformer_new" (
    "imageId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    PRIMARY KEY ("imageId", "performerId")
);

INSERT INTO "ImagePerformer_new" SELECT * FROM "ImagePerformer";
DROP TABLE "ImagePerformer";
ALTER TABLE "ImagePerformer_new" RENAME TO "ImagePerformer";
CREATE INDEX "ImagePerformer_performerId_idx" ON "ImagePerformer"("performerId");

-- ============================================================================
-- Recreate ImageTag without FK constraints
-- ============================================================================
CREATE TABLE "ImageTag_new" (
    "imageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("imageId", "tagId")
);

INSERT INTO "ImageTag_new" SELECT * FROM "ImageTag";
DROP TABLE "ImageTag";
ALTER TABLE "ImageTag_new" RENAME TO "ImageTag";
CREATE INDEX "ImageTag_tagId_idx" ON "ImageTag"("tagId");

-- ============================================================================
-- Recreate ImageGallery without FK constraints
-- ============================================================================
CREATE TABLE "ImageGallery_new" (
    "imageId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    PRIMARY KEY ("imageId", "galleryId")
);

INSERT INTO "ImageGallery_new" SELECT * FROM "ImageGallery";
DROP TABLE "ImageGallery";
ALTER TABLE "ImageGallery_new" RENAME TO "ImageGallery";
CREATE INDEX "ImageGallery_galleryId_idx" ON "ImageGallery"("galleryId");

-- ============================================================================
-- Fix fileSize columns: SQLite doesn't have true BIGINT, but we need to ensure
-- the column affinity allows large values. Recreate CachedScene and CachedImage
-- with BIGINT fileSize columns.
-- ============================================================================

-- Recreate CachedScene with BIGINT fileSize
CREATE TABLE "CachedScene_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "code" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
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
    "data" TEXT NOT NULL DEFAULT '{}',
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- Use COALESCE to handle NULL values when copying data
INSERT INTO "CachedScene_new" (
    id, stashInstanceId, title, code, date, studioId, rating100, duration,
    organized, details, filePath, fileBitRate, fileFrameRate, fileWidth,
    fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
    pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption,
    streams, oCounter, playCount, playDuration, data, stashCreatedAt, stashUpdatedAt,
    syncedAt, deletedAt
)
SELECT
    id, stashInstanceId, title, code, date, studioId, rating100, duration,
    COALESCE(organized, 0), details, filePath, fileBitRate, fileFrameRate, fileWidth,
    fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
    pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption,
    streams, COALESCE(oCounter, 0), COALESCE(playCount, 0), COALESCE(playDuration, 0),
    COALESCE(data, '{}'), stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
FROM "CachedScene";

DROP TABLE "CachedScene";
ALTER TABLE "CachedScene_new" RENAME TO "CachedScene";

-- Recreate indexes for CachedScene
CREATE INDEX "CachedScene_studioId_idx" ON "CachedScene"("studioId");
CREATE INDEX "CachedScene_date_idx" ON "CachedScene"("date");
CREATE INDEX "CachedScene_stashCreatedAt_idx" ON "CachedScene"("stashCreatedAt");
CREATE INDEX "CachedScene_stashUpdatedAt_idx" ON "CachedScene"("stashUpdatedAt");
CREATE INDEX "CachedScene_rating100_idx" ON "CachedScene"("rating100");
CREATE INDEX "CachedScene_duration_idx" ON "CachedScene"("duration");
CREATE INDEX "CachedScene_deletedAt_idx" ON "CachedScene"("deletedAt");
CREATE INDEX "CachedScene_oCounter_idx" ON "CachedScene"("oCounter");
CREATE INDEX "CachedScene_playCount_idx" ON "CachedScene"("playCount");

-- Recreate CachedImage with BIGINT fileSize
CREATE TABLE "CachedImage_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
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
    "data" TEXT NOT NULL DEFAULT '{}',
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- Use COALESCE to handle NULL values when copying data
INSERT INTO "CachedImage_new" (
    id, stashInstanceId, title, date, studioId, rating100, oCounter, organized,
    filePath, width, height, fileSize, pathThumbnail, pathPreview, pathImage,
    data, stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
)
SELECT
    id, stashInstanceId, title, date, studioId, rating100, COALESCE(oCounter, 0),
    COALESCE(organized, 0), filePath, width, height, fileSize, pathThumbnail,
    pathPreview, pathImage, COALESCE(data, '{}'), stashCreatedAt, stashUpdatedAt,
    syncedAt, deletedAt
FROM "CachedImage";

DROP TABLE "CachedImage";
ALTER TABLE "CachedImage_new" RENAME TO "CachedImage";

-- Recreate indexes for CachedImage
CREATE INDEX "CachedImage_studioId_idx" ON "CachedImage"("studioId");
CREATE INDEX "CachedImage_date_idx" ON "CachedImage"("date");
CREATE INDEX "CachedImage_rating100_idx" ON "CachedImage"("rating100");
CREATE INDEX "CachedImage_stashUpdatedAt_idx" ON "CachedImage"("stashUpdatedAt");
CREATE INDEX "CachedImage_deletedAt_idx" ON "CachedImage"("deletedAt");

-- Re-enable FK enforcement
PRAGMA foreign_keys = ON;
