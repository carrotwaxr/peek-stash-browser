PRAGMA foreign_keys=OFF;
BEGIN;
-- Stash's RFC 3339 text (any offset) to epoch milliseconds, as Prisma stores a
-- DateTime. One UPDATE per column: a row whose one column is already an
-- integer keeps it (julianday() of an integer would read it as a Julian day
-- number). Text julianday() cannot parse stays as it is.
UPDATE "StashScene" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashScene" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashPerformer" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashPerformer" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashStudio" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashStudio" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashTag" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashTag" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashGroup" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashGroup" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashGallery" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashGallery" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
UPDATE "StashImage" SET "stashCreatedAt" = CAST(ROUND((julianday("stashCreatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashCreatedAt") = 'text' AND julianday("stashCreatedAt") IS NOT NULL;
UPDATE "StashImage" SET "stashUpdatedAt" = CAST(ROUND((julianday("stashUpdatedAt") - 2440587.5) * 86400000) AS INTEGER) WHERE typeof("stashUpdatedAt") = 'text' AND julianday("stashUpdatedAt") IS NOT NULL;
-- The rewritten columns' indexes: new statistics for the planner
ANALYZE "StashScene_browse_idx";
ANALYZE "StashScene_browse_updated_idx";
ANALYZE "StashScene_stashCreatedAt_idx";
ANALYZE "StashScene_stashUpdatedAt_idx";
ANALYZE "StashImage_browse_idx";
ANALYZE "StashImage_stashUpdatedAt_idx";
ANALYZE "StashPerformer_stashUpdatedAt_idx";
ANALYZE "StashStudio_stashUpdatedAt_idx";
ANALYZE "StashTag_stashUpdatedAt_idx";
ANALYZE "StashGroup_stashUpdatedAt_idx";
ANALYZE "StashGallery_stashUpdatedAt_idx";
COMMIT;
PRAGMA foreign_keys=ON;
