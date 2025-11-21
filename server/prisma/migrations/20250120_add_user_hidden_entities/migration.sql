-- CreateTable
CREATE TABLE "UserHiddenEntity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserHiddenEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AddColumn
ALTER TABLE "User" ADD COLUMN "hideConfirmationDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "UserHiddenEntity_userId_entityType_entityId_key" ON "UserHiddenEntity"("userId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_userId_idx" ON "UserHiddenEntity"("userId");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_entityType_idx" ON "UserHiddenEntity"("entityType");

-- CreateIndex
CREATE INDEX "UserHiddenEntity_entityId_idx" ON "UserHiddenEntity"("entityId");
