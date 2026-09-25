-- Drop the 13 junction indexes that duplicate the start of their table's
-- primary key (item 67 (b), DB-04). A junction's primary key begins with its
-- parent's two columns (SceneTag: sceneId, sceneInstanceId, tagId,
-- tagInstanceId), so SQLite's primary-key index already serves every lookup
-- by the parent, and the planner picks it, since it also holds the other
-- side's columns. Each sync write to a junction now updates one B-tree less.
--
-- - Kept: the index on the other side ("SceneTag_tagId_tagInstanceId_idx"
--   and the like), which the tag, performer, gallery and group filters use.
-- - 20260925000500 gave these indexes their current names and dropped their
--   older twins. The freed pages stay in the file for reuse; a VACUUM, or a
--   backup (VACUUM INTO), leaves them out.
-- - A downgrade runs: older versions name no index in their queries, and
--   the planner uses the primary key instead.
PRAGMA foreign_keys=OFF;
BEGIN;
DROP INDEX IF EXISTS "SceneTag_sceneId_sceneInstanceId_idx";
DROP INDEX IF EXISTS "ScenePerformer_sceneId_sceneInstanceId_idx";
DROP INDEX IF EXISTS "SceneGroup_sceneId_sceneInstanceId_idx";
DROP INDEX IF EXISTS "SceneGallery_sceneId_sceneInstanceId_idx";
DROP INDEX IF EXISTS "GalleryTag_galleryId_galleryInstanceId_idx";
DROP INDEX IF EXISTS "GalleryPerformer_galleryId_galleryInstanceId_idx";
DROP INDEX IF EXISTS "ImageGallery_imageId_imageInstanceId_idx";
DROP INDEX IF EXISTS "ImageTag_imageId_imageInstanceId_idx";
DROP INDEX IF EXISTS "ImagePerformer_imageId_imageInstanceId_idx";
DROP INDEX IF EXISTS "PerformerTag_performerId_performerInstanceId_idx";
DROP INDEX IF EXISTS "GroupTag_groupId_groupInstanceId_idx";
DROP INDEX IF EXISTS "StudioTag_studioId_studioInstanceId_idx";
DROP INDEX IF EXISTS "ClipTag_clipId_clipInstanceId_idx";
COMMIT;
PRAGMA foreign_keys=ON;
