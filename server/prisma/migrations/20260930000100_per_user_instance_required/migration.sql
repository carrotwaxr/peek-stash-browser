-- Per-user rows always name their Stash instance, and stats and rankings
-- belong to their user:
-- - instanceId becomes NOT NULL on WatchHistory, PlaylistItem,
--   ImageViewHistory and the seven rating tables. A NULL instance (legacy
--   single-instance data) takes the instance of a live entity with that id,
--   by instance priority, else the first instance by priority; a row that
--   then repeats a stored key, or an earlier NULL row's, is left out.
-- - UserPerformerStats, UserStudioStats, UserTagStats and UserEntityRanking
--   get a foreign key to User with ON DELETE CASCADE, and instanceId loses its
--   '' default; rows of a user that no longer exists are left out.
-- - UserEntityStats is dropped: Library counts are read per request.
PRAGMA foreign_keys=OFF;
BEGIN;

-- The autoincrement counters of the tables rebuilt below: a rebuild resets
-- each to the highest id copied, so ids of deleted rows would be reused.
CREATE TEMP TABLE "_seq" AS SELECT "name", "seq" FROM sqlite_sequence
  WHERE "name" IN ('WatchHistory', 'PlaylistItem', 'ImageViewHistory', 'SceneRating', 'PerformerRating', 'StudioRating', 'TagRating', 'GalleryRating', 'GroupRating', 'ImageRating', 'UserPerformerStats', 'UserStudioStats', 'UserTagStats', 'UserEntityRanking');

CREATE TABLE "new_GalleryRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- GalleryRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashGallery with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_GalleryRating" ("createdAt", "favorite", "galleryId", "id", "instanceId", "rating", "updatedAt", "userId") SELECT "createdAt", "favorite", "galleryId", "id", "instanceId", "rating", "updatedAt", "userId" FROM "GalleryRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_GalleryRating" ("createdAt", "favorite", "galleryId", "id", "instanceId", "rating", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "galleryId", "id", "instanceId", "rating", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."galleryId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."galleryId" AS "galleryId", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashGallery" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."galleryId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "GalleryRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_GalleryRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."galleryId" = b."galleryId")
  ) WHERE "rn" = 1;
DROP TABLE "GalleryRating";
ALTER TABLE "new_GalleryRating" RENAME TO "GalleryRating";
CREATE INDEX "GalleryRating_userId_idx" ON "GalleryRating"("userId");
CREATE INDEX "GalleryRating_galleryId_idx" ON "GalleryRating"("galleryId");
CREATE INDEX "GalleryRating_favorite_idx" ON "GalleryRating"("favorite");
CREATE INDEX "GalleryRating_rating_idx" ON "GalleryRating"("rating");
CREATE UNIQUE INDEX "GalleryRating_userId_instanceId_galleryId_key" ON "GalleryRating"("userId", "instanceId", "galleryId");
CREATE TABLE "new_GroupRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- GroupRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashGroup with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_GroupRating" ("createdAt", "favorite", "groupId", "id", "instanceId", "rating", "updatedAt", "userId") SELECT "createdAt", "favorite", "groupId", "id", "instanceId", "rating", "updatedAt", "userId" FROM "GroupRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_GroupRating" ("createdAt", "favorite", "groupId", "id", "instanceId", "rating", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "groupId", "id", "instanceId", "rating", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."groupId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."groupId" AS "groupId", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashGroup" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."groupId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "GroupRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_GroupRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."groupId" = b."groupId")
  ) WHERE "rn" = 1;
