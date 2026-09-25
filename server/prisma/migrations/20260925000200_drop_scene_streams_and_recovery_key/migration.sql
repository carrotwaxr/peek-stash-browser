-- Sweep item 1: two columns kept only so a downgrade to 3.3.6 could run. The
-- pre-migration backup is the way back to an older version from here.
PRAGMA foreign_keys=OFF;
BEGIN;
-- A key 3.3.6 wrote after a downgrade is newer than the stored hash; hashLegacyRecoveryKeys() hashes it at startup.
UPDATE "User" SET "recoveryKeyHash" = "recoveryKey" WHERE "recoveryKey" IS NOT NULL AND "recoveryKey" <> '';
ALTER TABLE "User" DROP COLUMN "recoveryKey";
ALTER TABLE "StashScene" DROP COLUMN "streams";
COMMIT;
PRAGMA foreign_keys=ON;
