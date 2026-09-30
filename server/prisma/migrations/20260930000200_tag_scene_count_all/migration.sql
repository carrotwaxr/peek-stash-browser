-- StashTag.sceneCountAll: the scene count a tag's card shows, the live
-- scenes tagged directly or inheriting the tag, each once, as the scene
-- list's tag filter matches them (item 36). LinkCountService keeps it with
-- the other count columns in the post-sync steps, and data migration
-- 010_rebuild_link_counts counts it for the whole library once. Until then
-- it holds what the card showed, the larger of the direct and
-- via-performer counts.
--
-- In place, no rebuild: an ADD COLUMN rewrites no row. An older Peek
-- ignores the column.
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashTag" ADD COLUMN "sceneCountAll" INTEGER NOT NULL DEFAULT 0;

UPDATE "StashTag" SET "sceneCountAll" = MAX("sceneCount", "sceneCountViaPerformers");

COMMIT;
PRAGMA foreign_keys=ON;
