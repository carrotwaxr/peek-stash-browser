-- CreateTable
CREATE TABLE "StashClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "sceneId" TEXT NOT NULL,
    "title" TEXT,
    "seconds" REAL NOT NULL,
    "endSeconds" REAL,
    "primaryTagId" TEXT,
    "previewPath" TEXT,
    "screenshotPath" TEXT,
    "streamPath" TEXT,
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "generationCheckedAt" DATETIME,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "StashClip_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StashClip_primaryTagId_fkey" FOREIGN KEY ("primaryTagId") REFERENCES "StashTag" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClipTag" (
    "clipId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("clipId", "tagId"),
    CONSTRAINT "ClipTag_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "StashClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClipTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StashClip_sceneId_idx" ON "StashClip"("sceneId");

-- CreateIndex
CREATE INDEX "StashClip_primaryTagId_idx" ON "StashClip"("primaryTagId");

-- CreateIndex
CREATE INDEX "StashClip_isGenerated_deletedAt_idx" ON "StashClip"("isGenerated", "deletedAt");

-- CreateIndex
CREATE INDEX "StashClip_deletedAt_stashCreatedAt_idx" ON "StashClip"("deletedAt", "stashCreatedAt" DESC);

-- CreateIndex
CREATE INDEX "ClipTag_tagId_idx" ON "ClipTag"("tagId");