DROP TABLE "GroupRating";
ALTER TABLE "new_GroupRating" RENAME TO "GroupRating";
CREATE INDEX "GroupRating_userId_idx" ON "GroupRating"("userId");
CREATE INDEX "GroupRating_groupId_idx" ON "GroupRating"("groupId");
CREATE INDEX "GroupRating_favorite_idx" ON "GroupRating"("favorite");
CREATE INDEX "GroupRating_rating_idx" ON "GroupRating"("rating");
CREATE UNIQUE INDEX "GroupRating_userId_instanceId_groupId_key" ON "GroupRating"("userId", "instanceId", "groupId");
CREATE TABLE "new_ImageRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- ImageRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashImage with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_ImageRating" ("createdAt", "favorite", "id", "imageId", "instanceId", "rating", "updatedAt", "userId") SELECT "createdAt", "favorite", "id", "imageId", "instanceId", "rating", "updatedAt", "userId" FROM "ImageRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_ImageRating" ("createdAt", "favorite", "id", "imageId", "instanceId", "rating", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "id", "imageId", "instanceId", "rating", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."imageId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."id" AS "id", o."imageId" AS "imageId", COALESCE((SELECT e."stashInstanceId" FROM "StashImage" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."imageId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "ImageRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_ImageRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."imageId" = b."imageId")
  ) WHERE "rn" = 1;
DROP TABLE "ImageRating";
ALTER TABLE "new_ImageRating" RENAME TO "ImageRating";
CREATE INDEX "ImageRating_userId_idx" ON "ImageRating"("userId");
CREATE INDEX "ImageRating_imageId_idx" ON "ImageRating"("imageId");
CREATE INDEX "ImageRating_favorite_idx" ON "ImageRating"("favorite");
CREATE INDEX "ImageRating_rating_idx" ON "ImageRating"("rating");
CREATE UNIQUE INDEX "ImageRating_userId_instanceId_imageId_key" ON "ImageRating"("userId", "instanceId", "imageId");
CREATE TABLE "new_ImageViewHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
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
-- ImageViewHistory: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashImage with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_ImageViewHistory" ("createdAt", "id", "imageId", "instanceId", "lastViewedAt", "oCount", "oHistory", "updatedAt", "userId", "viewCount", "viewHistory") SELECT "createdAt", "id", "imageId", "instanceId", "lastViewedAt", "oCount", "oHistory", "updatedAt", "userId", "viewCount", "viewHistory" FROM "ImageViewHistory" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_ImageViewHistory" ("createdAt", "id", "imageId", "instanceId", "lastViewedAt", "oCount", "oHistory", "updatedAt", "userId", "viewCount", "viewHistory")
  SELECT "createdAt", "id", "imageId", "instanceId", "lastViewedAt", "oCount", "oHistory", "updatedAt", "userId", "viewCount", "viewHistory" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."imageId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."id" AS "id", o."imageId" AS "imageId", COALESCE((SELECT e."stashInstanceId" FROM "StashImage" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."imageId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."lastViewedAt" AS "lastViewedAt", o."oCount" AS "oCount", o."oHistory" AS "oHistory", o."updatedAt" AS "updatedAt", o."userId" AS "userId", o."viewCount" AS "viewCount", o."viewHistory" AS "viewHistory" FROM "ImageViewHistory" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_ImageViewHistory" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."imageId" = b."imageId")
  ) WHERE "rn" = 1;
DROP TABLE "ImageViewHistory";
ALTER TABLE "new_ImageViewHistory" RENAME TO "ImageViewHistory";
CREATE INDEX "ImageViewHistory_userId_idx" ON "ImageViewHistory"("userId");
CREATE INDEX "ImageViewHistory_imageId_idx" ON "ImageViewHistory"("imageId");
CREATE INDEX "ImageViewHistory_lastViewedAt_idx" ON "ImageViewHistory"("lastViewedAt");
CREATE UNIQUE INDEX "ImageViewHistory_userId_instanceId_imageId_key" ON "ImageViewHistory"("userId", "instanceId", "imageId");
CREATE TABLE "new_PerformerRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PerformerRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- PerformerRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashPerformer with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_PerformerRating" ("createdAt", "favorite", "id", "instanceId", "performerId", "rating", "updatedAt", "userId") SELECT "createdAt", "favorite", "id", "instanceId", "performerId", "rating", "updatedAt", "userId" FROM "PerformerRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_PerformerRating" ("createdAt", "favorite", "id", "instanceId", "performerId", "rating", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "id", "instanceId", "performerId", "rating", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."performerId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashPerformer" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."performerId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."performerId" AS "performerId", o."rating" AS "rating", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "PerformerRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_PerformerRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."performerId" = b."performerId")
  ) WHERE "rn" = 1;
