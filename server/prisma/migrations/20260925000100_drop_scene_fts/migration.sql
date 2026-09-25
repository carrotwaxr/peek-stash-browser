-- Sweep item 68: stale since 20260126000000's rebuild, and nothing reads it.
PRAGMA foreign_keys=OFF;
BEGIN;
DROP TRIGGER IF EXISTS "scene_fts_insert";
DROP TRIGGER IF EXISTS "scene_fts_delete";
DROP TRIGGER IF EXISTS "scene_fts_update";
DROP TABLE IF EXISTS "scene_fts";
COMMIT;
PRAGMA foreign_keys=ON;
