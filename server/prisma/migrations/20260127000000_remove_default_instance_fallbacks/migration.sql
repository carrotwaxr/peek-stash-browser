-- Migration: Remove 'default' Instance ID Fallbacks
--
-- This migration fixes any entities that have stashInstanceId = 'default' or NULL by
-- updating them to use the actual StashInstance UUID. This is a data repair for the
-- legacy fallback pattern that has been removed from the codebase.
--
-- Handles two cases:
-- 1. stashInstanceId = 'default' (from legacy fallback code)
-- 2. stashInstanceId IS NULL (from pre-multi-instance data)
--
-- After this migration:
-- - All entities will have valid UUID stashInstanceId values
-- - The schema defaults are removed (handled by Prisma schema change)
-- - A full sync runs on startup to ensure all data is correct

-- ============================================================================
-- STEP 1: Update entity tables - replace 'default' with actual StashInstance ID
-- ============================================================================

-- Use the primary instance (lowest priority) as the target for 'default' values
-- This handles upgrading users who had entities created before multi-instance support

UPDATE "StashScene"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashPerformer"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashStudio"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashTag"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashGroup"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashGallery"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashImage"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashClip"
SET "stashInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 2: Update StashClip foreign key fields
-- ============================================================================

UPDATE "StashClip"
SET "sceneInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("sceneInstanceId" = 'default' OR "sceneInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StashClip"
SET "primaryTagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("primaryTagInstanceId" = 'default' OR "primaryTagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 3: Update junction tables - ScenePerformer
-- ============================================================================

UPDATE "ScenePerformer"
SET "sceneInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("sceneInstanceId" = 'default' OR "sceneInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "ScenePerformer"
SET "performerInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("performerInstanceId" = 'default' OR "performerInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 4: Update junction tables - SceneTag
-- ============================================================================

UPDATE "SceneTag"
SET "sceneInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("sceneInstanceId" = 'default' OR "sceneInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "SceneTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 5: Update junction tables - SceneGroup
-- ============================================================================

UPDATE "SceneGroup"
SET "sceneInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("sceneInstanceId" = 'default' OR "sceneInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "SceneGroup"
SET "groupInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("groupInstanceId" = 'default' OR "groupInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 6: Update junction tables - SceneGallery
-- ============================================================================

UPDATE "SceneGallery"
SET "sceneInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("sceneInstanceId" = 'default' OR "sceneInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "SceneGallery"
SET "galleryInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("galleryInstanceId" = 'default' OR "galleryInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 7: Update junction tables - ImagePerformer
-- ============================================================================

UPDATE "ImagePerformer"
SET "imageInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("imageInstanceId" = 'default' OR "imageInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "ImagePerformer"
SET "performerInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("performerInstanceId" = 'default' OR "performerInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 8: Update junction tables - ImageTag
-- ============================================================================

UPDATE "ImageTag"
SET "imageInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("imageInstanceId" = 'default' OR "imageInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "ImageTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 9: Update junction tables - ImageGallery
-- ============================================================================

UPDATE "ImageGallery"
SET "imageInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("imageInstanceId" = 'default' OR "imageInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "ImageGallery"
SET "galleryInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("galleryInstanceId" = 'default' OR "galleryInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 10: Update junction tables - GalleryPerformer
-- ============================================================================

UPDATE "GalleryPerformer"
SET "galleryInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("galleryInstanceId" = 'default' OR "galleryInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "GalleryPerformer"
SET "performerInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("performerInstanceId" = 'default' OR "performerInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 11: Update junction tables - GalleryTag
-- ============================================================================

UPDATE "GalleryTag"
SET "galleryInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("galleryInstanceId" = 'default' OR "galleryInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "GalleryTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 12: Update junction tables - PerformerTag
-- ============================================================================

UPDATE "PerformerTag"
SET "performerInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("performerInstanceId" = 'default' OR "performerInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "PerformerTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 13: Update junction tables - StudioTag
-- ============================================================================

