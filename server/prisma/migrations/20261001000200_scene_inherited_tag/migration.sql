-- Inherited scene tags get an indexed junction (routed L8). The scene tag
-- filter, the tag counts and the exclusion compute matched a scene's
-- inherited tags through json_each over StashScene.inheritedTagIds, a JSON
-- column no index reads, so every tag filter read every live scene's list
-- (about 100 ms at 200k scenes, the floor under each one). SceneInheritedTag
-- holds the same pairs, one row per (scene, tag), keyed like SceneTag with
-- the reverse index on the tag, so those readers find a tag's scenes and a
-- scene's tags by index.
--
-- SceneTagInheritanceService writes the junction beside the JSON column, in
-- the same write unit. The JSON column stays: the API and the cards read
-- it. An inherited tag is on its scene's instance, so tagInstanceId always
-- equals sceneInstanceId. The foreign key to the scene cascades a purge;
-- there is none to the tag, as the lists name tags by id only and nothing
-- reads the junction without the tag's own row.
--
-- The backfill copies every scene's list, soft-deleted ones too (their
-- links count until a sync removes them, as the JSON's did). A list that is
-- not a JSON array, and a null element, are skipped; a repeated id is one
-- row. No SyncState reset: the rows derive from what is stored. An older
-- Peek ignores the table.
PRAGMA foreign_keys=OFF;
BEGIN;

CREATE TABLE "SceneInheritedTag" (
    "sceneId" TEXT NOT NULL,
    "sceneInstanceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagInstanceId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId"),
    CONSTRAINT "SceneInheritedTag_sceneId_sceneInstanceId_fkey" FOREIGN KEY ("sceneId", "sceneInstanceId") REFERENCES "StashScene" ("id", "stashInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT OR IGNORE INTO "SceneInheritedTag" ("sceneId", "sceneInstanceId", "tagId", "tagInstanceId")
SELECT s."id", s."stashInstanceId", je.value, s."stashInstanceId"
FROM "StashScene" s
CROSS JOIN json_each(CASE WHEN json_valid(s."inheritedTagIds") AND json_type(s."inheritedTagIds") = 'array' THEN s."inheritedTagIds" ELSE '[]' END) je
WHERE je.atom IS NOT NULL;

CREATE INDEX "SceneInheritedTag_tagId_tagInstanceId_idx" ON "SceneInheritedTag"("tagId", "tagInstanceId");

ANALYZE "SceneInheritedTag";

COMMIT;
PRAGMA foreign_keys=ON;
