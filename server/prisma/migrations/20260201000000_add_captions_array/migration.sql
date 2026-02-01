-- Add captions array column for multi-language subtitle support
-- Stores JSON array: [{language_code: "en", caption_type: "srt"}, ...]
ALTER TABLE "StashScene" ADD COLUMN "captions" TEXT;
