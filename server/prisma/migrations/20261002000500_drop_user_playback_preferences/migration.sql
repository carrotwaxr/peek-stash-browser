-- The Preferred Quality and Preferred Playback Mode settings are removed:
-- nothing ever read them (the player starts with the first source the
-- browser can decode and offers every stream in its source menu). Not
-- indexed, keyed or referenced. An older version reads the columns and
-- fails: the pre-migration backup is the way back.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "User" DROP COLUMN "preferredQuality";
ALTER TABLE "User" DROP COLUMN "preferredPlaybackMode";
COMMIT;
PRAGMA foreign_keys=ON;
