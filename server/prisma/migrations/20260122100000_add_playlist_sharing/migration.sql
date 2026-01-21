-- CreateTable
CREATE TABLE "PlaylistShare" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "playlistId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "sharedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistShare_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlaylistShare_groupId_idx" ON "PlaylistShare"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistShare_playlistId_groupId_key" ON "PlaylistShare"("playlistId", "groupId");
