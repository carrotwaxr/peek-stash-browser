PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "User" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "plexOnly" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "PlexIdentity" (
  "accountId" TEXT NOT NULL PRIMARY KEY,
  "approved" BOOLEAN NOT NULL DEFAULT false,
  "userId" INTEGER,
  CONSTRAINT "PlexIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlexIdentity_userId_key" ON "PlexIdentity"("userId");
COMMIT;
PRAGMA foreign_keys=ON;
