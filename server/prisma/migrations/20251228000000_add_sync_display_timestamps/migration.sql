-- Add display timestamp fields to SyncState
-- These store the actual UTC time for UI display, separate from the
-- "fake UTC" timestamps used for Stash sync queries

ALTER TABLE "SyncState" ADD COLUMN "lastFullSyncActual" DATETIME;
ALTER TABLE "SyncState" ADD COLUMN "lastIncrementalSyncActual" DATETIME;
