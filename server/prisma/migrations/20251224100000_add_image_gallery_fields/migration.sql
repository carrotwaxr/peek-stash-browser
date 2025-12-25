-- Add missing fields to StashImage
ALTER TABLE "StashImage" ADD COLUMN "code" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "details" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "photographer" TEXT;
ALTER TABLE "StashImage" ADD COLUMN "urls" TEXT;

-- Add missing fields to StashGallery
ALTER TABLE "StashGallery" ADD COLUMN "photographer" TEXT;
ALTER TABLE "StashGallery" ADD COLUMN "urls" TEXT;

-- Performance indexes for gallery-umbrella queries
CREATE INDEX IF NOT EXISTS "ImageGallery_imageId_idx" ON "ImageGallery"("imageId");
CREATE INDEX IF NOT EXISTS "GalleryPerformer_galleryId_idx" ON "GalleryPerformer"("galleryId");
CREATE INDEX IF NOT EXISTS "GalleryTag_galleryId_idx" ON "GalleryTag"("galleryId");
CREATE INDEX IF NOT EXISTS "StashGallery_studioId_deletedAt_idx" ON "StashGallery"("studioId", "deletedAt");
CREATE INDEX IF NOT EXISTS "StashImage_title_idx" ON "StashImage"("title");
CREATE INDEX IF NOT EXISTS "StashImage_browse_idx" ON "StashImage"("deletedAt", "stashCreatedAt" DESC);
