-- Drops the unused Playlist.isPublic column. Nothing read it; sharing goes
-- through PlaylistShare. SQLite drops a plain column in place (the column has
-- no index or constraint).
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "Playlist" DROP COLUMN "isPublic";
COMMIT;
PRAGMA foreign_keys=ON;
