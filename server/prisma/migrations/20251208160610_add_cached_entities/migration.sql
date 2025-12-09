-- CreateTable
CREATE TABLE "CachedScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "code" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedPerformer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "disambiguation" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "galleryCount" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedStudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "galleryCount" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "sceneCount" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedGallery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "imageCount" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CachedImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "data" TEXT NOT NULL,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ScenePerformer" (
    "sceneId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "performerId"),
    CONSTRAINT "ScenePerformer_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "CachedScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "CachedPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneTag" (
    "sceneId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "tagId"),
    CONSTRAINT "SceneTag_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "CachedScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CachedTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneGroup" (
    "sceneId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sceneIndex" INTEGER,

    PRIMARY KEY ("sceneId", "groupId"),
    CONSTRAINT "SceneGroup_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "CachedScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CachedGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneGallery" (
    "sceneId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "galleryId"),
    CONSTRAINT "SceneGallery_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "CachedScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "CachedGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImagePerformer" (
    "imageId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "performerId"),
    CONSTRAINT "ImagePerformer_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "CachedImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImagePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "CachedPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageTag" (
    "imageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "tagId"),
    CONSTRAINT "ImageTag_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "CachedImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CachedTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageGallery" (
    "imageId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "galleryId"),
    CONSTRAINT "ImageGallery_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "CachedImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "CachedGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "SyncSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "enableScanSubscription" BOOLEAN NOT NULL DEFAULT true,
    "enablePluginWebhook" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CachedScene_studioId_idx" ON "CachedScene"("studioId");

-- CreateIndex
CREATE INDEX "CachedScene_date_idx" ON "CachedScene"("date");

-- CreateIndex
CREATE INDEX "CachedScene_stashCreatedAt_idx" ON "CachedScene"("stashCreatedAt");

-- CreateIndex
CREATE INDEX "CachedScene_stashUpdatedAt_idx" ON "CachedScene"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedScene_rating100_idx" ON "CachedScene"("rating100");

-- CreateIndex
CREATE INDEX "CachedScene_duration_idx" ON "CachedScene"("duration");

-- CreateIndex
CREATE INDEX "CachedScene_deletedAt_idx" ON "CachedScene"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedPerformer_name_idx" ON "CachedPerformer"("name");

-- CreateIndex
CREATE INDEX "CachedPerformer_gender_idx" ON "CachedPerformer"("gender");

-- CreateIndex
CREATE INDEX "CachedPerformer_favorite_idx" ON "CachedPerformer"("favorite");

-- CreateIndex
CREATE INDEX "CachedPerformer_rating100_idx" ON "CachedPerformer"("rating100");

-- CreateIndex
CREATE INDEX "CachedPerformer_sceneCount_idx" ON "CachedPerformer"("sceneCount");

-- CreateIndex
CREATE INDEX "CachedPerformer_stashUpdatedAt_idx" ON "CachedPerformer"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedPerformer_deletedAt_idx" ON "CachedPerformer"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedStudio_name_idx" ON "CachedStudio"("name");

-- CreateIndex
CREATE INDEX "CachedStudio_parentId_idx" ON "CachedStudio"("parentId");

-- CreateIndex
CREATE INDEX "CachedStudio_favorite_idx" ON "CachedStudio"("favorite");

-- CreateIndex
CREATE INDEX "CachedStudio_rating100_idx" ON "CachedStudio"("rating100");

-- CreateIndex
CREATE INDEX "CachedStudio_sceneCount_idx" ON "CachedStudio"("sceneCount");

-- CreateIndex
CREATE INDEX "CachedStudio_stashUpdatedAt_idx" ON "CachedStudio"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedStudio_deletedAt_idx" ON "CachedStudio"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedTag_name_idx" ON "CachedTag"("name");

-- CreateIndex
CREATE INDEX "CachedTag_favorite_idx" ON "CachedTag"("favorite");

-- CreateIndex
CREATE INDEX "CachedTag_sceneCount_idx" ON "CachedTag"("sceneCount");

-- CreateIndex
CREATE INDEX "CachedTag_stashUpdatedAt_idx" ON "CachedTag"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedTag_deletedAt_idx" ON "CachedTag"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedGroup_name_idx" ON "CachedGroup"("name");

-- CreateIndex
CREATE INDEX "CachedGroup_date_idx" ON "CachedGroup"("date");

-- CreateIndex
CREATE INDEX "CachedGroup_studioId_idx" ON "CachedGroup"("studioId");

-- CreateIndex
CREATE INDEX "CachedGroup_rating100_idx" ON "CachedGroup"("rating100");

-- CreateIndex
CREATE INDEX "CachedGroup_sceneCount_idx" ON "CachedGroup"("sceneCount");

-- CreateIndex
CREATE INDEX "CachedGroup_stashUpdatedAt_idx" ON "CachedGroup"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedGroup_deletedAt_idx" ON "CachedGroup"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedGallery_title_idx" ON "CachedGallery"("title");

-- CreateIndex
CREATE INDEX "CachedGallery_date_idx" ON "CachedGallery"("date");

-- CreateIndex
CREATE INDEX "CachedGallery_studioId_idx" ON "CachedGallery"("studioId");

-- CreateIndex
CREATE INDEX "CachedGallery_rating100_idx" ON "CachedGallery"("rating100");

-- CreateIndex
CREATE INDEX "CachedGallery_imageCount_idx" ON "CachedGallery"("imageCount");

-- CreateIndex
CREATE INDEX "CachedGallery_stashUpdatedAt_idx" ON "CachedGallery"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedGallery_deletedAt_idx" ON "CachedGallery"("deletedAt");

-- CreateIndex
CREATE INDEX "CachedImage_studioId_idx" ON "CachedImage"("studioId");

-- CreateIndex
CREATE INDEX "CachedImage_date_idx" ON "CachedImage"("date");

-- CreateIndex
CREATE INDEX "CachedImage_rating100_idx" ON "CachedImage"("rating100");

-- CreateIndex
CREATE INDEX "CachedImage_stashUpdatedAt_idx" ON "CachedImage"("stashUpdatedAt");

-- CreateIndex
CREATE INDEX "CachedImage_deletedAt_idx" ON "CachedImage"("deletedAt");

-- CreateIndex
CREATE INDEX "ScenePerformer_performerId_idx" ON "ScenePerformer"("performerId");

-- CreateIndex
CREATE INDEX "SceneTag_tagId_idx" ON "SceneTag"("tagId");

-- CreateIndex
CREATE INDEX "SceneGroup_groupId_idx" ON "SceneGroup"("groupId");

-- CreateIndex
CREATE INDEX "SceneGallery_galleryId_idx" ON "SceneGallery"("galleryId");

-- CreateIndex
CREATE INDEX "ImagePerformer_performerId_idx" ON "ImagePerformer"("performerId");

-- CreateIndex
CREATE INDEX "ImageTag_tagId_idx" ON "ImageTag"("tagId");

-- CreateIndex
CREATE INDEX "ImageGallery_galleryId_idx" ON "ImageGallery"("galleryId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_stashInstanceId_entityType_key" ON "SyncState"("stashInstanceId", "entityType");
