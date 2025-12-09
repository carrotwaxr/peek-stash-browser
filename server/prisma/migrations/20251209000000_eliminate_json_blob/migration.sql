-- Migration: Eliminate JSON blob storage
-- This migration adds individual columns to replace the JSON 'data' column on cached entities
-- and updates FTS triggers to use the new columns instead of JSON extraction

-- ============================================================================
-- STEP 1: Add new columns to CachedScene
-- ============================================================================

-- Content fields
ALTER TABLE CachedScene ADD COLUMN details TEXT;

-- Primary file metadata
ALTER TABLE CachedScene ADD COLUMN filePath TEXT;
ALTER TABLE CachedScene ADD COLUMN fileBitRate INTEGER;
ALTER TABLE CachedScene ADD COLUMN fileFrameRate REAL;
ALTER TABLE CachedScene ADD COLUMN fileWidth INTEGER;
ALTER TABLE CachedScene ADD COLUMN fileHeight INTEGER;
ALTER TABLE CachedScene ADD COLUMN fileVideoCodec TEXT;
ALTER TABLE CachedScene ADD COLUMN fileAudioCodec TEXT;
ALTER TABLE CachedScene ADD COLUMN fileSize INTEGER;

-- Stash paths (raw, transformed at read time)
ALTER TABLE CachedScene ADD COLUMN pathScreenshot TEXT;
ALTER TABLE CachedScene ADD COLUMN pathPreview TEXT;
ALTER TABLE CachedScene ADD COLUMN pathSprite TEXT;
ALTER TABLE CachedScene ADD COLUMN pathVtt TEXT;
ALTER TABLE CachedScene ADD COLUMN pathChaptersVtt TEXT;
ALTER TABLE CachedScene ADD COLUMN pathStream TEXT;
ALTER TABLE CachedScene ADD COLUMN pathCaption TEXT;

-- Stream data (small JSON array)
ALTER TABLE CachedScene ADD COLUMN streams TEXT;

-- Stash counter data
ALTER TABLE CachedScene ADD COLUMN oCounter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE CachedScene ADD COLUMN playCount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE CachedScene ADD COLUMN playDuration REAL NOT NULL DEFAULT 0;

-- Add indexes for new counter columns
CREATE INDEX IF NOT EXISTS CachedScene_oCounter_idx ON CachedScene(oCounter);
CREATE INDEX IF NOT EXISTS CachedScene_playCount_idx ON CachedScene(playCount);

-- ============================================================================
-- STEP 2: Add new columns to CachedPerformer
-- ============================================================================

-- Extended fields
ALTER TABLE CachedPerformer ADD COLUMN details TEXT;
ALTER TABLE CachedPerformer ADD COLUMN aliasList TEXT;
ALTER TABLE CachedPerformer ADD COLUMN country TEXT;
ALTER TABLE CachedPerformer ADD COLUMN ethnicity TEXT;
ALTER TABLE CachedPerformer ADD COLUMN hairColor TEXT;
ALTER TABLE CachedPerformer ADD COLUMN eyeColor TEXT;
ALTER TABLE CachedPerformer ADD COLUMN heightCm INTEGER;
ALTER TABLE CachedPerformer ADD COLUMN weightKg INTEGER;
ALTER TABLE CachedPerformer ADD COLUMN measurements TEXT;
ALTER TABLE CachedPerformer ADD COLUMN tattoos TEXT;
ALTER TABLE CachedPerformer ADD COLUMN piercings TEXT;
ALTER TABLE CachedPerformer ADD COLUMN careerLength TEXT;
ALTER TABLE CachedPerformer ADD COLUMN deathDate TEXT;
ALTER TABLE CachedPerformer ADD COLUMN url TEXT;

-- Stash paths
ALTER TABLE CachedPerformer ADD COLUMN imagePath TEXT;

-- ============================================================================
-- STEP 3: Add new columns to CachedStudio
-- ============================================================================

-- Extended fields
ALTER TABLE CachedStudio ADD COLUMN details TEXT;
ALTER TABLE CachedStudio ADD COLUMN url TEXT;

