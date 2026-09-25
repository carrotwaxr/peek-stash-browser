-- StashInstance.firstSyncedAt: when the instance's first sync finished with
-- its users' exclusions computed (C17, item 42). Until then nobody sees the
-- instance, admins included: the allowed instances and the by-id access
-- checks leave it out, while the exclusion compute already covers it. An
-- instance whose URL changes is new again: the update sets it to NULL.
--
-- Every instance that has synced something shows today, and keeps showing:
-- one with a SyncState row that records a sync, or with a cached entity (an
-- older install whose SyncState rows had no instance, which
-- 20260925000800_sync_state_instance_required deleted). Prisma stores a
-- DateTime as epoch milliseconds. An instance that never synced anything
-- stays NULL and shows once its first sync has finished.
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashInstance" ADD COLUMN "firstSyncedAt" DATETIME;

UPDATE "StashInstance" SET "firstSyncedAt" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (
        SELECT 1 FROM "SyncState" s
        WHERE s."stashInstanceId" = "StashInstance"."id"
          AND (s."lastFullSyncTimestamp" IS NOT NULL
               OR s."lastIncrementalSyncTimestamp" IS NOT NULL
               OR s."lastFullSyncActual" IS NOT NULL
               OR s."lastIncrementalSyncActual" IS NOT NULL)
    )
   OR EXISTS (
        SELECT 1 FROM "StashScene" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashImage" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashGallery" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashPerformer" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashStudio" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashTag" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashGroup" WHERE "stashInstanceId" = "StashInstance"."id"
        UNION ALL SELECT 1 FROM "StashClip" WHERE "stashInstanceId" = "StashInstance"."id"
    );

COMMIT;
PRAGMA foreign_keys=ON;
