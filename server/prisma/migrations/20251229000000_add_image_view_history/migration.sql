-- CreateTable
CREATE TABLE "ImageViewHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "imageId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "viewHistory" TEXT NOT NULL DEFAULT '[]',
    "oCount" INTEGER NOT NULL DEFAULT 0,
    "oHistory" TEXT NOT NULL DEFAULT '[]',
    "lastViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageViewHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageViewHistory_userId_imageId_key" ON "ImageViewHistory"("userId", "imageId");

-- CreateIndex
CREATE INDEX "ImageViewHistory_userId_idx" ON "ImageViewHistory"("userId");

-- CreateIndex
CREATE INDEX "ImageViewHistory_imageId_idx" ON "ImageViewHistory"("imageId");

-- CreateIndex
CREATE INDEX "ImageViewHistory_lastViewedAt_idx" ON "ImageViewHistory"("lastViewedAt");
