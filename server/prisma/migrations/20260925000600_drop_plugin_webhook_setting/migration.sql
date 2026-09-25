-- The plugin webhook is gone (item 22); its setting goes with it. The column
-- is not indexed, keyed or referenced, and the table holds one row. After a
-- downgrade, an older version reads the column and fails: the pre-migration
-- backup is the way back.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "SyncSettings" DROP COLUMN "enablePluginWebhook";
COMMIT;
PRAGMA foreign_keys=ON;
