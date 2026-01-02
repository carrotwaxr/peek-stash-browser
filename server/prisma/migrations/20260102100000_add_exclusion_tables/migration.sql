-- CreateTable
CREATE TABLE "UserExcludedEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExcludedEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserEntityStats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "visibleCount" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserEntityStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserExcludedEntity_userId_entityType_entityId_key" ON "UserExcludedEntity"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "UserExcludedEntity_userId_entityType_idx" ON "UserExcludedEntity"("userId", "entityType");

-- CreateIndex
CREATE INDEX "UserExcludedEntity_entityType_entityId_idx" ON "UserExcludedEntity"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEntityStats_userId_entityType_key" ON "UserEntityStats"("userId", "entityType");
