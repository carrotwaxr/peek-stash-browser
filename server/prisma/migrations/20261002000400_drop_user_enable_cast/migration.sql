-- Casting is removed until it is built on signed links (item 54, PR 11);
-- its per-user setting goes with it. Not indexed, keyed or referenced.
-- An older version reads the column and fails: the pre-migration backup
-- is the way back.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "User" DROP COLUMN "enableCast";
COMMIT;
PRAGMA foreign_keys=ON;
