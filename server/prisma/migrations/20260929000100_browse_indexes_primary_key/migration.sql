-- The browse indexes end with the primary key (L6). Every list order now
-- ends with the list's primary key, "x.id <dir>, x.stashInstanceId <dir>",
-- so paging never repeats or skips a row among equal sort values (one id on
-- two servers, one date twice). Each of the seven scene sort indexes and
-- the image list's index gains the key after its sort column, in the sort's
-- direction, so the index serves the whole ORDER BY and a page reads its
-- rows off it with no sort.
--
-- A (deletedAt, X DESC) index that served only the sort column stopped
-- being used once the order grew to three terms, and Prisma's SQLite, built
-- with STAT4, used none of the scene sort indexes, even before: it scanned
-- the table and sorted every live scene for each page. An index covering
-- the whole order is chosen by both.
--
-- Dropping an index drops its statistics, and without them SQLite takes
-- "deletedAt IS NULL" on a new index for a narrow range: the studio and
-- group tooltips then walked every live scene through it instead of the
-- studio's or group's own index (5 s a page at 200k scenes), and the
-- unindexed sorts read the table through it. So the eight are analysed
-- again, and only they (0.3 s at 200k scenes); the other statistics stay.
--
-- Same names, dropped and created again in place: no rebuild, no SyncState
-- reset. An older Peek reads the same index names.
PRAGMA foreign_keys=OFF;
BEGIN;

DROP INDEX "StashScene_browse_idx";
DROP INDEX "StashScene_browse_updated_idx";
DROP INDEX "StashScene_browse_date_idx";
DROP INDEX "StashScene_browse_titleSort_idx";
DROP INDEX "StashScene_browse_performerCount_idx";
DROP INDEX "StashScene_browse_tagCount_idx";
DROP INDEX "StashScene_browse_duration_idx";
DROP INDEX "StashImage_browse_idx";

CREATE INDEX "StashScene_browse_idx" ON "StashScene"("deletedAt", "stashCreatedAt" DESC, "id" DESC, "stashInstanceId" DESC);
CREATE INDEX "StashScene_browse_updated_idx" ON "StashScene"("deletedAt", "stashUpdatedAt" DESC, "id" DESC, "stashInstanceId" DESC);
CREATE INDEX "StashScene_browse_date_idx" ON "StashScene"("deletedAt", "date" DESC, "id" DESC, "stashInstanceId" DESC);
CREATE INDEX "StashScene_browse_titleSort_idx" ON "StashScene"("deletedAt", "titleSort", "id", "stashInstanceId");
CREATE INDEX "StashScene_browse_performerCount_idx" ON "StashScene"("deletedAt", "performerCount", "id", "stashInstanceId");
CREATE INDEX "StashScene_browse_tagCount_idx" ON "StashScene"("deletedAt", "tagCount", "id", "stashInstanceId");
CREATE INDEX "StashScene_browse_duration_idx" ON "StashScene"("deletedAt", "duration" DESC, "id" DESC, "stashInstanceId" DESC);
CREATE INDEX "StashImage_browse_idx" ON "StashImage"("deletedAt", "stashCreatedAt" DESC, "id" DESC, "stashInstanceId" DESC);

ANALYZE "StashScene_browse_idx";
ANALYZE "StashScene_browse_updated_idx";
ANALYZE "StashScene_browse_date_idx";
ANALYZE "StashScene_browse_titleSort_idx";
ANALYZE "StashScene_browse_performerCount_idx";
ANALYZE "StashScene_browse_tagCount_idx";
ANALYZE "StashScene_browse_duration_idx";
ANALYZE "StashImage_browse_idx";

COMMIT;
PRAGMA foreign_keys=ON;
