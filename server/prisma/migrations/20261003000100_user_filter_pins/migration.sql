-- Each user's pinned filter fields and pinned filters per list (9b): NULL,
-- or a list missing from it, shows the seeded defaults
-- (shared/types/filters/pins.ts) until the user changes that list's pins.
-- Deleted with the user row.
PRAGMA foreign_keys=OFF;
BEGIN;
ALTER TABLE "User" ADD COLUMN "filterPins" JSONB;
COMMIT;
PRAGMA foreign_keys=ON;
