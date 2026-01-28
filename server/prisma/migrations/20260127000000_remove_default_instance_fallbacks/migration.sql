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
-- STEP 0A: Deduplicate 'default' vs NULL entries within entity tables
-- ============================================================================
-- When the same entity ID exists with BOTH 'default' AND NULL stashInstanceId,
-- delete the NULL entries (keep 'default' as it's more explicit about legacy).
-- This prevents conflicts when both would be updated to the same UUID.

DELETE FROM "StashScene"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashScene" s2
    WHERE s2.id = "StashScene".id
      AND s2.stashInstanceId = 'default'
  );

DELETE FROM "StashPerformer"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashPerformer" p2
    WHERE p2.id = "StashPerformer".id
      AND p2.stashInstanceId = 'default'
  );

DELETE FROM "StashStudio"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashStudio" s2
    WHERE s2.id = "StashStudio".id
      AND s2.stashInstanceId = 'default'
  );

DELETE FROM "StashTag"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashTag" t2
    WHERE t2.id = "StashTag".id
      AND t2.stashInstanceId = 'default'
  );

DELETE FROM "StashGroup"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashGroup" g2
    WHERE g2.id = "StashGroup".id
      AND g2.stashInstanceId = 'default'
  );

DELETE FROM "StashGallery"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashGallery" g2
    WHERE g2.id = "StashGallery".id
      AND g2.stashInstanceId = 'default'
  );

DELETE FROM "StashImage"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashImage" i2
    WHERE i2.id = "StashImage".id
      AND i2.stashInstanceId = 'default'
  );

DELETE FROM "StashClip"
WHERE "stashInstanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StashClip" c2
    WHERE c2.id = "StashClip".id
      AND c2.stashInstanceId = 'default'
  );

-- ============================================================================
-- STEP 0B: Delete entries that conflict with existing real UUID entries
-- ============================================================================
-- Before updating 'default'/NULL entries to the primary instance UUID, we must
-- delete any entries where the same entity ID already exists for that instance.
-- This prevents UNIQUE constraint violations on the composite primary key.

DELETE FROM "StashScene"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashScene" s2
    WHERE s2.id = "StashScene".id
      AND s2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashPerformer"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashPerformer" p2
    WHERE p2.id = "StashPerformer".id
      AND p2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashStudio"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashStudio" s2
    WHERE s2.id = "StashStudio".id
      AND s2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashTag"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashTag" t2
    WHERE t2.id = "StashTag".id
      AND t2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashGroup"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashGroup" g2
    WHERE g2.id = "StashGroup".id
      AND g2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashGallery"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashGallery" g2
    WHERE g2.id = "StashGallery".id
      AND g2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashImage"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashImage" i2
    WHERE i2.id = "StashImage".id
      AND i2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

DELETE FROM "StashClip"
WHERE ("stashInstanceId" = 'default' OR "stashInstanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StashClip" c2
    WHERE c2.id = "StashClip".id
      AND c2.stashInstanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- ============================================================================
-- STEP 0C: Handle user data tables - Ratings and Watch History
-- ============================================================================
-- These tables contain user-generated data that won't be rebuilt by sync.
-- We need to deduplicate and update them carefully.

-- SceneRating: Dedupe 'default' vs NULL (keep 'default')
DELETE FROM "SceneRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "SceneRating" r2
    WHERE r2.userId = "SceneRating".userId
      AND r2.sceneId = "SceneRating".sceneId
      AND r2.instanceId = 'default'
  );

-- SceneRating: Delete if real UUID already exists
DELETE FROM "SceneRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "SceneRating" r2
    WHERE r2.userId = "SceneRating".userId
      AND r2.sceneId = "SceneRating".sceneId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- SceneRating: Update remaining legacy entries
UPDATE "SceneRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- PerformerRating: Dedupe 'default' vs NULL
DELETE FROM "PerformerRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "PerformerRating" r2
    WHERE r2.userId = "PerformerRating".userId
      AND r2.performerId = "PerformerRating".performerId
      AND r2.instanceId = 'default'
  );

-- PerformerRating: Delete if real UUID already exists
DELETE FROM "PerformerRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "PerformerRating" r2
    WHERE r2.userId = "PerformerRating".userId
      AND r2.performerId = "PerformerRating".performerId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- PerformerRating: Update remaining
UPDATE "PerformerRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- StudioRating: Dedupe 'default' vs NULL
DELETE FROM "StudioRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "StudioRating" r2
    WHERE r2.userId = "StudioRating".userId
      AND r2.studioId = "StudioRating".studioId
      AND r2.instanceId = 'default'
  );

