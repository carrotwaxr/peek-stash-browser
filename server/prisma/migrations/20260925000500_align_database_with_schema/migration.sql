-- Aligns the database with schema.prisma (item 70, DB-05), so that
-- `npm run db:drift` prints an empty migration and CI can hold every later
-- migration to the schema. SQLite cannot change a column's default or type
-- or add a foreign key in place, so each of the 26 tables below is rebuilt:
-- create "new_X", copy the rows, drop "X", rename. One transaction (A4's
-- form) keeps the whole change atomic; a failure rolls back everything and
-- the next start retries.
--
-- What changes:
-- - The 37 `DEFAULT 'default'` instance columns lose their default: an INSERT
--   that forgets an instance now fails instead of landing on 'default'.
-- - Four foreign keys the schema declares and the database lacked are added:
--   StashGallery and StashImage to StashStudio, StashClip to StashScene and
--   to its primary StashTag. The copies below null a studio or primary tag
--   whose row is missing and leave out a clip whose scene is missing.
-- - Junction rows are copied only when both parents exist; rows of the four
--   per-user tables only when their User exists (a deleted user's data goes).
-- - User's tableColumnDefaults, cardDisplaySettings and landingPagePreference
--   and ImageViewHistory's viewHistory and oHistory become JSONB, as the
--   schema says. The values stay the text they were: JSON objects and arrays
--   never take numeric affinity.
-- - The three userId foreign keys of UserEntityStats, UserExcludedEntity and
--   UserHiddenEntity gain ON UPDATE CASCADE; UserEntityStats.updatedAt loses
--   its default (only Prisma writes it).
-- - Every index is recreated under Prisma's name. The 10 undeclared duplicate
--   junction indexes (<T>_<side>_idx) are not recreated; their twins remain.
--   The 8 <T>_stashInstanceId_idx and StashGallery_studioId_deletedAt_idx are
--   kept and now declared in the schema.
--
-- The autoincrement counters are saved first and restored after the renames:
-- a rebuilt table's counter would otherwise fall back to its highest surviving
-- id, and a deleted user's id could be reused while their session or signed
-- link is still valid.
--
-- Prisma's generated script quoted no JSON default (`DEFAULT []` parses as an
-- empty identifier) and turned foreign keys back on midway; both are fixed
-- here. Entity tables come first, then junctions, then the per-user tables.
-- The foreign-key guard at the end aborts the migration, which then rolls
-- back whole, if any rebuilt table still references a missing parent.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TEMP TABLE "_seq" AS SELECT "name", "seq" FROM sqlite_sequence;

-- StashScene
CREATE TABLE "new_StashScene" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
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
    "captions" TEXT,
    "streamDirect" BOOLEAN,
    "streamMkv" BOOLEAN,
    "streamResolutions" TEXT,
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
INSERT INTO "new_StashScene" ("captions", "code", "date", "deletedAt", "details", "director", "duration", "fileAudioCodec", "fileBitRate", "fileFrameRate", "fileHeight", "filePath", "fileSize", "fileVideoCodec", "fileWidth", "id", "inheritedTagIds", "oCounter", "organized", "pathCaption", "pathChaptersVtt", "pathPreview", "pathScreenshot", "pathSprite", "pathStream", "pathVtt", "phash", "phashes", "playCount", "playDuration", "rating100", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "streamDirect", "streamMkv", "streamResolutions", "studioId", "syncedAt", "title", "urls")
SELECT "captions", "code", "date", "deletedAt", "details", "director", "duration", "fileAudioCodec", "fileBitRate", "fileFrameRate", "fileHeight", "filePath", "fileSize", "fileVideoCodec", "fileWidth", "id", "inheritedTagIds", "oCounter", "organized", "pathCaption", "pathChaptersVtt", "pathPreview", "pathScreenshot", "pathSprite", "pathStream", "pathVtt", "phash", "phashes", "playCount", "playDuration", "rating100", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "streamDirect", "streamMkv", "streamResolutions", "studioId", "syncedAt", "title", "urls"
FROM "StashScene";
DROP TABLE "StashScene";
ALTER TABLE "new_StashScene" RENAME TO "StashScene";
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

