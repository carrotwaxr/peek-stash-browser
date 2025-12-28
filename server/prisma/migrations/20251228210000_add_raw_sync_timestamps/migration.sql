-- Add raw timestamp string fields to SyncState
-- These store the exact RFC3339 timestamp from Stash, preserving timezone info
-- This is more reliable than the old DateTime fields which required timezone tricks

ALTER TABLE "SyncState" ADD COLUMN "lastFullSyncTimestamp" TEXT;
ALTER TABLE "SyncState" ADD COLUMN "lastIncrementalSyncTimestamp" TEXT;
