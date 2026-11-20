PRAGMA foreign_keys=OFF;
BEGIN;

-- #439: an admin limits a USER to an allow-list of Stash instances
ALTER TABLE "User" ADD COLUMN "instanceAccessLimited" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserInstanceAccess" (
    "userId" INTEGER NOT NULL,
    "instanceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "instanceId"),
    CONSTRAINT "UserInstanceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserInstanceAccess_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "StashInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserInstanceAccess_instanceId_idx" ON "UserInstanceAccess"("instanceId");

COMMIT;
PRAGMA foreign_keys=ON;
