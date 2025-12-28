-- Fix sync timestamp handling by storing raw RFC3339 strings from Stash
--
-- Problem: The old DateTime fields (lastFullSync, lastIncrementalSync) used a
-- "fake UTC" approach that broke when Docker and Stash were in different timezones.
--
-- Solution: Store raw RFC3339 timestamp strings from Stash exactly as received.
-- When querying Stash, we just strip the timezone suffix. This is timezone-agnostic.

-- Step 1: Create new table with correct schema
CREATE TABLE "SyncState_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stashInstanceId" TEXT,
    "entityType" TEXT NOT NULL,
    "lastFullSyncTimestamp" TEXT,
    "lastIncrementalSyncTimestamp" TEXT,
    "lastFullSyncActual" DATETIME,
    "lastIncrementalSyncActual" DATETIME,
    "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDurationMs" INTEGER,
    "lastError" TEXT,
    "totalEntities" INTEGER NOT NULL DEFAULT 0
);

-- Step 2: Copy data from old table (timestamp columns will be null - full sync required)
INSERT INTO "SyncState_new" (
    "id", "stashInstanceId", "entityType",
    "lastSyncCount", "lastSyncDurationMs", "lastError", "totalEntities"
)
SELECT
    "id", "stashInstanceId", "entityType",
    "lastSyncCount", "lastSyncDurationMs", "lastError", "totalEntities"
FROM "SyncState";

-- Step 3: Drop old table
DROP TABLE "SyncState";

-- Step 4: Rename new table
ALTER TABLE "SyncState_new" RENAME TO "SyncState";

-- Step 5: Recreate unique index
CREATE UNIQUE INDEX "SyncState_stashInstanceId_entityType_key" ON "SyncState"("stashInstanceId", "entityType");