UPDATE "StudioTag"
SET "studioInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("studioInstanceId" = 'default' OR "studioInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "StudioTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 14: Update junction tables - GroupTag
-- ============================================================================

UPDATE "GroupTag"
SET "groupInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("groupInstanceId" = 'default' OR "groupInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "GroupTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 15: Update junction tables - ClipTag
-- ============================================================================

UPDATE "ClipTag"
SET "clipInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("clipInstanceId" = 'default' OR "clipInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

UPDATE "ClipTag"
SET "tagInstanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("tagInstanceId" = 'default' OR "tagInstanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ============================================================================
-- STEP 16: Clean up orphaned junction table records
-- Delete any junction records where the FK relationship doesn't resolve
-- ============================================================================

-- ImageTag: delete records where the tag doesn't exist with matching instanceId
DELETE FROM "ImageTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "ImageTag".tagId
    AND t.stashInstanceId = "ImageTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- ImagePerformer: delete records where the performer doesn't exist
DELETE FROM "ImagePerformer"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashPerformer" p
  WHERE p.id = "ImagePerformer".performerId
    AND p.stashInstanceId = "ImagePerformer".performerInstanceId
    AND p.deletedAt IS NULL
);

-- ImageGallery: delete records where the gallery doesn't exist
DELETE FROM "ImageGallery"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashGallery" g
  WHERE g.id = "ImageGallery".galleryId
    AND g.stashInstanceId = "ImageGallery".galleryInstanceId
    AND g.deletedAt IS NULL
);

-- ScenePerformer: delete records where the performer doesn't exist
DELETE FROM "ScenePerformer"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashPerformer" p
  WHERE p.id = "ScenePerformer".performerId
    AND p.stashInstanceId = "ScenePerformer".performerInstanceId
    AND p.deletedAt IS NULL
);

-- SceneTag: delete records where the tag doesn't exist
DELETE FROM "SceneTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "SceneTag".tagId
    AND t.stashInstanceId = "SceneTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- SceneGroup: delete records where the group doesn't exist
DELETE FROM "SceneGroup"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashGroup" g
  WHERE g.id = "SceneGroup".groupId
    AND g.stashInstanceId = "SceneGroup".groupInstanceId
    AND g.deletedAt IS NULL
);

-- SceneGallery: delete records where the gallery doesn't exist
DELETE FROM "SceneGallery"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashGallery" g
  WHERE g.id = "SceneGallery".galleryId
    AND g.stashInstanceId = "SceneGallery".galleryInstanceId
    AND g.deletedAt IS NULL
);

-- GalleryPerformer: delete records where the performer doesn't exist
DELETE FROM "GalleryPerformer"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashPerformer" p
  WHERE p.id = "GalleryPerformer".performerId
    AND p.stashInstanceId = "GalleryPerformer".performerInstanceId
    AND p.deletedAt IS NULL
);

-- GalleryTag: delete records where the tag doesn't exist
DELETE FROM "GalleryTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "GalleryTag".tagId
    AND t.stashInstanceId = "GalleryTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- PerformerTag: delete records where the tag doesn't exist
DELETE FROM "PerformerTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "PerformerTag".tagId
    AND t.stashInstanceId = "PerformerTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- StudioTag: delete records where the tag doesn't exist
DELETE FROM "StudioTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "StudioTag".tagId
    AND t.stashInstanceId = "StudioTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- GroupTag: delete records where the tag doesn't exist
DELETE FROM "GroupTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "GroupTag".tagId
    AND t.stashInstanceId = "GroupTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- ClipTag: delete records where the tag doesn't exist
DELETE FROM "ClipTag"
WHERE NOT EXISTS (
  SELECT 1 FROM "StashTag" t
  WHERE t.id = "ClipTag".tagId
    AND t.stashInstanceId = "ClipTag".tagInstanceId
    AND t.deletedAt IS NULL
);

-- ============================================================================
-- NOTE: Schema default removal is handled by Prisma schema changes
-- A full sync will run automatically after this migration to ensure all
-- data is correct with proper instance IDs from the sync code.
-- ============================================================================
