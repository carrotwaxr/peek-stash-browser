-- AlterTable: Add new watch history tracking fields
ALTER TABLE "WatchHistory" ADD COLUMN "playCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WatchHistory" ADD COLUMN "playDuration" REAL NOT NULL DEFAULT 0;
ALTER TABLE "WatchHistory" ADD COLUMN "resumeTime" REAL;
ALTER TABLE "WatchHistory" ADD COLUMN "lastPlayedAt" DATETIME;
ALTER TABLE "WatchHistory" ADD COLUMN "oCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WatchHistory" ADD COLUMN "oHistory" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "WatchHistory" ADD COLUMN "playHistory" TEXT NOT NULL DEFAULT '[]';

-- CreateIndex: Add indexes for better query performance
CREATE INDEX "WatchHistory_userId_idx" ON "WatchHistory"("userId");
CREATE INDEX "WatchHistory_sceneId_idx" ON "WatchHistory"("sceneId");
CREATE INDEX "WatchHistory_lastPlayedAt_idx" ON "WatchHistory"("lastPlayedAt");
