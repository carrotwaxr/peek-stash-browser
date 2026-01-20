-- CreateTable
CREATE TABLE "UserGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "canShare" BOOLEAN NOT NULL DEFAULT false,
    "canDownloadFiles" BOOLEAN NOT NULL DEFAULT false,
    "canDownloadPlaylists" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserGroupMembership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "UserGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable: Add permission override columns to User
ALTER TABLE "User" ADD COLUMN "canShareOverride" BOOLEAN;
ALTER TABLE "User" ADD COLUMN "canDownloadFilesOverride" BOOLEAN;
ALTER TABLE "User" ADD COLUMN "canDownloadPlaylistsOverride" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_name_key" ON "UserGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroupMembership_userId_groupId_key" ON "UserGroupMembership"("userId", "groupId");

-- CreateIndex
CREATE INDEX "UserGroupMembership_userId_idx" ON "UserGroupMembership"("userId");

-- CreateIndex
CREATE INDEX "UserGroupMembership_groupId_idx" ON "UserGroupMembership"("groupId");
