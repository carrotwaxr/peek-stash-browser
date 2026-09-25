-- GroupRelation: Stash's collection hierarchy (item 58), one row per edge
-- from a containing group to one of its sub-groups, with the sub-group's
-- place in the containing group's list and Stash's description of the link.
-- Stash stores the hierarchy as one table; its containing_groups and
-- sub_groups are the same edges read from either end, so Peek keeps one
-- table too and reads both lists from it.
--
-- Keyed on both groups' (id, instance), like every junction. Both instance
-- columns always hold the same value, since Stash relations stay within one
-- server, but the composite foreign keys need both. Deleting a group, as an
-- instance purge does, removes its rows on both sides.
--
-- The primary key's prefix serves "the sub-groups of X"; the one index is the
-- reverse direction, "the groups containing X". The table starts empty; no
-- SyncState reset is needed, since the sync's relation pass reads the whole
-- hierarchy on every run.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE "GroupRelation" (
    "containingId" TEXT NOT NULL,
    "containingInstanceId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "subInstanceId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "description" TEXT,

    PRIMARY KEY ("containingId", "containingInstanceId", "subId", "subInstanceId"),
    CONSTRAINT "GroupRelation_containingId_containingInstanceId_fkey" FOREIGN KEY ("containingId", "containingInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupRelation_subId_subInstanceId_fkey" FOREIGN KEY ("subId", "subInstanceId") REFERENCES "StashGroup" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GroupRelation_subId_subInstanceId_idx" ON "GroupRelation"("subId", "subInstanceId");

COMMIT;
PRAGMA foreign_keys=ON;
