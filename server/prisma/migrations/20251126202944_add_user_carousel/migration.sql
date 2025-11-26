-- CreateTable
CREATE TABLE "UserCarousel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Film',
    "rules" JSONB NOT NULL,
    "sort" TEXT NOT NULL DEFAULT 'random',
    "direction" TEXT NOT NULL DEFAULT 'DESC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserCarousel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserCarousel_userId_idx" ON "UserCarousel"("userId");
