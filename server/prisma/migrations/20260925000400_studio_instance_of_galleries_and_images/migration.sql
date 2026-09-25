-- Galleries and images record which instance their studio is on (DB-05).
-- A Stash gallery or image names its studio by id, and that studio is on the
-- same Stash server, so the column is the row's own instance, or NULL with no
-- studio. Sync never wrote it: the column's default 'default' stood in, so a
-- studio restriction missed the galleries and images of any other instance,
-- and a studio-less row carried a stray 'default'. Sync now writes it; this
-- corrects the stored rows. It stays a column for the composite foreign key
-- to StashStudio.
--
-- - Only rows whose value differs are written.
-- - Exclusions are recomputed once after the startup sync (data migration
--   005_recompute_exclusions_studio_instance), which applies the cascade.
-- - After a downgrade, an older sync inserts new rows with 'default' again
--   and leaves this column alone on update (a row that gains a studio keeps
--   NULL). The pre-migration backup is the clean way back.
PRAGMA foreign_keys=OFF;
BEGIN;

UPDATE "StashImage"
SET "studioInstanceId" = CASE WHEN "studioId" IS NULL THEN NULL ELSE "stashInstanceId" END
WHERE "studioInstanceId" IS NOT (CASE WHEN "studioId" IS NULL THEN NULL ELSE "stashInstanceId" END);

UPDATE "StashGallery"
SET "studioInstanceId" = CASE WHEN "studioId" IS NULL THEN NULL ELSE "stashInstanceId" END
WHERE "studioInstanceId" IS NOT (CASE WHEN "studioId" IS NULL THEN NULL ELSE "stashInstanceId" END);

COMMIT;
PRAGMA foreign_keys=ON;
