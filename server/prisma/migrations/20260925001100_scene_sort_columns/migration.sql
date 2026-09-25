-- Scene sort columns (item 67 (c), DB-07). Sorting the scene list by title,
-- performer count or tag count computed an expression, or a correlated
-- COUNT(*), for every live scene on every page, then sorted them all in a
-- temp B-tree: half a second a page at 200k scenes. StashScene now stores
-- the three sort keys, which sync writes with each scene batch
-- (refreshSceneDerivedColumns in services/StashSyncService.ts), and indexes
-- each after deletedAt, as the list filters, with id last, as every sort
-- ends in "s.id <direction>", so a page reads its rows off the index.
--
-- titleSort is the title the scene's card shows, with ASCII lower-cased: its
-- title, else its file name without the extension. lower() folds ASCII only,
-- exactly what COLLATE NOCASE compared, so a BINARY order on the stored
-- value is the case-insensitive order of the displayed title, and the index
-- needs no collation. The old sort kept the extension, so an untitled
-- "Scene.mp4" sorted after "Scene (2).mp4" while the cards read "Scene" and
-- "Scene (2)". performerCount and tagCount are the scene's ScenePerformer
-- and SceneTag rows, as the count filters and sorts counted them.
--
-- The backfill is SCENE_DERIVED_COLUMNS_SQL (services/StashSyncService.ts),
-- copied verbatim: change both together.
--
-- StashScene_browse_title_idx served nothing once the sort stopped reading
-- title. StashScene_deletedAt_idx goes too: every (deletedAt, X) index
-- serves a deletedAt lookup. StashImage_deletedAt_idx stays: gallery
-- inheritance's scoped UPDATEs (inheritScalarSql) read it as a
-- (deletedAt, rowid) lookup, which no composite index can serve.
--
-- In place, no rebuild; no SyncState reset, since the backfill derives the
-- columns from what is stored. An older Peek ignores the columns (its
-- INSERT names its own, and the defaults fill the rest).
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashScene" ADD COLUMN "titleSort" TEXT;
ALTER TABLE "StashScene" ADD COLUMN "performerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StashScene" ADD COLUMN "tagCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "StashScene" SET
  "titleSort" = lower(COALESCE(NULLIF("title", ''), (
    SELECT CASE WHEN dot <> '' AND ext <> '' AND instr(ext, '/') = 0
      THEN substr(name, 1, length(dot) - 1) ELSE name END
    FROM (SELECT name, dot, substr(name, length(dot) + 1) AS ext
      FROM (SELECT name, rtrim(name, replace(name, '.', '')) AS dot
        FROM (SELECT COALESCE(NULLIF(substr(path, length(rtrim(path, replace(replace(path, '/', ''), '\', ''))) + 1), ''), path) AS name
          FROM (SELECT NULLIF("filePath", '') AS path))))))),
  "performerCount" = (SELECT COUNT(*) FROM "ScenePerformer" sp WHERE sp."sceneId" = "StashScene"."id" AND sp."sceneInstanceId" = "StashScene"."stashInstanceId"),
  "tagCount" = (SELECT COUNT(*) FROM "SceneTag" st WHERE st."sceneId" = "StashScene"."id" AND st."sceneInstanceId" = "StashScene"."stashInstanceId");

DROP INDEX "StashScene_browse_title_idx";
DROP INDEX "StashScene_deletedAt_idx";

CREATE INDEX "StashScene_browse_titleSort_idx" ON "StashScene"("deletedAt", "titleSort", "id");
CREATE INDEX "StashScene_browse_performerCount_idx" ON "StashScene"("deletedAt", "performerCount", "id");
CREATE INDEX "StashScene_browse_tagCount_idx" ON "StashScene"("deletedAt", "tagCount", "id");

ANALYZE;

COMMIT;
PRAGMA foreign_keys=ON;
