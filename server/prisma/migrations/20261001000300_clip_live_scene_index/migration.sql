-- The clip list at any size (S5, routed C8). At 207k clips a page of the
-- Clips page cost about 0.3 s and its count as much (0.45 s at 300k),
-- whatever the filter: SQLite read every live clip, looked its scene up
-- through the scene's primary key and then read the scene's row for
-- deletedAt, and sorted them all in a temp B-tree.
--
-- StashClip_browse_idx replaces StashClip_deletedAt_stashCreatedAt_idx (its
-- first two columns): the deletedAt filter, the default sort (newest first)
-- and the primary key, which every order ends with, so the default page
-- reads its rows off the index and stops; then the title, isGenerated and
-- the scene's key, so while a page walks it a filter that holds few clips
-- (a search, a scene tag) is checked from the index alone rather than by
-- reading each clip's row (a rare search: 117 ms a page without them, 15
-- with them, as the table scan before).
--
-- StashScene_id_stashInstanceId_deletedAt_idx is the scene's key with
-- deletedAt, so the check that a clip's scene is live reads the index alone
-- (a partial index WHERE deletedAt IS NULL does the same, but schema.prisma
-- cannot declare one).
--
-- Indexes only: no rebuild, no SyncState reset. ANALYZE gives the new
-- indexes their statistics, which SQLite lacks until the next sync's
-- PRAGMA optimize.
PRAGMA foreign_keys=OFF;
BEGIN;

DROP INDEX "StashClip_deletedAt_stashCreatedAt_idx";
CREATE INDEX "StashClip_browse_idx" ON "StashClip"("deletedAt", "stashCreatedAt" DESC, "id" DESC, "stashInstanceId" DESC, "title", "isGenerated", "sceneId", "sceneInstanceId");
CREATE INDEX "StashScene_id_stashInstanceId_deletedAt_idx" ON "StashScene"("id", "stashInstanceId", "deletedAt");

ANALYZE "StashClip_browse_idx";
ANALYZE "StashScene_id_stashInstanceId_deletedAt_idx";

COMMIT;
PRAGMA foreign_keys=ON;
