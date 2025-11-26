-- Baseline migration: Creates all tables for Peek Stash Browser v2.0.0+
-- This migration represents the complete schema as of v2.0.0
-- For existing databases (created with db push), this will be marked as already applied
-- For new databases, this will create all tables from scratch

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "preferredQuality" TEXT DEFAULT 'auto',
    "preferredPlaybackMode" TEXT DEFAULT 'auto',
    "preferredPreviewQuality" TEXT DEFAULT 'sprite',
    "enableCast" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT DEFAULT 'dark',
    "carouselPreferences" JSONB,
    "navPreferences" JSONB,
    "filterPresets" JSONB,
    "defaultFilterPresets" JSONB,
    "minimumPlayPercent" INTEGER NOT NULL DEFAULT 20,
    "syncToStash" BOOLEAN NOT NULL DEFAULT false,
    "hideConfirmationDisabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "WatchHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "sceneId" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "playDuration" REAL NOT NULL DEFAULT 0,
    "resumeTime" REAL,
    "lastPlayedAt" DATETIME,
    "oCount" INTEGER NOT NULL DEFAULT 0,
    "oHistory" JSONB NOT NULL DEFAULT '[]',
    "playHistory" JSONB NOT NULL DEFAULT '[]',
    "watchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "WatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" INTEGER NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playlistId" INTEGER NOT NULL,
    "sceneId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomTheme" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SceneRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "sceneId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SceneRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PerformerRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "performerId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PerformerRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudioRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "studioId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TagRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tagId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TagRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GalleryRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "galleryId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "imageId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserContentRestriction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "entityIds" TEXT NOT NULL,
    "restrictEmpty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserContentRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPerformerStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "performerId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "lastOAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserStudioStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "studioId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserTagStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tagId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserHiddenEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserHiddenEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataMigration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StashInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "url" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "WatchHistory_userId_idx" ON "WatchHistory"("userId");

-- CreateIndex
CREATE INDEX "WatchHistory_sceneId_idx" ON "WatchHistory"("sceneId");

