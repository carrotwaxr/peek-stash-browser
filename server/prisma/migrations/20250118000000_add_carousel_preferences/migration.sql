-- Add carouselPreferences column to User table
-- Stores user's homepage carousel preferences as JSON
-- Format: [{id: string, enabled: boolean, order: number}]
ALTER TABLE User ADD COLUMN carouselPreferences TEXT;