DROP TABLE "PerformerRating";
ALTER TABLE "new_PerformerRating" RENAME TO "PerformerRating";
CREATE INDEX "PerformerRating_userId_idx" ON "PerformerRating"("userId");
CREATE INDEX "PerformerRating_performerId_idx" ON "PerformerRating"("performerId");
CREATE INDEX "PerformerRating_favorite_idx" ON "PerformerRating"("favorite");
CREATE INDEX "PerformerRating_rating_idx" ON "PerformerRating"("rating");
CREATE UNIQUE INDEX "PerformerRating_userId_instanceId_performerId_key" ON "PerformerRating"("userId", "instanceId", "performerId");
CREATE TABLE "new_PlaylistItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playlistId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- PlaylistItem: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashScene with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_PlaylistItem" ("addedAt", "id", "instanceId", "playlistId", "position", "sceneId") SELECT "addedAt", "id", "instanceId", "playlistId", "position", "sceneId" FROM "PlaylistItem" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_PlaylistItem" ("addedAt", "id", "instanceId", "playlistId", "position", "sceneId")
  SELECT "addedAt", "id", "instanceId", "playlistId", "position", "sceneId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."playlistId", b."instanceId", b."sceneId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."addedAt" AS "addedAt", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashScene" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."sceneId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."playlistId" AS "playlistId", o."position" AS "position", o."sceneId" AS "sceneId" FROM "PlaylistItem" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_PlaylistItem" n WHERE n."playlistId" = b."playlistId" AND n."instanceId" = b."instanceId" AND n."sceneId" = b."sceneId")
  ) WHERE "rn" = 1;
DROP TABLE "PlaylistItem";
ALTER TABLE "new_PlaylistItem" RENAME TO "PlaylistItem";
CREATE INDEX "PlaylistItem_playlistId_position_idx" ON "PlaylistItem"("playlistId", "position");
CREATE UNIQUE INDEX "PlaylistItem_playlistId_instanceId_sceneId_key" ON "PlaylistItem"("playlistId", "instanceId", "sceneId");
CREATE TABLE "new_SceneRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SceneRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- SceneRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashScene with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_SceneRating" ("createdAt", "favorite", "id", "instanceId", "rating", "sceneId", "updatedAt", "userId") SELECT "createdAt", "favorite", "id", "instanceId", "rating", "sceneId", "updatedAt", "userId" FROM "SceneRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_SceneRating" ("createdAt", "favorite", "id", "instanceId", "rating", "sceneId", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "id", "instanceId", "rating", "sceneId", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."sceneId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashScene" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."sceneId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."sceneId" AS "sceneId", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "SceneRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_SceneRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."sceneId" = b."sceneId")
  ) WHERE "rn" = 1;
DROP TABLE "SceneRating";
ALTER TABLE "new_SceneRating" RENAME TO "SceneRating";
CREATE INDEX "SceneRating_userId_idx" ON "SceneRating"("userId");
CREATE INDEX "SceneRating_sceneId_idx" ON "SceneRating"("sceneId");
CREATE INDEX "SceneRating_favorite_idx" ON "SceneRating"("favorite");
CREATE INDEX "SceneRating_rating_idx" ON "SceneRating"("rating");
CREATE UNIQUE INDEX "SceneRating_userId_instanceId_sceneId_key" ON "SceneRating"("userId", "instanceId", "sceneId");
CREATE TABLE "new_StudioRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- StudioRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashStudio with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_StudioRating" ("createdAt", "favorite", "id", "instanceId", "rating", "studioId", "updatedAt", "userId") SELECT "createdAt", "favorite", "id", "instanceId", "rating", "studioId", "updatedAt", "userId" FROM "StudioRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_StudioRating" ("createdAt", "favorite", "id", "instanceId", "rating", "studioId", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "id", "instanceId", "rating", "studioId", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."studioId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashStudio" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."studioId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."studioId" AS "studioId", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "StudioRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_StudioRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."studioId" = b."studioId")
  ) WHERE "rn" = 1;
