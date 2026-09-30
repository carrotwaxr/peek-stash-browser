-- Image title sort key (routed C7). Sorting the image list by title, the
-- contract's default image sort, computed the displayed title for every live
-- image on every page and sorted them all in a temp B-tree: about 300 ms a
-- page on a library of 142k images. StashImage now stores the sort key,
-- which sync writes with each image batch (refreshImageDerivedColumns in
-- services/StashSyncService.ts), and indexes it after deletedAt, as the list
-- filters, with the primary key last, as every order ends in "i.id
-- <direction>, i.stashInstanceId <direction>", so a page reads its rows off
-- the index.
--
-- titleSort is the title the image's card shows (getImageFallbackTitle),
-- with ASCII lower-cased: its title, else its file name without the
-- extension, as scenes' titleSort. lower() folds ASCII only, exactly what
-- COLLATE NOCASE compared, so a BINARY order on the stored value is the
-- case-insensitive order of the displayed title, and the index needs no
-- collation. The old sort kept the extension and split the path on "/"
-- only, so an untitled "Beach.jpg" sorted after "Beach (2).jpg" while the
-- cards read "Beach" and "Beach (2)", and a Windows path sorted by its drive.
--
-- The backfill is IMAGE_DERIVED_COLUMNS_SQL (services/StashSyncService.ts),
-- copied verbatim: change both together.
--
-- In place, no rebuild; no SyncState reset, since the backfill derives the
-- column from what is stored. An older Peek ignores the column (its INSERT
-- names its own, and the default fills the rest).
PRAGMA foreign_keys=OFF;
BEGIN;

ALTER TABLE "StashImage" ADD COLUMN "titleSort" TEXT;

UPDATE "StashImage" SET
  "titleSort" = lower(COALESCE(NULLIF("title", ''), (
    SELECT CASE WHEN dot <> '' AND ext <> '' AND instr(ext, '/') = 0
      THEN substr(name, 1, length(dot) - 1) ELSE name END
    FROM (SELECT name, dot, substr(name, length(dot) + 1) AS ext
      FROM (SELECT name, rtrim(name, replace(name, '.', '')) AS dot
        FROM (SELECT COALESCE(NULLIF(substr(path, length(rtrim(path, replace(replace(path, '/', ''), '\', ''))) + 1), ''), path) AS name
          FROM (SELECT NULLIF("filePath", '') AS path)))))));

CREATE INDEX "StashImage_browse_titleSort_idx" ON "StashImage"("deletedAt", "titleSort", "id", "stashInstanceId");

ANALYZE "StashImage_browse_titleSort_idx";

COMMIT;
PRAGMA foreign_keys=ON;