-- CreateIndex
CREATE INDEX "WatchHistory_lastPlayedAt_idx" ON "WatchHistory"("lastPlayedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchHistory_userId_sceneId_key" ON "WatchHistory"("userId", "sceneId");

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE INDEX "Playlist_updatedAt_idx" ON "Playlist"("updatedAt");

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_position_idx" ON "PlaylistItem"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_sceneId_key" ON "PlaylistItem"("playlistId", "sceneId");

-- CreateIndex
CREATE INDEX "CustomTheme_userId_idx" ON "CustomTheme"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomTheme_userId_name_key" ON "CustomTheme"("userId", "name");

-- CreateIndex
CREATE INDEX "SceneRating_userId_idx" ON "SceneRating"("userId");

-- CreateIndex
CREATE INDEX "SceneRating_sceneId_idx" ON "SceneRating"("sceneId");

-- CreateIndex
CREATE INDEX "SceneRating_favorite_idx" ON "SceneRating"("favorite");

-- CreateIndex
CREATE INDEX "SceneRating_rating_idx" ON "SceneRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "SceneRating_userId_sceneId_key" ON "SceneRating"("userId", "sceneId");

-- CreateIndex
CREATE INDEX "PerformerRating_userId_idx" ON "PerformerRating"("userId");

-- CreateIndex
CREATE INDEX "PerformerRating_performerId_idx" ON "PerformerRating"("performerId");

-- CreateIndex
CREATE INDEX "PerformerRating_favorite_idx" ON "PerformerRating"("favorite");

-- CreateIndex
CREATE INDEX "PerformerRating_rating_idx" ON "PerformerRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "PerformerRating_userId_performerId_key" ON "PerformerRating"("userId", "performerId");

-- CreateIndex
CREATE INDEX "StudioRating_userId_idx" ON "StudioRating"("userId");

-- CreateIndex
CREATE INDEX "StudioRating_studioId_idx" ON "StudioRating"("studioId");

-- CreateIndex
CREATE INDEX "StudioRating_favorite_idx" ON "StudioRating"("favorite");

-- CreateIndex
CREATE INDEX "StudioRating_rating_idx" ON "StudioRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "StudioRating_userId_studioId_key" ON "StudioRating"("userId", "studioId");

-- CreateIndex
CREATE INDEX "TagRating_userId_idx" ON "TagRating"("userId");

-- CreateIndex
CREATE INDEX "TagRating_tagId_idx" ON "TagRating"("tagId");

-- CreateIndex
CREATE INDEX "TagRating_favorite_idx" ON "TagRating"("favorite");

-- CreateIndex
CREATE INDEX "TagRating_rating_idx" ON "TagRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "TagRating_userId_tagId_key" ON "TagRating"("userId", "tagId");

-- CreateIndex
CREATE INDEX "GalleryRating_userId_idx" ON "GalleryRating"("userId");

-- CreateIndex
CREATE INDEX "GalleryRating_galleryId_idx" ON "GalleryRating"("galleryId");

-- CreateIndex
CREATE INDEX "GalleryRating_favorite_idx" ON "GalleryRating"("favorite");

-- CreateIndex
CREATE INDEX "GalleryRating_rating_idx" ON "GalleryRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryRating_userId_galleryId_key" ON "GalleryRating"("userId", "galleryId");

-- CreateIndex
CREATE INDEX "GroupRating_userId_idx" ON "GroupRating"("userId");

-- CreateIndex
CREATE INDEX "GroupRating_groupId_idx" ON "GroupRating"("groupId");

-- CreateIndex
CREATE INDEX "GroupRating_favorite_idx" ON "GroupRating"("favorite");

-- CreateIndex
CREATE INDEX "GroupRating_rating_idx" ON "GroupRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRating_userId_groupId_key" ON "GroupRating"("userId", "groupId");

-- CreateIndex
CREATE INDEX "ImageRating_userId_idx" ON "ImageRating"("userId");

-- CreateIndex
CREATE INDEX "ImageRating_imageId_idx" ON "ImageRating"("imageId");

-- CreateIndex
CREATE INDEX "ImageRating_favorite_idx" ON "ImageRating"("favorite");

-- CreateIndex
CREATE INDEX "ImageRating_rating_idx" ON "ImageRating"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "ImageRating_userId_imageId_key" ON "ImageRating"("userId", "imageId");

-- CreateIndex
CREATE INDEX "UserContentRestriction_userId_idx" ON "UserContentRestriction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserContentRestriction_userId_entityType_key" ON "UserContentRestriction"("userId", "entityType");

-- CreateIndex
CREATE INDEX "UserPerformerStats_userId_idx" ON "UserPerformerStats"("userId");

-- CreateIndex
CREATE INDEX "UserPerformerStats_performerId_idx" ON "UserPerformerStats"("performerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPerformerStats_userId_performerId_key" ON "UserPerformerStats"("userId", "performerId");

-- CreateIndex
CREATE INDEX "UserStudioStats_userId_idx" ON "UserStudioStats"("userId");

-- CreateIndex
CREATE INDEX "UserStudioStats_studioId_idx" ON "UserStudioStats"("studioId");

-- CreateIndex
CREATE UNIQUE INDEX "UserStudioStats_userId_studioId_key" ON "UserStudioStats"("userId", "studioId");

-- CreateIndex
CREATE INDEX "UserTagStats_userId_idx" ON "UserTagStats"("userId");

-- CreateIndex
CREATE INDEX "UserTagStats_tagId_idx" ON "UserTagStats"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTagStats_userId_tagId_key" ON "UserTagStats"("userId", "tagId");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_userId_idx" ON "UserHiddenEntity"("userId");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_entityType_idx" ON "UserHiddenEntity"("entityType");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_entityId_idx" ON "UserHiddenEntity"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "UserHiddenEntity_userId_entityType_entityId_key" ON "UserHiddenEntity"("userId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "DataMigration_name_key" ON "DataMigration"("name");