-- StashPerformer
CREATE TABLE "new_StashPerformer" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
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
INSERT INTO "new_StashPerformer" ("aliasList", "birthdate", "careerLength", "country", "deathDate", "deletedAt", "details", "disambiguation", "ethnicity", "eyeColor", "fakeTits", "favorite", "galleryCount", "gender", "groupCount", "hairColor", "heightCm", "id", "imageCount", "imagePath", "measurements", "name", "piercings", "rating100", "sceneCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "syncedAt", "tattoos", "url", "weightKg")
SELECT "aliasList", "birthdate", "careerLength", "country", "deathDate", "deletedAt", "details", "disambiguation", "ethnicity", "eyeColor", "fakeTits", "favorite", "galleryCount", "gender", "groupCount", "hairColor", "heightCm", "id", "imageCount", "imagePath", "measurements", "name", "piercings", "rating100", "sceneCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "syncedAt", "tattoos", "url", "weightKg"
FROM "StashPerformer";
DROP TABLE "StashPerformer";
ALTER TABLE "new_StashPerformer" RENAME TO "StashPerformer";
CREATE INDEX "StashPerformer_name_idx" ON "StashPerformer"("name");
CREATE INDEX "StashPerformer_gender_idx" ON "StashPerformer"("gender");
CREATE INDEX "StashPerformer_favorite_idx" ON "StashPerformer"("favorite");
CREATE INDEX "StashPerformer_rating100_idx" ON "StashPerformer"("rating100");
CREATE INDEX "StashPerformer_stashUpdatedAt_idx" ON "StashPerformer"("stashUpdatedAt");
CREATE INDEX "StashPerformer_deletedAt_idx" ON "StashPerformer"("deletedAt");
CREATE INDEX "StashPerformer_stashInstanceId_idx" ON "StashPerformer"("stashInstanceId");

-- StashStudio
CREATE TABLE "new_StashStudio" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
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
INSERT INTO "new_StashStudio" ("deletedAt", "details", "favorite", "galleryCount", "groupCount", "id", "imageCount", "imagePath", "name", "parentId", "performerCount", "rating100", "sceneCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "syncedAt", "url")
SELECT "deletedAt", "details", "favorite", "galleryCount", "groupCount", "id", "imageCount", "imagePath", "name", "parentId", "performerCount", "rating100", "sceneCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "syncedAt", "url"
FROM "StashStudio";
DROP TABLE "StashStudio";
ALTER TABLE "new_StashStudio" RENAME TO "StashStudio";
CREATE INDEX "StashStudio_name_idx" ON "StashStudio"("name");
CREATE INDEX "StashStudio_parentId_idx" ON "StashStudio"("parentId");
CREATE INDEX "StashStudio_favorite_idx" ON "StashStudio"("favorite");
CREATE INDEX "StashStudio_rating100_idx" ON "StashStudio"("rating100");
CREATE INDEX "StashStudio_stashUpdatedAt_idx" ON "StashStudio"("stashUpdatedAt");
CREATE INDEX "StashStudio_deletedAt_idx" ON "StashStudio"("deletedAt");
CREATE INDEX "StashStudio_stashInstanceId_idx" ON "StashStudio"("stashInstanceId");

-- StashTag
CREATE TABLE "new_StashTag" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
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
INSERT INTO "new_StashTag" ("aliases", "color", "deletedAt", "description", "favorite", "galleryCount", "groupCount", "id", "imageCount", "imagePath", "name", "parentIds", "performerCount", "sceneCount", "sceneCountViaPerformers", "sceneMarkerCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "studioCount", "syncedAt")
SELECT "aliases", "color", "deletedAt", "description", "favorite", "galleryCount", "groupCount", "id", "imageCount", "imagePath", "name", "parentIds", "performerCount", "sceneCount", "sceneCountViaPerformers", "sceneMarkerCount", "stashCreatedAt", "stashIds", "stashInstanceId", "stashUpdatedAt", "studioCount", "syncedAt"
FROM "StashTag";
DROP TABLE "StashTag";
ALTER TABLE "new_StashTag" RENAME TO "StashTag";
CREATE INDEX "StashTag_name_idx" ON "StashTag"("name");
CREATE INDEX "StashTag_favorite_idx" ON "StashTag"("favorite");
CREATE INDEX "StashTag_stashUpdatedAt_idx" ON "StashTag"("stashUpdatedAt");
CREATE INDEX "StashTag_deletedAt_idx" ON "StashTag"("deletedAt");
CREATE INDEX "StashTag_stashInstanceId_idx" ON "StashTag"("stashInstanceId");

-- StashGroup
CREATE TABLE "new_StashGroup" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
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
INSERT INTO "new_StashGroup" ("backImagePath", "date", "deletedAt", "director", "duration", "frontImagePath", "id", "name", "performerCount", "rating100", "sceneCount", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "studioId", "syncedAt", "synopsis", "urls")
SELECT "backImagePath", "date", "deletedAt", "director", "duration", "frontImagePath", "id", "name", "performerCount", "rating100", "sceneCount", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "studioId", "syncedAt", "synopsis", "urls"
FROM "StashGroup";
DROP TABLE "StashGroup";
ALTER TABLE "new_StashGroup" RENAME TO "StashGroup";
CREATE INDEX "StashGroup_name_idx" ON "StashGroup"("name");
CREATE INDEX "StashGroup_date_idx" ON "StashGroup"("date");
CREATE INDEX "StashGroup_studioId_idx" ON "StashGroup"("studioId");
CREATE INDEX "StashGroup_rating100_idx" ON "StashGroup"("rating100");
CREATE INDEX "StashGroup_stashUpdatedAt_idx" ON "StashGroup"("stashUpdatedAt");
CREATE INDEX "StashGroup_deletedAt_idx" ON "StashGroup"("deletedAt");
CREATE INDEX "StashGroup_stashInstanceId_idx" ON "StashGroup"("stashInstanceId");

-- StashGallery
CREATE TABLE "new_StashGallery" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "studioInstanceId" TEXT,
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

    PRIMARY KEY ("id", "stashInstanceId"),
    CONSTRAINT "StashGallery_studioId_studioInstanceId_fkey" FOREIGN KEY ("studioId", "studioInstanceId") REFERENCES "StashStudio" ("id", "stashInstanceId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StashGallery" ("code", "coverImageId", "coverPath", "date", "deletedAt", "details", "fileBasename", "folderPath", "id", "imageCount", "photographer", "rating100", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "studioId", "studioInstanceId", "syncedAt", "title", "url", "urls")
SELECT "StashGallery"."code", "StashGallery"."coverImageId", "StashGallery"."coverPath", "StashGallery"."date", "StashGallery"."deletedAt", "StashGallery"."details", "StashGallery"."fileBasename", "StashGallery"."folderPath", "StashGallery"."id", "StashGallery"."imageCount", "StashGallery"."photographer", "StashGallery"."rating100", "StashGallery"."stashCreatedAt", "StashGallery"."stashInstanceId", "StashGallery"."stashUpdatedAt", s."id", s."stashInstanceId", "StashGallery"."syncedAt", "StashGallery"."title", "StashGallery"."url", "StashGallery"."urls"
FROM "StashGallery"
LEFT JOIN "StashStudio" s ON s."id" = "StashGallery"."studioId" AND s."stashInstanceId" = "StashGallery"."studioInstanceId";
DROP TABLE "StashGallery";
ALTER TABLE "new_StashGallery" RENAME TO "StashGallery";
CREATE INDEX "StashGallery_title_idx" ON "StashGallery"("title");
CREATE INDEX "StashGallery_date_idx" ON "StashGallery"("date");
CREATE INDEX "StashGallery_studioId_idx" ON "StashGallery"("studioId");
CREATE INDEX "StashGallery_rating100_idx" ON "StashGallery"("rating100");
CREATE INDEX "StashGallery_stashUpdatedAt_idx" ON "StashGallery"("stashUpdatedAt");
CREATE INDEX "StashGallery_deletedAt_idx" ON "StashGallery"("deletedAt");
CREATE INDEX "StashGallery_coverImageId_idx" ON "StashGallery"("coverImageId");
CREATE INDEX "StashGallery_stashInstanceId_idx" ON "StashGallery"("stashInstanceId");
CREATE INDEX "StashGallery_studioId_deletedAt_idx" ON "StashGallery"("studioId", "deletedAt");

-- StashImage
CREATE TABLE "new_StashImage" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
    "title" TEXT,
    "code" TEXT,
    "details" TEXT,
    "photographer" TEXT,
    "urls" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "studioInstanceId" TEXT,
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

    PRIMARY KEY ("id", "stashInstanceId"),
    CONSTRAINT "StashImage_studioId_studioInstanceId_fkey" FOREIGN KEY ("studioId", "studioInstanceId") REFERENCES "StashStudio" ("id", "stashInstanceId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StashImage" ("code", "date", "deletedAt", "details", "filePath", "fileSize", "height", "id", "oCounter", "organized", "pathImage", "pathPreview", "pathThumbnail", "photographer", "rating100", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "studioId", "studioInstanceId", "syncedAt", "title", "urls", "width")
SELECT "StashImage"."code", "StashImage"."date", "StashImage"."deletedAt", "StashImage"."details", "StashImage"."filePath", "StashImage"."fileSize", "StashImage"."height", "StashImage"."id", "StashImage"."oCounter", "StashImage"."organized", "StashImage"."pathImage", "StashImage"."pathPreview", "StashImage"."pathThumbnail", "StashImage"."photographer", "StashImage"."rating100", "StashImage"."stashCreatedAt", "StashImage"."stashInstanceId", "StashImage"."stashUpdatedAt", s."id", s."stashInstanceId", "StashImage"."syncedAt", "StashImage"."title", "StashImage"."urls", "StashImage"."width"
FROM "StashImage"
LEFT JOIN "StashStudio" s ON s."id" = "StashImage"."studioId" AND s."stashInstanceId" = "StashImage"."studioInstanceId";
DROP TABLE "StashImage";
ALTER TABLE "new_StashImage" RENAME TO "StashImage";
CREATE INDEX "StashImage_studioId_idx" ON "StashImage"("studioId");
CREATE INDEX "StashImage_date_idx" ON "StashImage"("date");
CREATE INDEX "StashImage_rating100_idx" ON "StashImage"("rating100");
CREATE INDEX "StashImage_stashUpdatedAt_idx" ON "StashImage"("stashUpdatedAt");
CREATE INDEX "StashImage_deletedAt_idx" ON "StashImage"("deletedAt");
CREATE INDEX "StashImage_title_idx" ON "StashImage"("title");
CREATE INDEX "StashImage_browse_idx" ON "StashImage"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashImage_stashInstanceId_idx" ON "StashImage"("stashInstanceId");

-- StashClip
CREATE TABLE "new_StashClip" (
    "id" TEXT NOT NULL,
    "stashInstanceId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
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

    PRIMARY KEY ("id", "stashInstanceId"),
    CONSTRAINT "StashClip_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StashClip_primaryTagId_primaryTagInstanceId_fkey" FOREIGN KEY ("primaryTagId", "primaryTagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StashClip" ("deletedAt", "endSeconds", "generationCheckedAt", "id", "isGenerated", "previewPath", "primaryTagId", "primaryTagInstanceId", "sceneId", "sceneInstanceId", "screenshotPath", "seconds", "stashCreatedAt", "stashInstanceId", "stashUpdatedAt", "streamPath", "syncedAt", "title")
SELECT "StashClip"."deletedAt", "StashClip"."endSeconds", "StashClip"."generationCheckedAt", "StashClip"."id", "StashClip"."isGenerated", "StashClip"."previewPath", t."id", t."stashInstanceId", "StashClip"."sceneId", "StashClip"."sceneInstanceId", "StashClip"."screenshotPath", "StashClip"."seconds", "StashClip"."stashCreatedAt", "StashClip"."stashInstanceId", "StashClip"."stashUpdatedAt", "StashClip"."streamPath", "StashClip"."syncedAt", "StashClip"."title"
FROM "StashClip"
LEFT JOIN "StashTag" t ON t."id" = "StashClip"."primaryTagId" AND t."stashInstanceId" = "StashClip"."primaryTagInstanceId"
WHERE EXISTS (SELECT 1 FROM "StashScene" p WHERE p."id" = "StashClip"."sceneId" AND p."stashInstanceId" = "StashClip"."sceneInstanceId");
DROP TABLE "StashClip";
ALTER TABLE "new_StashClip" RENAME TO "StashClip";
CREATE INDEX "StashClip_sceneId_idx" ON "StashClip"("sceneId");
CREATE INDEX "StashClip_primaryTagId_idx" ON "StashClip"("primaryTagId");
CREATE INDEX "StashClip_isGenerated_deletedAt_idx" ON "StashClip"("isGenerated", "deletedAt");
CREATE INDEX "StashClip_deletedAt_stashCreatedAt_idx" ON "StashClip"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashClip_stashInstanceId_idx" ON "StashClip"("stashInstanceId");

-- SceneTag
CREATE TABLE "new_SceneTag" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "SceneTag_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SceneTag" ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId")
SELECT "SceneTag"."sceneId", "SceneTag"."sceneInstanceId", "SceneTag"."tagId", "SceneTag"."tagInstanceId"
FROM "SceneTag"
WHERE EXISTS (SELECT 1 FROM "StashScene" p WHERE p."id" = "SceneTag"."sceneId" AND p."stashInstanceId" = "SceneTag"."sceneInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "SceneTag"."tagId" AND q."stashInstanceId" = "SceneTag"."tagInstanceId");
DROP TABLE "SceneTag";
ALTER TABLE "new_SceneTag" RENAME TO "SceneTag";
CREATE INDEX "SceneTag_tagId_tagInstanceId_idx" ON "SceneTag"("tagId", "tagInstanceId");
CREATE INDEX "SceneTag_sceneId_sceneInstanceId_idx" ON "SceneTag"("sceneId", "sceneInstanceId");

-- ScenePerformer
CREATE TABLE "new_ScenePerformer" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "sceneInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "ScenePerformer_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenePerformer_performerId_performerInstanceId_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScenePerformer" ("performerId", "performerInstanceId", "sceneId", "sceneInstanceId")
SELECT "ScenePerformer"."performerId", "ScenePerformer"."performerInstanceId", "ScenePerformer"."sceneId", "ScenePerformer"."sceneInstanceId"
FROM "ScenePerformer"
WHERE EXISTS (SELECT 1 FROM "StashScene" p WHERE p."id" = "ScenePerformer"."sceneId" AND p."stashInstanceId" = "ScenePerformer"."sceneInstanceId")
  AND EXISTS (SELECT 1 FROM "StashPerformer" q WHERE q."id" = "ScenePerformer"."performerId" AND q."stashInstanceId" = "ScenePerformer"."performerInstanceId");
DROP TABLE "ScenePerformer";
ALTER TABLE "new_ScenePerformer" RENAME TO "ScenePerformer";
CREATE INDEX "ScenePerformer_performerId_performerInstanceId_idx" ON "ScenePerformer"("performerId", "performerInstanceId");
CREATE INDEX "ScenePerformer_sceneId_sceneInstanceId_idx" ON "ScenePerformer"("sceneId", "sceneInstanceId");

-- SceneGroup
CREATE TABLE "new_SceneGroup" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupInstanceId" TEXT NOT NULL,
    "sceneIndex" INTEGER,

    PRIMARY KEY ("sceneId", "sceneInstanceId", "groupId", "groupInstanceId"),
    CONSTRAINT "SceneGroup_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGroup_groupId_groupInstanceId_fkey" FOREIGN KEY ("groupId", "groupInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SceneGroup" ("groupId", "groupInstanceId", "sceneId", "sceneIndex", "sceneInstanceId")
SELECT "SceneGroup"."groupId", "SceneGroup"."groupInstanceId", "SceneGroup"."sceneId", "SceneGroup"."sceneIndex", "SceneGroup"."sceneInstanceId"
FROM "SceneGroup"
WHERE EXISTS (SELECT 1 FROM "StashScene" p WHERE p."id" = "SceneGroup"."sceneId" AND p."stashInstanceId" = "SceneGroup"."sceneInstanceId")
  AND EXISTS (SELECT 1 FROM "StashGroup" q WHERE q."id" = "SceneGroup"."groupId" AND q."stashInstanceId" = "SceneGroup"."groupInstanceId");
DROP TABLE "SceneGroup";
ALTER TABLE "new_SceneGroup" RENAME TO "SceneGroup";
CREATE INDEX "SceneGroup_groupId_groupInstanceId_idx" ON "SceneGroup"("groupId", "groupInstanceId");
CREATE INDEX "SceneGroup_sceneId_sceneInstanceId_idx" ON "SceneGroup"("sceneId", "sceneInstanceId");

-- SceneGallery
CREATE TABLE "new_SceneGallery" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "sceneInstanceId", "galleryId", "galleryInstanceId"),
    CONSTRAINT "SceneGallery_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGallery_galleryId_galleryInstanceId_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SceneGallery" ("galleryId", "galleryInstanceId", "sceneId", "sceneInstanceId")
SELECT "SceneGallery"."galleryId", "SceneGallery"."galleryInstanceId", "SceneGallery"."sceneId", "SceneGallery"."sceneInstanceId"
FROM "SceneGallery"
WHERE EXISTS (SELECT 1 FROM "StashScene" p WHERE p."id" = "SceneGallery"."sceneId" AND p."stashInstanceId" = "SceneGallery"."sceneInstanceId")
  AND EXISTS (SELECT 1 FROM "StashGallery" q WHERE q."id" = "SceneGallery"."galleryId" AND q."stashInstanceId" = "SceneGallery"."galleryInstanceId");
DROP TABLE "SceneGallery";
ALTER TABLE "new_SceneGallery" RENAME TO "SceneGallery";
CREATE INDEX "SceneGallery_galleryId_galleryInstanceId_idx" ON "SceneGallery"("galleryId", "galleryInstanceId");
CREATE INDEX "SceneGallery_sceneId_sceneInstanceId_idx" ON "SceneGallery"("sceneId", "sceneInstanceId");

-- ImageTag
CREATE TABLE "new_ImageTag" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "imageInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "ImageTag_imageId_imageInstanceId_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImageTag" ("imageId", "imageInstanceId", "tagId", "tagInstanceId")
SELECT "ImageTag"."imageId", "ImageTag"."imageInstanceId", "ImageTag"."tagId", "ImageTag"."tagInstanceId"
FROM "ImageTag"
WHERE EXISTS (SELECT 1 FROM "StashImage" p WHERE p."id" = "ImageTag"."imageId" AND p."stashInstanceId" = "ImageTag"."imageInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "ImageTag"."tagId" AND q."stashInstanceId" = "ImageTag"."tagInstanceId");
DROP TABLE "ImageTag";
ALTER TABLE "new_ImageTag" RENAME TO "ImageTag";
CREATE INDEX "ImageTag_tagId_tagInstanceId_idx" ON "ImageTag"("tagId", "tagInstanceId");
CREATE INDEX "ImageTag_imageId_imageInstanceId_idx" ON "ImageTag"("imageId", "imageInstanceId");

-- ImagePerformer
CREATE TABLE "new_ImagePerformer" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "imageInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "ImagePerformer_imageId_imageInstanceId_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImagePerformer_performerId_performerInstanceId_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImagePerformer" ("imageId", "imageInstanceId", "performerId", "performerInstanceId")
SELECT "ImagePerformer"."imageId", "ImagePerformer"."imageInstanceId", "ImagePerformer"."performerId", "ImagePerformer"."performerInstanceId"
FROM "ImagePerformer"
WHERE EXISTS (SELECT 1 FROM "StashImage" p WHERE p."id" = "ImagePerformer"."imageId" AND p."stashInstanceId" = "ImagePerformer"."imageInstanceId")
  AND EXISTS (SELECT 1 FROM "StashPerformer" q WHERE q."id" = "ImagePerformer"."performerId" AND q."stashInstanceId" = "ImagePerformer"."performerInstanceId");
DROP TABLE "ImagePerformer";
ALTER TABLE "new_ImagePerformer" RENAME TO "ImagePerformer";
CREATE INDEX "ImagePerformer_performerId_performerInstanceId_idx" ON "ImagePerformer"("performerId", "performerInstanceId");
CREATE INDEX "ImagePerformer_imageId_imageInstanceId_idx" ON "ImagePerformer"("imageId", "imageInstanceId");

-- ImageGallery
CREATE TABLE "new_ImageGallery" (
    "imageId" TEXT NOT NULL,
    "imageInstanceId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "imageInstanceId", "galleryId", "galleryInstanceId"),
    CONSTRAINT "ImageGallery_imageId_imageInstanceId_fkey" FOREIGN KEY ("imageId", "imageInstanceId") REFERENCES "StashImage" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageGallery_galleryId_galleryInstanceId_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImageGallery" ("galleryId", "galleryInstanceId", "imageId", "imageInstanceId")
SELECT "ImageGallery"."galleryId", "ImageGallery"."galleryInstanceId", "ImageGallery"."imageId", "ImageGallery"."imageInstanceId"
FROM "ImageGallery"
WHERE EXISTS (SELECT 1 FROM "StashImage" p WHERE p."id" = "ImageGallery"."imageId" AND p."stashInstanceId" = "ImageGallery"."imageInstanceId")
  AND EXISTS (SELECT 1 FROM "StashGallery" q WHERE q."id" = "ImageGallery"."galleryId" AND q."stashInstanceId" = "ImageGallery"."galleryInstanceId");
DROP TABLE "ImageGallery";
ALTER TABLE "new_ImageGallery" RENAME TO "ImageGallery";
CREATE INDEX "ImageGallery_galleryId_galleryInstanceId_idx" ON "ImageGallery"("galleryId", "galleryInstanceId");
CREATE INDEX "ImageGallery_imageId_imageInstanceId_idx" ON "ImageGallery"("imageId", "imageInstanceId");

-- GalleryTag
CREATE TABLE "new_GalleryTag" (
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "galleryInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "GalleryTag_galleryId_galleryInstanceId_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GalleryTag" ("galleryId", "galleryInstanceId", "tagId", "tagInstanceId")
SELECT "GalleryTag"."galleryId", "GalleryTag"."galleryInstanceId", "GalleryTag"."tagId", "GalleryTag"."tagInstanceId"
FROM "GalleryTag"
WHERE EXISTS (SELECT 1 FROM "StashGallery" p WHERE p."id" = "GalleryTag"."galleryId" AND p."stashInstanceId" = "GalleryTag"."galleryInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "GalleryTag"."tagId" AND q."stashInstanceId" = "GalleryTag"."tagInstanceId");
DROP TABLE "GalleryTag";
ALTER TABLE "new_GalleryTag" RENAME TO "GalleryTag";
CREATE INDEX "GalleryTag_tagId_tagInstanceId_idx" ON "GalleryTag"("tagId", "tagInstanceId");
CREATE INDEX "GalleryTag_galleryId_galleryInstanceId_idx" ON "GalleryTag"("galleryId", "galleryInstanceId");

-- GalleryPerformer
CREATE TABLE "new_GalleryPerformer" (
    "galleryId" TEXT NOT NULL,
    "galleryInstanceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "galleryInstanceId", "performerId", "performerInstanceId"),
    CONSTRAINT "GalleryPerformer_galleryId_galleryInstanceId_fkey" FOREIGN KEY ("galleryId", "galleryInstanceId") REFERENCES "StashGallery" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryPerformer_performerId_performerInstanceId_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GalleryPerformer" ("galleryId", "galleryInstanceId", "performerId", "performerInstanceId")
SELECT "GalleryPerformer"."galleryId", "GalleryPerformer"."galleryInstanceId", "GalleryPerformer"."performerId", "GalleryPerformer"."performerInstanceId"
FROM "GalleryPerformer"
WHERE EXISTS (SELECT 1 FROM "StashGallery" p WHERE p."id" = "GalleryPerformer"."galleryId" AND p."stashInstanceId" = "GalleryPerformer"."galleryInstanceId")
  AND EXISTS (SELECT 1 FROM "StashPerformer" q WHERE q."id" = "GalleryPerformer"."performerId" AND q."stashInstanceId" = "GalleryPerformer"."performerInstanceId");
DROP TABLE "GalleryPerformer";
ALTER TABLE "new_GalleryPerformer" RENAME TO "GalleryPerformer";
CREATE INDEX "GalleryPerformer_performerId_performerInstanceId_idx" ON "GalleryPerformer"("performerId", "performerInstanceId");
CREATE INDEX "GalleryPerformer_galleryId_galleryInstanceId_idx" ON "GalleryPerformer"("galleryId", "galleryInstanceId");

-- PerformerTag
CREATE TABLE "new_PerformerTag" (
    "performerId" TEXT NOT NULL,
    "performerInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("performerId", "performerInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "PerformerTag_performerId_performerInstanceId_fkey" FOREIGN KEY ("performerId", "performerInstanceId") REFERENCES "StashPerformer" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformerTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PerformerTag" ("performerId", "performerInstanceId", "tagId", "tagInstanceId")
SELECT "PerformerTag"."performerId", "PerformerTag"."performerInstanceId", "PerformerTag"."tagId", "PerformerTag"."tagInstanceId"
FROM "PerformerTag"
WHERE EXISTS (SELECT 1 FROM "StashPerformer" p WHERE p."id" = "PerformerTag"."performerId" AND p."stashInstanceId" = "PerformerTag"."performerInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "PerformerTag"."tagId" AND q."stashInstanceId" = "PerformerTag"."tagInstanceId");
DROP TABLE "PerformerTag";
ALTER TABLE "new_PerformerTag" RENAME TO "PerformerTag";
CREATE INDEX "PerformerTag_tagId_tagInstanceId_idx" ON "PerformerTag"("tagId", "tagInstanceId");
CREATE INDEX "PerformerTag_performerId_performerInstanceId_idx" ON "PerformerTag"("performerId", "performerInstanceId");

-- StudioTag
CREATE TABLE "new_StudioTag" (
    "studioId" TEXT NOT NULL,
    "studioInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("studioId", "studioInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "StudioTag_studioId_studioInstanceId_fkey" FOREIGN KEY ("studioId", "studioInstanceId") REFERENCES "StashStudio" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudioTag" ("studioId", "studioInstanceId", "tagId", "tagInstanceId")
SELECT "StudioTag"."studioId", "StudioTag"."studioInstanceId", "StudioTag"."tagId", "StudioTag"."tagInstanceId"
FROM "StudioTag"
WHERE EXISTS (SELECT 1 FROM "StashStudio" p WHERE p."id" = "StudioTag"."studioId" AND p."stashInstanceId" = "StudioTag"."studioInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "StudioTag"."tagId" AND q."stashInstanceId" = "StudioTag"."tagInstanceId");
DROP TABLE "StudioTag";
ALTER TABLE "new_StudioTag" RENAME TO "StudioTag";
CREATE INDEX "StudioTag_tagId_tagInstanceId_idx" ON "StudioTag"("tagId", "tagInstanceId");
CREATE INDEX "StudioTag_studioId_studioInstanceId_idx" ON "StudioTag"("studioId", "studioInstanceId");

-- GroupTag
CREATE TABLE "new_GroupTag" (
    "groupId" TEXT NOT NULL,
    "groupInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("groupId", "groupInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "GroupTag_groupId_groupInstanceId_fkey" FOREIGN KEY ("groupId", "groupInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GroupTag" ("groupId", "groupInstanceId", "tagId", "tagInstanceId")
SELECT "GroupTag"."groupId", "GroupTag"."groupInstanceId", "GroupTag"."tagId", "GroupTag"."tagInstanceId"
FROM "GroupTag"
WHERE EXISTS (SELECT 1 FROM "StashGroup" p WHERE p."id" = "GroupTag"."groupId" AND p."stashInstanceId" = "GroupTag"."groupInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "GroupTag"."tagId" AND q."stashInstanceId" = "GroupTag"."tagInstanceId");
DROP TABLE "GroupTag";
ALTER TABLE "new_GroupTag" RENAME TO "GroupTag";
CREATE INDEX "GroupTag_tagId_tagInstanceId_idx" ON "GroupTag"("tagId", "tagInstanceId");
CREATE INDEX "GroupTag_groupId_groupInstanceId_idx" ON "GroupTag"("groupId", "groupInstanceId");

-- ClipTag
CREATE TABLE "new_ClipTag" (
    "clipId" TEXT NOT NULL,
    "clipInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("clipId", "clipInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "ClipTag_clipId_clipInstanceId_fkey" FOREIGN KEY ("clipId", "clipInstanceId") REFERENCES "StashClip" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClipTag_tagId_tagInstanceId_fkey" FOREIGN KEY ("tagId", "tagInstanceId") REFERENCES "StashTag" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClipTag" ("clipId", "clipInstanceId", "tagId", "tagInstanceId")
SELECT "ClipTag"."clipId", "ClipTag"."clipInstanceId", "ClipTag"."tagId", "ClipTag"."tagInstanceId"
FROM "ClipTag"
WHERE EXISTS (SELECT 1 FROM "StashClip" p WHERE p."id" = "ClipTag"."clipId" AND p."stashInstanceId" = "ClipTag"."clipInstanceId")
  AND EXISTS (SELECT 1 FROM "StashTag" q WHERE q."id" = "ClipTag"."tagId" AND q."stashInstanceId" = "ClipTag"."tagInstanceId");
DROP TABLE "ClipTag";
ALTER TABLE "new_ClipTag" RENAME TO "ClipTag";
CREATE INDEX "ClipTag_tagId_tagInstanceId_idx" ON "ClipTag"("tagId", "tagInstanceId");
CREATE INDEX "ClipTag_clipId_clipInstanceId_idx" ON "ClipTag"("clipId", "clipInstanceId");

-- User
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "preferredQuality" TEXT DEFAULT 'auto',
    "preferredPlaybackMode" TEXT DEFAULT 'auto',
    "preferredPreviewQuality" TEXT DEFAULT 'sprite',
    "wallPlayback" TEXT DEFAULT 'autoplay',
    "enableCast" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT DEFAULT 'dark',
    "carouselPreferences" JSONB,
    "navPreferences" JSONB,
    "filterPresets" JSONB,
    "defaultFilterPresets" JSONB,
    "unitPreference" TEXT DEFAULT 'metric',
    "tableColumnDefaults" JSONB,
    "cardDisplaySettings" JSONB,
    "landingPagePreference" JSONB DEFAULT '{"pages":["home"],"randomize":false}',
    "lightboxDoubleTapAction" TEXT DEFAULT 'favorite',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "setupCompletedAt" DATETIME,
    "minimumPlayPercent" INTEGER NOT NULL DEFAULT 20,
    "syncToStash" BOOLEAN NOT NULL DEFAULT false,
    "hideConfirmationDisabled" BOOLEAN NOT NULL DEFAULT false,
    "canShareOverride" BOOLEAN,
    "canDownloadFilesOverride" BOOLEAN,
    "canDownloadPlaylistsOverride" BOOLEAN,
    "recoveryKeyHash" TEXT,
    "passwordChangedAt" DATETIME
);
INSERT INTO "new_User" ("canDownloadFilesOverride", "canDownloadPlaylistsOverride", "canShareOverride", "cardDisplaySettings", "carouselPreferences", "createdAt", "defaultFilterPresets", "enableCast", "filterPresets", "hideConfirmationDisabled", "id", "landingPagePreference", "lightboxDoubleTapAction", "minimumPlayPercent", "navPreferences", "password", "passwordChangedAt", "preferredPlaybackMode", "preferredPreviewQuality", "preferredQuality", "recoveryKeyHash", "role", "setupCompleted", "setupCompletedAt", "syncToStash", "tableColumnDefaults", "theme", "unitPreference", "updatedAt", "username", "wallPlayback")
SELECT "canDownloadFilesOverride", "canDownloadPlaylistsOverride", "canShareOverride", "cardDisplaySettings", "carouselPreferences", "createdAt", "defaultFilterPresets", "enableCast", "filterPresets", "hideConfirmationDisabled", "id", "landingPagePreference", "lightboxDoubleTapAction", "minimumPlayPercent", "navPreferences", "password", "passwordChangedAt", "preferredPlaybackMode", "preferredPreviewQuality", "preferredQuality", "recoveryKeyHash", "role", "setupCompleted", "setupCompletedAt", "syncToStash", "tableColumnDefaults", "theme", "unitPreference", "updatedAt", "username", "wallPlayback"
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- ImageViewHistory
CREATE TABLE "new_ImageViewHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT,
    "imageId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "viewHistory" JSONB NOT NULL DEFAULT '[]',
    "oCount" INTEGER NOT NULL DEFAULT 0,
    "oHistory" JSONB NOT NULL DEFAULT '[]',
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageViewHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImageViewHistory" ("createdAt", "id", "imageId", "instanceId", "lastViewedAt", "oCount", "oHistory", "updatedAt", "userId", "viewCount", "viewHistory")
SELECT "ImageViewHistory"."createdAt", "ImageViewHistory"."id", "ImageViewHistory"."imageId", "ImageViewHistory"."instanceId", "ImageViewHistory"."lastViewedAt", "ImageViewHistory"."oCount", "ImageViewHistory"."oHistory", "ImageViewHistory"."updatedAt", "ImageViewHistory"."userId", "ImageViewHistory"."viewCount", "ImageViewHistory"."viewHistory"
FROM "ImageViewHistory"
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "ImageViewHistory"."userId");
DROP TABLE "ImageViewHistory";
ALTER TABLE "new_ImageViewHistory" RENAME TO "ImageViewHistory";
CREATE INDEX "ImageViewHistory_userId_idx" ON "ImageViewHistory"("userId");
CREATE INDEX "ImageViewHistory_imageId_idx" ON "ImageViewHistory"("imageId");
CREATE INDEX "ImageViewHistory_lastViewedAt_idx" ON "ImageViewHistory"("lastViewedAt");
CREATE UNIQUE INDEX "ImageViewHistory_userId_instanceId_imageId_key" ON "ImageViewHistory"("userId", "instanceId", "imageId");

-- UserEntityStats
CREATE TABLE "new_UserEntityStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL DEFAULT '',
    "visibleCount" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserEntityStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserEntityStats" ("entityType", "id", "instanceId", "updatedAt", "userId", "visibleCount")
SELECT "UserEntityStats"."entityType", "UserEntityStats"."id", "UserEntityStats"."instanceId", "UserEntityStats"."updatedAt", "UserEntityStats"."userId", "UserEntityStats"."visibleCount"
FROM "UserEntityStats"
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "UserEntityStats"."userId");
DROP TABLE "UserEntityStats";
ALTER TABLE "new_UserEntityStats" RENAME TO "UserEntityStats";
CREATE UNIQUE INDEX "UserEntityStats_userId_entityType_instanceId_key" ON "UserEntityStats"("userId", "entityType", "instanceId");

-- UserExcludedEntity
CREATE TABLE "new_UserExcludedEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExcludedEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserExcludedEntity" ("computedAt", "entityId", "entityType", "id", "instanceId", "reason", "userId")
SELECT "UserExcludedEntity"."computedAt", "UserExcludedEntity"."entityId", "UserExcludedEntity"."entityType", "UserExcludedEntity"."id", "UserExcludedEntity"."instanceId", "UserExcludedEntity"."reason", "UserExcludedEntity"."userId"
FROM "UserExcludedEntity"
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "UserExcludedEntity"."userId");
DROP TABLE "UserExcludedEntity";
ALTER TABLE "new_UserExcludedEntity" RENAME TO "UserExcludedEntity";
CREATE INDEX "UserExcludedEntity_userId_entityType_idx" ON "UserExcludedEntity"("userId", "entityType");
CREATE INDEX "UserExcludedEntity_entityType_entityId_idx" ON "UserExcludedEntity"("entityType", "entityId");
CREATE INDEX "UserExcludedEntity_userId_entityType_reason_idx" ON "UserExcludedEntity"("userId", "entityType", "reason");
CREATE UNIQUE INDEX "UserExcludedEntity_userId_entityType_entityId_instanceId_key" ON "UserExcludedEntity"("userId", "entityType", "entityId", "instanceId");

-- UserHiddenEntity
CREATE TABLE "new_UserHiddenEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL DEFAULT '',
    "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserHiddenEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserHiddenEntity" ("entityId", "entityType", "hiddenAt", "id", "instanceId", "userId")
SELECT "UserHiddenEntity"."entityId", "UserHiddenEntity"."entityType", "UserHiddenEntity"."hiddenAt", "UserHiddenEntity"."id", "UserHiddenEntity"."instanceId", "UserHiddenEntity"."userId"
FROM "UserHiddenEntity"
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "UserHiddenEntity"."userId");
DROP TABLE "UserHiddenEntity";
ALTER TABLE "new_UserHiddenEntity" RENAME TO "UserHiddenEntity";
CREATE INDEX "UserHiddenEntity_userId_idx" ON "UserHiddenEntity"("userId");
CREATE INDEX "UserHiddenEntity_entityType_idx" ON "UserHiddenEntity"("entityType");
CREATE INDEX "UserHiddenEntity_entityId_idx" ON "UserHiddenEntity"("entityId");
CREATE UNIQUE INDEX "UserHiddenEntity_userId_entityType_entityId_instanceId_key" ON "UserHiddenEntity"("userId", "entityType", "entityId", "instanceId");

-- Restore the autoincrement counters the rebuilds reset. A rebuilt table
-- that is empty has no counter row left, so its saved one is put back.
UPDATE sqlite_sequence SET "seq" = (SELECT "seq" FROM "_seq" WHERE "_seq"."name" = sqlite_sequence."name") WHERE "name" IN (SELECT "name" FROM "_seq");
INSERT INTO sqlite_sequence ("name", "seq") SELECT "name", "seq" FROM "_seq" WHERE "name" NOT IN (SELECT "name" FROM sqlite_sequence);
DROP TABLE "_seq";

-- Foreign-key guard over the rebuilt tables (see .claude/rules/prisma.md)
CREATE TEMP TABLE "_fk_guard" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "_fk_guard" SELECT count(*) FROM (
  SELECT 1 FROM pragma_foreign_key_check('StashScene')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashPerformer')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashStudio')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashGroup')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashGallery')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashImage')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StashClip')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('SceneTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ScenePerformer')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('SceneGroup')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('SceneGallery')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImageTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImagePerformer')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImageGallery')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('GalleryTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('GalleryPerformer')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('PerformerTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StudioTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('GroupTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ClipTag')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('User')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImageViewHistory')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserEntityStats')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserExcludedEntity')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserHiddenEntity')
);
DROP TABLE "_fk_guard";

COMMIT;
PRAGMA foreign_keys=ON;
