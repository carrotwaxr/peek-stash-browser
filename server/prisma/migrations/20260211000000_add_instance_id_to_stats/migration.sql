-- Add instanceId to UserPerformerStats, UserStudioStats, UserTagStats, and UserEntityRanking
-- These tables were missing instance awareness, causing stats to merge across Stash instances

-- Step 1: Add instanceId column to each table (with default empty string for existing rows)
ALTER TABLE "UserPerformerStats" ADD COLUMN "instanceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserStudioStats" ADD COLUMN "instanceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserTagStats" ADD COLUMN "instanceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserEntityRanking" ADD COLUMN "instanceId" TEXT NOT NULL DEFAULT '';

-- Step 2: Populate instanceId from cached entities where possible
UPDATE "UserPerformerStats" SET "instanceId" = COALESCE(
  (SELECT sp."stashInstanceId" FROM "StashPerformer" sp WHERE sp."id" = "UserPerformerStats"."performerId" LIMIT 1),
  (SELECT si."id" FROM "StashInstance" si WHERE si."enabled" = 1 ORDER BY si."priority" ASC LIMIT 1),
  ''
);

UPDATE "UserStudioStats" SET "instanceId" = COALESCE(
  (SELECT ss."stashInstanceId" FROM "StashStudio" ss WHERE ss."id" = "UserStudioStats"."studioId" LIMIT 1),
  (SELECT si."id" FROM "StashInstance" si WHERE si."enabled" = 1 ORDER BY si."priority" ASC LIMIT 1),
  ''
);

UPDATE "UserTagStats" SET "instanceId" = COALESCE(
  (SELECT st."stashInstanceId" FROM "StashTag" st WHERE st."id" = "UserTagStats"."tagId" LIMIT 1),
  (SELECT si."id" FROM "StashInstance" si WHERE si."enabled" = 1 ORDER BY si."priority" ASC LIMIT 1),
  ''
);

UPDATE "UserEntityRanking" SET "instanceId" = COALESCE(
  CASE "entityType"
    WHEN 'performer' THEN (SELECT sp."stashInstanceId" FROM "StashPerformer" sp WHERE sp."id" = "UserEntityRanking"."entityId" LIMIT 1)
    WHEN 'studio' THEN (SELECT ss."stashInstanceId" FROM "StashStudio" ss WHERE ss."id" = "UserEntityRanking"."entityId" LIMIT 1)
    WHEN 'tag' THEN (SELECT st."stashInstanceId" FROM "StashTag" st WHERE st."id" = "UserEntityRanking"."entityId" LIMIT 1)
    WHEN 'scene' THEN (SELECT sc."stashInstanceId" FROM "StashScene" sc WHERE sc."id" = "UserEntityRanking"."entityId" LIMIT 1)
  END,
  (SELECT si."id" FROM "StashInstance" si WHERE si."enabled" = 1 ORDER BY si."priority" ASC LIMIT 1),
  ''
);

-- Step 3: Drop old unique constraints and create new ones with instanceId
DROP INDEX IF EXISTS "UserPerformerStats_userId_performerId_key";
CREATE UNIQUE INDEX "UserPerformerStats_userId_instanceId_performerId_key" ON "UserPerformerStats"("userId", "instanceId", "performerId");

DROP INDEX IF EXISTS "UserStudioStats_userId_studioId_key";
CREATE UNIQUE INDEX "UserStudioStats_userId_instanceId_studioId_key" ON "UserStudioStats"("userId", "instanceId", "studioId");

DROP INDEX IF EXISTS "UserTagStats_userId_tagId_key";
CREATE UNIQUE INDEX "UserTagStats_userId_instanceId_tagId_key" ON "UserTagStats"("userId", "instanceId", "tagId");

DROP INDEX IF EXISTS "UserEntityRanking_userId_entityType_entityId_key";
CREATE UNIQUE INDEX "UserEntityRanking_userId_instanceId_entityType_entityId_key" ON "UserEntityRanking"("userId", "instanceId", "entityType", "entityId");

-- Step 4: Add indexes for instanceId
CREATE INDEX "UserPerformerStats_instanceId_idx" ON "UserPerformerStats"("instanceId");
CREATE INDEX "UserStudioStats_instanceId_idx" ON "UserStudioStats"("instanceId");
CREATE INDEX "UserTagStats_instanceId_idx" ON "UserTagStats"("instanceId");
CREATE INDEX "UserEntityRanking_instanceId_idx" ON "UserEntityRanking"("instanceId");
