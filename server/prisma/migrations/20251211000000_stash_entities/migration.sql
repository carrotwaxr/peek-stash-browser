-- CreateTable: StashScene
CREATE TABLE "StashScene" (
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
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashPerformer
CREATE TABLE "StashPerformer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "disambiguation" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "details" TEXT,
    "aliasList" TEXT,
    "country" TEXT,
    "ethnicity" TEXT,
    "hairColor" TEXT,
    "eyeColor" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "measurements" TEXT,
    "tattoos" TEXT,
    "piercings" TEXT,
    "careerLength" TEXT,
    "deathDate" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashStudio
CREATE TABLE "StashStudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "details" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashTag
CREATE TABLE "StashTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "aliases" TEXT,
    "parentIds" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashGroup
CREATE TABLE "StashGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "director" TEXT,
    "synopsis" TEXT,
    "urls" TEXT,
    "frontImagePath" TEXT,
    "backImagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashGallery
CREATE TABLE "StashGallery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "details" TEXT,
    "url" TEXT,
    "code" TEXT,
    "folderPath" TEXT,
    "coverPath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashImage
CREATE TABLE "StashImage" (
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
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: ScenePerformer
CREATE TABLE "ScenePerformer" (
    "sceneId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "performerId"),
    CONSTRAINT "ScenePerformer_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneTag
CREATE TABLE "SceneTag" (
    "sceneId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "tagId"),
    CONSTRAINT "SceneTag_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneGroup
CREATE TABLE "SceneGroup" (
    "sceneId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sceneIndex" INTEGER,

    PRIMARY KEY ("sceneId", "groupId"),
    CONSTRAINT "SceneGroup_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StashGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneGallery
CREATE TABLE "SceneGallery" (
    "sceneId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "galleryId"),
    CONSTRAINT "SceneGallery_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImagePerformer
CREATE TABLE "ImagePerformer" (
    "imageId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "performerId"),
    CONSTRAINT "ImagePerformer_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImagePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImageTag
CREATE TABLE "ImageTag" (
    "imageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "tagId"),
    CONSTRAINT "ImageTag_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImageGallery
CREATE TABLE "ImageGallery" (
    "imageId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "galleryId"),
    CONSTRAINT "ImageGallery_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GalleryPerformer
CREATE TABLE "GalleryPerformer" (
    "galleryId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "performerId"),
    CONSTRAINT "GalleryPerformer_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryPerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: PerformerTag
CREATE TABLE "PerformerTag" (
    "performerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("performerId", "tagId"),
    CONSTRAINT "PerformerTag_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: StudioTag
CREATE TABLE "StudioTag" (
    "studioId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("studioId", "tagId"),
    CONSTRAINT "StudioTag_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "StashStudio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GalleryTag
CREATE TABLE "GalleryTag" (
    "galleryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "tagId"),
    CONSTRAINT "GalleryTag_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GroupTag
CREATE TABLE "GroupTag" (
    "groupId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("groupId", "tagId"),
    CONSTRAINT "GroupTag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StashGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SyncState
CREATE TABLE "SyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stashInstanceId" TEXT,
    "entityType" TEXT NOT NULL,
    "lastFullSync" DATETIME,
    "lastIncrementalSync" DATETIME,
    "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDurationMs" INTEGER,
    "lastError" TEXT,
    "totalEntities" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable: SyncSettings
CREATE TABLE "SyncSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "enableScanSubscription" BOOLEAN NOT NULL DEFAULT true,
    "enablePluginWebhook" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex: StashScene indexes
CREATE INDEX "StashScene_studioId_idx" ON "StashScene"("studioId");
CREATE INDEX "StashScene_date_idx" ON "StashScene"("date");
CREATE INDEX "StashScene_stashCreatedAt_idx" ON "StashScene"("stashCreatedAt");
CREATE INDEX "StashScene_stashUpdatedAt_idx" ON "StashScene"("stashUpdatedAt");
CREATE INDEX "StashScene_rating100_idx" ON "StashScene"("rating100");
CREATE INDEX "StashScene_duration_idx" ON "StashScene"("duration");
CREATE INDEX "StashScene_deletedAt_idx" ON "StashScene"("deletedAt");
CREATE INDEX "StashScene_oCounter_idx" ON "StashScene"("oCounter");
CREATE INDEX "StashScene_playCount_idx" ON "StashScene"("playCount");
CREATE INDEX "StashScene_browse_idx" ON "StashScene"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashScene_browse_updated_idx" ON "StashScene"("deletedAt", "stashUpdatedAt" DESC);
CREATE INDEX "StashScene_browse_date_idx" ON "StashScene"("deletedAt", "date" DESC);
CREATE INDEX "StashScene_browse_title_idx" ON "StashScene"("deletedAt", "title");
CREATE INDEX "StashScene_browse_duration_idx" ON "StashScene"("deletedAt", "duration" DESC);

-- CreateIndex: StashPerformer indexes
CREATE INDEX "StashPerformer_name_idx" ON "StashPerformer"("name");
CREATE INDEX "StashPerformer_gender_idx" ON "StashPerformer"("gender");
CREATE INDEX "StashPerformer_favorite_idx" ON "StashPerformer"("favorite");
CREATE INDEX "StashPerformer_rating100_idx" ON "StashPerformer"("rating100");
CREATE INDEX "StashPerformer_stashUpdatedAt_idx" ON "StashPerformer"("stashUpdatedAt");
CREATE INDEX "StashPerformer_deletedAt_idx" ON "StashPerformer"("deletedAt");

-- CreateIndex: StashStudio indexes
CREATE INDEX "StashStudio_name_idx" ON "StashStudio"("name");
CREATE INDEX "StashStudio_parentId_idx" ON "StashStudio"("parentId");
CREATE INDEX "StashStudio_favorite_idx" ON "StashStudio"("favorite");
CREATE INDEX "StashStudio_rating100_idx" ON "StashStudio"("rating100");
CREATE INDEX "StashStudio_stashUpdatedAt_idx" ON "StashStudio"("stashUpdatedAt");
CREATE INDEX "StashStudio_deletedAt_idx" ON "StashStudio"("deletedAt");

-- CreateIndex: StashTag indexes
CREATE INDEX "StashTag_name_idx" ON "StashTag"("name");
CREATE INDEX "StashTag_favorite_idx" ON "StashTag"("favorite");
CREATE INDEX "StashTag_stashUpdatedAt_idx" ON "StashTag"("stashUpdatedAt");
CREATE INDEX "StashTag_deletedAt_idx" ON "StashTag"("deletedAt");

-- CreateIndex: StashGroup indexes
CREATE INDEX "StashGroup_name_idx" ON "StashGroup"("name");
CREATE INDEX "StashGroup_date_idx" ON "StashGroup"("date");
CREATE INDEX "StashGroup_studioId_idx" ON "StashGroup"("studioId");
CREATE INDEX "StashGroup_rating100_idx" ON "StashGroup"("rating100");
CREATE INDEX "StashGroup_stashUpdatedAt_idx" ON "StashGroup"("stashUpdatedAt");
CREATE INDEX "StashGroup_deletedAt_idx" ON "StashGroup"("deletedAt");

-- CreateIndex: StashGallery indexes
CREATE INDEX "StashGallery_title_idx" ON "StashGallery"("title");
CREATE INDEX "StashGallery_date_idx" ON "StashGallery"("date");
CREATE INDEX "StashGallery_studioId_idx" ON "StashGallery"("studioId");
CREATE INDEX "StashGallery_rating100_idx" ON "StashGallery"("rating100");
CREATE INDEX "StashGallery_stashUpdatedAt_idx" ON "StashGallery"("stashUpdatedAt");
CREATE INDEX "StashGallery_deletedAt_idx" ON "StashGallery"("deletedAt");

-- CreateIndex: StashImage indexes
CREATE INDEX "StashImage_studioId_idx" ON "StashImage"("studioId");
CREATE INDEX "StashImage_date_idx" ON "StashImage"("date");
CREATE INDEX "StashImage_rating100_idx" ON "StashImage"("rating100");
CREATE INDEX "StashImage_stashUpdatedAt_idx" ON "StashImage"("stashUpdatedAt");
CREATE INDEX "StashImage_deletedAt_idx" ON "StashImage"("deletedAt");

-- CreateIndex: Junction table indexes
CREATE INDEX "ScenePerformer_performerId_idx" ON "ScenePerformer"("performerId");
CREATE INDEX "SceneTag_tagId_idx" ON "SceneTag"("tagId");
CREATE INDEX "SceneGroup_groupId_idx" ON "SceneGroup"("groupId");
CREATE INDEX "SceneGallery_galleryId_idx" ON "SceneGallery"("galleryId");
CREATE INDEX "ImagePerformer_performerId_idx" ON "ImagePerformer"("performerId");
CREATE INDEX "ImageTag_tagId_idx" ON "ImageTag"("tagId");
CREATE INDEX "ImageGallery_galleryId_idx" ON "ImageGallery"("galleryId");
CREATE INDEX "GalleryPerformer_performerId_idx" ON "GalleryPerformer"("performerId");
CREATE INDEX "PerformerTag_tagId_idx" ON "PerformerTag"("tagId");
CREATE INDEX "StudioTag_tagId_idx" ON "StudioTag"("tagId");
CREATE INDEX "GalleryTag_tagId_idx" ON "GalleryTag"("tagId");
CREATE INDEX "GroupTag_tagId_idx" ON "GroupTag"("tagId");

-- CreateIndex: SyncState unique constraint
CREATE UNIQUE INDEX "SyncState_stashInstanceId_entityType_key" ON "SyncState"("stashInstanceId", "entityType");

-- FTS5 Virtual Table for scene search
CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(
    id,
    title,
    details,
    code,
    content='StashScene',
    content_rowid='rowid'
);

-- FTS5 Triggers for automatic sync
CREATE TRIGGER IF NOT EXISTS scene_fts_insert AFTER INSERT ON StashScene BEGIN
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_delete AFTER DELETE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_update AFTER UPDATE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;