-- StudioRating: Delete if real UUID already exists
DELETE FROM "StudioRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "StudioRating" r2
    WHERE r2.userId = "StudioRating".userId
      AND r2.studioId = "StudioRating".studioId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- StudioRating: Update remaining
UPDATE "StudioRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- TagRating: Dedupe 'default' vs NULL
DELETE FROM "TagRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "TagRating" r2
    WHERE r2.userId = "TagRating".userId
      AND r2.tagId = "TagRating".tagId
      AND r2.instanceId = 'default'
  );

-- TagRating: Delete if real UUID already exists
DELETE FROM "TagRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "TagRating" r2
    WHERE r2.userId = "TagRating".userId
      AND r2.tagId = "TagRating".tagId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- TagRating: Update remaining
UPDATE "TagRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- GalleryRating: Dedupe 'default' vs NULL
DELETE FROM "GalleryRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "GalleryRating" r2
    WHERE r2.userId = "GalleryRating".userId
      AND r2.galleryId = "GalleryRating".galleryId
      AND r2.instanceId = 'default'
  );

-- GalleryRating: Delete if real UUID already exists
DELETE FROM "GalleryRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "GalleryRating" r2
    WHERE r2.userId = "GalleryRating".userId
      AND r2.galleryId = "GalleryRating".galleryId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- GalleryRating: Update remaining
UPDATE "GalleryRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- GroupRating: Dedupe 'default' vs NULL
DELETE FROM "GroupRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "GroupRating" r2
    WHERE r2.userId = "GroupRating".userId
      AND r2.groupId = "GroupRating".groupId
      AND r2.instanceId = 'default'
  );

-- GroupRating: Delete if real UUID already exists
DELETE FROM "GroupRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "GroupRating" r2
    WHERE r2.userId = "GroupRating".userId
      AND r2.groupId = "GroupRating".groupId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- GroupRating: Update remaining
UPDATE "GroupRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ImageRating: Dedupe 'default' vs NULL
DELETE FROM "ImageRating"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ImageRating" r2
    WHERE r2.userId = "ImageRating".userId
      AND r2.imageId = "ImageRating".imageId
      AND r2.instanceId = 'default'
  );

-- ImageRating: Delete if real UUID already exists
DELETE FROM "ImageRating"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "ImageRating" r2
    WHERE r2.userId = "ImageRating".userId
      AND r2.imageId = "ImageRating".imageId
      AND r2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- ImageRating: Update remaining
UPDATE "ImageRating"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- WatchHistory: Dedupe 'default' vs NULL
DELETE FROM "WatchHistory"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "WatchHistory" w2
    WHERE w2.userId = "WatchHistory".userId
      AND w2.sceneId = "WatchHistory".sceneId
      AND w2.instanceId = 'default'
  );

-- WatchHistory: Delete if real UUID already exists
DELETE FROM "WatchHistory"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "WatchHistory" w2
    WHERE w2.userId = "WatchHistory".userId
      AND w2.sceneId = "WatchHistory".sceneId
      AND w2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- WatchHistory: Update remaining
UPDATE "WatchHistory"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- PlaylistItem: Dedupe 'default' vs NULL (unique by playlistId + sceneId)
DELETE FROM "PlaylistItem"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "PlaylistItem" p2
    WHERE p2.playlistId = "PlaylistItem".playlistId
      AND p2.sceneId = "PlaylistItem".sceneId
      AND p2.instanceId = 'default'
  );

-- PlaylistItem: Delete if real UUID already exists
DELETE FROM "PlaylistItem"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "PlaylistItem" p2
    WHERE p2.playlistId = "PlaylistItem".playlistId
      AND p2.sceneId = "PlaylistItem".sceneId
      AND p2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- PlaylistItem: Update remaining
UPDATE "PlaylistItem"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

-- ImageViewHistory: Dedupe 'default' vs NULL
DELETE FROM "ImageViewHistory"
WHERE "instanceId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ImageViewHistory" h2
    WHERE h2.userId = "ImageViewHistory".userId
      AND h2.imageId = "ImageViewHistory".imageId
      AND h2.instanceId = 'default'
  );

-- ImageViewHistory: Delete if real UUID already exists
DELETE FROM "ImageViewHistory"
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (
    SELECT 1 FROM "ImageViewHistory" h2
    WHERE h2.userId = "ImageViewHistory".userId
      AND h2.imageId = "ImageViewHistory".imageId
      AND h2.instanceId = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
  );

-- ImageViewHistory: Update remaining
UPDATE "ImageViewHistory"
SET "instanceId" = (SELECT "id" FROM "StashInstance" ORDER BY "priority" ASC LIMIT 1)
WHERE ("instanceId" = 'default' OR "instanceId" IS NULL)
  AND EXISTS (SELECT 1 FROM "StashInstance");

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
