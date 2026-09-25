-- Delete cached Stash rows whose instance no longer exists (sweep item 28,
-- DB-12 part). Nothing can reach them: every query and media route names an
-- instance, and a deleted instance is never named again. They are the dev
-- database's 54 orphan junction rows (an instance deleted before deletion
-- cleaned up) and the 8 SyncState rows with no instance that January's
-- multi-instance migration left, which the "last refreshed" reading and the
-- sync status could pick up instead of an instance's own row.
--
-- - Entity rows by their own instance; junction rows when either side's
--   instance is missing; SyncState rows for a missing instance or for none.
-- - A database with no StashInstance row (setup never finished) keeps
--   everything: the EXISTS guard.
-- - Per-user tables are left alone; deleting an instance decides about them.
-- - A downgrade is harmless: the rows were unreachable, and an older server
--   writes SyncState rows per instance.
PRAGMA foreign_keys=OFF;
BEGIN;

-- The 8 entity tables
DELETE FROM "StashScene" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashPerformer" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashStudio" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashGroup" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashGallery" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashImage" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");
DELETE FROM "StashClip" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance");

-- The 13 junctions, when either side's instance is missing
DELETE FROM "SceneTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("sceneInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "ScenePerformer" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("sceneInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "performerInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "SceneGroup" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("sceneInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "groupInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "SceneGallery" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("sceneInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "galleryInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "ImageTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("imageInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "ImagePerformer" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("imageInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "performerInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "ImageGallery" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("imageInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "galleryInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "GalleryTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("galleryInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "GalleryPerformer" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("galleryInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "performerInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "PerformerTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("performerInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "StudioTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("studioInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "GroupTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("groupInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));
DELETE FROM "ClipTag" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("clipInstanceId" NOT IN (SELECT "id" FROM "StashInstance")
    OR "tagInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));

-- Sync state of a missing instance, or of none
DELETE FROM "SyncState" WHERE EXISTS (SELECT 1 FROM "StashInstance")
  AND ("stashInstanceId" IS NULL
    OR "stashInstanceId" NOT IN (SELECT "id" FROM "StashInstance"));

COMMIT;
PRAGMA foreign_keys=ON;