DROP TABLE "StudioRating";
ALTER TABLE "new_StudioRating" RENAME TO "StudioRating";
CREATE INDEX "StudioRating_userId_idx" ON "StudioRating"("userId");
CREATE INDEX "StudioRating_studioId_idx" ON "StudioRating"("studioId");
CREATE INDEX "StudioRating_favorite_idx" ON "StudioRating"("favorite");
CREATE INDEX "StudioRating_rating_idx" ON "StudioRating"("rating");
CREATE UNIQUE INDEX "StudioRating_userId_instanceId_studioId_key" ON "StudioRating"("userId", "instanceId", "studioId");
CREATE TABLE "new_TagRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "rating" INTEGER,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TagRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- TagRating: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashTag with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_TagRating" ("createdAt", "favorite", "id", "instanceId", "rating", "tagId", "updatedAt", "userId") SELECT "createdAt", "favorite", "id", "instanceId", "rating", "tagId", "updatedAt", "userId" FROM "TagRating" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_TagRating" ("createdAt", "favorite", "id", "instanceId", "rating", "tagId", "updatedAt", "userId")
  SELECT "createdAt", "favorite", "id", "instanceId", "rating", "tagId", "updatedAt", "userId" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."tagId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."createdAt" AS "createdAt", o."favorite" AS "favorite", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashTag" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."tagId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."rating" AS "rating", o."tagId" AS "tagId", o."updatedAt" AS "updatedAt", o."userId" AS "userId" FROM "TagRating" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_TagRating" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."tagId" = b."tagId")
  ) WHERE "rn" = 1;
DROP TABLE "TagRating";
ALTER TABLE "new_TagRating" RENAME TO "TagRating";
CREATE INDEX "TagRating_userId_idx" ON "TagRating"("userId");
CREATE INDEX "TagRating_tagId_idx" ON "TagRating"("tagId");
CREATE INDEX "TagRating_favorite_idx" ON "TagRating"("favorite");
CREATE INDEX "TagRating_rating_idx" ON "TagRating"("rating");
CREATE UNIQUE INDEX "TagRating_userId_instanceId_tagId_key" ON "TagRating"("userId", "instanceId", "tagId");
CREATE TABLE "new_UserEntityRanking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "playDuration" REAL NOT NULL DEFAULT 0,
    "oCount" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" REAL NOT NULL DEFAULT 0,
    "libraryPresence" INTEGER NOT NULL DEFAULT 1,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "percentileRank" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserEntityRanking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- UserEntityRanking: only rows whose user exists (L10's data migration 008 deletes orphans; none on prod)
INSERT INTO "new_UserEntityRanking" ("engagementRate", "engagementScore", "entityId", "entityType", "id", "instanceId", "libraryPresence", "oCount", "percentileRank", "playCount", "playDuration", "updatedAt", "userId") SELECT "engagementRate", "engagementScore", "entityId", "entityType", "id", "instanceId", "libraryPresence", "oCount", "percentileRank", "playCount", "playDuration", "updatedAt", "userId" FROM "UserEntityRanking" s WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."userId");
DROP TABLE "UserEntityRanking";
ALTER TABLE "new_UserEntityRanking" RENAME TO "UserEntityRanking";
CREATE INDEX "UserEntityRanking_userId_entityType_percentileRank_idx" ON "UserEntityRanking"("userId", "entityType", "percentileRank" DESC);
CREATE INDEX "UserEntityRanking_userId_entityType_idx" ON "UserEntityRanking"("userId", "entityType");
CREATE INDEX "UserEntityRanking_instanceId_idx" ON "UserEntityRanking"("instanceId");
CREATE UNIQUE INDEX "UserEntityRanking_userId_instanceId_entityType_entityId_key" ON "UserEntityRanking"("userId", "instanceId", "entityType", "entityId");
CREATE TABLE "new_UserPerformerStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" DATETIME,
    "lastOAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPerformerStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- UserPerformerStats: only rows whose user exists (L10's data migration 008 deletes orphans; none on prod)
