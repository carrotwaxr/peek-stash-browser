-- Add fileBasename column to StashGallery for zip gallery title fallback
ALTER TABLE "StashGallery" ADD COLUMN "fileBasename" TEXT;
