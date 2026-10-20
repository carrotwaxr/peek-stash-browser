PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "PlexIdentity" ADD COLUMN "username" TEXT;
ALTER TABLE "PlexIdentity" ADD COLUMN "serverMember" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "PlexConnection" (
  "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
  "encryptedToken" TEXT,
  "ownerId" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "serverId" TEXT,
  "serverName" TEXT,
  "revision" TEXT NOT NULL,
  "lastSyncedAt" DATETIME,
  "lastError" TEXT
);
COMMIT;
PRAGMA foreign_keys=ON;