-- Stash paths
ALTER TABLE CachedStudio ADD COLUMN imagePath TEXT;

-- ============================================================================
-- STEP 4: Add new columns to CachedTag
-- ============================================================================

-- Extended fields
ALTER TABLE CachedTag ADD COLUMN description TEXT;
ALTER TABLE CachedTag ADD COLUMN parentIds TEXT;

-- Stash paths
ALTER TABLE CachedTag ADD COLUMN imagePath TEXT;

-- ============================================================================
-- STEP 5: Add new columns to CachedGroup
-- ============================================================================

-- Extended fields
ALTER TABLE CachedGroup ADD COLUMN director TEXT;
ALTER TABLE CachedGroup ADD COLUMN synopsis TEXT;
ALTER TABLE CachedGroup ADD COLUMN urls TEXT;

-- Stash paths
ALTER TABLE CachedGroup ADD COLUMN frontImagePath TEXT;
ALTER TABLE CachedGroup ADD COLUMN backImagePath TEXT;

-- ============================================================================
-- STEP 6: Add new columns to CachedGallery
-- ============================================================================

-- Extended fields
ALTER TABLE CachedGallery ADD COLUMN details TEXT;
ALTER TABLE CachedGallery ADD COLUMN url TEXT;
ALTER TABLE CachedGallery ADD COLUMN code TEXT;

-- File metadata
ALTER TABLE CachedGallery ADD COLUMN folderPath TEXT;

-- Stash paths
ALTER TABLE CachedGallery ADD COLUMN coverPath TEXT;

-- ============================================================================
-- STEP 7: Add new columns to CachedImage
-- ============================================================================

-- File metadata
ALTER TABLE CachedImage ADD COLUMN filePath TEXT;

-- Stash paths
ALTER TABLE CachedImage ADD COLUMN pathThumbnail TEXT;
ALTER TABLE CachedImage ADD COLUMN pathPreview TEXT;
ALTER TABLE CachedImage ADD COLUMN pathImage TEXT;

-- ============================================================================
-- STEP 8: Update FTS triggers to use new columns instead of JSON extraction
-- ============================================================================

-- Drop old triggers
DROP TRIGGER IF EXISTS scene_fts_insert;
DROP TRIGGER IF EXISTS scene_fts_update;
DROP TRIGGER IF EXISTS scene_fts_delete;
DROP TRIGGER IF EXISTS performer_fts_insert;
DROP TRIGGER IF EXISTS performer_fts_update;
DROP TRIGGER IF EXISTS performer_fts_delete;

-- Recreate scene FTS triggers using new 'details' column
CREATE TRIGGER IF NOT EXISTS scene_fts_insert AFTER INSERT ON CachedScene BEGIN
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.details, ''), COALESCE(new.code, ''));
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_update AFTER UPDATE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
  INSERT INTO scene_fts(id, title, details, code)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.details, ''), COALESCE(new.code, ''));
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_delete AFTER DELETE ON CachedScene BEGIN
  DELETE FROM scene_fts WHERE id = old.id;
END;

-- Recreate performer FTS triggers using new 'aliasList' column
CREATE TRIGGER IF NOT EXISTS performer_fts_insert AFTER INSERT ON CachedPerformer BEGIN
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.aliasList, ''));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_update AFTER UPDATE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
  INSERT INTO performer_fts(id, name, aliases)
  VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.aliasList, ''));
END;

CREATE TRIGGER IF NOT EXISTS performer_fts_delete AFTER DELETE ON CachedPerformer BEGIN
  DELETE FROM performer_fts WHERE id = old.id;
END;

-- ============================================================================
-- STEP 9: Drop the 'data' column from all cached entity tables
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the tables
-- However, for this migration we'll leave the 'data' column in place but unused
-- A future migration can remove it after the sync code is updated
-- ============================================================================

-- NOTE: The 'data' column is left in place for now to allow rollback
-- It will be removed in a future migration after verification
