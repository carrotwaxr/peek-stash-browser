-- StashInstance.lastFullPassAt: when the instance's last full pass ran to
-- the end (C16). The daily full pass runs when it is over 24 hours old or
-- NULL; a pass cut off by an abort or a restart does not set it, and a type
-- that failed in a pass that ran to the end does not hold it back.
--
-- It starts at the newest "lastFullSyncActual" among the instance's
-- SyncState rows, the best record of its last full sync, so an upgraded
-- install does not run a full pass of every instance at its first start.
-- Prisma stores a DateTime as epoch milliseconds (the prod snapshot's
-- "lastFullSyncActual" values are all integers); a time held as text is
-- converted, keeping its milliseconds. An instance with no full sync on
-- record stays NULL, and its pass is due.
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashInstance" ADD COLUMN "lastFullPassAt" DATETIME;

UPDATE "StashInstance" SET "lastFullPassAt" = (
    SELECT MAX(CASE
        WHEN typeof(s."lastFullSyncActual") = 'integer' THEN s."lastFullSyncActual"
        WHEN typeof(s."lastFullSyncActual") = 'real' THEN CAST(s."lastFullSyncActual" AS INTEGER)
        WHEN typeof(s."lastFullSyncActual") = 'text' AND s."lastFullSyncActual" LIKE '____-__-__%'
            THEN CAST(ROUND((julianday(s."lastFullSyncActual") - 2440587.5) * 86400000) AS INTEGER)
    END)
    FROM "SyncState" s
    WHERE s."stashInstanceId" = "StashInstance"."id"
);

COMMIT;
PRAGMA foreign_keys=ON;
