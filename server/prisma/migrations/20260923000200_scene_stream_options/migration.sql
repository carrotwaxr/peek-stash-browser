-- Stash's per-scene stream choices without URLs. Stash exposes no transcode
-- flag and the streaming cap is instance config, so we keep its decisions.
ALTER TABLE "StashScene" ADD COLUMN "streamDirect" BOOLEAN;
ALTER TABLE "StashScene" ADD COLUMN "streamMkv" BOOLEAN;
ALTER TABLE "StashScene" ADD COLUMN "streamResolutions" TEXT;

-- Backfill from the stored lists, then clear them: their URLs carried the
-- Stash API key. The column stays (NULL) so 3.3.6 still runs; PR 3 drops it.
UPDATE "StashScene"
SET
  "streamDirect" = EXISTS (SELECT 1 FROM json_each("streams") WHERE json_extract(value, '$.label') = 'Direct stream'),
  "streamMkv" = EXISTS (SELECT 1 FROM json_each("streams") WHERE json_extract(value, '$.label') = 'MKV'),
  "streamResolutions" = COALESCE((
    SELECT group_concat(r, ',') FROM (
      SELECT CASE json_extract(value, '$.label')
        WHEN 'MP4' THEN 'ORIGINAL'
        WHEN 'MP4 4K (2160p)' THEN 'FOUR_K'
        WHEN 'MP4 Full HD (1080p)' THEN 'FULL_HD'
        WHEN 'MP4 HD (720p)' THEN 'STANDARD_HD'
        WHEN 'MP4 Standard (480p)' THEN 'STANDARD'
        WHEN 'MP4 Low (240p)' THEN 'LOW'
      END AS r
      FROM json_each("StashScene"."streams")
      ORDER BY json_each.key
    ) WHERE r IS NOT NULL
  ), ''),
  "streams" = NULL
WHERE "streams" IS NOT NULL AND json_valid("streams");

-- Anything left (malformed JSON) is cleared too; its columns stay NULL.
UPDATE "StashScene" SET "streams" = NULL WHERE "streams" IS NOT NULL;
