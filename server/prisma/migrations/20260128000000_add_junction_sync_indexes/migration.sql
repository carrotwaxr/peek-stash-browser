-- Add indexes for sync delete operations
-- These indexes allow efficient lookups when deleting junction records by entity ID
-- Without these, SQLite does full table scans causing timeouts on large libraries

-- Scene junction tables
CREATE INDEX "ScenePerformer_scene_idx" ON "ScenePerformer"("sceneId", "sceneInstanceId");
CREATE INDEX "SceneTag_scene_idx" ON "SceneTag"("sceneId", "sceneInstanceId");
CREATE INDEX "SceneGroup_scene_idx" ON "SceneGroup"("sceneId", "sceneInstanceId");
CREATE INDEX "SceneGallery_scene_idx" ON "SceneGallery"("sceneId", "sceneInstanceId");

-- Image junction table (ImagePerformer and ImageTag already have this index)
CREATE INDEX "ImageGallery_image_idx" ON "ImageGallery"("imageId", "imageInstanceId");

-- Gallery junction tables
CREATE INDEX "GalleryPerformer_gallery_idx" ON "GalleryPerformer"("galleryId", "galleryInstanceId");
CREATE INDEX "GalleryTag_gallery_idx" ON "GalleryTag"("galleryId", "galleryInstanceId");

-- Other junction tables
CREATE INDEX "PerformerTag_performer_idx" ON "PerformerTag"("performerId", "performerInstanceId");
CREATE INDEX "StudioTag_studio_idx" ON "StudioTag"("studioId", "studioInstanceId");
CREATE INDEX "GroupTag_group_idx" ON "GroupTag"("groupId", "groupInstanceId");
CREATE INDEX "ClipTag_clip_idx" ON "ClipTag"("clipId", "clipInstanceId");
