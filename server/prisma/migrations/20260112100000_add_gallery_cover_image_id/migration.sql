-- Add coverImageId column to StashGallery for cover image dimension lookup
ALTER TABLE "StashGallery" ADD COLUMN "coverImageId" TEXT;

-- Create index for efficient JOIN to StashImage
CREATE INDEX "StashGallery_coverImageId_idx" ON "StashGallery"("coverImageId");
