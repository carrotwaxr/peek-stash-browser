-- Add tagIds column to entities that have tags
ALTER TABLE "CachedPerformer" ADD COLUMN "tagIds" TEXT;
ALTER TABLE "CachedStudio" ADD COLUMN "tagIds" TEXT;
ALTER TABLE "CachedGallery" ADD COLUMN "tagIds" TEXT;
ALTER TABLE "CachedGroup" ADD COLUMN "tagIds" TEXT;

-- Create GalleryPerformer junction table
CREATE TABLE "GalleryPerformer" (
    "galleryId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "performerId"),
    CONSTRAINT "GalleryPerformer_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "CachedGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryPerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "CachedPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create index for efficient performer lookups
CREATE INDEX "GalleryPerformer_performerId_idx" ON "GalleryPerformer"("performerId");
