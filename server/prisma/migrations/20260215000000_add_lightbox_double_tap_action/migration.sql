-- Add lightbox double-tap/double-click action preference
ALTER TABLE "User" ADD COLUMN "lightboxDoubleTapAction" TEXT DEFAULT 'favorite';
