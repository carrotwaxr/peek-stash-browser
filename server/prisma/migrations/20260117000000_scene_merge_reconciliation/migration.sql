-- AlterTable: Add phash columns to StashScene for merge detection
ALTER TABLE "StashScene" ADD COLUMN "phash" TEXT;
ALTER TABLE "StashScene" ADD COLUMN "phashes" TEXT;

-- CreateIndex: Index on phash for efficient lookup during reconciliation
CREATE INDEX "StashScene_phash_idx" ON "StashScene"("phash");

-- CreateTable: MergeRecord for tracking user data transfers when scenes are merged
CREATE TABLE "MergeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSceneId" TEXT NOT NULL,
    "targetSceneId" TEXT NOT NULL,
    "matchedByPhash" TEXT,
    "userId" INTEGER NOT NULL,
    "playCountTransferred" INTEGER NOT NULL DEFAULT 0,
    "playDurationTransferred" REAL NOT NULL DEFAULT 0,
    "oCountTransferred" INTEGER NOT NULL DEFAULT 0,
    "ratingTransferred" INTEGER,
    "favoriteTransferred" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledBy" INTEGER,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MergeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: Indexes for MergeRecord
CREATE INDEX "MergeRecord_sourceSceneId_idx" ON "MergeRecord"("sourceSceneId");
CREATE INDEX "MergeRecord_targetSceneId_idx" ON "MergeRecord"("targetSceneId");
CREATE INDEX "MergeRecord_userId_idx" ON "MergeRecord"("userId");