INSERT INTO "new_UserPerformerStats" ("id", "instanceId", "lastOAt", "lastPlayedAt", "oCounter", "performerId", "playCount", "updatedAt", "userId") SELECT "id", "instanceId", "lastOAt", "lastPlayedAt", "oCounter", "performerId", "playCount", "updatedAt", "userId" FROM "UserPerformerStats" s WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."userId");
DROP TABLE "UserPerformerStats";
ALTER TABLE "new_UserPerformerStats" RENAME TO "UserPerformerStats";
CREATE INDEX "UserPerformerStats_userId_idx" ON "UserPerformerStats"("userId");
CREATE INDEX "UserPerformerStats_performerId_idx" ON "UserPerformerStats"("performerId");
CREATE INDEX "UserPerformerStats_instanceId_idx" ON "UserPerformerStats"("instanceId");
CREATE UNIQUE INDEX "UserPerformerStats_userId_instanceId_performerId_key" ON "UserPerformerStats"("userId", "instanceId", "performerId");
CREATE TABLE "new_UserStudioStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserStudioStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- UserStudioStats: only rows whose user exists (L10's data migration 008 deletes orphans; none on prod)
INSERT INTO "new_UserStudioStats" ("id", "instanceId", "oCounter", "playCount", "studioId", "updatedAt", "userId") SELECT "id", "instanceId", "oCounter", "playCount", "studioId", "updatedAt", "userId" FROM "UserStudioStats" s WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."userId");
DROP TABLE "UserStudioStats";
ALTER TABLE "new_UserStudioStats" RENAME TO "UserStudioStats";
CREATE INDEX "UserStudioStats_userId_idx" ON "UserStudioStats"("userId");
CREATE INDEX "UserStudioStats_studioId_idx" ON "UserStudioStats"("studioId");
CREATE INDEX "UserStudioStats_instanceId_idx" ON "UserStudioStats"("instanceId");
CREATE UNIQUE INDEX "UserStudioStats_userId_instanceId_studioId_key" ON "UserStudioStats"("userId", "instanceId", "studioId");
CREATE TABLE "new_UserTagStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserTagStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- UserTagStats: only rows whose user exists (L10's data migration 008 deletes orphans; none on prod)
INSERT INTO "new_UserTagStats" ("id", "instanceId", "oCounter", "playCount", "tagId", "updatedAt", "userId") SELECT "id", "instanceId", "oCounter", "playCount", "tagId", "updatedAt", "userId" FROM "UserTagStats" s WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = s."userId");
DROP TABLE "UserTagStats";
ALTER TABLE "new_UserTagStats" RENAME TO "UserTagStats";
CREATE INDEX "UserTagStats_userId_idx" ON "UserTagStats"("userId");
CREATE INDEX "UserTagStats_tagId_idx" ON "UserTagStats"("tagId");
CREATE INDEX "UserTagStats_instanceId_idx" ON "UserTagStats"("instanceId");
CREATE UNIQUE INDEX "UserTagStats_userId_instanceId_tagId_key" ON "UserTagStats"("userId", "instanceId", "tagId");
CREATE TABLE "new_WatchHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
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
-- WatchHistory: rows with an instance as they are. A NULL instance (none on prod) takes
-- the instance of a live StashScene with that id, by priority, else the first
-- instance; a row that then repeats a stored key (or an earlier NULL row's) is left out.
INSERT INTO "new_WatchHistory" ("completed", "duration", "id", "instanceId", "lastPlayedAt", "oCount", "oHistory", "playCount", "playDuration", "playHistory", "position", "resumeTime", "sceneId", "userId", "watchedAt") SELECT "completed", "duration", "id", "instanceId", "lastPlayedAt", "oCount", "oHistory", "playCount", "playDuration", "playHistory", "position", "resumeTime", "sceneId", "userId", "watchedAt" FROM "WatchHistory" WHERE "instanceId" IS NOT NULL;
INSERT INTO "new_WatchHistory" ("completed", "duration", "id", "instanceId", "lastPlayedAt", "oCount", "oHistory", "playCount", "playDuration", "playHistory", "position", "resumeTime", "sceneId", "userId", "watchedAt")
  SELECT "completed", "duration", "id", "instanceId", "lastPlayedAt", "oCount", "oHistory", "playCount", "playDuration", "playHistory", "position", "resumeTime", "sceneId", "userId", "watchedAt" FROM (
    SELECT b.*, ROW_NUMBER() OVER (PARTITION BY b."userId", b."instanceId", b."sceneId" ORDER BY b."id") AS "rn"
    FROM (SELECT o."completed" AS "completed", o."duration" AS "duration", o."id" AS "id", COALESCE((SELECT e."stashInstanceId" FROM "StashScene" e JOIN "StashInstance" si ON si."id" = e."stashInstanceId" WHERE e."id" = o."sceneId" ORDER BY (e."deletedAt" IS NOT NULL), si."priority", si."id" LIMIT 1), (SELECT i."id" FROM "StashInstance" i ORDER BY i."priority", i."id" LIMIT 1)) AS "instanceId", o."lastPlayedAt" AS "lastPlayedAt", o."oCount" AS "oCount", o."oHistory" AS "oHistory", o."playCount" AS "playCount", o."playDuration" AS "playDuration", o."playHistory" AS "playHistory", o."position" AS "position", o."resumeTime" AS "resumeTime", o."sceneId" AS "sceneId", o."userId" AS "userId", o."watchedAt" AS "watchedAt" FROM "WatchHistory" o WHERE o."instanceId" IS NULL) b
    WHERE b."instanceId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "new_WatchHistory" n WHERE n."userId" = b."userId" AND n."instanceId" = b."instanceId" AND n."sceneId" = b."sceneId")
  ) WHERE "rn" = 1;
DROP TABLE "WatchHistory";
ALTER TABLE "new_WatchHistory" RENAME TO "WatchHistory";
CREATE INDEX "WatchHistory_userId_idx" ON "WatchHistory"("userId");
CREATE INDEX "WatchHistory_sceneId_idx" ON "WatchHistory"("sceneId");
CREATE INDEX "WatchHistory_lastPlayedAt_idx" ON "WatchHistory"("lastPlayedAt");
CREATE UNIQUE INDEX "WatchHistory_userId_instanceId_sceneId_key" ON "WatchHistory"("userId", "instanceId", "sceneId");

-- Library counts are read per request
DROP TABLE "UserEntityStats";

-- Restore the counters. A rebuilt table that is empty has no counter row
-- left (or a zero one), so its saved one is put back.
UPDATE sqlite_sequence SET "seq" = (SELECT "seq" FROM "_seq" WHERE "_seq"."name" = sqlite_sequence."name") WHERE "name" IN (SELECT "name" FROM "_seq");
INSERT INTO sqlite_sequence ("name", "seq") SELECT "name", "seq" FROM "_seq" WHERE "name" NOT IN (SELECT "name" FROM sqlite_sequence);
DROP TABLE "_seq";

CREATE TEMP TABLE "_fk_guard" ("violations" INTEGER NOT NULL CHECK ("violations" = 0));
INSERT INTO "_fk_guard" SELECT count(*) FROM (
  SELECT 1 FROM pragma_foreign_key_check('WatchHistory')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('PlaylistItem')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('SceneRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('PerformerRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('StudioRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('TagRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('GalleryRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('GroupRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImageRating')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('ImageViewHistory')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserPerformerStats')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserStudioStats')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserTagStats')
  UNION ALL SELECT 1 FROM pragma_foreign_key_check('UserEntityRanking')
);
DROP TABLE "_fk_guard";

ANALYZE "WatchHistory";
ANALYZE "PlaylistItem";
ANALYZE "SceneRating";
ANALYZE "PerformerRating";
ANALYZE "StudioRating";
ANALYZE "TagRating";
ANALYZE "GalleryRating";
ANALYZE "GroupRating";
ANALYZE "ImageRating";
ANALYZE "ImageViewHistory";
ANALYZE "UserPerformerStats";
ANALYZE "UserStudioStats";
ANALYZE "UserTagStats";
ANALYZE "UserEntityRanking";

COMMIT;
PRAGMA foreign_keys=ON;
