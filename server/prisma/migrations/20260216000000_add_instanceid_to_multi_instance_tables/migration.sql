-- Add instanceId to tables missing multi-instance scoping
-- Tables: UserHiddenEntity, UserExcludedEntity, Download, MergeRecord, UserEntityStats

-- 1. UserHiddenEntity: Add instanceId and update unique constraint
-- Requires table rebuild for SQLite constraint changes
CREATE TABLE "UserHiddenEntity_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL DEFAULT '',
  "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserHiddenEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
INSERT INTO "UserHiddenEntity_new" ("id", "userId", "entityType", "entityId", "instanceId", "hiddenAt")
  SELECT "id", "userId", "entityType", "entityId", '', "hiddenAt" FROM "UserHiddenEntity";
DROP TABLE "UserHiddenEntity";
ALTER TABLE "UserHiddenEntity_new" RENAME TO "UserHiddenEntity";
CREATE UNIQUE INDEX "UserHiddenEntity_userId_entityType_entityId_instanceId_key" ON "UserHiddenEntity"("userId", "entityType", "entityId", "instanceId");
CREATE INDEX "UserHiddenEntity_userId_idx" ON "UserHiddenEntity"("userId");
CREATE INDEX "UserHiddenEntity_entityType_idx" ON "UserHiddenEntity"("entityType");
CREATE INDEX "UserHiddenEntity_entityId_idx" ON "UserHiddenEntity"("entityId");

-- 2. UserExcludedEntity: Add instanceId and update unique constraint
CREATE TABLE "UserExcludedEntity_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL,
  "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserExcludedEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
INSERT INTO "UserExcludedEntity_new" ("id", "userId", "entityType", "entityId", "instanceId", "reason", "computedAt")
  SELECT "id", "userId", "entityType", "entityId", '', "reason", "computedAt" FROM "UserExcludedEntity";
DROP TABLE "UserExcludedEntity";
ALTER TABLE "UserExcludedEntity_new" RENAME TO "UserExcludedEntity";
CREATE UNIQUE INDEX "UserExcludedEntity_userId_entityType_entityId_instanceId_key" ON "UserExcludedEntity"("userId", "entityType", "entityId", "instanceId");
CREATE INDEX "UserExcludedEntity_userId_entityType_idx" ON "UserExcludedEntity"("userId", "entityType");
CREATE INDEX "UserExcludedEntity_entityType_entityId_idx" ON "UserExcludedEntity"("entityType", "entityId");
CREATE INDEX "UserExcludedEntity_userId_entityType_reason_idx" ON "UserExcludedEntity"("userId", "entityType", "reason");

-- 3. Download: Add instanceId column
ALTER TABLE "Download" ADD COLUMN "instanceId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "Download_instanceId_idx" ON "Download"("instanceId");

-- 4. MergeRecord: Add source and target instanceId columns
ALTER TABLE "MergeRecord" ADD COLUMN "sourceInstanceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MergeRecord" ADD COLUMN "targetInstanceId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "MergeRecord_sourceInstanceId_idx" ON "MergeRecord"("sourceInstanceId");
CREATE INDEX "MergeRecord_targetInstanceId_idx" ON "MergeRecord"("targetInstanceId");

-- 5. UserEntityStats: Add instanceId and update unique constraint
CREATE TABLE "UserEntityStats_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL DEFAULT '',
  "visibleCount" INTEGER NOT NULL,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserEntityStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
INSERT INTO "UserEntityStats_new" ("id", "userId", "entityType", "instanceId", "visibleCount", "updatedAt")
  SELECT "id", "userId", "entityType", '', "visibleCount", "updatedAt" FROM "UserEntityStats";
DROP TABLE "UserEntityStats";
ALTER TABLE "UserEntityStats_new" RENAME TO "UserEntityStats";
CREATE UNIQUE INDEX "UserEntityStats_userId_entityType_instanceId_key" ON "UserEntityStats"("userId", "entityType", "instanceId");
