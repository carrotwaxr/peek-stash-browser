-- CreateTable
CREATE TABLE "UserEntityRanking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "playDuration" REAL NOT NULL DEFAULT 0,
    "oCount" INTEGER NOT NULL DEFAULT 0,
    "engagementScore" REAL NOT NULL DEFAULT 0,
    "libraryPresence" INTEGER NOT NULL DEFAULT 1,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "percentileRank" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEntityRanking_userId_entityType_entityId_key" ON "UserEntityRanking"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "UserEntityRanking_userId_entityType_percentileRank_idx" ON "UserEntityRanking"("userId", "entityType", "percentileRank" DESC);

-- CreateIndex
CREATE INDEX "UserEntityRanking_userId_entityType_idx" ON "UserEntityRanking"("userId", "entityType");
