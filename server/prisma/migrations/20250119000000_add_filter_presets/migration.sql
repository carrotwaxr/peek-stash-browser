-- Add filterPresets column to User table
-- Stores user's saved filter/sort presets per artifact type as JSON
-- Format: {scene: [{id, name, filters, sort, direction}], performer: [...], studio: [...], tag: [...]}
ALTER TABLE User ADD COLUMN filterPresets TEXT;
