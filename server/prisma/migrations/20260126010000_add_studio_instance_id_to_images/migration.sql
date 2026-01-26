-- Migration: Add studioInstanceId to StashImage and StashGallery
--
-- This migration adds the studioInstanceId column to StashImage and StashGallery
-- tables to complete the composite foreign key relation to StashStudio.
-- This was missed in the original composite entity keys migration.

-- Add studioInstanceId to StashImage with default value 'default'
ALTER TABLE "StashImage" ADD COLUMN "studioInstanceId" TEXT DEFAULT 'default';

-- Add studioInstanceId to StashGallery with default value 'default'
ALTER TABLE "StashGallery" ADD COLUMN "studioInstanceId" TEXT DEFAULT 'default';
