-- UserExcludedContentCount: the viewer's excluded links per entity (item
-- 36, B13b). A card's count is the entity's live count column (B13a) minus
-- the matching column here, so it equals the total of the tab behind the
-- card. A full recompute of a user's exclusions rewrites their rows in the
-- swap, a hide increments them in its unit, and only entities with a
-- nonzero column have a row. Data migration
-- 011_recompute_exclusions_content_counts fills the table for every user
-- after the startup sync; until then the cards show the live numbers.
--
-- A new table only: no row of any other table is touched. An older Peek
-- ignores it.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE "UserExcludedContentCount" (
    "userId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "scenes" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,
    "galleries" INTEGER NOT NULL DEFAULT 0,
    "groups" INTEGER NOT NULL DEFAULT 0,
    "performers" INTEGER NOT NULL DEFAULT 0,
    "studios" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "entityType", "entityId", "instanceId"),
    CONSTRAINT "UserExcludedContentCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMIT;
PRAGMA foreign_keys=ON;
